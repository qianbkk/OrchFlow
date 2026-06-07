import { contextBridge, ipcRenderer } from 'electron'
import { RECEIVE_EVENTS } from '../shared/events'

// API surface exposed to the renderer as window.orchflow
const api = {
  // App info
  getAppInfo: () =>
    ipcRenderer.invoke('app:info') as Promise<{
      name: string
      version: string
      platform: NodeJS.Platform
    }>,

  // Project
  projects: {
    list: () => ipcRenderer.invoke('projects:list'),
    open: (rootPath: string) => ipcRenderer.invoke('projects:open', rootPath),
    current: () => ipcRenderer.invoke('projects:current'),
    setCurrent: (projectId: string) => ipcRenderer.invoke('projects:setCurrent', projectId)
  },

  // Agents
  agents: {
    detectInstalled: () => ipcRenderer.invoke('agents:detectInstalled'),
    getConfig: (agentType: string) => ipcRenderer.invoke('agents:getConfig', agentType),
    setConfig: (agentType: string, config: unknown) =>
      ipcRenderer.invoke('agents:setConfig', agentType, config)
  },

  // Settings / credentials
  settings: {
    get: (key: string) => ipcRenderer.invoke('settings:get', key),
    set: (key: string, value: unknown) => ipcRenderer.invoke('settings:set', key, value)
  },

  // Sessions
  sessions: {
    list: (taskId?: string) => ipcRenderer.invoke('sessions:list', taskId),
    start: (config: unknown) => ipcRenderer.invoke('sessions:start', config),
    stop: (sessionId: string, mode: 'graceful' | 'force') =>
      ipcRenderer.invoke('sessions:stop', sessionId, mode),
    pause: (sessionId: string) => ipcRenderer.invoke('sessions:pause', sessionId),
    resume: (sessionId: string) => ipcRenderer.invoke('sessions:resume', sessionId),
    send: (sessionId: string, message: string) =>
      ipcRenderer.invoke('sessions:send', sessionId, message),
    attachPty: (sessionId: string) => ipcRenderer.invoke('sessions:attachPty', sessionId),
    openExternal: (sessionId: string) => ipcRenderer.invoke('sessions:openExternal', sessionId)
  },

  // Tasks
  tasks: {
    list: (filters?: unknown) => ipcRenderer.invoke('tasks:list', filters),
    create: (input: unknown) => ipcRenderer.invoke('tasks:create', input),
    cancel: (taskId: string) => ipcRenderer.invoke('tasks:cancel', taskId),
    retry: (taskId: string) => ipcRenderer.invoke('tasks:retry', taskId),
    get: (taskId: string) => ipcRenderer.invoke('tasks:get', taskId)
  },

  // Approval
  approval: {
    getQueue: () => ipcRenderer.invoke('approval:queue'),
    approve: (requestId: string) => ipcRenderer.invoke('approval:approve', requestId),
    reject: (requestId: string) => ipcRenderer.invoke('approval:reject', requestId),
    batchApprove: (requestIds: string[]) =>
      ipcRenderer.invoke('approval:batchApprove', requestIds)
  },

  // Checkpoints
  checkpoints: {
    list: (sessionId: string) => ipcRenderer.invoke('checkpoints:list', sessionId),
    create: (sessionId: string, description: string) =>
      ipcRenderer.invoke('checkpoints:create', sessionId, description),
    rollback: (checkpointId: string) => ipcRenderer.invoke('checkpoints:rollback', checkpointId)
  },

  // Git
  git: {
    getDiff: (worktreePath: string) => ipcRenderer.invoke('git:getDiff', worktreePath),
    merge: (taskId: string) => ipcRenderer.invoke('git:merge', taskId),
    discard: (taskId: string) => ipcRenderer.invoke('git:discard', taskId),
    keep: (taskId: string) => ipcRenderer.invoke('git:keep', taskId)
  },

  // Audit
  audit: {
    query: (filters: unknown) => ipcRenderer.invoke('audit:query', filters),
    export: (filters: unknown, format: 'json' | 'csv') =>
      ipcRenderer.invoke('audit:export', filters, format)
  },

  // Notifications
  notifications: {
    list: () => ipcRenderer.invoke('notifications:list'),
    markRead: (id: number) => ipcRenderer.invoke('notifications:markRead', id)
  },

  // Event subscriptions
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

export type OrchFlowAPI = typeof api
