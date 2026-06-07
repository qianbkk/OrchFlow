import { useEffect, useState } from 'react'
import type { AuditEntry } from '@shared/types'

export function AuditView(): React.JSX.Element {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void (async () => {
      try {
        const result = await window.orchflow.audit.query({})
        setEntries(result)
      } catch (err) {
        console.error('[AuditView] query failed:', err)
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  return (
    <div className="flex h-full flex-col overflow-hidden p-6">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-2)]">
        Audit Log ({entries.length})
      </h2>
      {loading ? (
        <p className="text-sm text-[var(--color-text-2)]">Loading…</p>
      ) : entries.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--color-border-1)] p-8 text-center text-sm text-[var(--color-text-2)]">
          No audit entries yet. Operations will be logged here as you work.
        </div>
      ) : (
        <ul className="flex-1 space-y-1 overflow-auto">
          {entries.map((e) => (
            <li
              key={e.id}
              className="rounded border border-[var(--color-border-1)] bg-[var(--color-bg-2)] p-2 text-xs"
            >
              <div className="flex items-center gap-2">
                <span className="font-mono text-[var(--color-text-2)]">
                  {new Date(e.timestamp).toLocaleTimeString()}
                </span>
                <span className="font-medium">{e.actor}</span>
                <span className="text-[var(--color-text-1)]">{e.actionType}</span>
                {e.riskLevel && (
                  <span
                    className={`rounded px-1.5 py-0.5 ${
                      e.riskLevel === 'high'
                        ? 'bg-[var(--color-danger)]/20 text-[var(--color-danger)]'
                        : e.riskLevel === 'medium'
                          ? 'bg-[var(--color-warn)]/20 text-[var(--color-warn)]'
                          : 'bg-[var(--color-text-2)]/20 text-[var(--color-text-1)]'
                    }`}
                  >
                    {e.riskLevel}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
