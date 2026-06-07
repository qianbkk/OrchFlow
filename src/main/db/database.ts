import { DatabaseSync } from 'node:sqlite'
import { app } from 'electron'
import { SCHEMA_VERSION, DB_FILENAME } from '@shared/constants'
import { runMigrations } from './migrations'
import { userDataPath } from '../core/paths'

let dbInstance: DatabaseSync | null = null
let initInProgress = false

export function getDb(): DatabaseSync {
  if (dbInstance) return dbInstance
  if (!app.isReady()) {
    throw new Error('Database cannot be opened before app is ready')
  }
  // Re-entrancy guard: two concurrent callers (e.g., two IPC handlers fired
  // in the same tick) would each pass the `dbInstance` null check, each call
  // new DatabaseSync, and race on runMigrations. Guard until assignment is done.
  if (initInProgress) {
    throw new Error('Database initialization already in progress')
  }
  initInProgress = true
  try {
    const db = new DatabaseSync(userDataPath(DB_FILENAME))
    db.exec('PRAGMA journal_mode = WAL;')
    db.exec('PRAGMA synchronous = NORMAL;')
    db.exec('PRAGMA foreign_keys = ON;')
    db.exec('PRAGMA busy_timeout = 5000;')
    runMigrations(db)
    dbInstance = db
    return db
  } finally {
    initInProgress = false
  }
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
