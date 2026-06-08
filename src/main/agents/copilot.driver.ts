import * as pty from '@lydell/node-pty'
import type { AgentEvent, Session, SessionConfig } from '@shared/types'
import type { IAgentDriver } from './driver.interface'
import {
  buildChildEnv, sendPtyData, emit, setStatus,
  DriverSessionManager, ptySpawnOptions, resolveCwd, createSession,
  getAgentBinaryPath
} from './driver-base'

/** CopilotDriver: GitHub Copilot CLI integration.
 *  Spawns `gh copilot suggest -p "<prompt>"` — plain text output, no JSON streaming. */

const EXTRA_ENV_KEYS = ['GH_TOKEN', 'GITHUB_TOKEN', 'GH_HOST']
const LABEL = 'copilot-driver'

export class CopilotDriver implements IAgentDriver {
  readonly type = 'copilot' as const
  private mgr = new DriverSessionManager(LABEL)

  async start(config: SessionConfig): Promise<Session> {
    const session = createSession(config, this.type)
    const state = this.mgr.create(session)
    const bin = getAgentBinaryPath(this.type)
    const cwd = resolveCwd(config.worktreePath)
    const env = buildChildEnv(EXTRA_ENV_KEYS, config.env)

    let ptyProc: pty.IPty
    try {
      ptyProc = pty.spawn(bin, ['copilot', 'suggest', '-p', config.prompt], ptySpawnOptions(cwd, env))
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
      for (const line of data.split('\n')) {
        if (line.trim()) emit(state, { type: 'output', timestamp: Date.now(), content: line, taskId: session.taskId }, LABEL)
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

  async stop(sessionId: string, mode: 'graceful' | 'force'): Promise<void> { return this.mgr.stop(sessionId, mode) }
  async pause(): Promise<void> {}
  async resume(): Promise<void> {}
  async send(sessionId: string, message: string): Promise<void> { return this.mgr.send(sessionId, message) }
  switchMode(sessionId: string, newMode: import('@shared/types').SessionMode): void { this.mgr.switchMode(sessionId, newMode) }
  ptyInput(sessionId: string, data: string): void { this.mgr.ptyInput(sessionId, data) }
  ptyResize(sessionId: string, cols: number, rows: number): void { this.mgr.ptyResize(sessionId, cols, rows) }
  subscribe(sessionId: string, handler: (event: AgentEvent) => void): () => void { return this.mgr.subscribe(sessionId, handler) }
}
