import { existsSync } from 'node:fs'
import * as pty from '@lydell/node-pty'
import type { AgentEvent, Session, SessionConfig, ToolCall } from '@shared/types'
import type { IAgentDriver } from './driver.interface'
import { approvalGate } from '../core/approval-gate'
import { checkpointManager } from '../core/checkpoint'
import { TaskRepository } from '../db/repositories/task.repository'
import {
  buildChildEnv, sendPtyData, emit, setStatus,
  DriverSessionManager, ptySpawnOptions, resolveCwd, createSession,
  getAgentBinaryPath
} from './driver-base'

/** CodexDriver: Codex CLI integration.
 *  Spawns `codex -p "<prompt>" --approval-policy on-failure` with stdout JSON line parsing. */

const EXTRA_ENV_KEYS = ['OPENAI_API_KEY', 'OPENAI_ORG_ID']
const LABEL = 'codex-driver'
const HIGH_RISK_TYPES: ToolCall['type'][] = ['file_delete', 'git_force_push', 'db_destructive', 'merge']

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
  private mgr = new DriverSessionManager(LABEL)

  async start(config: SessionConfig): Promise<Session> {
    const session = createSession(config, this.type)
    const state = this.mgr.create(session)
    const bin = getAgentBinaryPath(this.type)
    const cwd = resolveCwd(config.worktreePath)
    const env = buildChildEnv(EXTRA_ENV_KEYS, config.env)

    let ptyProc: pty.IPty
    try {
      ptyProc = pty.spawn(bin, ['-p', config.prompt, '--approval-policy', 'on-failure'], ptySpawnOptions(cwd, env))
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
        if (line.trim()) this.parseLine(state, line)
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

  private parseLine(state: ReturnType<DriverSessionManager['create']>, line: string): void {
    try {
      const obj = JSON.parse(line) as Record<string, unknown>
      const eventType = (obj.type as string) ?? (obj.event as string) ?? 'output'

      if (eventType === 'tool_use' || eventType === 'tool_call' || eventType === 'function_call') {
        const toolName = (obj.tool as string) ?? (obj.name as string) ?? (obj.function as string) ?? 'unknown'
        const input = (obj.input as Record<string, unknown>) ?? (obj.arguments as Record<string, unknown>) ?? {}
        const description = (input.description as string) ?? (input.command as string) ?? toolName
        const toolCall = classifyToolCall(toolName, description)
        const needsApproval = HIGH_RISK_TYPES.includes(toolCall.type)

        emit(state, { type: 'tool_call', timestamp: Date.now(), content: `Tool call: ${toolName}`,
          taskId: state.session.taskId, toolCall }, LABEL)

        if (needsApproval && !state.cancelled) {
          if (state.session.taskId) {
            try {
              const task = new TaskRepository().get(state.session.taskId)
              if (task?.worktreePath && existsSync(task.worktreePath)) {
                void checkpointManager.create(state.session.id, state.session.taskId,
                  task.worktreePath, 'pre_approval', `Before ${toolCall.type}: ${toolCall.description.slice(0, 80)}`)
              }
            } catch (err) { console.warn(`[${LABEL}] checkpoint failed:`, err) }
          }
          setStatus(state, 'waiting_approval', LABEL)
          state.pendingApproval = approvalGate
            .request(state.session.id, state.session.taskId ?? '', toolCall)
            .then((approved) => {
              state.pendingApproval = null
              if (!state.cancelled) setStatus(state, approved ? 'running' : 'error', LABEL)
              return approved
            })
            .catch(() => { state.pendingApproval = null; return false })
        }
        return
      }

      if (eventType === 'done' || eventType === 'complete' || eventType === 'result') {
        setStatus(state, 'done', LABEL)
        emit(state, { type: 'done', timestamp: Date.now(), content: '', taskId: state.session.taskId }, LABEL)
        return
      }
      if (eventType === 'error') {
        setStatus(state, 'error', LABEL)
        emit(state, { type: 'error', timestamp: Date.now(),
          content: typeof obj.error === 'string' ? obj.error : JSON.stringify(obj),
          taskId: state.session.taskId }, LABEL)
        return
      }

      const text = (obj.text as string) ?? (obj.content as string) ?? (obj.message as string) ?? (obj.output as string) ?? ''
      if (text) emit(state, { type: 'output', timestamp: Date.now(), content: text, taskId: state.session.taskId }, LABEL)
    } catch {
      if (line.trim()) emit(state, { type: 'output', timestamp: Date.now(), content: line, taskId: state.session.taskId }, LABEL)
    }
  }

  async stop(sessionId: string, mode: 'graceful' | 'force'): Promise<void> { return this.mgr.stop(sessionId, mode) }
  async pause(): Promise<void> {}
  async resume(): Promise<void> {}
  async send(sessionId: string, message: string): Promise<void> { return this.mgr.send(sessionId, message) }
  switchMode(sessionId: string, newMode: import('@shared/types').SessionMode): void { this.mgr.switchMode(sessionId, newMode) }
  ptyInput(sessionId: string, data: string): void { this.mgr.ptyInput(sessionId, data) }
  ptyResize(sessionId: string, cols: number, rows: number): void { this.mgr.ptyResize(sessionId, cols, rows) }
  subscribe(sessionId: string, handler: (event: AgentEvent) => void): () => void { return this.mgr.subscribe(sessionId, handler) }
}
