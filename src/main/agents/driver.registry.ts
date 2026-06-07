import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { AGENT_DEFAULTS } from '@shared/constants'
import type { AgentType, DetectedAgent } from '@shared/types'
import { ClaudeCodeDriver } from './claude-code.driver'
import { StubDriver } from './stub.driver'
import type { IAgentDriver } from './driver.interface'

const execFileP = promisify(execFile)

// Order matters: P0 claude first, then codex (P1), then copilot (P2)
const drivers: Map<AgentType, IAgentDriver> = new Map()
let initialized = false

function registerDefaults(): void {
  if (initialized) return
  drivers.set('claude', new ClaudeCodeDriver())
  // Phase 1+ — explicit stubs that surface "not implemented" via an error event
  drivers.set('codex', new StubDriver('codex', 'Phase 1'))
  drivers.set('copilot', new StubDriver('copilot', 'Phase 2'))
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
  const def = AGENT_DEFAULTS[type]
  // On Windows, prefer the .cmd shim that npm creates
  return def.cliBinary
}

async function probeVersion(bin: string): Promise<string | undefined> {
  try {
    const { stdout } = await execFileP(bin, ['--version'], {
      shell: true,
      windowsHide: true,
      timeout: 5000
    })
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
