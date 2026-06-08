import * as pty from '@lydell/node-pty'
import type { AgentEvent, Session, SessionConfig, ToolCall } from '@shared/types'
import type { IAgentDriver } from './driver.interface'
import {
  buildChildEnv, sendPtyData, emit, setStatus,
  DriverSessionManager, ptySpawnOptions, resolveCwd, createSession,
  getAgentBinaryPath, HIGH_RISK_TYPES, requestApproval
} from './driver-base'

/** ClaudeCodeDriver: Claude Code CLI integration.
 *  Spawns `claude -p --output-format stream-json --verbose` with full
 *  stream-json parsing, approval gate, and checkpoint integration. */

const LABEL = 'claude-driver'

/** Best-effort classification of a tool-use event into a ToolCall shape. */
function toolCallFromEvent(obj: Record<string, unknown>): ToolCall | null {
  const rawName = (obj.tool as string) ?? (obj.name as string) ?? (obj.tool_name as string) ?? ''
  const name = rawName.toLowerCase()
  const input = (obj.input as Record<string, unknown>) ?? {}
  const description = (input.description as string) ?? (input.command as string) ?? name
  const detail = input.command as string | undefined
  const filesAffected = Array.isArray(input.paths)
    ? (input.paths as unknown[]).map((p) => String(p))
    : input.path ? [String(input.path)] : undefined
  let type: ToolCall['type'] = 'other'
  if (/(delete|rm|rmdir|unlink|drop|truncate)/.test(name) || /rm\s+-rf|drop\s+table/.test(description)) {
    type = name.includes('rm') || name.includes('delete') || name.includes('unlink') || name.includes('rmdir')
      ? 'file_delete' : 'db_destructive'
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

export class ClaudeCodeDriver implements IAgentDriver {
  readonly type = 'claude' as const
  private mgr = new DriverSessionManager(LABEL)

  async start(config: SessionConfig): Promise<Session> {
    const session = createSession(config, this.type)
    const state = this.mgr.create(session)
    const bin = getAgentBinaryPath(this.type)
    const cwd = resolveCwd(config.worktreePath)
    // API key is injected by session-manager via overrides (read from keytar).
    const env = buildChildEnv([], config.env)

    let ptyProc: pty.IPty
    try {
      ptyProc = pty.spawn(bin, ['-p', config.prompt, '--output-format', 'stream-json', '--verbose'], ptySpawnOptions(cwd, env))
    } catch (err) {
      setStatus(state, 'error', LABEL)
      emit(state, { type: 'error', timestamp: Date.now(),
        content: `Failed to spawn ${bin}: ${err instanceof Error ? err.message : String(err)}`,
        taskId: session.taskId }, LABEL)
      this.mgr.delete(session.id)
      return session
    }

    state.pty = ptyProc
    state.session.pid = ptyProc.pid
    setStatus(state, 'running', LABEL)

    ptyProc.onData((data: string) => {
      if (state.mode === 'interactive') { sendPtyData(session.id, data, LABEL); return }
      state.buffer += data
      const lines = state.buffer.split('\n')
      state.buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.trim()) continue
        if (!this.parseStreamJsonLine(state, line)) {
          emit(state, { type: 'output', timestamp: Date.now(), content: line, taskId: session.taskId }, LABEL)
        }
      }
    })

    ptyProc.onExit(({ exitCode }) => {
      if (state.session.status === 'running' || state.session.status === 'initializing') {
        setStatus(state, exitCode === 0 ? 'done' : 'error', LABEL)
      }
      state.pty = null
    })

    return session
  }

  private parseStreamJsonLine(state: ReturnType<DriverSessionManager['create']>, line: string): boolean {
    try {
      const obj = JSON.parse(line) as Record<string, unknown>
      const eventType = (obj.type as string) ?? (obj.event as string) ?? 'output'

      if (eventType === 'tool_use' || eventType === 'tool_call') {
        const toolName = (obj.tool as string) ?? (obj.name as string) ?? 'unknown'
        const toolCall = toolCallFromEvent(obj)
        // SECURITY: unknown tools default to requiring approval
        const needsApproval = toolCall == null ? true : HIGH_RISK_TYPES.includes(toolCall.type)
        const effectiveToolCall: ToolCall = toolCall ?? {
          type: 'other', description: `Unknown tool: ${toolName}`,
          detail: JSON.stringify(obj).slice(0, 200)
        }

        emit(state, { type: 'tool_call', timestamp: Date.now(), content: `Tool call: ${toolName}`,
          taskId: state.session.taskId, toolCall: effectiveToolCall }, LABEL)

        if (needsApproval && !state.cancelled) {
          state.pendingApproval = requestApproval(state, effectiveToolCall, LABEL)
        }
        return true
      }

      if (eventType === 'tool_result') {
        emit(state, { type: 'tool_result', timestamp: Date.now(),
          content: typeof obj.content === 'string' ? obj.content : JSON.stringify(obj),
          taskId: state.session.taskId }, LABEL)
        return true
      }
      if (eventType === 'done' || eventType === 'complete') {
        setStatus(state, 'done', LABEL)
        emit(state, { type: 'done', timestamp: Date.now(), content: '', taskId: state.session.taskId }, LABEL)
        return true
      }
      if (eventType === 'error') {
        setStatus(state, 'error', LABEL)
        emit(state, { type: 'error', timestamp: Date.now(),
          content: typeof obj.error === 'string' ? obj.error : JSON.stringify(obj),
          taskId: state.session.taskId }, LABEL)
        return true
      }

      const text = (obj.text as string) ?? (obj.content as string) ?? (obj.message as string) ?? ''
      if (text) {
        emit(state, { type: 'output', timestamp: Date.now(), content: text, taskId: state.session.taskId }, LABEL)
        return true
      }
      return false
    } catch {
      return false
    }
  }

  async stop(sessionId: string, mode: 'graceful' | 'force'): Promise<void> { return this.mgr.stop(sessionId, mode) }
  async pause(): Promise<void> {} // Windows ConPTY doesn't support SIGSTOP
  async resume(): Promise<void> {}
  async send(sessionId: string, message: string): Promise<void> { return this.mgr.send(sessionId, message) }
  switchMode(sessionId: string, newMode: import('@shared/types').SessionMode): void { this.mgr.switchMode(sessionId, newMode) }
  ptyInput(sessionId: string, data: string): void { this.mgr.ptyInput(sessionId, data) }
  ptyResize(sessionId: string, cols: number, rows: number): void { this.mgr.ptyResize(sessionId, cols, rows) }
  subscribe(sessionId: string, handler: (event: AgentEvent) => void): () => void { return this.mgr.subscribe(sessionId, handler) }
}

// Re-export the IPty type for downstream usage
export type { IPty } from '@lydell/node-pty'
