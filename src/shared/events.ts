// IPC 事件名常量 — 集中定义避免字面量散落
// Send (Renderer -> Main) uses 'ipcMain.handle' API, not events
// Receive (Main -> Renderer) uses ipcMain.emit / webContents.send

export const ELECTRON_EVENTS = {
  WORKTREE_FILE_CHANGE: 'worktree:file-change',
  // Session events (Main -> Renderer)
  SESSION_OUTPUT: 'session:output',
  SESSION_STATUS: 'session:status',
  // Task events
  TASK_STATUS: 'task:status',
  TASK_CREATED: 'task:created',
  TASK_BATCH_CREATED: 'task:batch-created',
  // Approval events
  APPROVAL_REQUEST: 'approval:request',
  APPROVAL_RESOLVED: 'approval:resolved',
  // Checkpoint events
  CHECKPOINT_CREATED: 'checkpoint:created',
  // Notification events
  NOTIFICATION_NEW: 'notification:new',
  NOTIFICATION_NAVIGATE: 'notification:navigate',
  // PTY data channel (main -> renderer, raw bytes in interactive mode)
  PTY_DATA: 'pty:data',
  // Shortcut events (menu accelerators)
  SHORTCUT_CREATE_CHECKPOINT: 'shortcut:createCheckpoint',
  // Message bus events
  MESSAGE_BUS_DELIVERED: 'message-bus:delivered',
  MESSAGE_BUS_PUBLISHED: 'message-bus:published',
  // Pipeline events
  PIPELINE_STARTED: 'pipeline:started',
  PIPELINE_STATUS: 'pipeline:status',
  PIPELINE_COMPLETED: 'pipeline:completed',
  PIPELINE_FAILED: 'pipeline:failed',
  // Audit events
  AUDIT_ENTRY: 'audit:entry'
} as const

// Receiver-whitelist for the preload `on()` API
export const RECEIVE_EVENTS: readonly string[] = [
  ELECTRON_EVENTS.SESSION_OUTPUT,
  ELECTRON_EVENTS.SESSION_STATUS,
  ELECTRON_EVENTS.TASK_STATUS,
  ELECTRON_EVENTS.TASK_CREATED,
  ELECTRON_EVENTS.TASK_BATCH_CREATED,
  ELECTRON_EVENTS.APPROVAL_REQUEST,
  ELECTRON_EVENTS.APPROVAL_RESOLVED,
  ELECTRON_EVENTS.CHECKPOINT_CREATED,
  ELECTRON_EVENTS.NOTIFICATION_NEW,
  ELECTRON_EVENTS.NOTIFICATION_NAVIGATE,
  ELECTRON_EVENTS.PTY_DATA,
  ELECTRON_EVENTS.SHORTCUT_CREATE_CHECKPOINT,
  ELECTRON_EVENTS.MESSAGE_BUS_DELIVERED,
  ELECTRON_EVENTS.MESSAGE_BUS_PUBLISHED,
  ELECTRON_EVENTS.PIPELINE_STARTED,
  ELECTRON_EVENTS.PIPELINE_STATUS,
  ELECTRON_EVENTS.PIPELINE_COMPLETED,
  ELECTRON_EVENTS.PIPELINE_FAILED,
  ELECTRON_EVENTS.AUDIT_ENTRY
]
