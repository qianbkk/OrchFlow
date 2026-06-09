import { ipcMain, dialog } from 'electron'
import { basename, resolve, isAbsolute, join, sep, dirname } from 'node:path'
import { existsSync, realpathSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import * as keytar from 'keytar'
import { PROJECT_KEYTAR_SERVICE, KEYTAR_KEYS, APP_VERSION } from '@shared/constants'
import type { Project, Task, TaskCreateInput, SessionConfig, TaskFilters, AuditFilters } from '@shared/types'
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

const requireTask = (id: string): Task => {
  const t = tasks.get(id)
  if (!t) throw new Error(`Task not found: ${id}`)
  return t
}

// ===== Approved path registry (F-01 fix) =====

/** Paths approved via projects:open — renderer can only access these or their sub-paths.
 *  This is the "minimum privilege" model: the renderer can't access arbitrary filesystem paths. */
const APPROVED_BASE_PATHS = new Set<string>()

export function registerApprovedPath(absPath: string): void {
  APPROVED_BASE_PATHS.add(resolve(absPath))
}

/** Validate that a renderer-supplied path is absolute, exists, and is under an
 *  approved project root or worktree base. Prevents renderer-driven FS access
 *  to arbitrary paths. */
function validateUserPath(p: string, label: string): string {
  if (typeof p !== 'string' || p.length === 0) {
    throw new Error(`${label}: path must be a non-empty string`)
  }
  if (!isAbsolute(p)) {
    throw new Error(`${label}: path must be absolute`)
  }
  if (!existsSync(p)) throw new Error(`${label}: path does not exist: ${p}`)
  let real: string
  try {
    real = realpathSync(p)
  } catch {
    throw new Error(`${label}: cannot resolve real path: ${p}`)
  }
  const normalizedReal = resolve(real)

  // Reject Windows device / UNC paths
  const DEVICE_PREFIXES = ['\\\\?\\', '\\\\.\\', '//./', '//localhost/']
  if (DEVICE_PREFIXES.some(prefix => normalizedReal.startsWith(prefix))) {
    throw new Error(`${label}: device/UNC paths are not allowed`)
  }

  // Core security check: must be under an approved project root
  const isUnderApproved = [...APPROVED_BASE_PATHS].some(base =>
    normalizedReal === base || normalizedReal.startsWith(base + sep)
  )
  if (!isUnderApproved) {
    throw new Error(`${label}: path is not under any registered project root`)
  }

  return normalizedReal
}

function csvEscape(v: unknown): string {
  const s = String(v)
  // Guard against CSV formula injection (=, +, -, @, tab, CR) by prefixing with a single quote
  const needsQuoting = /[",\r\n\t]/.test(s)
  const isFormula = /^[=+\-@\t\r]/.test(s)
  const escaped = isFormula ? `'${s}` : s
  return needsQuoting || isFormula ? `"${escaped.replace(/"/g, '""')}"` : escaped
}

/** Runtime validation for IPC filter inputs. Prevents malformed data from
 *  reaching repository queries when renderer sends unexpected shapes. */
function parseTaskFilters(input: unknown): TaskFilters | undefined {
  if (input == null || typeof input !== 'object') return undefined
  const f = input as Record<string, unknown>
  return {
    projectId: typeof f.projectId === 'string' ? f.projectId : undefined,
    status: typeof f.status === 'string' ? f.status as TaskFilters['status'] : undefined,
    agentType: typeof f.agentType === 'string' ? f.agentType as TaskFilters['agentType'] : undefined,
    from: typeof f.from === 'number' ? f.from : undefined,
    to: typeof f.to === 'number' ? f.to : undefined
  }
}

function parseAuditFilters(input: unknown): AuditFilters {
  if (input == null || typeof input !== 'object') return {}
  const f = input as Record<string, unknown>
  return {
    projectId: typeof f.projectId === 'string' ? f.projectId : undefined,
    sessionId: typeof f.sessionId === 'string' ? f.sessionId : undefined,
    taskId: typeof f.taskId === 'string' ? f.taskId : undefined,
    actor: typeof f.actor === 'string' ? f.actor : undefined,
    actionType: typeof f.actionType === 'string' ? f.actionType : undefined,
    riskLevel: typeof f.riskLevel === 'string' ? f.riskLevel as AuditFilters['riskLevel'] : undefined,
    from: typeof f.from === 'number' ? f.from : undefined,
    to: typeof f.to === 'number' ? f.to : undefined
  }
}

// App info
ipcMain.handle('app:info', () => ({
  name: 'OrchFlow',
  version: APP_VERSION,
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
  // projects:open is the entry point — validate the path is safe, then register it
  if (typeof rootPath !== 'string' || !rootPath) {
    throw new Error('projects:open: path must be a non-empty string')
  }
  if (!isAbsolute(rootPath)) {
    throw new Error('projects:open: path must be absolute')
  }
  if (!existsSync(rootPath)) throw new Error(`projects:open: path does not exist: ${rootPath}`)
  let realPath: string
  try {
    realPath = realpathSync(rootPath)
  } catch {
    throw new Error(`projects:open: cannot resolve real path: ${rootPath}`)
  }
  const validated = resolve(realPath)

  // Reject device/UNC paths
  const DEVICE_PREFIXES = ['\\\\?\\', '\\\\.\\', '//./', '//localhost/']
  if (DEVICE_PREFIXES.some(prefix => validated.startsWith(prefix))) {
    throw new Error('projects:open: device/UNC paths are not allowed')
  }

  if (!existsSync(join(validated, '.git'))) {
    throw new Error(`Not a git repository: ${validated}`)
  }
  const name = basename(validated)
  const existing = projects.findByPath(validated)

  // Register this project root (and worktree base) as approved paths
  registerApprovedPath(validated)
  // Worktree base is sibling to project: ../[project-name]-orch-worktrees
  registerApprovedPath(join(dirname(validated), `${name}-orch-worktrees`))

  if (existing) {
    projects.touch(existing.id)
    currentProjectStore.set(existing.id)
    return existing
  }
  const project: Project = {
    id: randomUUID(),
    name,
    rootPath: validated,
    createdAt: Date.now(),
    lastOpenedAt: Date.now()
  }
  projects.upsert(project)
  currentProjectStore.set(project.id)
  audit.log({
    timestamp: Date.now(),
    actor: 'user',
    actionType: 'project_open',
    actionDetailJson: JSON.stringify({ rootPath: validated }),
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

// Settings (api keys via keytar — NEVER return plaintext keys to Renderer)
ipcMain.handle('settings:get', async (_e, key: string): Promise<unknown> => {
  if (key.startsWith('apiKey:')) {
    // SECURITY: never return the API key plaintext to the Renderer.
    // Use settings:apiKeyExists instead (returns boolean only).
    throw new Error('Use settings:apiKeyExists to check key configuration — plaintext API keys are never sent to the Renderer')
  }
  return settingsStore.get(key)
})
ipcMain.handle('settings:apiKeyExists', async (_e, agentType: string): Promise<boolean> => {
  const val = await keytar.getPassword(PROJECT_KEYTAR_SERVICE, `${KEYTAR_KEYS.API_KEY_PREFIX}${agentType}`)
  return val != null && val.length > 0
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
ipcMain.handle('sessions:setMode', (_e, sessionId: string, mode: 'headless' | 'interactive') => {
  sessionManager.setMode(sessionId, mode)
})
ipcMain.handle('pty:input', (_e, sessionId: string, data: string) => {
  sessionManager.ptyInput(sessionId, data)
})
ipcMain.handle('pty:resize', (_e, sessionId: string, cols: number, rows: number) => {
  sessionManager.ptyResize(sessionId, cols, rows)
})
ipcMain.handle('sessions:openExternal', async (_e, sessionId: string) => {
  const session = sessions.get(sessionId)
  if (!session) throw new Error(`Session not found: ${sessionId}`)
  const task = tasks.get(session.taskId)
  if (!task) throw new Error(`Task not found: ${session.taskId}`)
  if (!task.worktreePath) throw new Error('Task has no worktree to open externally')
  const cliPath = getAgentBinaryPath(session.agentType)
  // Use execFile with an arg array to prevent shell-injection from any
  // worktree path or agent type that contains shell metacharacters.
  try {
    await new Promise<void>((resolve, reject) => {
      execFile(
        'wt',
        [
          '-w', '0',
          'new-tab',
          '--title', `OrchFlow ${session.agentType}`,
          '-d', task.worktreePath!,
          cliPath
        ],
        { timeout: 5000 },
        (err) => { if (err) reject(err); else resolve() }
      )
    })
  } catch {
    // Fallback: if wt.exe is not available (older Win10, enterprise), use PowerShell
    // SECURITY: Use -EncodedCommand to completely avoid shell injection.
    // PowerShell -Command parses special chars (`, $, &, ;, etc.), so we encode
    // the entire script as UTF-16LE Base64, which -EncodedCommand treats as opaque.
    const psScript = `Set-Location -LiteralPath '${task.worktreePath!.replace(/'/g, "''")}'; & '${cliPath.replace(/'/g, "''")}'`
    const encoded = Buffer.from(psScript, 'utf16le').toString('base64')
    await new Promise<void>((resolve, reject) => {
      execFile(
        'powershell',
        ['-NoExit', '-NonInteractive', '-EncodedCommand', encoded],
        { timeout: 5000 },
        (err) => { if (err) reject(err); else resolve() }
      )
    })
  }
})

// Tasks
ipcMain.handle('tasks:list', (_e, filters?: unknown) => tasks.list(parseTaskFilters(filters)))
ipcMain.handle('tasks:get', (_e, id: string) => tasks.get(id))
ipcMain.handle('tasks:create', async (_e, input: TaskCreateInput) => taskManager.create(input))
ipcMain.handle('tasks:createBatch', async (_e, input: import('@shared/types').TaskBatchCreateInput) => taskManager.createBatch(input))
ipcMain.handle('tasks:createFromPlan', async (_e, input: import('@shared/types').TaskPlanInput) => taskManager.createFromPlan(input))
ipcMain.handle('tasks:importFromFile', async (_e, input: import('@shared/types').TaskImportInput) => taskManager.importFromFile(input))
ipcMain.handle('tasks:cancel', async (_e, taskId: string) => taskManager.cancel(taskId))
ipcMain.handle('tasks:retry', async (_e, taskId: string) => taskManager.retry(taskId))
ipcMain.handle('tasks:updateStatus', (_e, taskId: string, status: import('@shared/types').TaskStatus) =>
  taskManager.updateStatus(taskId, status))
ipcMain.handle('tasks:getDependencies', (_e, taskId: string) => taskManager.getDependencies(taskId))
ipcMain.handle('tasks:addDependency', (_e, taskId: string, dependsOnTaskId: string, config?: import('@shared/types').MessageConfig) =>
  taskManager.addDependency(taskId, dependsOnTaskId, config))
ipcMain.handle('tasks:removeDependency', (_e, taskId: string, dependsOnTaskId: string) =>
  taskManager.removeDependency(taskId, dependsOnTaskId))

// Approval
ipcMain.handle('approval:queue', () => sessionManager.getApprovalQueue())
ipcMain.handle('approval:approve', (_e, requestId: string) => sessionManager.approve(requestId))
ipcMain.handle('approval:reject', (_e, requestId: string) => sessionManager.reject(requestId))
ipcMain.handle('approval:batchApprove', (_e, requestIds: string[]) => {
  for (const id of requestIds) sessionManager.approve(id)
})
ipcMain.handle('approval:batchReject', (_e, requestIds: string[]) => {
  for (const id of requestIds) sessionManager.reject(id)
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
ipcMain.handle('checkpoints:rollbackDiff', async (_e, checkpointId: string) => {
  // PRD §3.4.3: rollback preview — "将撤销哪些操作"
  const { checkpointManager } = await import('./core/checkpoint')
  return checkpointManager.getRollbackDiff(checkpointId)
})

// Git
ipcMain.handle('git:getDiff', async (_e, worktreePath: string) => {
  const validated = validateUserPath(worktreePath, 'git:getDiff')
  return getWorktreeDiff(validated)
})
ipcMain.handle('git:merge', async (_e, taskId: string) => {
  const task = requireTask(taskId)
  if (task.worktreePath) validateUserPath(task.worktreePath, 'git:merge')
  await mergeWorktree(task)
})
ipcMain.handle('git:discard', async (_e, taskId: string) => {
  const task = requireTask(taskId)
  if (task.worktreePath) validateUserPath(task.worktreePath, 'git:discard')
  await discardWorktree(task)
})
ipcMain.handle('git:keep', (_e, taskId: string) => {
  requireTask(taskId)
  tasks.updateStatus(taskId, 'done')
})

// Audit
ipcMain.handle('audit:query', (_e, filters: unknown) => audit.query(parseAuditFilters(filters)))
ipcMain.handle('audit:export', async (_e, filters: unknown, format: 'json' | 'csv') => {
  const entries = audit.query(parseAuditFilters(filters))
  if (format === 'json') return JSON.stringify(entries, null, 2)
  const header = 'timestamp,actor,action_type,risk_level,approval_status,task_id,session_id'
  const lines = entries.map((e) =>
    [e.timestamp, e.actor, e.actionType, e.riskLevel ?? '', e.approvalStatus ?? '', e.taskId ?? '', e.sessionId ?? '']
      .map(csvEscape)
      .join(',')
  )
  return [header, ...lines].join('\n')
})
ipcMain.handle('audit:getFilterOptions', () => {
  const all = audit.query({})
  return {
    actors: [...new Set(all.map((e) => e.actor))].sort(),
    actionTypes: [...new Set(all.map((e) => e.actionType))].sort(),
    riskLevels: [...new Set(all.map((e) => e.riskLevel).filter(Boolean))]
  }
})

// Notifications
ipcMain.handle('notifications:list', () => notifications.list())
ipcMain.handle('notifications:markRead', (_e, id: number) => notifications.markRead(id))

// Dialog
ipcMain.handle('dialog:openDirectory', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Select project root directory (must be a git repository)',
    properties: ['openDirectory'],
    buttonLabel: 'Select'
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
})
ipcMain.handle('dialog:openFile', async (_e, filters?: Array<{ name: string; extensions: string[] }>) => {
  const result = await dialog.showOpenDialog({
    title: 'Select file to import',
    properties: ['openFile'],
    buttonLabel: 'Select',
    filters: filters ?? [{ name: 'All Files', extensions: ['*'] }]
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
})

// Pipeline
ipcMain.handle('pipeline:start', async (_e, projectId: string) => {
  const { pipelineEngine } = await import('./core/pipeline-engine')
  return pipelineEngine.start(projectId)
})
ipcMain.handle('pipeline:pause', async (_e, projectId: string) => {
  const { pipelineEngine } = await import('./core/pipeline-engine')
  return pipelineEngine.pause(projectId)
})
ipcMain.handle('pipeline:resume', async (_e, projectId: string) => {
  const { pipelineEngine } = await import('./core/pipeline-engine')
  return pipelineEngine.resume(projectId)
})
ipcMain.handle('pipeline:getGraph', async (_e, projectId: string) => {
  const { pipelineEngine } = await import('./core/pipeline-engine')
  return pipelineEngine.getGraph(projectId)
})
ipcMain.handle('pipeline:getStatus', async (_e, projectId: string) => {
  const { pipelineEngine } = await import('./core/pipeline-engine')
  return pipelineEngine.getStatus(projectId)
})

// Message Bus
ipcMain.handle('messageBus:publish', async (_e, fromSessionId: string, toTaskId: string, message: unknown) => {
  const { messageBus } = await import('./core/message-bus')
  const m = message as { messageType: string; content: string }
  return messageBus.publish(fromSessionId, toTaskId, m.messageType as import('@shared/types').AgentMessageType, m.content)
})
ipcMain.handle('messageBus:list', async (_e, taskId?: string, delivered?: boolean) => {
  const { messageBus } = await import('./core/message-bus')
  return messageBus.list(taskId, delivered)
})
ipcMain.handle('messageBus:markDelivered', async (_e, messageId: string) => {
  const { messageBus } = await import('./core/message-bus')
  return messageBus.markDelivered(messageId)
})
ipcMain.handle('messageBus:consumeForTask', async (_e, taskId: string) => {
  const { messageBus } = await import('./core/message-bus')
  return messageBus.consume(taskId)
})

export function registerIpcHandlers(): void {
  // Handlers register on module import (above). This marker exists so the
  // main process can call it at a known point in startup.
  console.log('[ipc] handlers registered')
}
