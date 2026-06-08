import { randomUUID } from 'node:crypto'
import type { AgentType, Session, SessionConfig } from '@shared/types'
import type { IAgentDriver } from './driver.interface'

/** Driver for CLIs that are not yet wired in the current phase. Emits a single
 *  'error' event so the UI shows a clear "not implemented" message instead of
 *  silently spawning the wrong binary. */
export class StubDriver implements IAgentDriver {
  constructor(public readonly type: AgentType, public readonly phase: string) {}

  async start(config: SessionConfig): Promise<Session> {
    return {
      id: randomUUID(),
      taskId: config.taskId,
      agentType: this.type,
      status: 'initializing',
      mode: 'headless',
      startedAt: Date.now()
    }
  }

  async stop(): Promise<void> {}
  async pause(): Promise<void> {}
  async resume(): Promise<void> {}
  async send(): Promise<void> {}

  subscribe(sessionId: string, handler: (event: import('@shared/types').AgentEvent) => void): () => void {
    let cancelled = false
    setImmediate(() => {
      if (cancelled) return
      handler({
        type: 'error',
        timestamp: Date.now(),
        sessionId,
        taskId: '',
        content: `${this.type} driver is not yet implemented (${this.phase}). Only Claude Code is wired in this build.`
      })
      handler({
        type: 'status_change',
        timestamp: Date.now(),
        sessionId,
        taskId: '',
        content: 'error',
        status: 'error'
      })
    })
    return () => { cancelled = true }
  }
}
