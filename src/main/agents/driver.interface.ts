import type { AgentEvent, AgentType, Session, SessionConfig, SessionMode } from '@shared/types'

export interface IAgentDriver {
  readonly type: AgentType
  start(config: SessionConfig): Promise<Session>
  stop(sessionId: string, mode: 'graceful' | 'force'): Promise<void>
  pause(sessionId: string): Promise<void>
  resume(sessionId: string): Promise<void>
  send(sessionId: string, message: string): Promise<void>
  /** Subscribe to output/status events for a session. Returns an unsubscribe function. */
  subscribe(sessionId: string, handler: (event: AgentEvent) => void): () => void

  /** Optional: switch between headless (structured) and interactive (raw PTY) modes.
   *  Only drivers with PTY support should implement this. */
  switchMode?(sessionId: string, mode: SessionMode): void
  /** Optional: write raw keystrokes from xterm.js to the PTY. */
  ptyInput?(sessionId: string, data: string): void
  /** Optional: forward resize events to the PTY. */
  ptyResize?(sessionId: string, cols: number, rows: number): void
}
