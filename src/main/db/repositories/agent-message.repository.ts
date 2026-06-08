import type { AgentMessage, AgentMessageType } from '@shared/types'
import { Repository } from './base'

function rowToMessage(row: unknown): AgentMessage {
  const r = row as Record<string, unknown>
  return {
    id: r.id as string,
    fromSessionId: (r.from_session_id as string | null) ?? undefined,
    toSessionId: (r.to_session_id as string | null) ?? undefined,
    taskId: (r.task_id as string | null) ?? undefined,
    timestamp: r.timestamp as number,
    messageType: r.message_type as AgentMessageType,
    content: r.content as string,
    delivered: (r.delivered as number) === 1
  }
}

export class AgentMessageRepository extends Repository {
  create(msg: AgentMessage): void {
    this.db
      .prepare(
        `INSERT INTO agent_messages (id, from_session_id, to_session_id, task_id, timestamp, message_type, content, delivered)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        msg.id,
        msg.fromSessionId ?? null,
        msg.toSessionId ?? null,
        msg.taskId ?? null,
        msg.timestamp,
        msg.messageType,
        msg.content,
        msg.delivered ? 1 : 0
      )
  }

  list(taskId?: string, delivered?: boolean): AgentMessage[] {
    let sql = 'SELECT * FROM agent_messages WHERE 1=1'
    const params: (string | number)[] = []
    if (taskId) {
      sql += ' AND task_id = ?'
      params.push(taskId)
    }
    if (delivered !== undefined) {
      sql += ' AND delivered = ?'
      params.push(delivered ? 1 : 0)
    }
    sql += ' ORDER BY timestamp ASC'
    const rows = this.db.prepare(sql).all(...params)
    return rows.map(rowToMessage)
  }

  markDelivered(id: string): void {
    this.db.prepare('UPDATE agent_messages SET delivered = 1 WHERE id = ?').run(id)
  }

  /** Get undelivered messages for a specific task */
  getPendingForTask(taskId: string): AgentMessage[] {
    const rows = this.db
      .prepare(
        'SELECT * FROM agent_messages WHERE task_id = ? AND delivered = 0 ORDER BY timestamp ASC'
      )
      .all(taskId)
    return rows.map(rowToMessage)
  }

  get(id: string): AgentMessage | null {
    const row = this.db.prepare('SELECT * FROM agent_messages WHERE id = ?').get(id)
    return row ? rowToMessage(row) : null
  }
}
