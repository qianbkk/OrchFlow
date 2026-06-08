import type { Notification, NotificationType } from '@shared/types'
import { Repository } from './base'

function rowToNotification(row: unknown): Notification {
  const r = row as Record<string, unknown>
  return {
    id: r.id as number,
    timestamp: r.timestamp as number,
    type: r.type as NotificationType,
    title: r.title as string,
    body: (r.body as string | null) ?? '',
    taskId: (r.task_id as string | null) ?? undefined,
    sessionId: (r.session_id as string | null) ?? undefined,
    read: Boolean(r.read),
    actionTaken: (r.action_taken as string | null) ?? undefined
  }
}

export class NotificationRepository extends Repository {
  list(): Notification[] {
    const rows = this.db.prepare('SELECT * FROM notifications ORDER BY timestamp DESC LIMIT 200').all()
    return rows.map(rowToNotification)
  }

  create(n: Omit<Notification, 'id'>): number {
    const result = this.db
      .prepare(
        `INSERT INTO notifications (timestamp, type, title, body, task_id, session_id, read, action_taken)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        n.timestamp,
        n.type,
        n.title,
        n.body,
        n.taskId ?? null,
        n.sessionId ?? null,
        n.read ? 1 : 0,
        n.actionTaken ?? null
      )
    return Number(result.lastInsertRowid)
  }

  markRead(id: number): void {
    this.db.prepare('UPDATE notifications SET read = 1 WHERE id = ?').run(id)
  }
}
