import type { Checkpoint, CheckpointType } from '@shared/types'
import { Repository } from './base'

function rowToCheckpoint(row: unknown): Checkpoint {
  const r = row as Record<string, unknown>
  return {
    id: r.id as string,
    sessionId: r.session_id as string,
    taskId: r.task_id as string,
    timestamp: r.timestamp as number,
    type: r.type as CheckpointType,
    gitCommit: (r.git_commit as string | null) ?? undefined,
    gitStash: (r.git_stash as string | null) ?? undefined,
    sessionStateJson: (r.session_state_json as string | null) ?? undefined,
    description: r.description as string
  }
}

export class CheckpointRepository extends Repository {
  list(sessionId: string): Checkpoint[] {
    const rows = this.db
      .prepare('SELECT * FROM checkpoints WHERE session_id = ? ORDER BY timestamp DESC')
      .all(sessionId)
    return rows.map(rowToCheckpoint)
  }

  create(cp: Checkpoint): void {
    this.db
      .prepare(
        `INSERT INTO checkpoints (id, session_id, task_id, timestamp, type, git_commit, git_stash, session_state_json, description)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        cp.id,
        cp.sessionId,
        cp.taskId,
        cp.timestamp,
        cp.type,
        cp.gitCommit ?? null,
        cp.gitStash ?? null,
        cp.sessionStateJson ?? null,
        cp.description
      )
  }

  get(id: string): Checkpoint | null {
    const row = this.db.prepare('SELECT * FROM checkpoints WHERE id = ?').get(id)
    return row ? rowToCheckpoint(row) : null
  }
}
