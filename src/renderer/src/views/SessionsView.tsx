import { useEffect, useMemo, useState } from 'react'
import { Circle, Loader2, Pause, CheckCircle2, XCircle, Play } from 'lucide-react'
import type { DetectedAgent, Session, SessionStatus } from '@shared/types'
import { TerminalPane } from '../components/TerminalPane'
import { useSessionsStore } from '../stores/sessions.store'

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
  const byId = useSessionsStore((s) => s.byId)
  const select = useSessionsStore((s) => s.select)
  const selectedId = useSessionsStore((s) => s.selectedId)
  const loadAll = useSessionsStore((s) => s.loadAll)
  const applyEvent = useSessionsStore((s) => s.applyEvent)
  const sessionList = useMemo(() => Object.values(byId), [byId])
  const selected = selectedId ? byId[selectedId] : sessionList[0]

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

  // Subscribe to live events
  useEffect(() => {
    const offOutput = window.orchflow.on('session:output', (payload) => {
      applyEvent(payload as never)
    })
    const offStatus = window.orchflow.on('session:status', (payload) => {
      applyEvent(payload as never)
    })
    return () => {
      offOutput()
      offStatus()
    }
  }, [applyEvent])

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
                  <button
                    onClick={() => void window.orchflow.sessions.openExternal(selected.sessionId)}
                    className="rounded px-2 py-0.5 text-xs text-[var(--color-text-1)] hover:bg-[var(--color-bg-3)]"
                  >
                    Open External
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-hidden p-2">
                <SessionOutput sessionId={selected.sessionId} />
              </div>
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

function SessionOutput({ sessionId }: { sessionId: string }): React.JSX.Element {
  const byId = useSessionsStore((s) => s.byId)
  const log = byId[sessionId]
  const [api, setApi] = useState<{
    write: (d: string) => void
    writeln: (d: string) => void
    clear: () => void
  } | null>(null)

  // Replay buffered lines into xterm when log changes
  useEffect(() => {
    if (!api || !log) return
    const currentLength = (api as unknown as { _renderedLen?: number })._renderedLen ?? 0
    if (log.lines.length > currentLength) {
      for (let i = currentLength; i < log.lines.length; i++) {
        api.writeln(log.lines[i])
      }
      ;(api as unknown as { _renderedLen?: number })._renderedLen = log.lines.length
    }
  }, [log?.lines.length, api, log])

  return (
    <TerminalPane
      onReady={(a) => {
        api?.clear()
        setApi(a)
        ;(a as unknown as { _renderedLen?: number })._renderedLen = 0
        if (log) {
          for (const line of log.lines) a.writeln(line)
          ;(a as unknown as { _renderedLen?: number })._renderedLen = log.lines.length
        }
      }}
    />
  )
}
