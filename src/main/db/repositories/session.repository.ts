import type { Session, SessionStatus, AgentType } from '@shared/types'
import { Repository } from './base'

function rowToSession(row: unknown): Session {
  const r = row as Record<string, unknown>
  return {
    id: r.id as string,
    taskId: r.task_id as string,
    agentType: r.agent_type as AgentType,
    status: r.status as SessionStatus,
    pid: (r.pid as number | null) ?? undefined,
    mode: r.mode as Session['mode'],
    startedAt: r.started_at as number,
    endedAt: (r.ended_at as number | null) ?? undefined,
    tokenUsageJson: (r.token_usage_json as string | null) ?? undefined
  }
}

export class SessionRepository extends Repository {
  list(taskId?: string): Session[] {
    if (taskId) {
      const rows = this.db.prepare('SELECT * FROM sessions WHERE task_id = ? ORDER BY started_at DESC').all(taskId)
      return rows.map(rowToSession)
    }
    const rows = this.db.prepare('SELECT * FROM sessions ORDER BY started_at DESC').all()
    return rows.map(rowToSession)
  }

  get(id: string): Session | null {
    const row = this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(id)
    return row ? rowToSession(row) : null
  }

  create(session: Session): void {
    this.db
      .prepare(
        `INSERT INTO sessions (id, task_id, agent_type, status, pid, mode, started_at, token_usage_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        session.id,
        session.taskId,
        session.agentType,
        session.status,
        session.pid ?? null,
        session.mode,
        session.startedAt,
        session.tokenUsageJson ?? null
      )
  }

  updateStatus(id: string, status: SessionStatus, pid?: number): void {
    if (pid !== undefined) {
      this.db.prepare('UPDATE sessions SET status = ?, pid = ? WHERE id = ?').run(status, pid, id)
    } else {
      this.db.prepare('UPDATE sessions SET status = ? WHERE id = ?').run(status, id)
    }
  }

  end(id: string): void {
    this.db.prepare('UPDATE sessions SET status = ?, ended_at = ? WHERE id = ?').run('done', Date.now(), id)
  }
}
