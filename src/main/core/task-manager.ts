import { randomUUID } from 'node:crypto'
import type { Task, TaskCreateInput, TaskStatus } from '@shared/types'
import { TaskRepository } from '../db/repositories/task.repository'
import { SessionRepository } from '../db/repositories/session.repository'
import { AuditRepository } from '../db/repositories/audit.repository'
import { ProjectRepository } from '../db/repositories/project.repository'
import { sessionManager } from './session-manager'
import { ensureWorktree } from '../git/worktree'

const tasks = new TaskRepository()
const sessions = new SessionRepository()
const audit = new AuditRepository()
const projects = new ProjectRepository()

export const taskManager = {
  async create(input: TaskCreateInput): Promise<Task> {
    const task = tasks.create({ ...input, id: randomUUID() })

    // Set up worktree if this is a non-pipeline task with a project
    const project = projects.get(input.projectId)
    if (project) {
      try {
        const { worktreePath, branchName } = await ensureWorktree(project.rootPath, task.id, task.title)
        tasks.setWorktree(task.id, worktreePath, branchName)
        task.worktreePath = worktreePath
        task.branchName = branchName
      } catch (err) {
        console.warn(`[task-manager] worktree setup failed:`, err)
        // Worktree failure is non-fatal for the task itself; user can retry
      }
    }

    audit.log({
      timestamp: Date.now(),
      taskId: task.id,
      actor: 'user',
      actionType: 'task_create',
      actionDetailJson: JSON.stringify({ title: task.title, mode: task.mode, agentType: task.agentType }),
      approvalStatus: 'auto'
    })

    // Auto-start if an explicit agent is selected
    if (task.agentType && task.worktreePath) {
      tasks.updateStatus(task.id, 'queued')
      const prompt = task.description?.trim() || task.title
      await sessionManager.start({
        taskId: task.id,
        agentType: task.agentType,
        worktreePath: task.worktreePath,
        prompt
      })
      tasks.updateStatus(task.id, 'running')
    }

    return tasks.get(task.id)!
  },

  async cancel(taskId: string): Promise<void> {
    const task = tasks.get(taskId)
    if (!task) return
    const sessionList = sessions.list(taskId)
    for (const s of sessionList) {
      if (s.status === 'running' || s.status === 'initializing' || s.status === 'waiting_input' || s.status === 'waiting_approval') {
        await sessionManager.stop(s.id, 'force')
      }
    }
    tasks.updateStatus(taskId, 'failed')
    audit.log({
      timestamp: Date.now(),
      taskId,
      actor: 'user',
      actionType: 'task_cancel',
      approvalStatus: 'auto'
    })
  },

  async retry(taskId: string): Promise<void> {
    const task = tasks.get(taskId)
    if (!task) return
    if (task.status === 'running' || task.status === 'queued') return
    if (!task.agentType) {
      throw new Error('Cannot auto-retry: no agent assigned. Please re-create with an explicit agent.')
    }
    if (!task.worktreePath) {
      throw new Error('Cannot auto-retry: no worktree bound to this task.')
    }
    tasks.updateStatus(taskId, 'queued')
    const prompt = task.description?.trim() || task.title
    await sessionManager.start({
      taskId: task.id,
      agentType: task.agentType,
      worktreePath: task.worktreePath,
      prompt
    })
    tasks.updateStatus(taskId, 'running')
  },

  list(filters: Parameters<TaskRepository['list']>[0]) {
    return tasks.list(filters)
  },

  get(id: string): Task | null {
    return tasks.get(id)
  },

  updateStatus(id: string, status: TaskStatus): void {
    tasks.updateStatus(id, status)
  }
}
