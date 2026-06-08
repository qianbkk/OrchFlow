/** Shared infrastructure for all Agent Drivers.
 *  Eliminates ~240 lines of copy-paste across claude/codex/copilot drivers.
 *  Each driver instantiates DriverSessionManager and delegates session
 *  lifecycle, PTY management, and event dispatch to this module. */

import * as pty from '@lydell/node-pty'
import { BrowserWindow } from 'electron'
import { existsSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import type { AgentEvent, AgentType, Session, SessionConfig, SessionMode, SessionStatus, ToolCall } from '@shared/types'
import { getAgentBinaryPath } from './driver.registry'
import { approvalGate } from '../core/approval-gate'
import { checkpointManager } from '../core/checkpoint'
import { TaskRepository } from '../db/repositories/task.repository'

// ===== Shared constants =====

/** Tool call types that require user approval (PRD §3.4). */
export const HIGH_RISK_TYPES: ToolCall['type'][] = ['file_delete', 'git_force_push', 'db_destructive', 'merge']

// ===== Shared env builder =====

/** Common env vars safe to forward to any child CLI process. */
const COMMON_ENV_KEYS = new Set([
  'PATH', 'PATHEXT', 'SYSTEMROOT', 'WINDIR',
  'TEMP', 'TMP', 'LANG', 'LC_ALL', 'LC_CTYPE',
  'HOME', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH',
  'TZ', 'SHELL',
  'APPDATA', 'LOCALAPPDATA', 'PROGRAMDATA',
  // Windows Terminal
  'WT_SESSION', 'WT_PROFILE_ID',
  // Node / npm resolution
  'NODE_PATH', 'NODE_OPTIONS', 'NPM_CONFIG_PREFIX'
])

/** Build a sanitized env for child processes. Merges COMMON keys with
 *  driver-specific keys (e.g., ANTHROPIC_API_KEY, OPENAI_API_KEY). */
export function buildChildEnv(
  extraKeys: string[],
  overrides: Record<string, string> = {}
): Record<string, string> {
  const allowed = new Set([...COMMON_ENV_KEYS, ...extraKeys])
  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && allowed.has(k)) env[k] = v
  }
  Object.assign(env, overrides)
  return env
}

// ===== PTY data sender =====

/** Send raw PTY data to the first open BrowserWindow. Avoids broadcasting
 *  keystrokes (interactive mode) to every window. */
export function sendPtyData(sessionId: string, data: string, label: string): void {
  const wins = BrowserWindow.getAllWindows()
  if (wins.length === 0) return
  try {
    wins[0].webContents.send('pty:data', { sessionId, data })
  } catch (err) {
    console.warn(`[${label}] pty:data send failed:`, err)
  }
}

// ===== Session state =====

export interface DriverSessionState {
  session: Session
  pty: pty.IPty | null
  subscribers: Set<(event: AgentEvent) => void>
  buffer: string
  cancelled: boolean
  pendingApproval: Promise<boolean> | null
  mode: SessionMode
}

// ===== Event dispatch =====

export function emit(state: DriverSessionState, event: Omit<AgentEvent, 'sessionId'>, label: string): void {
  const full: AgentEvent = { ...event, sessionId: state.session.id } as AgentEvent
  for (const sub of state.subscribers) {
    try { sub(full) } catch (err) { console.error(`[${label}] subscriber error:`, err) }
  }
}

export function setStatus(state: DriverSessionState, status: SessionStatus, label: string): void {
  if (state.session.status === status) return
  state.session.status = status
  emit(state, {
    type: 'status_change', timestamp: Date.now(), content: status,
    taskId: state.session.taskId, status
  }, label)
}

// ===== PTY kill =====

/** Gracefully or forcefully kill a PTY process. */
export function killPty(ptyProc: pty.IPty, mode: 'graceful' | 'force'): void {
  try {
    if (mode === 'force') {
      ptyProc.kill('SIGKILL')
    } else {
      ptyProc.write('\x03') // Ctrl-C
      setTimeout(() => {
        try { ptyProc.kill('SIGTERM') } catch { /* already gone */ }
      }, 2000)
    }
  } catch (err) {
    console.error('[driver-base] kill failed:', err)
  }
}

// ===== Session map manager =====

/** Per-driver session map with standard stop/subscribe/send/switchMode/ptyInput/ptyResize. */
export class DriverSessionManager {
  private sessions = new Map<string, DriverSessionState>()

  constructor(private label: string) {}

  create(session: Session): DriverSessionState {
    const state: DriverSessionState = {
      session, pty: null, subscribers: new Set(),
      buffer: '', cancelled: false, pendingApproval: null, mode: 'headless'
    }
    this.sessions.set(session.id, state)
    return state
  }

  get(sessionId: string): DriverSessionState | undefined {
    return this.sessions.get(sessionId)
  }

  delete(sessionId: string): void {
    this.sessions.delete(sessionId)
  }

  /** Standard stop implementation: cancel + kill PTY + cleanup. */
  async stop(sessionId: string, mode: 'graceful' | 'force'): Promise<void> {
    const state = this.sessions.get(sessionId)
    if (!state) return
    state.cancelled = true
    const ptyToKill = state.pty
    state.pty = null
    if (ptyToKill) killPty(ptyToKill, mode)
    setStatus(state, 'done', this.label)
    this.sessions.delete(sessionId)
  }

  /** Standard subscribe implementation. */
  subscribe(sessionId: string, handler: (event: AgentEvent) => void): () => void {
    const state = this.sessions.get(sessionId)
    if (!state) {
      handler({ type: 'error', timestamp: Date.now(), sessionId, content: `No session ${sessionId}`, taskId: '' })
      return () => undefined
    }
    state.subscribers.add(handler)
    return () => { state.subscribers.delete(handler) }
  }

  /** Standard send implementation. */
  async send(sessionId: string, message: string): Promise<void> {
    const state = this.sessions.get(sessionId)
    if (state?.pty) state.pty.write(`${message}\r`)
  }

  /** Standard switchMode implementation with buffer flush. */
  switchMode(sessionId: string, newMode: SessionMode): void {
    const state = this.sessions.get(sessionId)
    if (!state || state.mode === newMode) return
    if (newMode === 'interactive' && state.buffer) {
      sendPtyData(sessionId, state.buffer, this.label)
      state.buffer = ''
    } else {
      state.buffer = ''
    }
    state.mode = newMode
    state.session.mode = newMode
    emit(state, {
      type: 'status_change', timestamp: Date.now(), content: newMode,
      taskId: state.session.taskId, status: state.session.status
    }, this.label)
  }

  /** Standard ptyInput implementation. */
  ptyInput(sessionId: string, data: string): void {
    const state = this.sessions.get(sessionId)
    if (state?.pty && state.mode === 'interactive') state.pty.write(data)
  }

  /** Standard ptyResize implementation. */
  ptyResize(sessionId: string, cols: number, rows: number): void {
    const state = this.sessions.get(sessionId)
    if (state?.pty) {
      try { state.pty.resize(cols, rows) } catch (err) { console.warn(`[${this.label}] resize failed:`, err) }
    }
  }
}

// ===== PTY spawn helper =====

/** Common PTY spawn options used by all drivers. */
export function ptySpawnOptions(cwd: string, env: Record<string, string>): {
  name: string; cols: number; rows: number; cwd: string; env: Record<string, string>
} {
  return { name: 'xterm-256color', cols: 120, rows: 40, cwd, env }
}

/** Resolve the working directory: prefer worktree path, fall back to cwd. */
export function resolveCwd(worktreePath: string): string {
  return existsSync(worktreePath) ? worktreePath : process.cwd()
}

/** Create a new Session object with defaults. */
export function createSession(config: SessionConfig, agentType: AgentType): Session {
  return {
    id: randomUUID(), taskId: config.taskId, agentType,
    status: 'initializing', mode: 'headless', startedAt: Date.now()
  }
}

/** Request approval for a high-risk tool call. Creates a pre-approval checkpoint,
 *  sets status to waiting_approval, and returns a promise that resolves to true
 *  if approved, false otherwise. (PRD §3.4.3) */
export function requestApproval(
  state: DriverSessionState,
  toolCall: ToolCall,
  label: string
): Promise<boolean> {
  // Create pre-approval checkpoint
  if (state.session.taskId) {
    try {
      const task = new TaskRepository().get(state.session.taskId)
      if (task?.worktreePath && existsSync(task.worktreePath)) {
        void checkpointManager.create(state.session.id, state.session.taskId,
          task.worktreePath, 'pre_approval',
          `Before ${toolCall.type}: ${toolCall.description.slice(0, 80)}`)
      }
    } catch (err) { console.warn(`[${label}] pre-approval checkpoint failed:`, err) }
  }

  setStatus(state, 'waiting_approval', label)
  return approvalGate
    .request(state.session.id, state.session.taskId ?? '', toolCall)
    .then((approved) => {
      state.pendingApproval = null
      if (state.cancelled) return approved
      setStatus(state, approved ? 'running' : 'error', label)
      return approved
    })
    .catch((err) => {
      console.error(`[${label}] approval gate error:`, err)
      state.pendingApproval = null
      return false
    })
}

// Re-export for convenience
export { getAgentBinaryPath }
