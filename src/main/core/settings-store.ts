// Lightweight settings store — file-backed JSON in userData/settings.json
// API keys are NOT stored here (those go through keytar in IPC layer)

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { userDataPath } from './paths'

const SETTINGS_FILE = 'settings.json'

interface Settings {
  agents: Record<string, Record<string, unknown>>
  global: Record<string, unknown>
}

const defaultSettings = (): Settings => ({ agents: {}, global: {} })

let cache: Settings | null = null

function load(): Settings {
  if (cache) return cache
  const p = userDataPath(SETTINGS_FILE)
  if (!existsSync(p)) {
    cache = defaultSettings()
    return cache
  }
  try {
    cache = JSON.parse(readFileSync(p, 'utf-8'))
    return cache!
  } catch {
    cache = defaultSettings()
    return cache
  }
}

function persist(): void {
  if (!cache) return
  writeFileSync(userDataPath(SETTINGS_FILE), JSON.stringify(cache, null, 2), 'utf-8')
}

export const settingsStore = {
  get(key: string): unknown {
    return load().global[key]
  },
  set(key: string, value: unknown): void {
    const s = load()
    s.global[key] = value
    persist()
  },
  getAgentConfig(agentType: string): Record<string, unknown> | null {
    return load().agents[agentType] ?? null
  },
  setAgentConfig(agentType: string, config: Record<string, unknown>): Record<string, unknown> {
    const s = load()
    s.agents[agentType] = { ...(s.agents[agentType] ?? {}), ...config }
    persist()
    return s.agents[agentType]
  }
}
