// Core domain types shared between Main and Renderer
// 任何修改需同步两侧构建，TypeScript-only 编译即可

// ===== Agent Types =====
export type AgentType = 'claude' | 'codex' | 'copilot'

export interface AgentConfig {
  type: AgentType
  executablePath?: string
  model?: string
  defaultPermissionPolicy?: PermissionPolicy
  persistOnClose?: boolean
  // CLI path is auto-detected; users may override.
  version?: string
}

export interface DetectedAgent {
  type: AgentType
  installed: boolean
  path?: string
  version?: string
}

// ===== Permission / Approval =====
export type RiskLevel = 'low' | 'medium' | 'high'
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'auto'

export interface PermissionPolicy {
  autoApprove: RiskLevel[]
  alwaysRequireApproval: string[] // operation types
}

export interface ApprovalRequest {
  id: string
  sessionId: string
  taskId: string
  toolCall: ToolCall
  riskLevel: RiskLevel
  timestamp: number
  status: ApprovalStatus
  resolvedAt?: number
  resolvedBy?: string
}

export interface ToolCall {
  type:
    | 'file_write'
    | 'file_delete'
    | 'file_read'
    | 'shell'
    | 'git_push'
    | 'git_force_push'
    | 'db_destructive'
    | 'install_deps'
    | 'merge'
    | 'other'
  description: string
  detail?: string
  filesAffected?: string[]
}

// ===== Project =====
export interface Project {
  id: string
  name: string
  rootPath: string
  worktreeBasePath?: string
  configJson?: string
  createdAt: number
  lastOpenedAt: number
}

// ===== Task =====
export type TaskStatus =
  | 'created'
  | 'queued'
  | 'assigned'
  | 'running'
  | 'pending_review'
  | 'done'
  | 'failed'
  | 'cancelled'
  | 'paused'

export type TaskMode = 'broadcast' | 'divide' | 'pipeline' | 'single'
export type AssignmentMode = 'auto' | 'semi' | 'manual'

export interface Task {
  id: string
  projectId: string
  title: string
  description?: string
  mode: TaskMode
  assignmentMode: AssignmentMode
  status: TaskStatus
  agentType?: AgentType | null
  worktreePath?: string
  branchName?: string
  createdAt: number
  startedAt?: number
  completedAt?: number
  approvalPolicyJson?: string
  persistOnClose: boolean
}

export interface TaskCreateInput {
  projectId: string
  title: string
  description?: string
  mode: TaskMode
  assignmentMode: AssignmentMode
  agentType?: AgentType
  approvalPolicy?: PermissionPolicy
  persistOnClose?: boolean
}

export interface TaskFilters {
  projectId?: string
  status?: TaskStatus
  agentType?: AgentType
  from?: number
  to?: number
}

// ===== Session =====
export type SessionStatus =
  | 'idle'
  | 'initializing'
  | 'running'
  | 'waiting_input'
  | 'waiting_approval'
  | 'error'
  | 'done'

export type SessionMode = 'headless' | 'interactive'

export interface Session {
  id: string
  taskId: string
  agentType: AgentType
  status: SessionStatus
  pid?: number
  mode: SessionMode
  startedAt: number
  endedAt?: number
  tokenUsageJson?: string
}

export interface SessionConfig {
  taskId: string
  agentType: AgentType
  worktreePath: string
  prompt: string
  model?: string
  env?: Record<string, string>
}

// ===== Agent Event Stream =====
export type AgentEventType =
  | 'output'
  | 'tool_call'
  | 'tool_result'
  | 'status_change'
  | 'error'
  | 'done'

export interface AgentEvent {
  type: AgentEventType
  timestamp: number
  sessionId: string
  taskId?: string
  content: string
  // For tool_call / tool_result events
  toolCall?: ToolCall
  // For status_change events
  status?: SessionStatus
}

// ===== Checkpoint =====
export type CheckpointType = 'auto' | 'manual' | 'pre_approval'

export interface Checkpoint {
  id: string
  sessionId: string
  taskId: string
  timestamp: number
  type: CheckpointType
  gitCommit?: string
  gitStash?: string
  sessionStateJson?: string
  description: string
}

// ===== Audit =====
export interface AuditEntry {
  id: number
  timestamp: number
  sessionId?: string
  taskId?: string
  actor: string // agent name or 'user'
  actionType: string
  actionDetailJson?: string
  riskLevel?: RiskLevel
  approvalStatus?: ApprovalStatus
  approvedBy?: string
  approvedAt?: number
}

export interface AuditFilters {
  projectId?: string
  sessionId?: string
  taskId?: string
  actor?: string
  actionType?: string
  from?: number
  to?: number
  riskLevel?: RiskLevel
}

// ===== Message Bus =====
export type AgentMessageType = 'text' | 'diff' | 'status' | 'structured' | 'file_path' | 'mixed'

export interface AgentMessage {
  id: string
  fromSessionId?: string
  toSessionId?: string
  taskId?: string
  timestamp: number
  messageType: AgentMessageType
  content: string
  delivered: boolean
}

// ===== Notification =====
export type NotificationType =
  | 'task_done'
  | 'task_failed'
  | 'approval_required'
  | 'agent_crashed'
  | 'rate_limit'
  | 'checkpoint_created'
  | 'info'

export interface Notification {
  id: number
  timestamp: number
  type: NotificationType
  title: string
  body: string
  taskId?: string
  sessionId?: string
  read: boolean
  actionTaken?: string
}

// ===== Git =====
export interface DiffResult {
  worktreePath: string
  files: DiffFile[]
  summary: { added: number; removed: number; modified: number }
}

export interface DiffFile {
  path: string
  status: 'added' | 'modified' | 'deleted' | 'renamed'
  additions: number
  deletions: number
  diff: string // unified diff text
}

// ===== IPC API surface re-exports =====
export interface OrchFlowAPI {
  getAppInfo(): Promise<{ name: string; version: string; platform: NodeJS.Platform }>
  projects: ProjectsAPI
  agents: AgentsAPI
  settings: SettingsAPI
  sessions: SessionsAPI
  tasks: TasksAPI
  approval: ApprovalAPI
  checkpoints: CheckpointsAPI
  git: GitAPI
  audit: AuditAPI
  notifications: NotificationsAPI
  on(channel: string, listener: (payload: unknown) => void): () => void
}

export interface ProjectsAPI {
  list(): Promise<Project[]>
  open(rootPath: string): Promise<Project>
  current(): Promise<Project | null>
  setCurrent(projectId: string): Promise<void>
}

export interface AgentsAPI {
  detectInstalled(): Promise<DetectedAgent[]>
  getConfig(agentType: AgentType): Promise<AgentConfig | null>
  setConfig(agentType: AgentType, config: Partial<AgentConfig>): Promise<AgentConfig>
}

export interface SettingsAPI {
  get<T = unknown>(key: string): Promise<T | null>
  set(key: string, value: unknown): Promise<void>
}

export interface SessionsAPI {
  list(taskId?: string): Promise<Session[]>
  start(config: SessionConfig): Promise<Session>
  stop(sessionId: string, mode: 'graceful' | 'force'): Promise<void>
  pause(sessionId: string): Promise<void>
  resume(sessionId: string): Promise<void>
  send(sessionId: string, message: string): Promise<void>
  attachPty(sessionId: string): Promise<void>
  openExternal(sessionId: string): Promise<void>
}

export interface TasksAPI {
  list(filters?: TaskFilters): Promise<Task[]>
  create(input: TaskCreateInput): Promise<Task>
  cancel(taskId: string): Promise<void>
  retry(taskId: string): Promise<void>
  get(taskId: string): Promise<Task | null>
}

export interface ApprovalAPI {
  getQueue(): Promise<ApprovalRequest[]>
  approve(requestId: string): Promise<void>
  reject(requestId: string): Promise<void>
  batchApprove(requestIds: string[]): Promise<void>
}

export interface CheckpointsAPI {
  list(sessionId: string): Promise<Checkpoint[]>
  create(sessionId: string, description: string): Promise<Checkpoint>
  rollback(checkpointId: string): Promise<void>
  rollbackDiff(checkpointId: string): Promise<DiffResult>
}

export interface GitAPI {
  getDiff(worktreePath: string): Promise<DiffResult>
  merge(taskId: string): Promise<void>
  discard(taskId: string): Promise<void>
  keep(taskId: string): Promise<void>
}

export interface AuditAPI {
  query(filters: AuditFilters): Promise<AuditEntry[]>
  export(filters: AuditFilters, format: 'json' | 'csv'): Promise<string>
}

export interface NotificationsAPI {
  list(): Promise<Notification[]>
  markRead(id: number): Promise<void>
}
