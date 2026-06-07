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
    cliBinary: 'copilot',
    detect: ['copilot.cmd', 'copilot.exe', 'copilot'],
    package: '@github/copilot'
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
