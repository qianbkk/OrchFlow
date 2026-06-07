import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { app } from 'electron'
import { AGENT_DEFAULTS } from '@shared/constants'
import type { AgentType, DetectedAgent } from '@shared/types'
import { ClaudeCodeDriver } from './claude-code.driver'
import type { IAgentDriver } from './driver.interface'

const execFileP = promisify(execFile)

// Order matters: P0 claude first, then codex, then copilot
const drivers: Map<AgentType, IAgentDriver> = new Map()
let initialized = false

function registerDefaults(): void {
  if (initialized) return
  drivers.set('claude', new ClaudeCodeDriver())
  // codex, copilot are Phase 1/2 — register stubs to enable UI flow
  drivers.set('codex', new ClaudeCodeDriver()) // TODO: replace with real CodexDriver in Phase 1
  drivers.set('copilot', new ClaudeCodeDriver()) // TODO: replace with real CopilotDriver in Phase 2
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

export async function detectInstalledAgents(): Promise<DetectedAgent[]> {
  const results: DetectedAgent[] = []
  for (const type of ['claude', 'codex', 'copilot'] as AgentType[]) {
    const def = AGENT_DEFAULTS[type]
    let installed = false
    let resolvedPath: string | undefined
    // 1. Check npm global bin first (preferred)
    try {
      const globalRoot = join(app.getPath('userData'), '..')
      const candidates = [
        join(process.env.APPDATA ?? globalRoot, 'npm', `${def.cliBinary}.cmd`),
        join(process.env.LOCALAPPDATA ?? globalRoot, 'npm', `${def.cliBinary}.cmd`),
        join(process.env.APPDATA ?? globalRoot, 'npm', `${def.cliBinary}`),
        join(process.env.LOCALAPPDATA ?? globalRoot, 'npm', `${def.cliBinary}`)
      ]
      for (const p of candidates) {
        if (existsSync(p)) {
          installed = true
          resolvedPath = p
          break
        }
      }
      // 2. PATH fallback
      if (!installed) {
        const path = process.env.PATH ?? ''
        const sep = process.platform === 'win32' ? ';' : ':'
        for (const dir of path.split(sep)) {
          for (const ext of def.detect) {
            const p = join(dir, ext)
            if (existsSync(p)) {
              installed = true
              resolvedPath = p
              break
            }
          }
          if (installed) break
        }
      }
    } catch {
      // ignore detection errors
    }
    const version = installed ? await probeVersion(resolvedPath ?? def.cliBinary) : undefined
    results.push({ type, installed, path: resolvedPath, version })
  }
  return results
}
