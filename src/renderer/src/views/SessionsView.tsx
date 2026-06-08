import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Circle,
  Loader2,
  Pause,
  CheckCircle2,
  XCircle,
  Play,
  ChevronDown,
  ChevronRight,
  Maximize2,
  Minimize2,
  Keyboard,
  List
} from 'lucide-react'
import type { AgentEvent, DetectedAgent, Session, SessionMode, SessionStatus } from '@shared/types'
import { TerminalPane } from '../components/TerminalPane'
import { useSessionsStore } from '../stores/sessions.store'
import { useRefreshOn } from '../hooks/useRefreshOn'
import { CheckpointTimeline } from '../components/CheckpointTimeline'

const STATUS_ICON: Record<SessionStatus, React.ComponentType<{ size?: number; className?: string }>> = {
  idle: Circle,
  initializing: Loader2,
  running: Loader2,
  waiting_input: Pause,
  waiting_approval: Pause,
  error: XCircle,
  done: CheckCircle2
}

const STATUS_COLOR: Record<SessionStatus, string> = {
  idle: 'text-[var(--color-text-2)]',
  initializing: 'text-[var(--color-accent)]',
  running: 'text-[var(--color-accent-2)]',
  waiting_input: 'text-[var(--color-warn)]',
  waiting_approval: 'text-[var(--color-warn)]',
  error: 'text-[var(--color-danger)]',
  done: 'text-[var(--color-accent-2)]'
}

function StatusDot({ status }: { status: SessionStatus }): React.JSX.Element {
  const Icon = STATUS_ICON[status]
  return (
    <Icon
      size={12}
      className={`${STATUS_COLOR[status]} ${status === 'running' || status === 'initializing' ? 'animate-spin' : ''}`}
    />
  )
}

export function SessionsView(): React.JSX.Element {
  const [agents, setAgents] = useState<DetectedAgent[]>([])
  const [loading, setLoading] = useState(true)
  const [fullscreenId, setFullscreenId] = useState<string | null>(null)
  const byId = useSessionsStore((s) => s.byId)
  const select = useSessionsStore((s) => s.select)
  const selectedId = useSessionsStore((s) => s.selectedId)
  const loadAll = useSessionsStore((s) => s.loadAll)
  const sessionList = useMemo(() => Object.values(byId), [byId])
  const selected = selectedId ? byId[selectedId] : sessionList[0]
  const selectedMode: SessionMode = selected?.mode ?? 'headless'

  useEffect(() => {
    void (async () => {
      try {
        const detected = await window.orchflow.agents.detectInstalled()
        setAgents(detected)
        const list = (await window.orchflow.sessions.list()) as Session[]
        loadAll(list)
        if (list.length > 0) select(list[0].id)
      } catch (err) {
        console.error('[SessionsView] load failed:', err)
      } finally {
        setLoading(false)
      }
    })()
  }, [loadAll, select])

  // Subscribe to live events — wire session:output and session:status to the
  // Zustand store so the terminal pane receives real-time Agent output.
  useEffect(() => {
    const offOutput = window.orchflow.on('session:output', (payload: unknown) => {
      useSessionsStore.getState().applyEvent(payload as AgentEvent)
    })
    const offStatus = window.orchflow.on('session:status', (payload: unknown) => {
      useSessionsStore.getState().applyEvent(payload as AgentEvent)
    })
    return () => {
      offOutput()
      offStatus()
    }
  }, [])

  // PRD §3.5.2: Esc exits fullscreen (keyboard affordance for the fullscreen
  // overlay, since it feels modal to the user). Also auto-exits fullscreen
  // when the session enters waiting_approval — security-critical approval
  // dialogs must not be obscured by the terminal overlay.
  useEffect(() => {
    if (!fullscreenId) return
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setFullscreenId(null)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [fullscreenId])

  useEffect(() => {
    if (fullscreenId && selected?.status === 'waiting_approval') {
      setFullscreenId(null)
    }
  }, [fullscreenId, selected?.status])

  const toggleMode = async (): Promise<void> => {
    if (!selected) return
    const nextMode: SessionMode = selectedMode === 'headless' ? 'interactive' : 'headless'
    try {
      await window.orchflow.sessions.setMode(selected.sessionId, nextMode)
      useSessionsStore.getState().setMode(selected.sessionId, nextMode)
    } catch (err) {
      console.error('[SessionsView] setMode failed:', err)
      // UI stays in current mode; user can retry.
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Top: agent detection cards */}
      <div className="border-b border-[var(--color-border-1)] bg-[var(--color-bg-2)] p-4">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-2)]">
          Detected Agent CLIs
        </h2>
        {loading ? (
          <p className="text-sm text-[var(--color-text-2)]">Detecting…</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {agents.map((a) => (
              <div
                key={a.type}
                className="rounded-lg border border-[var(--color-border-1)] bg-[var(--color-bg-1)] p-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium capitalize">{a.type}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      a.installed
                        ? 'bg-[var(--color-accent-2)]/20 text-[var(--color-accent-2)]'
                        : 'bg-[var(--color-danger)]/20 text-[var(--color-danger)]'
                    }`}
                  >
                    {a.installed ? 'installed' : 'missing'}
                  </span>
                </div>
                {a.path && (
                  <p className="mt-1 truncate text-xs text-[var(--color-text-2)]" title={a.path}>
                    {a.path}
                  </p>
                )}
                {a.version && <p className="mt-0.5 text-xs text-[var(--color-text-1)]">v{a.version}</p>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bottom: sessions list + selected preview */}
      <div className="flex flex-1 overflow-hidden">
        <div className="w-72 shrink-0 overflow-auto border-r border-[var(--color-border-1)] bg-[var(--color-bg-2)]">
          <h2 className="sticky top-0 border-b border-[var(--color-border-1)] bg-[var(--color-bg-2)] px-4 py-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-2)]">
            Sessions ({sessionList.length})
          </h2>
          {sessionList.length === 0 ? (
            <p className="p-4 text-sm text-[var(--color-text-2)]">No active sessions.</p>
          ) : (
            <ul>
              {sessionList.map((s) => (
                <li key={s.sessionId}>
                  <button
                    onClick={() => select(s.sessionId)}
                    className={`flex w-full items-center gap-2 border-l-2 border-transparent px-4 py-2 text-left text-sm hover:bg-[var(--color-bg-3)]/40 ${
                      selected?.sessionId === s.sessionId
                        ? 'border-l-[var(--color-accent)] bg-[var(--color-bg-3)]/60'
                        : ''
                    }`}
                  >
                    <StatusDot status={s.status} />
                    <span className="flex-1 truncate">
                      <span className="block truncate capitalize">{s.agentType}</span>
                      <span className="block text-xs text-[var(--color-text-2)]">
                        {s.status} · {new Date(s.updatedAt).toLocaleTimeString()}
                      </span>
                    </span>
                    {s.status === 'running' || s.status === 'initializing' ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          void window.orchflow.sessions.stop(s.sessionId, 'graceful')
                        }}
                        className="rounded p-1 text-[var(--color-text-2)] hover:bg-[var(--color-bg-0)]"
                        title="Stop session"
                      >
                        <Pause size={12} />
                      </button>
                    ) : null}
                    {(s.status === 'done' || s.status === 'error' || s.status === 'idle') && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          void window.orchflow.sessions.resume(s.sessionId)
                        }}
                        className="rounded p-1 text-[var(--color-text-2)] hover:bg-[var(--color-bg-0)]"
                        title="Resume session"
                      >
                        <Play size={12} />
                      </button>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-1 flex-col overflow-hidden bg-[var(--color-bg-0)]">
          {selected ? (
            <>
              <div className="flex items-center justify-between border-b border-[var(--color-border-1)] bg-[var(--color-bg-2)] px-4 py-2">
                <div className="flex items-center gap-2">
                  <StatusDot status={selected.status} />
                  <span className="font-mono text-xs">{selected.sessionId.slice(0, 8)}</span>
                  <span className="text-xs text-[var(--color-text-2)]">
                    {selected.agentType} · {selected.status}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  {/* PRD §3.5.2: mode toggle — switches the driver between
                      stream-json parsing (headless) and raw pty passthrough
                      (interactive) without restarting the PTY process. */}
                  <button
                    onClick={() => void toggleMode()}
                    className={`flex items-center gap-1 rounded px-2 py-1 text-xs hover:bg-[var(--color-bg-3)] ${
                      selectedMode === 'interactive'
                        ? 'bg-[var(--color-accent)]/20 text-[var(--color-accent)]'
                        : 'text-[var(--color-text-1)]'
                    }`}
                    title={
                      selectedMode === 'interactive'
                        ? 'Switch to structured output mode'
                        : 'Switch to interactive terminal mode'
                    }
                  >
                    {selectedMode === 'interactive' ? <Keyboard size={12} /> : <List size={12} />}
                    {selectedMode === 'interactive' ? 'Interactive' : 'Structured'}
                  </button>
                  {/* PRD §3.5.2: "展开" button — fullscreen xterm view.
                      Same terminal instance, just repositioned via CSS. */}
                  <button
                    onClick={() =>
                      setFullscreenId(
                        fullscreenId === selected.sessionId ? null : selected.sessionId
                      )
                    }
                    className="rounded p-1 text-[var(--color-text-1)] hover:bg-[var(--color-bg-3)]"
                    title={fullscreenId ? 'Exit fullscreen (Esc)' : 'Enter fullscreen'}
                  >
                    {fullscreenId ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-hidden p-2">
                <SessionOutput
                  sessionId={selected.sessionId}
                  mode={selectedMode}
                  fullscreen={fullscreenId === selected.sessionId}
                />
              </div>
              {/* PRD §3.4.3: checkpoint timeline (collapsible, below the
                  terminal output). Shows markers for auto/manual/pre_approval
                  checkpoints with preview + rollback actions. Hidden when
                  the terminal is fullscreen. */}
              {fullscreenId !== selected.sessionId && (
                <CollapsibleTimeline sessionId={selected.sessionId} />
              )}
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-sm text-[var(--color-text-2)]">
              Select a session to view output
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

interface SessionOutputProps {
  sessionId: string
  mode: SessionMode
  fullscreen: boolean
}

function SessionOutput({ sessionId, mode, fullscreen }: SessionOutputProps): React.JSX.Element {
  const byId = useSessionsStore((s) => s.byId)
  const log = byId[sessionId]
  const apiRef = useRef<{
    write: (d: string) => void
    writeln: (d: string) => void
    clear: () => void
  } | null>(null)
  const renderedLenRef = useRef(0)

  // Replay buffered lines into xterm when log changes (headless mode only)
  // Uses fullLines (up to 5000) so the terminal shows complete output history,
  // not just the 20-line compact preview used in task list cards.
  useEffect(() => {
    if (mode !== 'headless') return
    const api = apiRef.current
    if (!api || !log) return
    if (log.fullLines.length > renderedLenRef.current) {
      for (let i = renderedLenRef.current; i < log.fullLines.length; i++) {
        api.writeln(log.fullLines[i])
      }
      renderedLenRef.current = log.fullLines.length
    }
  }, [log?.fullLines.length, log, mode])

  // PRD §3.5.2: in interactive mode, subscribe to raw pty:data events
  // from the main process and write them straight into xterm.
  useEffect(() => {
    if (mode !== 'interactive') return
    const off = window.orchflow.on('pty:data', (payload: unknown) => {
      const p = payload as { sessionId: string; data: string }
      if (p.sessionId === sessionId) {
        apiRef.current?.write(p.data)
      }
    })
    return off
  }, [mode, sessionId])

  return (
    <TerminalPane
      fullscreen={fullscreen}
      onReady={(a) => {
        a.clear()
        apiRef.current = a
        renderedLenRef.current = 0
        if (mode === 'headless' && log) {
          for (const line of log.fullLines) a.writeln(line)
          renderedLenRef.current = log.fullLines.length
        }
      }}
      onData={(data) => {
        if (mode === 'interactive') {
          void window.orchflow.sessions.ptyInput(sessionId, data)
        }
      }}
      onResize={(cols, rows) => {
        if (mode === 'interactive') {
          void window.orchflow.sessions.ptyResize(sessionId, cols, rows)
        }
      }}
    />
  )
}

function CollapsibleTimeline({ sessionId }: { sessionId: string }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  return (
    <div className="shrink-0 border-t border-[var(--color-border-1)] bg-[var(--color-bg-1)]">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-[var(--color-text-2)] hover:bg-[var(--color-bg-2)]"
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        Checkpoints
      </button>
      {open && (
        <div className="max-h-80 overflow-auto px-2 pb-3">
          <CheckpointTimeline sessionId={sessionId} />
        </div>
      )}
    </div>
  )
}
