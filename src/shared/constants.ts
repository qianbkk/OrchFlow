// Constants shared between Main and Renderer

export const APP_NAME = 'OrchFlow'
export const APP_VERSION = '0.1.0'

// User data directory layout
export const USER_DATA_PATHS = {
  ROOT: '~/.orchflow',
  CONFIG: 'config.json',
  PROJECTS: 'projects',
  LOGS: 'logs'
} as const

// Database
export const DB_FILENAME = 'orchflow.db'
export const SCHEMA_VERSION = 2

// Compact preview buffer size for the Sessions view (PRD §3.5.1: "默认 20 行")
export const COMPACT_PREVIEW_LINES = 20

// Approval gate timeout (5 minutes — long enough for a human to read a diff)
export const APPROVAL_GATE_TIMEOUT_MS = 5 * 60 * 1000

// Agent type defaults
export const AGENT_DEFAULTS: Record<
  string,
  { displayName: string; cliBinary: string; detect: string[]; package: string }
> = {
  claude: {
    displayName: 'Claude Code',
    cliBinary: 'claude',
    detect: ['claude.cmd', 'claude.exe', 'claude'],
    package: '@anthropic-ai/claude-code'
  },
  codex: {
    displayName: 'Codex CLI',
    cliBinary: 'codex',
    detect: ['codex.cmd', 'codex.exe', 'codex'],
    package: '@openai/codex'
  },
  copilot: {
    displayName: 'GitHub Copilot CLI',
    cliBinary: 'gh',
    detect: ['gh.cmd', 'gh.exe', 'gh'],
    package: '@githubnext/github-copilot-cli'
  }
}

// Risk level thresholds for tools
export const HIGH_RISK_TOOL_PATTERNS: { pattern: RegExp; type: string; risk: 'high' | 'medium' }[] = [
  { pattern: /rm\s+-rf|rmdir/i, type: 'file_delete', risk: 'high' },
  { pattern: /git\s+push\s+.*--force/i, type: 'force_push', risk: 'high' },
  { pattern: /drop\s+table|truncate\s+table/i, type: 'db_destructive', risk: 'high' },
  { pattern: /npm\s+install|npm\s+i\s|pnpm\s+add|yarn\s+add/i, type: 'install_deps', risk: 'medium' }
]

// Keytar settings
export const PROJECT_KEYTAR_SERVICE = 'OrchFlow'
export const KEYTAR_KEYS = {
  API_KEY_PREFIX: 'apiKey:'
} as const

// ===== Phase 1/2 Constants =====

// Kanban board columns (maps to TaskStatus)
export const KANBAN_COLUMNS = [
  { key: 'queued', label: 'Queued', statuses: ['created', 'queued', 'assigned'] as const },
  { key: 'running', label: 'Running', statuses: ['running', 'paused'] as const },
  { key: 'review', label: 'Review', statuses: ['pending_review'] as const },
  { key: 'done', label: 'Done', statuses: ['done', 'failed', 'cancelled'] as const }
] as const

// Pipeline DAG visualization
export const PIPELINE_LAYOUT = {
  NODE_WIDTH: 180,
  NODE_HEIGHT: 60,
  NODE_GAP_X: 80,
  NODE_GAP_Y: 40,
  PADDING: 40
} as const

// Default message config for task dependencies
export const DEFAULT_MESSAGE_CONFIG: import('./types').MessageConfig = {
  trigger: 'on_task_done',
  contentTypes: ['text', 'diff'],
  receiveAction: 'auto_continue'
}

// Auto-router scoring weights
export const AUTO_ROUTER_WEIGHTS = {
  IDLE_BONUS: 10,
  RUNNING_PENALTY: 5,
  CAPABILITY_MATCH_BONUS: 8,
  LAST_SUCCESS_BONUS: 3
} as const

// File import supported formats
export const FILE_IMPORT_FILTERS = [
  { name: 'Task Files', extensions: ['md', 'json', 'txt'] },
  { name: 'Markdown', extensions: ['md'] },
  { name: 'JSON', extensions: ['json'] },
  { name: 'Text', extensions: ['txt'] }
] as const
