import type { AuditEntry, AuditFilters, ApprovalStatus, RiskLevel } from '@shared/types'
import { Repository } from './base'

function rowToEntry(row: unknown): AuditEntry {
  const r = row as Record<string, unknown>
  return {
    id: r.id as number,
    timestamp: r.timestamp as number,
    sessionId: (r.session_id as string | null) ?? undefined,
    taskId: (r.task_id as string | null) ?? undefined,
    actor: r.actor as string,
    actionType: r.action_type as string,
    actionDetailJson: (r.action_detail_json as string | null) ?? undefined,
    riskLevel: (r.risk_level as RiskLevel | null) ?? undefined,
    approvalStatus: (r.approval_status as ApprovalStatus | null) ?? undefined,
    approvedBy: (r.approved_by as string | null) ?? undefined,
    approvedAt: (r.approved_at as number | null) ?? undefined
  }
}

export class AuditRepository extends Repository {
  log(entry: Omit<AuditEntry, 'id'>): number {
    const stmt = this.db.prepare(
      `INSERT INTO audit_log (timestamp, session_id, task_id, actor, action_type, action_detail_json, risk_level, approval_status, approved_by, approved_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    const result = stmt.run(
      entry.timestamp,
      entry.sessionId ?? null,
      entry.taskId ?? null,
      entry.actor,
      entry.actionType,
      entry.actionDetailJson ?? null,
      entry.riskLevel ?? null,
      entry.approvalStatus ?? null,
      entry.approvedBy ?? null,
      entry.approvedAt ?? null
    )
    return Number(result.lastInsertRowid)
  }

  query(filters: AuditFilters): AuditEntry[] {
    const where: string[] = []
    const params: (string | number)[] = []
    if (filters.taskId) {
      where.push('task_id = ?')
      params.push(filters.taskId)
    }
    if (filters.sessionId) {
      where.push('session_id = ?')
      params.push(filters.sessionId)
    }
    if (filters.actor) {
      where.push('actor = ?')
      params.push(filters.actor)
    }
    if (filters.actionType) {
      where.push('action_type = ?')
      params.push(filters.actionType)
    }
    if (filters.riskLevel) {
      where.push('risk_level = ?')
      params.push(filters.riskLevel)
    }
    if (filters.from) {
      where.push('timestamp >= ?')
      params.push(filters.from)
    }
    if (filters.to) {
      where.push('timestamp <= ?')
      params.push(filters.to)
    }
    const sql = `SELECT * FROM audit_log ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY timestamp DESC LIMIT 1000`
    const rows = this.db.prepare(sql).all(...params)
    return rows.map(rowToEntry)
  }
}
