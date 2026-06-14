import type { AgentEvent, Checkpoint, Session, SessionConfig } from '@shared/types'
import { SessionRepository } from '../db/repositories/session.repository'
import { TaskRepository } from '../db/repositories/task.repository'
import { AuditRepository } from '../db/repositories/audit.repository'
import { getDriver } from '../agents/driver.registry'
import { approvalGate } from './approval-gate'
import { checkpointManager } from './checkpoint'
import { notifier } from './notifier'
import { broadcast } from './broadcast'
import * as keytar from 'keytar'
import { PROJECT_KEYTAR_SERVICE, KEYTAR_KEYS } from '
import { worktreeWatcher } from './worktree-watcher'@shared/constants'

const sessions = new SessionRepository()
const audit = new AuditRepository()

/** Per-session cleanup callbacks so we can release driver subscribers on stop. */
const sessionCleanup = new Map<string, () => void>()

function pushEvent(event: AgentEvent): void {
  const channel = event.type === 'status_change' ? 'session:status' : 'session:output'
  broadcast(channel, event)
}

/** Only log security-relevant events; output stream is too chatty. */
function shouldAudit(event: AgentEvent): boolean {
  switch (event.type) {
    case 'tool_call':
    case 'error':
      return true
    case 'status_change':
      // Only log terminal status transitions
      return event.status === 'done' || event.status === 'error' || event.status === 'waiting_approval'
    case 'tool_result':
      // Log only if the result carries a high-risk marker (set by the driver)
      return false
    case 'output':
    case 'done':
    default:
      return false
  }
}

export const sessionManager = {
  async start(config: SessionConfig): Promise<Session> {
    // SECURITY: Read API key from keytar (Windows Credential Manager) and
    // inject it into the child process env. The driver only trusts the
    // overrides passed via config.env — it never reads keytar directly.
    const envOverrides = { ...(config.env ?? {}) }
    const API_KEY_ENV: Record<string, string> = {
      claude: 'ANTHROPIC_API_KEY',
      codex: 'OPENAI_API_KEY',
      copilot: 'GH_TOKEN'
    }
    const envVarName = API_KEY_ENV[config.agentType]
    if (envVarName && !envOverrides[envVarName]) {
      try {
        const apiKey = await keytar.getPassword(
          PROJECT_KEYTAR_SERVICE,
          `${KEYTAR_KEYS.API_KEY_PREFIX}${config.agentType}`
        )
        if (apiKey) envOverrides[envVarName] = apiKey
      } catch (err) {
        // Log keytar failure instead of silently swallowing — helps diagnose
        // "API key unavailable" issues (ERR-keytar-silent)
        console.warn(`[session-manager] keytar.getPassword failed for ${config.agentType}:`, err)
      }
    }
    const enrichedConfig = { ...config, env: envOverrides }

    const driver = getDriver(config.agentType)
    const session = await driver.start(enrichedConfig)
    sessions.create(session)

    const unsubscribe = driver.subscribe(session.id, (event) => {
      if (event.type === 'status_change' && event.status) {
        sessions.updateStatus(session.id, event.status, session.pid)
        if (event.status === 'done' || event.status === 'error') {
          sessions.end(session.id)
          notifier.notify({
            type: event.status === 'done' ? 'task_done' : 'task_failed',
            title: event.status === 'done' ? 'Task complete' : 'Task failed',
            body: `${session.agentType} session ${session.id.slice(0, 8)} ${event.status}`,
            taskId: session.taskId,
            sessionId: session.id
          })
          // Clean up driver subscription to prevent memory leak on natural session end
          const cleanup = sessionCleanup.get(session.id)
          if (cleanup) {
            cleanup()
            sessionCleanup.delete(session.id)
          }
        }
      }
      // Only log security-relevant events to the audit log; the per-event
      // output stream would otherwise flood the table and drown out the
      // actual security signal.
      if (shouldAudit(event)) {
        try {
          audit.log({
            timestamp: event.timestamp,
            sessionId: session.id,
            taskId: session.taskId,
            actor: `agent:${session.agentType}`,
            actionType: event.type,
            actionDetailJson:
              typeof event.content === 'string'
                ? JSON.stringify({ content: event.content.slice(0, 500) })
                : event.toolCall
                  ? JSON.stringify(event.toolCall)
                  : undefined,
            riskLevel:
              event.type === 'tool_call'
                ? 'medium'
                : event.type === 'error'
                  ? 'high'
                  : 'low',
            approvalStatus: 'auto'
          })
        } catch (err) {
          console.error('[session-manager] audit.log failed:', err)
        }
      }
      pushEvent(event)
    })
    // Attach the unsubscribe so stop() can release the closure
    sessionCleanup.set(session.id, unsubscribe)

    audit.log({
      timestamp: Date.now(),
      sessionId: session.id,
      taskId: session.taskId,
      actor: 'user',
      actionType: 'session_start',
      actionDetailJson: JSON.stringify({ agentType: session.agentType, worktreePath: config.worktreePath }),
      approvalStatus: 'auto'
    })
    return session
  },

  async stop(sessionId: string, mode: 'graceful' | 'force'): Promise<void> {
    const s = sessions.get(sessionId)
    if (!s) throw new Error(`Session not found: ${sessionId}`)
    const driver = getDriver(s.agentType)
    const cleanup = sessionCleanup.get(sessionId)
    if (cleanup) {
      cleanup()
      sessionCleanup.delete(sessionId)
    }
    await driver.stop(sessionId, mode)
    sessions.end(sessionId)
  },

  async pause(sessionId: string): Promise<void> {
    const s = sessions.get(sessionId)
    if (!s) throw new Error(`Session not found: ${sessionId}`)
    const driver = getDriver(s.agentType)
    await driver.pause(sessionId)
  },

  async resume(sessionId: string): Promise<void> {
    const s = sessions.get(sessionId)
    if (!s) throw new Error(`Session not found: ${sessionId}`)
    const driver = getDriver(s.agentType)
    await driver.resume(sessionId)
  },

  async send(sessionId: string, message: string): Promise<void> {
    const s = sessions.get(sessionId)
    if (!s) throw new Error(`Session not found: ${sessionId}`)
    const driver = getDriver(s.agentType)
    await driver.send(sessionId, message)
  },

  async attachPty(sessionId: string): Promise<void> {
    // Switch the session mode in the DB; the renderer can then re-render via xterm.js
    const s = sessions.get(sessionId)
    if (!s) throw new Error(`Session not found: ${sessionId}`)
    s.mode = 'interactive'
  },

  /** PRD §3.5.2: toggle a session between headless (stream-json parsed) and
   *  interactive (raw pty passthrough to xterm.js). */
  setMode(sessionId: string, mode: Session['mode']): void {
    const s = sessions.get(sessionId)
    if (!s) return
    const driver = getDriver(s.agentType)
    if (driver.switchMode) {
      driver.switchMode(sessionId, mode)
    }
  },

  /** Forward renderer keystrokes to the underlying PTY in interactive mode. */
  ptyInput(sessionId: string, data: string): void {
    const s = sessions.get(sessionId)
    if (!s) return
    const driver = getDriver(s.agentType)
    if (driver.ptyInput) driver.ptyInput(sessionId, data)
  },

  /** Forward renderer resize to the underlying PTY so the CLI sees correct
   *  COLUMNS/LINES. */
  ptyResize(sessionId: string, cols: number, rows: number): void {
    const s = sessions.get(sessionId)
    if (!s) return
    const driver = getDriver(s.agentType)
    if (driver.ptyResize) driver.ptyResize(sessionId, cols, rows)
  },

  async openExternal(_sessionId: string): Promise<void> {
    // Implemented in IPC layer; placeholder
  },

  async createCheckpoint(sessionId: string, description: string): Promise<Checkpoint> {
    const s = sessions.get(sessionId)
    if (!s) throw new Error(`Session not found: ${sessionId}`)
    const task = new TaskRepository().get(s.taskId)
    if (!task?.worktreePath) throw new Error('Cannot checkpoint: task has no worktree')
    const cp = await checkpointManager.create(sessionId, s.taskId, task.worktreePath, 'manual', description)
    broadcast('checkpoint:created', cp)
    return cp
  },

  async rollbackToCheckpoint(checkpointId: string): Promise<void> {
    await checkpointManager.rollback(checkpointId)
  },

  getApprovalQueue() {
    return approvalGate.list()
  },

  approve(requestId: string): void {
    approvalGate.approve(requestId)
  },

  reject(requestId: string): void {
    approvalGate.reject(requestId)
  }
}
