// Tracks the currently opened project ID across sessions
// (separate from DB so the UI can re-open the last project on app launch)

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { userDataPath } from './paths'

const FILE = 'current-project.json'

export const currentProjectStore = {
  get(): string | null {
    const p = userDataPath(FILE)
    if (!existsSync(p)) return null
    try {
      const data = JSON.parse(readFileSync(p, 'utf-8'))
      return typeof data?.id === 'string' ? data.id : null
    } catch {
      return null
    }
  },
  set(id: string): void {
    writeFileSync(userDataPath(FILE), JSON.stringify({ id }), 'utf-8')
  },
  clear(): void {
    try {
      writeFileSync(userDataPath(FILE), JSON.stringify({ id: null }), 'utf-8')
    } catch {
      // best-effort
    }
  }
}
