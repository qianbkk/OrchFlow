import type { TaskDependency } from '@shared/types'
import { Repository } from './base'

function rowToDep(row: unknown): TaskDependency {
  const r = row as Record<string, unknown>
  return {
    taskId: r.task_id as string,
    dependsOnTaskId: r.depends_on_task_id as string,
    messageConfigJson: (r.message_config_json as string | null) ?? undefined
  }
}

export class TaskDependencyRepository extends Repository {
  /** Get all dependencies for a task (what this task depends ON) */
  listByTask(taskId: string): TaskDependency[] {
    const rows = this.db
      .prepare('SELECT * FROM task_dependencies WHERE task_id = ?')
      .all(taskId)
    return rows.map(rowToDep)
  }

  /** Get all tasks that depend ON a given task */
  listDependents(dependsOnTaskId: string): TaskDependency[] {
    const rows = this.db
      .prepare('SELECT * FROM task_dependencies WHERE depends_on_task_id = ?')
      .all(dependsOnTaskId)
    return rows.map(rowToDep)
  }

  add(dep: TaskDependency): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO task_dependencies (task_id, depends_on_task_id, message_config_json)
         VALUES (?, ?, ?)`
      )
      .run(dep.taskId, dep.dependsOnTaskId, dep.messageConfigJson ?? null)
  }

  remove(taskId: string, dependsOnTaskId: string): void {
    this.db
      .prepare('DELETE FROM task_dependencies WHERE task_id = ? AND depends_on_task_id = ?')
      .run(taskId, dependsOnTaskId)
  }

  /** Get all dependencies in a project (joins with tasks table for project filter) */
  listByProject(projectId: string): TaskDependency[] {
    const rows = this.db
      .prepare(
        `SELECT td.* FROM task_dependencies td
         JOIN tasks t ON td.task_id = t.id
         WHERE t.project_id = ?`
      )
      .all(projectId)
    return rows.map(rowToDep)
  }
}
