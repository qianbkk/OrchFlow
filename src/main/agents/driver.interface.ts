import type { AgentEvent, AgentType, Session, SessionConfig } from '@shared/types'

export interface IAgentDriver {
  readonly type: AgentType
  start(config: SessionConfig): Promise<Session>
  stop(sessionId: string, mode: 'graceful' | 'force'): Promise<void>
  pause(sessionId: string): Promise<void>
  resume(sessionId: string): Promise<void>
  send(sessionId: string, message: string): Promise<void>
  /** Subscribe to output/status events for a session. Returns an unsubscribe function. */
  subscribe(sessionId: string, handler: (event: AgentEvent) => void): () => void
}
