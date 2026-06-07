// Tracks the currently opened project ID across sessions
// (separate from DB so the UI can re-open the last project on app launch)

import { app } from 'electron'
import { join } from 'node:path'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'

const FILE = 'current-project.json'

function getPath(): string {
  const dir = app.getPath('userData')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return join(dir, FILE)
}

export const currentProjectStore = {
  get(): string | null {
    const p = getPath()
    if (!existsSync(p)) return null
    try {
      const data = JSON.parse(readFileSync(p, 'utf-8'))
      return typeof data?.id === 'string' ? data.id : null
    } catch {
      return null
    }
  },
  set(id: string | null): void {
    writeFileSync(getPath(), JSON.stringify({ id }), 'utf-8')
  }
}
