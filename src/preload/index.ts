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
  TaskFilters,
  ApprovalRequest,
  Checkpoint,
  SessionConfig,
  AuditEntry,
  AuditFilters,
  Notification,
  DiffResult
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
    set: (key: string, value: unknown) => ipcRenderer.invoke('settings:set', key, value) as Promise<void>
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
    openExternal: (sessionId: string) => ipcRenderer.invoke('sessions:openExternal', sessionId) as Promise<void>
  },

  tasks: {
    list: (filters?: TaskFilters) => ipcRenderer.invoke('tasks:list', filters) as Promise<Task[]>,
    create: (input: TaskCreateInput) => ipcRenderer.invoke('tasks:create', input) as Promise<Task>,
    cancel: (taskId: string) => ipcRenderer.invoke('tasks:cancel', taskId) as Promise<void>,
    retry: (taskId: string) => ipcRenderer.invoke('tasks:retry', taskId) as Promise<void>,
    get: (taskId: string) => ipcRenderer.invoke('tasks:get', taskId) as Promise<Task | null>
  },

  approval: {
    getQueue: () => ipcRenderer.invoke('approval:queue') as Promise<ApprovalRequest[]>,
    approve: (requestId: string) => ipcRenderer.invoke('approval:approve', requestId) as Promise<void>,
    reject: (requestId: string) => ipcRenderer.invoke('approval:reject', requestId) as Promise<void>,
    batchApprove: (requestIds: string[]) =>
      ipcRenderer.invoke('approval:batchApprove', requestIds) as Promise<void>
  },

  checkpoints: {
    list: (sessionId: string) => ipcRenderer.invoke('checkpoints:list', sessionId) as Promise<Checkpoint[]>,
    create: (sessionId: string, description: string) =>
      ipcRenderer.invoke('checkpoints:create', sessionId, description) as Promise<Checkpoint>,
    rollback: (checkpointId: string) => ipcRenderer.invoke('checkpoints:rollback', checkpointId) as Promise<void>
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
      ipcRenderer.invoke('audit:export', filters, format) as Promise<string>
  },

  notifications: {
    list: () => ipcRenderer.invoke('notifications:list') as Promise<Notification[]>,
    markRead: (id: number) => ipcRenderer.invoke('notifications:markRead', id) as Promise<void>
  },

  on: (channel: string, listener: (payload: unknown) => void) => {
    if (!RECEIVE_EVENTS.includes(channel)) {
      console.warn(`[preload] Unknown event channel: ${channel}`)
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
  }
} else {
  ;(window as unknown as { orchflow: typeof api }).orchflow = api
}
