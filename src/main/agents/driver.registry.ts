import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { AGENT_DEFAULTS } from '@shared/constants'
import type { AgentType, DetectedAgent } from '@shared/types'
import { settingsStore } from '../core/settings-store'
import { ClaudeCodeDriver } from './claude-code.driver'
import { CodexDriver } from './codex.driver'
import { CopilotDriver } from './copilot.driver'
import type { IAgentDriver } from './driver.interface'

// All three drivers are now real implementations (Phase 0: Claude, Phase 1: Codex, Phase 2: Copilot)
const drivers: Map<AgentType, IAgentDriver> = new Map()
let initialized = false

function registerDefaults(): void {
  if (initialized) return
  drivers.set('claude', new ClaudeCodeDriver())
  drivers.set('codex', new CodexDriver())
  drivers.set('copilot', new CopilotDriver())
  initialized = true
}

export function getDriver(type: AgentType): IAgentDriver {
  registerDefaults()
  const d = drivers.get(type)
  if (!d) throw new Error(`No driver registered for agent type: ${type}`)
  return d
}

export function listDrivers(): IAgentDriver[] {
  registerDefaults()
  return Array.from(drivers.values())
}

export function getAgentBinaryPath(type: AgentType): string {
  // Honor user-configured executable path if set; fall back to default
  const configured = settingsStore.getAgentConfig(type)?.executablePath
  if (typeof configured === 'string' && configured) return configured
  const def = AGENT_DEFAULTS[type]
  return def.cliBinary
}

async function probeVersion(bin: string): Promise<string | undefined> {
  try {
    // Use exec (not execFile) on Windows — .cmd batch files require a shell,
    // and execFile + shell:true triggers DEP0190 deprecation warnings.
    // exec always uses a shell, so no deprecation. Quote the path for safety.
    const cmd = process.platform === 'win32'
      ? `"${bin.replace(/"/g, '\\"')}" --version`
      : `'${bin.replace(/'/g, "'\\''")}' --version`
    const execP = promisify(exec)
    const { stdout } = await execP(cmd, { windowsHide: true, timeout: 5000 })
    const m = stdout.match(/v?(\d+\.\d+\.\d+)/)
    return m ? m[1] : stdout.trim().split('\n')[0]
  } catch {
    return undefined
  }
}

function findNpmGlobalBinary(bin: string): string | undefined {
  for (const root of [process.env.APPDATA, process.env.LOCALAPPDATA]) {
    if (!root) continue
    for (const ext of ['', '.cmd']) {
      const p = join(root, 'npm', `${bin}${ext}`)
      if (existsSync(p)) return p
    }
  }
  return undefined
}

function findOnPath(_bin: string, exts: string[]): string | undefined {
  const sep = process.platform === 'win32' ? ';' : ':'
  for (const dir of (process.env.PATH ?? '').split(sep)) {
    for (const e of exts) {
      const p = join(dir, e)
      if (existsSync(p)) return p
    }
  }
  return undefined
}

export async function detectInstalledAgents(): Promise<DetectedAgent[]> {
  const probes = (['claude', 'codex', 'copilot'] as AgentType[]).map(async (type): Promise<DetectedAgent> => {
    const def = AGENT_DEFAULTS[type]
    const resolvedPath = findNpmGlobalBinary(def.cliBinary) ?? findOnPath(def.cliBinary, def.detect)
    const installed = !!resolvedPath
    const version = installed ? await probeVersion(resolvedPath) : undefined
    return { type, installed, path: resolvedPath, version }
  })
  return Promise.all(probes)
}
