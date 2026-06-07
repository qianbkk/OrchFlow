import { app } from 'electron'
import { join } from 'node:path'
import { existsSync, mkdirSync } from 'node:fs'

/** Returns userData/<name>, creating userData/ if missing.
 *  Used by settings-store, project-store, database. */
export function userDataPath(name: string): string {
  const dir = app.getPath('userData')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return join(dir, name)
}
