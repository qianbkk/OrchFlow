import type { Task, TaskCreateInput, TaskFilters, TaskStatus } from '@shared/types'
import { Repository } from './base'

function rowToTask(row: unknown): Task {
  const r = row as Record<string, unknown>
  return {
    id: r.id as string,
    projectId: r.project_id as string,
    title: r.title as string,
    description: (r.description as string | null) ?? undefined,
    mode: r.mode as Task['mode'],
    assignmentMode: r.assignment_mode as Task['assignmentMode'],
    status: r.status as TaskStatus,
    agentType: (r.agent_type as string | null) as Task['agentType'],
    worktreePath: (r.worktree_path as string | null) ?? undefined,
    branchName: (r.branch_name as string | null) ?? undefined,
    createdAt: r.created_at as number,
    startedAt: (r.started_at as number | null) ?? undefined,
    completedAt: (r.completed_at as number | null) ?? undefined,
    approvalPolicyJson: (r.approval_policy_json as string | null) ?? undefined,
    persistOnClose: Boolean(r.persist_on_close)
  }
}

export class TaskRepository extends Repository {
  list(filters?: TaskFilters): Task[] {
    const where: string[] = []
    const params: (string | number)[] = []
    if (filters?.projectId) {
      where.push('project_id = ?')
      params.push(filters.projectId)
    }
    if (filters?.status) {
      where.push('status = ?')
      params.push(filters.status)
    }
    if (filters?.agentType) {
      where.push('agent_type = ?')
      params.push(filters.agentType)
    }
    const sql = `SELECT * FROM tasks ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC`
    const rows = this.db.prepare(sql).all(...params)
    return rows.map(rowToTask)
  }

  get(id: string): Task | null {
    const row = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id)
    return row ? rowToTask(row) : null
  }

  create(input: TaskCreateInput & { id: string }): Task {
    const now = Date.now()
    const task: Task = {
      id: input.id,
      projectId: input.projectId,
      title: input.title,
      description: input.description,
      mode: input.mode,
      assignmentMode: input.assignmentMode,
      status: 'created',
      agentType: input.agentType ?? null,
      worktreePath: undefined,
      branchName: undefined,
      createdAt: now,
      approvalPolicyJson: input.approvalPolicy ? JSON.stringify(input.approvalPolicy) : undefined,
      persistOnClose: input.persistOnClose ?? false
    }
    this.db
      .prepare(
        `INSERT INTO tasks (id, project_id, title, description, mode, assignment_mode, status, agent_type, created_at, approval_policy_json, persist_on_close)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        task.id,
        task.projectId,
        task.title,
        task.description ?? null,
        task.mode,
        task.assignmentMode,
        task.status,
        task.agentType ?? null,
        task.createdAt,
        task.approvalPolicyJson ?? null,
        task.persistOnClose ? 1 : 0
      )
    return task
  }

  updateStatus(id: string, status: TaskStatus): void {
    const updates: string[] = ['status = ?']
    const params: (string | number)[] = [status]
    if (status === 'running') {
      updates.push('started_at = ?')
      params.push(Date.now())
    }
    if (status === 'done' || status === 'failed' || status === 'cancelled') {
      updates.push('completed_at = ?')
      params.push(Date.now())
    }
    params.push(id)
    this.db.prepare(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`).run(...params)
  }

  setWorktree(id: string, worktreePath: string, branchName: string): void {
    this.db
      .prepare('UPDATE tasks SET worktree_path = ?, branch_name = ? WHERE id = ?')
      .run(worktreePath, branchName, id)
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM tasks WHERE id = ?').run(id)
  }
}
