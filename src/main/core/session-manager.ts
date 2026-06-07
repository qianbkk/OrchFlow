import { BrowserWindow } from 'electron'
import type { AgentEvent, Checkpoint, Session, SessionConfig } from '@shared/types'
import { SessionRepository } from '../db/repositories/session.repository'
import { TaskRepository } from '../db/repositories/task.repository'
import { AuditRepository } from '../db/repositories/audit.repository'
import { getDriver } from '../agents/driver.registry'
import { approvalGate } from './approval-gate'
import { checkpointManager } from './checkpoint'
import { notifier } from './notifier'

const sessions = new SessionRepository()
const audit = new AuditRepository()

function pushEventToRenderers(event: AgentEvent): void {
  const channel = event.type === 'status_change' ? 'session:status' : 'session:output'
  for (const w of BrowserWindow.getAllWindows()) {
    try {
      w.webContents.send(channel, event)
    } catch (err) {
      console.error('[session-manager] send failed:', err)
    }
  }
}

export const sessionManager = {
  async start(config: SessionConfig): Promise<Session> {
    const driver = getDriver(config.agentType)
    const session = await driver.start(config)
    sessions.create(session)

    driver.subscribe(session.id, (event) => {
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
        }
      }
      audit.log({
        timestamp: event.timestamp,
        sessionId: session.id,
        taskId: session.taskId,
        actor: `agent:${session.agentType}`,
        actionType: event.type,
        actionDetailJson: typeof event.content === 'string' ? JSON.stringify({ content: event.content.slice(0, 500) }) : undefined,
        riskLevel: event.type === 'tool_call' ? 'medium' : 'low',
        approvalStatus: 'auto'
      })
      pushEventToRenderers(event)
    })

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
    if (!s) return
    const driver = getDriver(s.agentType)
    await driver.stop(sessionId, mode)
    sessions.end(sessionId)
  },

  async pause(sessionId: string): Promise<void> {
    const s = sessions.get(sessionId)
    if (!s) return
    const driver = getDriver(s.agentType)
    await driver.pause(sessionId)
  },

  async resume(sessionId: string): Promise<void> {
    const s = sessions.get(sessionId)
    if (!s) return
    const driver = getDriver(s.agentType)
    await driver.resume(sessionId)
  },

  async send(sessionId: string, message: string): Promise<void> {
    const s = sessions.get(sessionId)
    if (!s) return
    const driver = getDriver(s.agentType)
    await driver.send(sessionId, message)
  },

  async attachPty(sessionId: string): Promise<void> {
    // Switch the session mode in the DB; the renderer can then re-render via xterm.js
    const s = sessions.get(sessionId)
    if (!s) return
    s.mode = 'interactive'
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
    for (const w of BrowserWindow.getAllWindows()) {
      try {
        w.webContents.send('checkpoint:created', cp)
      } catch (err) {
        console.error('[session-manager] notify checkpoint failed:', err)
      }
    }
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
