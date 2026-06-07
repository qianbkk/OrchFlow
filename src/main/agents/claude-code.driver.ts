import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import * as pty from '@lydell/node-pty'
import { BrowserWindow } from 'electron'
import type { AgentEvent, Session, SessionConfig, SessionMode, SessionStatus, ToolCall } from '@shared/types'
import type { IAgentDriver } from './driver.interface'
import { getAgentBinaryPath } from './driver.registry'
import { approvalGate } from '../core/approval-gate'
import { settingsStore } from '../core/settings-store'
import { checkpointManager } from '../core/checkpoint'
import { TaskRepository } from '../db/repositories/task.repository'

/** Env vars forwarded to the spawned CLI — never the whole process.env. */
const ALLOWED_ENV_KEYS = new Set([
  'PATH', 'PATHEXT', 'SYSTEMROOT', 'WINDIR',
  'TEMP', 'TMP', 'LANG', 'LC_ALL', 'LC_CTYPE',
  'HOME', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH',
  'TZ', 'LANG', 'SHELL',
  // Windows Terminal specific
  'WT_SESSION', 'WT_PROFILE_ID',
  // Node / npm resolution
  'NODE_PATH', 'NODE_OPTIONS', 'NPM_CONFIG_PREFIX',
  'APPDATA', 'LOCALAPPDATA', 'PROGRAMDATA'
])

function buildChildEnv(overrides: Record<string, string> = {}): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && ALLOWED_ENV_KEYS.has(k)) env[k] = v
  }
  // Pull API key from keytar (don't leak process.env)
  const apiKey = settingsStore.getAgentConfig('claude')?.['apiKey']
  if (typeof apiKey === 'string' && apiKey) env['ANTHROPIC_API_KEY'] = apiKey
  Object.assign(env, overrides)
  return env
}

interface SessionState {
  session: Session
  pty: pty.IPty | null
  subscribers: Set<(event: AgentEvent) => void>
  buffer: string
  cancelled: boolean
  pendingApproval: Promise<boolean> | null
  mode: SessionMode
}

const sessions = new Map<string, SessionState>()

/** Targeted send to the first open window. Avoids broadcasting raw PTY
 *  data (which can include user keystrokes in interactive mode) to every
 *  BrowserWindow. Multi-window support would require tracking which window
 *  owns each session; for Phase 0 single-window this is correct. */
function sendPtyData(sessionId: string, data: string): void {
  const wins = BrowserWindow.getAllWindows()
  if (wins.length === 0) return
  try {
    wins[0].webContents.send('pty:data', { sessionId, data })
  } catch (err) {
    console.warn('[claude-driver] pty:data send failed:', err)
  }
}

function emit(state: SessionState, event: Omit<AgentEvent, 'sessionId'>): void {
  const full: AgentEvent = { ...event, sessionId: state.session.id } as AgentEvent
  for (const sub of state.subscribers) {
    try {
      sub(full)
    } catch (err) {
      console.error(`[claude-driver] subscriber error:`, err)
    }
  }
}

function setStatus(state: SessionState, status: SessionStatus): void {
  if (state.session.status === status) return
  state.session.status = status
  emit(state, {
    type: 'status_change',
    timestamp: Date.now(),
    content: status,
    taskId: state.session.taskId,
    status
  })
}

/** Best-effort classification of a tool-use event into a ToolCall shape. */
function toolCallFromEvent(obj: Record<string, unknown>): ToolCall | null {
  const rawName = (obj.tool as string) ?? (obj.name as string) ?? (obj.tool_name as string) ?? ''
  const name = rawName.toLowerCase()
  const input = (obj.input as Record<string, unknown>) ?? {}
  const description = (input.description as string) ?? (input.command as string) ?? name
  const detail = input.command as string | undefined
  const filesAffected = Array.isArray(input.paths)
    ? (input.paths as unknown[]).map((p) => String(p))
    : input.path
      ? [String(input.path)]
      : undefined
  let type: ToolCall['type'] = 'other'
  if (/(delete|rm|rmdir|unlink|drop|truncate)/.test(name) || /rm\s+-rf|drop\s+table/.test(description)) {
    type = name.includes('rm') || name.includes('delete') || name.includes('unlink') || name.includes('rmdir')
      ? 'file_delete'
      : 'db_destructive'
  } else if (/write|create|edit|patch|save/.test(name)) {
    type = 'file_write'
  } else if (/read|cat|view|fetch/.test(name)) {
    type = 'file_read'
  } else if (/bash|shell|exec|command|run/.test(name) || /git\s+merge/i.test(description)) {
    type = name.includes('merge') ? 'merge' : /install|add/.test(description) ? 'install_deps' : 'shell'
  } else if (/push/.test(name)) {
    type = /force/.test(description) ? 'git_force_push' : 'git_push'
  }
  return { type, description, detail, filesAffected }
}

function parseStreamJsonLine(state: SessionState, line: string): boolean {
  if (!line.trim()) return false
  try {
    const obj = JSON.parse(line) as Record<string, unknown>
    const eventType = (obj.type as string) ?? (obj.event as string) ?? 'output'
    if (eventType === 'tool_use' || eventType === 'tool_call') {
      const toolName = (obj.tool as string) ?? (obj.name as string) ?? 'unknown'
      const toolCall = toolCallFromEvent(obj)
      // For high-risk operations, request approval BEFORE emitting the
      // event to the UI. The session moves to 'waiting_approval'.
      const HIGH_RISK_TYPES: ToolCall['type'][] = ['file_delete', 'git_force_push', 'db_destructive', 'merge']
      const needsApproval = toolCall ? HIGH_RISK_TYPES.includes(toolCall.type) : false

      emit(state, {
        type: 'tool_call',
        timestamp: Date.now(),
        content: `Tool call: ${toolName}`,
        taskId: state.session.taskId,
        toolCall: toolCall ?? undefined
      })

      if (needsApproval && toolCall && !state.cancelled) {
        // PRD §3.4.3: "每次 Approval Gate 确认前自动创建" — snapshot the
        // worktree before the high-risk operation runs so the user can
        // always roll back even after approving.
        if (state.session.taskId) {
          try {
            const task = new TaskRepository().get(state.session.taskId)
            if (task?.worktreePath && existsSync(task.worktreePath)) {
              void checkpointManager.create(
                state.session.id,
                state.session.taskId,
                task.worktreePath,
                'pre_approval',
                `Before ${toolCall.type}: ${toolCall.description.slice(0, 80)}`
              )
            }
          } catch (err) {
            console.warn('[claude-driver] pre-approval checkpoint failed:', err)
          }
        }
        setStatus(state, 'waiting_approval')
        // Fire-and-forget: the result of approval drives the status, not the event emission
        state.pendingApproval = approvalGate
          .request(state.session.id, state.session.taskId ?? '', toolCall)
          .then((approved) => {
            state.pendingApproval = null
            if (state.cancelled) return approved
            setStatus(state, approved ? 'running' : 'error')
            return approved
          })
          .catch((err) => {
            console.error('[claude-driver] approval gate error:', err)
            state.pendingApproval = null
            return false
          })
      }
      return true
    }
    if (eventType === 'tool_result') {
      emit(state, {
        type: 'tool_result',
        timestamp: Date.now(),
        content: typeof obj.content === 'string' ? obj.content : JSON.stringify(obj),
        taskId: state.session.taskId
      })
      return true
    }
    if (eventType === 'done' || eventType === 'complete') {
      setStatus(state, 'done')
      emit(state, { type: 'done', timestamp: Date.now(), content: '', taskId: state.session.taskId })
      return true
    }
    if (eventType === 'error') {
      setStatus(state, 'error')
      emit(state, {
        type: 'error',
        timestamp: Date.now(),
        content: typeof obj.error === 'string' ? obj.error : JSON.stringify(obj),
        taskId: state.session.taskId
      })
      return true
    }
    // Generic text content
    const text = (obj.text as string) ?? (obj.content as string) ?? (obj.message as string) ?? ''
    if (text) {
      emit(state, {
        type: 'output',
        timestamp: Date.now(),
        content: text,
        taskId: state.session.taskId
      })
      return true
    }
    return false
  } catch {
    return false
  }
}

export class ClaudeCodeDriver implements IAgentDriver {
  readonly type = 'claude' as const

  async start(config: SessionConfig): Promise<Session> {
    const session: Session = {
      id: randomUUID(),
      taskId: config.taskId,
      agentType: this.type,
      status: 'initializing',
      mode: 'headless',
      startedAt: Date.now()
    }
    const state: SessionState = {
      session,
      pty: null,
      subscribers: new Set(),
      buffer: '',
      cancelled: false,
      pendingApproval: null,
      mode: 'headless'
    }
    sessions.set(session.id, state)

    const bin = getAgentBinaryPath(this.type)
    const cwd = existsSync(config.worktreePath) ? config.worktreePath : process.cwd()
    const env = buildChildEnv(config.env)

    let ptyProc: pty.IPty
    try {
      ptyProc = pty.spawn(bin, ['-p', config.prompt, '--output-format', 'stream-json', '--verbose'], {
        name: 'xterm-256color',
        cols: 120,
        rows: 40,
        cwd,
        env
      })
    } catch (err) {
      setStatus(state, 'error')
      emit(state, {
        type: 'error',
        timestamp: Date.now(),
        content: `Failed to spawn ${bin}: ${err instanceof Error ? err.message : String(err)}`,
        taskId: state.session.taskId
      })
      // Clean up immediately so the entry doesn't linger
      sessions.delete(session.id)
      return session
    }

    state.pty = ptyProc
    state.session.pid = ptyProc.pid
    setStatus(state, 'running')

    ptyProc.onData((data: string) => {
      if (state.mode === 'interactive') {
        // PRD §3.5.2 + §11.3: In Interactive mode, stop parsing stream-json
        // and pipe raw bytes straight to the renderer's xterm.js. The same
        // PTY process is reused — no restart, no lost state.
        // Use targeted send (not broadcast) to avoid leaking keystrokes
        // to every open BrowserWindow.
        sendPtyData(state.session.id, data)
        return
      }
      state.buffer += data
      const lines = state.buffer.split('\n')
      state.buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.trim()) continue
        if (!parseStreamJsonLine(state, line)) {
          emit(state, {
            type: 'output',
            timestamp: Date.now(),
            content: line,
            taskId: state.session.taskId
          })
        }
      }
    })

    ptyProc.onExit(({ exitCode }) => {
      if (state.session.status === 'running' || state.session.status === 'initializing') {
        setStatus(state, exitCode === 0 ? 'done' : 'error')
      }
      state.pty = null
    })

    return session
  }

  async stop(sessionId: string, mode: 'graceful' | 'force'): Promise<void> {
    const state = sessions.get(sessionId)
    if (!state) return
    state.cancelled = true
    const ptyToKill = state.pty
    state.pty = null
    if (ptyToKill) {
      try {
        if (mode === 'force') {
          ptyToKill.kill('SIGKILL')
        } else {
          // Send Ctrl-C and wait
          ptyToKill.write('\x03')
          setTimeout(() => {
            try { ptyToKill.kill('SIGTERM') } catch { /* already gone */ }
          }, 2000)
        }
      } catch (err) {
        console.error(`[claude-driver] stop failed:`, err)
      }
    }
    setStatus(state, 'done')
    sessions.delete(sessionId)
  }

  async pause(_sessionId: string): Promise<void> {
    // Windows ConPTY doesn't support SIGSTOP; UI shows "pause" by simply not auto-approving new tool calls
    // Real pause semantics in MVP: only meaningful for approval gating, not for the OS process
  }

  async resume(_sessionId: string): Promise<void> {
    // Same as above — for Phase 0 MVP, resume is a UI state change
  }

  async send(sessionId: string, message: string): Promise<void> {
    const state = sessions.get(sessionId)
    if (state?.pty) {
      state.pty.write(`${message}\r`)
    }
  }

  /** Switch a session between headless (structured stream-json) and interactive
   *  (raw pty passthrough) modes. The underlying PTY process is NOT restarted
   *  — only the routing of onData bytes changes (PRD §11.3). */
  switchMode(sessionId: string, newMode: SessionMode): void {
    const state = sessions.get(sessionId)
    if (!state || state.mode === newMode) return
    if (newMode === 'interactive') {
      // Flush any partial line in the headless buffer so the user sees
      // the last bit of output before the mode switch.
      if (state.buffer) {
        sendPtyData(sessionId, state.buffer)
        state.buffer = ''
      }
    } else {
      // Switching back to headless — drop any partial state. Rare path.
      state.buffer = ''
    }
    state.mode = newMode
    state.session.mode = newMode
    emit(state, {
      type: 'status_change',
      timestamp: Date.now(),
      content: newMode,
      taskId: state.session.taskId,
      status: state.session.status
    })
  }

  /** Write raw keystrokes from the renderer's xterm.js to the PTY.
   *  Used in interactive mode (PRD §3.5.2). */
  ptyInput(sessionId: string, data: string): void {
    const state = sessions.get(sessionId)
    if (state?.pty && state.mode === 'interactive') {
      state.pty.write(data)
    }
  }

  /** Forward renderer-side resize events to the PTY so the agent CLI sees
   *  the correct COLUMNS/LINES. */
  ptyResize(sessionId: string, cols: number, rows: number): void {
    const state = sessions.get(sessionId)
    if (state?.pty) {
      try {
        state.pty.resize(cols, rows)
      } catch (err) {
        console.warn('[claude-driver] resize failed:', err)
      }
    }
  }

  subscribe(sessionId: string, handler: (event: AgentEvent) => void): () => void {
    const state = sessions.get(sessionId)
    if (!state) {
      // Emit a synthetic error so the UI can show something
      handler({
        type: 'error',
        timestamp: Date.now(),
        sessionId,
        content: `No session with id ${sessionId}`,
        taskId: ''
      })
      return () => undefined
    }
    state.subscribers.add(handler)
    return () => {
      state.subscribers.delete(handler)
    }
  }
}

// Re-export the IPty type for downstream usage
export type { IPty } from '@lydell/node-pty'
