import { useEffect, useState } from 'react'
import type { DetectedAgent, Session } from '@shared/types'

export function SessionsView(): React.JSX.Element {
  const [agents, setAgents] = useState<DetectedAgent[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void (async () => {
      try {
        const detected = await window.orchflow.agents.detectInstalled()
        setAgents(detected)
        const list = await window.orchflow.sessions.list()
        setSessions(list)
      } catch (err) {
        console.error('[SessionsView] load failed:', err)
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  return (
    <div className="flex h-full flex-col gap-4 overflow-auto p-6">
      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-2)]">
          Detected Agents
        </h2>
        {loading ? (
          <p className="text-sm text-[var(--color-text-2)]">Detecting…</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {agents.map((a) => (
              <div
                key={a.type}
                className="rounded-lg border border-[var(--color-border-1)] bg-[var(--color-bg-2)] p-4"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium capitalize">{a.type}</span>
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
                {a.version && (
                  <p className="mt-1 text-xs text-[var(--color-text-1)]">v{a.version}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="flex-1">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-2)]">
          Active Sessions ({sessions.length})
        </h2>
        {sessions.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[var(--color-border-1)] p-8 text-center text-sm text-[var(--color-text-2)]">
            No active sessions. Create a task to start one.
          </div>
        ) : (
          <ul className="space-y-2">
            {sessions.map((s) => (
              <li
                key={s.id}
                className="rounded-lg border border-[var(--color-border-1)] bg-[var(--color-bg-2)] p-3 text-sm"
              >
                <span className="font-mono text-xs text-[var(--color-text-1)]">{s.id}</span>
                <span className="ml-2 capitalize text-[var(--color-text-0)]">{s.agentType}</span>
                <span className="ml-2 text-[var(--color-text-2)]">· {s.status}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
