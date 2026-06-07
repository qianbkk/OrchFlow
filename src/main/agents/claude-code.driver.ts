import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import * as pty from '@lydell/node-pty'
import type { AgentEvent, Session, SessionConfig, SessionStatus } from '@shared/types'
import type { IAgentDriver } from './driver.interface'
import { getAgentBinaryPath } from './driver.registry'

interface SessionState {
  session: Session
  pty: pty.IPty | null
  subscribers: Set<(event: AgentEvent) => void>
  buffer: string
}

const sessions = new Map<string, SessionState>()

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
  state.session.status = status
  emit(state, {
    type: 'status_change',
    timestamp: Date.now(),
    content: status,
    taskId: state.session.taskId,
    status
  })
}

function parseStreamJsonLine(state: SessionState, line: string): boolean {
  // Best-effort JSON parse for claude --output-format stream-json
  if (!line.trim()) return false
  try {
    const obj = JSON.parse(line) as Record<string, unknown>
    const eventType = (obj.type as string) ?? (obj.event as string) ?? 'output'
    if (eventType === 'tool_use' || eventType === 'tool_call') {
      const toolName = (obj.tool as string) ?? (obj.name as string) ?? 'unknown'
      emit(state, {
        type: 'tool_call',
        timestamp: Date.now(),
        content: `Tool call: ${toolName}`,
        taskId: state.session.taskId
      })
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
      buffer: ''
    }
    sessions.set(session.id, state)

    const bin = getAgentBinaryPath(this.type)
    const cwd = existsSync(config.worktreePath) ? config.worktreePath : process.cwd()
    const env = { ...process.env, ...(config.env ?? {}) }

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
      // PTY not available (e.g. native module missing); fall back to running nothing
      // so the UI can still show the error path.
      setStatus(state, 'error')
      emit(state, {
        type: 'error',
        timestamp: Date.now(),
        content: `Failed to spawn ${bin}: ${err instanceof Error ? err.message : String(err)}`,
        taskId: state.session.taskId
      })
      return session
    }

    state.pty = ptyProc
    state.session.pid = ptyProc.pid
    setStatus(state, 'running')

    ptyProc.onData((data: string) => {
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
    })

    return session
  }

  async stop(sessionId: string, mode: 'graceful' | 'force'): Promise<void> {
    const state = sessions.get(sessionId)
    if (!state) return
    if (state.pty) {
      try {
        if (mode === 'force') {
          state.pty.kill('SIGKILL')
        } else {
          // Send Ctrl-C and wait
          state.pty.write('\x03')
          setTimeout(() => state.pty?.kill('SIGTERM'), 2000)
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
