import type { DatabaseSync } from 'node:sqlite'
import { SCHEMA_VERSION } from '@shared/constants'
import { migration001Initial } from './migrations/001_initial'

export interface Migration {
  version: number
  name: string
  up: (db: DatabaseSync) => void
}

const MIGRATIONS: Migration[] = [migration001Initial]

export function runMigrations(db: DatabaseSync): void {
  // Ensure schema_version table exists
  db.exec(`CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at INTEGER NOT NULL
  )`)

  const currentRow = db
    .prepare('SELECT MAX(version) as v FROM schema_version')
    .get() as { v: number | null }
  const current = currentRow?.v ?? 0

  for (const m of MIGRATIONS) {
    if (m.version <= current) continue
    db.exec('BEGIN')
    try {
      m.up(db)
      db.prepare('INSERT INTO schema_version (version, name, applied_at) VALUES (?, ?, ?)').run(
        m.version,
        m.name,
        Date.now()
      )
      db.exec('COMMIT')
      console.log(`[migrations] applied v${m.version}: ${m.name}`)
    } catch (err) {
      db.exec('ROLLBACK')
      throw new Error(`Migration v${m.version} (${m.name}) failed: ${err}`)
    }
  }

  if (MIGRATIONS.length > 0 && current < SCHEMA_VERSION) {
    console.log(`[migrations] schema at v${SCHEMA_VERSION}`)
  }
}
