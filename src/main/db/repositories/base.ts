import type { DatabaseSync } from 'node:sqlite'
import { getDb } from '../database'

export abstract class Repository {
  protected get db(): DatabaseSync {
    return getDb()
  }
}
