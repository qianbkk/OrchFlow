import { DatabaseSync } from 'node:sqlite'
import { app } from 'electron'
import { join } from 'node:path'
import { existsSync, mkdirSync } from 'node:fs'
import { SCHEMA_VERSION, DB_FILENAME } from '@shared/constants'
import { runMigrations } from './migrations'

let dbInstance: DatabaseSync | null = null

export function getDb(): DatabaseSync {
  if (dbInstance) return dbInstance
  if (!app.isReady()) {
    throw new Error('Database cannot be opened before app is ready')
  }
  const userData = app.getPath('userData')
  if (!existsSync(userData)) {
    mkdirSync(userData, { recursive: true })
  }
  const dbPath = join(userData, DB_FILENAME)
  const db = new DatabaseSync(dbPath)

  // Pragmas - WAL for concurrent reads, FK enforcement, reasonable sync level
  db.exec('PRAGMA journal_mode = WAL;')
  db.exec('PRAGMA synchronous = NORMAL;')
  db.exec('PRAGMA foreign_keys = ON;')
  db.exec('PRAGMA busy_timeout = 5000;')

  runMigrations(db)
  dbInstance = db
  return db
}

export function closeDb(): void {
  if (dbInstance) {
    dbInstance.close()
    dbInstance = null
  }
}

export function getCurrentSchemaVersion(): number {
  const db = getDb()
  const row = db
    .prepare('SELECT version FROM schema_version ORDER BY version DESC LIMIT 1')
    .get() as { version: number } | undefined
  return row?.version ?? 0
}

export const CURRENT_TARGET_VERSION = SCHEMA_VERSION
