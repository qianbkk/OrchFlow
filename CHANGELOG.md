# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] — 2026-06-08

### Added

#### Core Platform
- Electron 42 + React 19 + TypeScript 5.7 + Vite 7 desktop application
- SQLite database via `node:sqlite` (built-in, no native compilation needed)
- IPC layer with contextBridge whitelist and RECEIVE_EVENTS validation
- Zustand state management for renderer process
- xterm.js terminal with fullscreen expand and compact preview modes
- ErrorBoundary component for crash recovery

#### Agent Drivers
- **ClaudeCodeDriver**: Full PTY management, stream-json parsing, approval gate integration
- **CodexDriver**: Codex CLI integration with `--approval-policy on-failure`
- **CopilotDriver**: GitHub Copilot CLI integration via `gh copilot suggest`
- StubDriver with cancellable subscriptions for future drivers
- IAgentDriver interface with optional PTY methods (switchMode/ptyInput/ptyResize)

#### Task Management
- Task creation with 4 input modes:
  - **Simple** (Mode A): Natural language description
  - **Task List** (Mode B): Multi-line with `>` dependency syntax
  - **Agent Planning** (Mode C): Planning agent generates JSON task list
  - **File Import** (Mode D): Import .md/.json/.txt files
- Batch task creation for broadcast and divide modes
- Task dependency management (add/remove/query)
- Auto-router: score agents by idle status, load, and capability match
- Kanban board view with HTML5 drag-and-drop (Queued/Running/Review/Done)
- List view with status indicators

#### Collaboration
- **Broadcast mode**: Same task to multiple agents, side-by-side diff comparison
- **Divide mode**: Sub-tasks distributed to different agents
- **Pipeline DAG**: Topological sort (Kahn's algorithm) + dependency satisfaction + auto-start downstream
- **Message Bus**: Publish/consume agent messages, prompt prefix injection for downstream tasks
- Pipeline DAG visualization: SVG with zoom/pan, node selection, status colors

#### Security
- Approval Gate with risk assessment (high/medium/low)
- Batch approval: select all, select by risk level, bulk approve/reject
- Pre-approval checkpoint auto-creation before high-risk operations
- API key storage via keytar (Windows Credential Manager) — zero plaintext
- `settings:get` blocks API key retrieval; `settings:apiKeyExists` returns boolean only
- `settings-store` refuses to persist sensitive fields (apiKey/token/secret/password)
- Electron sandbox enabled (`sandbox: true`)
- Path validation with home directory boundary + UNC/device path rejection
- toolCall null bypass protection (unknown tools default to approval required)

#### Git Integration
- Automatic worktree creation per task (`../<project>-orch-worktrees/<task>`)
- Worktree merge/discard/keep operations
- Checkpoint system: git stash + commit recording
- Checkpoint rollback with exact stash ref (prevents wrong-stash-pop)
- Rollback diff preview (split-based parsing handles quoted paths)
- mergeWorktree uses `git worktree list --porcelain` for reliable path resolution

#### Audit & Notifications
- Audit log with 6 filter controls (search, actor, action type, risk level, date range)
- JSON and CSV export with formula injection protection
- Windows system notifications via Electron Notification API
- In-app notification center with mark-read
- Notification click navigates to related session/task

#### UI/UX
- 5 views: Sessions, Tasks, Pipeline, Audit, Settings
- Sidebar navigation with Pipeline entry
- Task view toggle (List/Kanban)
- Native directory picker via Electron dialog
- Native file picker for task import
- Project picker with Browse button
- ApprovalCenter floating panel with Phase 0 audit-mode warning
- FullLines buffer (5000 lines) separate from 20-line compact preview
- External terminal: Windows Terminal with PowerShell fallback

#### Developer Experience
- Vitest test framework with jsdom + node environments
- 38 tests: events, constants, stores, auto-router scoring, pipeline topo sort, message-bus constants
- `@testing-library/jest-dom` matchers via setupFiles
- electron-vite build pipeline (main + preload + renderer)
- TypeScript strict mode with noUncheckedIndexedAccess

### Known Limitations

- Approval Gate is audit-only (does not block Agent CLI process execution)
- CodexDriver/CopilotDriver output parsing based on CLI format assumptions, not real-CLI tested
- Windows-only platform (PRD target)
- No E2E test coverage yet
- CSP includes `unsafe-inline` for Tailwind v4 compatibility
