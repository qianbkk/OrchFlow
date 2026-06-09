import { contextBridge, ipcRenderer } from 'electron'
import { RECEIVE_EVENTS } from '../shared/events'
import type {
  OrchFlowAPI,
  Project,
  DetectedAgent,
  AgentConfig,
  AgentType,
  Session,
  Task,
  TaskCreateInput,
  TaskBatchCreateInput,
  TaskPlanInput,
  TaskImportInput,
  TaskFilters,
  TaskStatus,
  TaskDependency,
  MessageConfig,
  ApprovalRequest,
  Checkpoint,
  SessionConfig,
  AuditEntry,
  AuditFilters,
  AuditFilterOptions,
  Notification,
  DiffResult,
  PipelineGraph,
  PipelineStatus,
  AgentMessage,
  FileFilter
} from '../shared/types'

// API surface exposed to the renderer as window.orchflow
const api: OrchFlowAPI = {
  getAppInfo: () => ipcRenderer.invoke('app:info'),

  projects: {
    list: () => ipcRenderer.invoke('projects:list') as Promise<Project[]>,
    open: (rootPath: string) => ipcRenderer.invoke('projects:open', rootPath) as Promise<Project>,
    current: () => ipcRenderer.invoke('projects:current') as Promise<Project | null>,
    setCurrent: (projectId: string) => ipcRenderer.invoke('projects:setCurrent', projectId) as Promise<void>
  },

  agents: {
    detectInstalled: () => ipcRenderer.invoke('agents:detectInstalled') as Promise<DetectedAgent[]>,
    getConfig: (agentType: AgentType) =>
      ipcRenderer.invoke('agents:getConfig', agentType) as Promise<AgentConfig | null>,
    setConfig: (agentType: AgentType, config: Partial<AgentConfig>) =>
      ipcRenderer.invoke('agents:setConfig', agentType, config) as Promise<AgentConfig>
  },

  settings: {
    get: <T = unknown>(key: string) => ipcRenderer.invoke('settings:get', key) as Promise<T | null>,
    set: (key: string, value: unknown) => ipcRenderer.invoke('settings:set', key, value) as Promise<void>,
    apiKeyExists: (agentType: string) =>
      ipcRenderer.invoke('settings:apiKeyExists', agentType) as Promise<boolean>
  },

  sessions: {
    list: (taskId?: string) => ipcRenderer.invoke('sessions:list', taskId) as Promise<Session[]>,
    start: (config: SessionConfig) => ipcRenderer.invoke('sessions:start', config) as Promise<Session>,
    stop: (sessionId: string, mode: 'graceful' | 'force') =>
      ipcRenderer.invoke('sessions:stop', sessionId, mode) as Promise<void>,
    pause: (sessionId: string) => ipcRenderer.invoke('sessions:pause', sessionId) as Promise<void>,
    resume: (sessionId: string) => ipcRenderer.invoke('sessions:resume', sessionId) as Promise<void>,
    send: (sessionId: string, message: string) =>
      ipcRenderer.invoke('sessions:send', sessionId, message) as Promise<void>,
    attachPty: (sessionId: string) => ipcRenderer.invoke('sessions:attachPty', sessionId) as Promise<void>,
    openExternal: (sessionId: string) => ipcRenderer.invoke('sessions:openExternal', sessionId) as Promise<void>,
    setMode: (sessionId: string, mode: 'headless' | 'interactive') =>
      ipcRenderer.invoke('sessions:setMode', sessionId, mode) as Promise<void>,
    ptyInput: (sessionId: string, data: string) =>
      ipcRenderer.invoke('pty:input', sessionId, data) as Promise<void>,
    ptyResize: (sessionId: string, cols: number, rows: number) =>
      ipcRenderer.invoke('pty:resize', sessionId, cols, rows) as Promise<void>
  },

  tasks: {
    list: (filters?: TaskFilters) => ipcRenderer.invoke('tasks:list', filters) as Promise<Task[]>,
    create: (input: TaskCreateInput) => ipcRenderer.invoke('tasks:create', input) as Promise<Task>,
    createBatch: (input: TaskBatchCreateInput) => ipcRenderer.invoke('tasks:createBatch', input) as Promise<Task[]>,
    createFromPlan: (input: TaskPlanInput) => ipcRenderer.invoke('tasks:createFromPlan', input) as Promise<Task[]>,
    importFromFile: (input: TaskImportInput) => ipcRenderer.invoke('tasks:importFromFile', input) as Promise<Task[]>,
    cancel: (taskId: string) => ipcRenderer.invoke('tasks:cancel', taskId) as Promise<void>,
    retry: (taskId: string) => ipcRenderer.invoke('tasks:retry', taskId) as Promise<void>,
    get: (taskId: string) => ipcRenderer.invoke('tasks:get', taskId) as Promise<Task | null>,
    updateStatus: (taskId: string, status: TaskStatus) =>
      ipcRenderer.invoke('tasks:updateStatus', taskId, status) as Promise<void>,
    getDependencies: (taskId: string) =>
      ipcRenderer.invoke('tasks:getDependencies', taskId) as Promise<TaskDependency[]>,
    addDependency: (taskId: string, dependsOnTaskId: string, config?: MessageConfig) =>
      ipcRenderer.invoke('tasks:addDependency', taskId, dependsOnTaskId, config) as Promise<void>,
    removeDependency: (taskId: string, dependsOnTaskId: string) =>
      ipcRenderer.invoke('tasks:removeDependency', taskId, dependsOnTaskId) as Promise<void>
  },

  approval: {
    getQueue: () => ipcRenderer.invoke('approval:queue') as Promise<ApprovalRequest[]>,
    approve: (requestId: string) => ipcRenderer.invoke('approval:approve', requestId) as Promise<void>,
    reject: (requestId: string) => ipcRenderer.invoke('approval:reject', requestId) as Promise<void>,
    batchApprove: (requestIds: string[]) =>
      ipcRenderer.invoke('approval:batchApprove', requestIds) as Promise<void>,
    batchReject: (requestIds: string[]) =>
      ipcRenderer.invoke('approval:batchReject', requestIds) as Promise<void>
  },

  checkpoints: {
    list: (sessionId: string) => ipcRenderer.invoke('checkpoints:list', sessionId) as Promise<Checkpoint[]>,
    create: (sessionId: string, description: string) =>
      ipcRenderer.invoke('checkpoints:create', sessionId, description) as Promise<Checkpoint>,
    rollback: (checkpointId: string) => ipcRenderer.invoke('checkpoints:rollback', checkpointId) as Promise<void>,
    rollbackDiff: (checkpointId: string) =>
      ipcRenderer.invoke('checkpoints:rollbackDiff', checkpointId) as Promise<DiffResult>
  },

  git: {
    getDiff: (worktreePath: string) => ipcRenderer.invoke('git:getDiff', worktreePath) as Promise<DiffResult>,
    merge: (taskId: string) => ipcRenderer.invoke('git:merge', taskId) as Promise<void>,
    discard: (taskId: string) => ipcRenderer.invoke('git:discard', taskId) as Promise<void>,
    keep: (taskId: string) => ipcRenderer.invoke('git:keep', taskId) as Promise<void>
  },

  audit: {
    query: (filters: AuditFilters) => ipcRenderer.invoke('audit:query', filters) as Promise<AuditEntry[]>,
    export: (filters: AuditFilters, format: 'json' | 'csv') =>
      ipcRenderer.invoke('audit:export', filters, format) as Promise<string>,
    getFilterOptions: () => ipcRenderer.invoke('audit:getFilterOptions') as Promise<AuditFilterOptions>
  },

  notifications: {
    list: () => ipcRenderer.invoke('notifications:list') as Promise<Notification[]>,
    markRead: (id: number) => ipcRenderer.invoke('notifications:markRead', id) as Promise<void>
  },

  dialog: {
    openDirectory: () => ipcRenderer.invoke('dialog:openDirectory') as Promise<string | null>,
    openFile: (filters?: FileFilter[]) => ipcRenderer.invoke('dialog:openFile', filters) as Promise<string | null>
  },

  pipeline: {
    start: (projectId: string) => ipcRenderer.invoke('pipeline:start', projectId) as Promise<void>,
    pause: (projectId: string) => ipcRenderer.invoke('pipeline:pause', projectId) as Promise<void>,
    resume: (projectId: string) => ipcRenderer.invoke('pipeline:resume', projectId) as Promise<void>,
    getGraph: (projectId: string) => ipcRenderer.invoke('pipeline:getGraph', projectId) as Promise<PipelineGraph>,
    getStatus: (projectId: string) => ipcRenderer.invoke('pipeline:getStatus', projectId) as Promise<PipelineStatus>
  },

  messageBus: {
    publish: (fromSessionId: string, toTaskId: string, message: Omit<AgentMessage, 'id' | 'timestamp' | 'delivered'>) =>
      ipcRenderer.invoke('messageBus:publish', fromSessionId, toTaskId, message) as Promise<AgentMessage>,
    list: (taskId?: string, delivered?: boolean) =>
      ipcRenderer.invoke('messageBus:list', taskId, delivered) as Promise<AgentMessage[]>,
    markDelivered: (messageId: string) =>
      ipcRenderer.invoke('messageBus:markDelivered', messageId) as Promise<void>,
    consumeForTask: (taskId: string) =>
      ipcRenderer.invoke('messageBus:consumeForTask', taskId) as Promise<AgentMessage[]>
  },

  on: (channel: string, listener: (payload: unknown) => void) => {
    if (!RECEIVE_EVENTS.includes(channel)) {
      // True block: do not register the handler at all for unknown channels.
      // This prevents a compromised renderer from subscribing to internal
      // channels that aren't part of the public API.
      console.error(`[preload] Blocked subscription to unknown channel: ${channel}`)
      return () => undefined
    }
    const handler = (_: unknown, payload: unknown): void => listener(payload)
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.removeListener(channel, handler)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('orchflow', api)
  } catch (error) {
    console.error('[preload] contextBridge failed:', error)
    throw new Error(`[preload] SECURITY: contextBridge failed to expose API. Aborting startup. Error: ${error}`)
  }
} else {
  // SECURITY: contextIsolation is required. Without it, the renderer process
  // has direct access to Node.js APIs, completely bypassing the sandbox.
  // Refuse to start in this insecure configuration.
  throw new Error(
    '[preload] SECURITY FATAL: contextIsolation is disabled. ' +
    'OrchFlow requires contextIsolation: true in webPreferences. ' +
    'Aborting startup to prevent insecure execution.'
  )
}
