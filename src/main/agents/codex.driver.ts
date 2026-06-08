import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import * as pty from '@lydell/node-pty'
import { BrowserWindow } from 'electron'
import type { AgentEvent, Session, SessionConfig, SessionMode, SessionStatus, ToolCall } from '@shared/types'
import type { IAgentDriver } from './driver.interface'
import { getAgentBinaryPath } from './driver.registry'
import { approvalGate } from '../core/approval-gate'
import { checkpointManager } from '../core/checkpoint'
import { TaskRepository } from '../db/repositories/task.repository'

/** CodexDriver: Codex CLI integration.
 *  Spawns `codex -p "<prompt>" --approval-policy on-failure` with stdout
 *  JSON line parsing. Architecture mirrors ClaudeCodeDriver.
 *  PRD §5.3: "spawn child process + stdout JSON parsing" */

const ALLOWED_ENV_KEYS = new Set([
  'PATH', 'PATHEXT', 'SYSTEMROOT', 'WINDIR',
  'TEMP', 'TMP', 'LANG', 'LC_ALL', 'LC_CTYPE',
  'HOME', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH',
  'TZ', 'SHELL',
  'APPDATA', 'LOCALAPPDATA', 'PROGRAMDATA',
  // OpenAI specific
  'OPENAI_API_KEY', 'OPENAI_ORG_ID'
])

function buildChildEnv(overrides: Record<string, string> = {}): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && ALLOWED_ENV_KEYS.has(k)) env[k] = v
  }
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

function sendPtyData(sessionId: string, data: string): void {
  const wins = BrowserWindow.getAllWindows()
  if (wins.length === 0) return
  try {
    wins[0].webContents.send('pty:data', { sessionId, data })
  } catch (err) {
    console.warn('[codex-driver] pty:data send failed:', err)
  }
}

function emit(state: SessionState, event: Omit<AgentEvent, 'sessionId'>): void {
  const full: AgentEvent = { ...event, sessionId: state.session.id } as AgentEvent
  for (const sub of state.subscribers) {
    try { sub(full) } catch (err) { console.error('[codex-driver] subscriber error:', err) }
  }
}

function setStatus(state: SessionState, status: SessionStatus): void {
  if (state.session.status === status) return
  state.session.status = status
  emit(state, {
    type: 'status_change', timestamp: Date.now(), content: status,
    taskId: state.session.taskId, status
  })
}

/** Parse Codex stdout JSON events. Format assumed similar to Claude stream-json
 *  but adapted for Codex's output schema. Falls back to treating each line as
 *  plain text output when JSON parsing fails. */
function parseCodexLine(state: SessionState, line: string): boolean {
  if (!line.trim()) return false
  try {
    const obj = JSON.parse(line) as Record<string, unknown>
    const eventType = (obj.type as string) ?? (obj.event as string) ?? 'output'

    if (eventType === 'tool_use' || eventType === 'tool_call' || eventType === 'function_call') {
      const toolName = (obj.tool as string) ?? (obj.name as string) ?? (obj.function as string) ?? 'unknown'
      const input = (obj.input as Record<string, unknown>) ?? (obj.arguments as Record<string, unknown>) ?? {}
      const description = (input.description as string) ?? (input.command as string) ?? toolName
      const detail = input.command as string | undefined

      const HIGH_RISK_TYPES: ToolCall['type'][] = ['file_delete', 'git_force_push', 'db_destructive', 'merge']
      const toolCall: ToolCall = classifyToolCall(toolName, description)
      const needsApproval = HIGH_RISK_TYPES.includes(toolCall.type)

      emit(state, {
        type: 'tool_call', timestamp: Date.now(),
        content: `Tool call: ${toolName}`,
        taskId: state.session.taskId, toolCall
      })

      if (needsApproval && !state.cancelled) {
        if (state.session.taskId) {
          try {
            const task = new TaskRepository().get(state.session.taskId)
            if (task?.worktreePath && existsSync(task.worktreePath)) {
              void checkpointManager.create(state.session.id, state.session.taskId,
                task.worktreePath, 'pre_approval', `Before ${toolCall.type}: ${toolCall.description.slice(0, 80)}`)
            }
          } catch (err) { console.warn('[codex-driver] checkpoint failed:', err) }
        }
        setStatus(state, 'waiting_approval')
        state.pendingApproval = approvalGate
          .request(state.session.id, state.session.taskId ?? '', toolCall)
          .then((approved) => {
            state.pendingApproval = null
            if (!state.cancelled) setStatus(state, approved ? 'running' : 'error')
            return approved
          })
          .catch(() => { state.pendingApproval = null; return false })
      }
      return true
    }

    if (eventType === 'done' || eventType === 'complete' || eventType === 'result') {
      setStatus(state, 'done')
      emit(state, { type: 'done', timestamp: Date.now(), content: '', taskId: state.session.taskId })
      return true
    }
    if (eventType === 'error') {
      setStatus(state, 'error')
      emit(state, { type: 'error', timestamp: Date.now(),
        content: typeof obj.error === 'string' ? obj.error : JSON.stringify(obj),
        taskId: state.session.taskId })
      return true
    }

    const text = (obj.text as string) ?? (obj.content as string) ?? (obj.message as string) ?? (obj.output as string) ?? ''
    if (text) {
      emit(state, { type: 'output', timestamp: Date.now(), content: text, taskId: state.session.taskId })
      return true
    }
    return false
  } catch {
    // Not JSON — treat as plain text output
    if (line.trim()) {
      emit(state, { type: 'output', timestamp: Date.now(), content: line, taskId: state.session.taskId })
      return true
    }
    return false
  }
}

function classifyToolCall(name: string, description: string): ToolCall {
  const n = name.toLowerCase()
  let type: ToolCall['type'] = 'other'
  if (/(delete|rm|rmdir|unlink)/.test(n)) type = 'file_delete'
  else if (/(write|create|edit|patch|save)/.test(n)) type = 'file_write'
  else if (/(read|cat|view|fetch)/.test(n)) type = 'file_read'
  else if (/(bash|shell|exec|command|run)/.test(n) || /git\s+merge/i.test(description)) type = 'shell'
  else if (/push/.test(n)) type = /force/.test(description) ? 'git_force_push' : 'git_push'
  return { type, description, detail: description }
}

export class CodexDriver implements IAgentDriver {
  readonly type = 'codex' as const

  async start(config: SessionConfig): Promise<Session> {
    const session: Session = {
      id: randomUUID(), taskId: config.taskId, agentType: this.type,
      status: 'initializing', mode: 'headless', startedAt: Date.now()
    }
    const state: SessionState = {
      session, pty: null, subscribers: new Set(), buffer: '',
      cancelled: false, pendingApproval: null, mode: 'headless'
    }
    sessions.set(session.id, state)

    const bin = getAgentBinaryPath(this.type)
    const cwd = existsSync(config.worktreePath) ? config.worktreePath : process.cwd()
    const env = buildChildEnv(config.env)

    let ptyProc: pty.IPty
    try {
      // PRD §5.3: codex -p --approval-policy=on-failure
      ptyProc = pty.spawn(bin, [
        '-p', config.prompt,
        '--approval-policy', 'on-failure'
      ], { name: 'xterm-256color', cols: 120, rows: 40, cwd, env })
    } catch (err) {
      setStatus(state, 'error')
      emit(state, { type: 'error', timestamp: Date.now(),
        content: `Failed to spawn ${bin}: ${err instanceof Error ? err.message : String(err)}`,
        taskId: state.session.taskId })
      sessions.delete(session.id)
      return session
    }

    state.pty = ptyProc
    state.session.pid = ptyProc.pid
    setStatus(state, 'running')

    ptyProc.onData((data: string) => {
      if (state.mode === 'interactive') {
        sendPtyData(state.session.id, data)
        return
      }
      state.buffer += data
      const lines = state.buffer.split('\n')
      state.buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.trim()) continue
        parseCodexLine(state, line)
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
        if (mode === 'force') ptyToKill.kill('SIGKILL')
        else {
          ptyToKill.write('\x03')
          setTimeout(() => { try { ptyToKill.kill('SIGTERM') } catch { /* gone */ } }, 2000)
        }
      } catch (err) { console.error('[codex-driver] stop failed:', err) }
    }
    setStatus(state, 'done')
    sessions.delete(sessionId)
  }

  async pause(): Promise<void> {}
  async resume(): Promise<void> {}

  async send(sessionId: string, message: string): Promise<void> {
    const state = sessions.get(sessionId)
    if (state?.pty) state.pty.write(`${message}\r`)
  }

  switchMode(sessionId: string, newMode: SessionMode): void {
    const state = sessions.get(sessionId)
    if (!state || state.mode === newMode) return
    if (newMode === 'interactive' && state.buffer) {
      sendPtyData(sessionId, state.buffer)
      state.buffer = ''
    } else {
      state.buffer = ''
    }
    state.mode = newMode
    state.session.mode = newMode
  }

  ptyInput(sessionId: string, data: string): void {
    const state = sessions.get(sessionId)
    if (state?.pty && state.mode === 'interactive') state.pty.write(data)
  }

  ptyResize(sessionId: string, cols: number, rows: number): void {
    const state = sessions.get(sessionId)
    if (state?.pty) {
      try { state.pty.resize(cols, rows) } catch (err) { console.warn('[codex-driver] resize failed:', err) }
    }
  }

  subscribe(sessionId: string, handler: (event: AgentEvent) => void): () => void {
    const state = sessions.get(sessionId)
    if (!state) {
      handler({ type: 'error', timestamp: Date.now(), sessionId, content: `No session ${sessionId}`, taskId: '' })
      return () => undefined
    }
    state.subscribers.add(handler)
    return () => { state.subscribers.delete(handler) }
  }
}
