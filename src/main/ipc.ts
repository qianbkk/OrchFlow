import { ipcMain, shell } from 'electron'
import { basename } from 'node:path'
import { existsSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { exec } from 'node:child_process'
import * as keytar from 'keytar'
import { PROJECT_KEYTAR_SERVICE, KEYTAR_KEYS } from '@shared/constants'
import type { Project, TaskCreateInput, SessionConfig } from '@shared/types'
import { ProjectRepository } from './db/repositories/project.repository'
import { TaskRepository } from './db/repositories/task.repository'
import { SessionRepository } from './db/repositories/session.repository'
import { AuditRepository } from './db/repositories/audit.repository'
import { CheckpointRepository } from './db/repositories/checkpoint.repository'
import { NotificationRepository } from './db/repositories/notification.repository'
import { detectInstalledAgents, getAgentBinaryPath } from './agents/driver.registry'
import { sessionManager } from './core/session-manager'
import { taskManager } from './core/task-manager'
import { settingsStore } from './core/settings-store'
import { currentProjectStore } from './core/project-store'
import { getWorktreeDiff, mergeWorktree, discardWorktree } from './git/worktree'

const projects = new ProjectRepository()
const tasks = new TaskRepository()
const sessions = new SessionRepository()
const audit = new AuditRepository()
const checkpoints = new CheckpointRepository()
const notifications = new NotificationRepository()

// App info
ipcMain.handle('app:info', () => ({
  name: 'OrchFlow',
  version: '0.1.0',
  platform: process.platform
}))

// Projects
ipcMain.handle('projects:list', (): Project[] => projects.list())
ipcMain.handle('projects:current', (): Project | null => {
  const id = currentProjectStore.get()
  return id ? projects.get(id) : null
})
ipcMain.handle('projects:setCurrent', (_e, projectId: string): void => {
  projects.touch(projectId)
  currentProjectStore.set(projectId)
})
ipcMain.handle('projects:open', (_e, rootPath: string): Project => {
  if (!existsSync(rootPath)) throw new Error(`Path does not exist: ${rootPath}`)
  const name = basename(rootPath)
  const existing = projects.findByPath(rootPath)
  if (existing) {
    projects.touch(existing.id)
    currentProjectStore.set(existing.id)
    return existing
  }
  const project: Project = {
    id: randomUUID(),
    name,
    rootPath,
    createdAt: Date.now(),
    lastOpenedAt: Date.now()
  }
  projects.upsert(project)
  currentProjectStore.set(project.id)
  audit.log({
    timestamp: Date.now(),
    actor: 'user',
    actionType: 'project_open',
    actionDetailJson: JSON.stringify({ rootPath }),
    approvalStatus: 'auto'
  })
  return project
})

// Agents
ipcMain.handle('agents:detectInstalled', async () => detectInstalledAgents())
ipcMain.handle('agents:getConfig', (_e, agentType: string) => settingsStore.getAgentConfig(agentType))
ipcMain.handle('agents:setConfig', (_e, agentType: string, config: unknown) =>
  settingsStore.setAgentConfig(agentType, config as Record<string, unknown>)
)

// Settings (api keys via keytar)
ipcMain.handle('settings:get', async (_e, key: string): Promise<unknown> => {
  if (key.startsWith('apiKey:')) {
    const agentType = key.slice(7)
    return keytar.getPassword(PROJECT_KEYTAR_SERVICE, `${KEYTAR_KEYS.API_KEY_PREFIX}${agentType}`)
  }
  return settingsStore.get(key)
})
ipcMain.handle('settings:set', async (_e, key: string, value: unknown): Promise<void> => {
  if (key.startsWith('apiKey:')) {
    const agentType = key.slice(7)
    const v = value as string
    if (!v) {
      await keytar.deletePassword(PROJECT_KEYTAR_SERVICE, `${KEYTAR_KEYS.API_KEY_PREFIX}${agentType}`)
    } else {
      await keytar.setPassword(PROJECT_KEYTAR_SERVICE, `${KEYTAR_KEYS.API_KEY_PREFIX}${agentType}`, v)
    }
    return
  }
  settingsStore.set(key, value)
})

// Sessions
ipcMain.handle('sessions:list', (_e, taskId?: string) => sessions.list(taskId))
ipcMain.handle('sessions:start', async (_e, config: SessionConfig) => sessionManager.start(config))
ipcMain.handle('sessions:stop', async (_e, sessionId: string, mode: 'graceful' | 'force') => {
  await sessionManager.stop(sessionId, mode)
})
ipcMain.handle('sessions:pause', async (_e, sessionId: string) => sessionManager.pause(sessionId))
ipcMain.handle('sessions:resume', async (_e, sessionId: string) => sessionManager.resume(sessionId))
ipcMain.handle('sessions:send', async (_e, sessionId: string, message: string) =>
  sessionManager.send(sessionId, message)
)
ipcMain.handle('sessions:attachPty', async (_e, sessionId: string) => sessionManager.attachPty(sessionId))
ipcMain.handle('sessions:openExternal', (_e, sessionId: string) => {
  const session = sessions.get(sessionId)
  if (!session) throw new Error(`Session not found: ${sessionId}`)
  const task = tasks.get(session.taskId)
  if (!task) throw new Error(`Task not found: ${session.taskId}`)
  const cliPath = getAgentBinaryPath(session.agentType)
  void exec(
    `wt -w 0 new-tab --title "OrchFlow ${session.agentType}" -d "${task.worktreePath ?? '.'}" "${cliPath}"`
  )
  void shell.openExternal('https://github.com/')
})

// Tasks
ipcMain.handle('tasks:list', (_e, filters?: unknown) => tasks.list(filters as never))
ipcMain.handle('tasks:get', (_e, id: string) => tasks.get(id))
ipcMain.handle('tasks:create', async (_e, input: TaskCreateInput) => taskManager.create(input))
ipcMain.handle('tasks:cancel', async (_e, taskId: string) => taskManager.cancel(taskId))
ipcMain.handle('tasks:retry', async (_e, taskId: string) => taskManager.retry(taskId))

// Approval
ipcMain.handle('approval:queue', () => sessionManager.getApprovalQueue())
ipcMain.handle('approval:approve', (_e, requestId: string) => sessionManager.approve(requestId))
ipcMain.handle('approval:reject', (_e, requestId: string) => sessionManager.reject(requestId))
ipcMain.handle('approval:batchApprove', (_e, requestIds: string[]) => {
  for (const id of requestIds) sessionManager.approve(id)
})

// Checkpoints
ipcMain.handle('checkpoints:list', (_e, sessionId: string) => checkpoints.list(sessionId))
ipcMain.handle('checkpoints:create', (_e, sessionId: string, description: string) =>
  sessionManager.createCheckpoint(sessionId, description)
)
ipcMain.handle('checkpoints:rollback', async (_e, checkpointId: string) => {
  if (!checkpoints.get(checkpointId)) throw new Error(`Checkpoint not found: ${checkpointId}`)
  await sessionManager.rollbackToCheckpoint(checkpointId)
})

// Git
ipcMain.handle('git:getDiff', async (_e, worktreePath: string) => getWorktreeDiff(worktreePath))
ipcMain.handle('git:merge', async (_e, taskId: string) => {
  const task = tasks.get(taskId)
  if (!task) throw new Error(`Task not found: ${taskId}`)
  await mergeWorktree(task)
})
ipcMain.handle('git:discard', async (_e, taskId: string) => {
  const task = tasks.get(taskId)
  if (!task) throw new Error(`Task not found: ${taskId}`)
  await discardWorktree(task)
})
ipcMain.handle('git:keep', (_e, taskId: string) => {
  if (!tasks.get(taskId)) throw new Error(`Task not found: ${taskId}`)
  tasks.updateStatus(taskId, 'done')
})

// Audit
ipcMain.handle('audit:query', (_e, filters: unknown) => audit.query(filters as never))
ipcMain.handle('audit:export', async (_e, filters: unknown, format: 'json' | 'csv') => {
  const entries = audit.query(filters as never)
  if (format === 'json') return JSON.stringify(entries, null, 2)
  const header = 'timestamp,actor,action_type,risk_level,approval_status,task_id,session_id'
  const lines = entries.map((e) =>
    [e.timestamp, e.actor, e.actionType, e.riskLevel ?? '', e.approvalStatus ?? '', e.taskId ?? '', e.sessionId ?? '']
      .map((v) => String(v).includes(',') ? `"${String(v).replace(/"/g, '""')}"` : v)
      .join(',')
  )
  return [header, ...lines].join('\n')
})

// Notifications
ipcMain.handle('notifications:list', () => notifications.list())
ipcMain.handle('notifications:markRead', (_e, id: number) => notifications.markRead(id))

export function registerIpcHandlers(): void {
  // This function is a no-op marker; the module-level handlers above register on import.
  console.log('[ipc] handlers registered')
}
