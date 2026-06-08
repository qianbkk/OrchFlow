import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import * as pty from '@lydell/node-pty'
import { BrowserWindow } from 'electron'
import type { AgentEvent, Session, SessionConfig, SessionMode, SessionStatus } from '@shared/types'
import type { IAgentDriver } from './driver.interface'
import { getAgentBinaryPath } from './driver.registry'

/** CopilotDriver: GitHub Copilot CLI integration.
 *  Spawns `gh copilot suggest -p "<prompt>"` — simpler output model than
 *  Claude/Codex (no JSON streaming, just text output).
 *  PRD §5.3: "GitHub Copilot Node.js SDK (JSON-RPC)" — for Phase 0-1,
 *  we use CLI spawning as a pragmatic approach. */

const ALLOWED_ENV_KEYS = new Set([
  'PATH', 'PATHEXT', 'SYSTEMROOT', 'WINDIR',
  'TEMP', 'TMP', 'LANG', 'LC_ALL', 'LC_CTYPE',
  'HOME', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH',
  'TZ', 'SHELL',
  'APPDATA', 'LOCALAPPDATA', 'PROGRAMDATA',
  // GitHub CLI specific
  'GH_TOKEN', 'GITHUB_TOKEN', 'GH_HOST'
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
  cancelled: boolean
  mode: SessionMode
}

const sessions = new Map<string, SessionState>()

function sendPtyData(sessionId: string, data: string): void {
  const wins = BrowserWindow.getAllWindows()
  if (wins.length === 0) return
  try {
    wins[0].webContents.send('pty:data', { sessionId, data })
  } catch (err) {
    console.warn('[copilot-driver] pty:data send failed:', err)
  }
}

function emit(state: SessionState, event: Omit<AgentEvent, 'sessionId'>): void {
  const full: AgentEvent = { ...event, sessionId: state.session.id } as AgentEvent
  for (const sub of state.subscribers) {
    try { sub(full) } catch (err) { console.error('[copilot-driver] subscriber error:', err) }
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

export class CopilotDriver implements IAgentDriver {
  readonly type = 'copilot' as const

  async start(config: SessionConfig): Promise<Session> {
    const session: Session = {
      id: randomUUID(), taskId: config.taskId, agentType: this.type,
      status: 'initializing', mode: 'headless', startedAt: Date.now()
    }
    const state: SessionState = {
      session, pty: null, subscribers: new Set(),
      cancelled: false, mode: 'headless'
    }
    sessions.set(session.id, state)

    // Copilot CLI uses `gh` (GitHub CLI) with the copilot extension
    const bin = getAgentBinaryPath(this.type)
    const cwd = existsSync(config.worktreePath) ? config.worktreePath : process.cwd()
    const env = buildChildEnv(config.env)

    let ptyProc: pty.IPty
    try {
      // `gh copilot suggest -p "<prompt>"` — Copilot's CLI interface
      ptyProc = pty.spawn('gh', [
        'copilot', 'suggest',
        '-p', config.prompt
      ], { name: 'xterm-256color', cols: 120, rows: 40, cwd, env })
    } catch (err) {
      setStatus(state, 'error')
      emit(state, { type: 'error', timestamp: Date.now(),
        content: `Failed to spawn gh copilot: ${err instanceof Error ? err.message : String(err)}`,
        taskId: state.session.taskId })
      sessions.delete(session.id)
      return session
    }

    state.pty = ptyProc
    state.session.pid = ptyProc.pid
    setStatus(state, 'running')

    // Copilot CLI outputs plain text (no JSON streaming)
    ptyProc.onData((data: string) => {
      if (state.mode === 'interactive') {
        sendPtyData(state.session.id, data)
        return
      }
      // Emit each line as an output event
      const lines = data.split('\n')
      for (const line of lines) {
        if (!line.trim()) continue
        emit(state, {
          type: 'output', timestamp: Date.now(),
          content: line, taskId: state.session.taskId
        })
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
      } catch (err) { console.error('[copilot-driver] stop failed:', err) }
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
      try { state.pty.resize(cols, rows) } catch (err) { console.warn('[copilot-driver] resize failed:', err) }
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
