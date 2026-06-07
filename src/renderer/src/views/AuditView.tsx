import { useEffect, useState } from 'react'
import { Download } from 'lucide-react'
import type { AuditEntry } from '@shared/types'

export function AuditView(): React.JSX.Element {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState<'json' | 'csv' | null>(null)

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

  const download = async (format: 'json' | 'csv'): Promise<void> => {
    setExporting(format)
    try {
      const content = await window.orchflow.audit.export({}, format)
      // Trigger a download via a blob URL
      const blob = new Blob([content], {
        type: format === 'json' ? 'application/json' : 'text/csv'
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `orchflow-audit-${Date.now()}.${format}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('[AuditView] export failed:', err)
    } finally {
      setExporting(null)
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden p-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-2)]">
          Audit Log ({entries.length})
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void download('json')}
            disabled={exporting !== null || entries.length === 0}
            className="flex items-center gap-1 rounded border border-[var(--color-border-1)] bg-[var(--color-bg-2)] px-2 py-1 text-xs hover:bg-[var(--color-bg-3)] disabled:opacity-50"
          >
            <Download size={12} />
            {exporting === 'json' ? 'Exporting…' : 'JSON'}
          </button>
          <button
            onClick={() => void download('csv')}
            disabled={exporting !== null || entries.length === 0}
            className="flex items-center gap-1 rounded border border-[var(--color-border-1)] bg-[var(--color-bg-2)] px-2 py-1 text-xs hover:bg-[var(--color-bg-3)] disabled:opacity-50"
          >
            <Download size={12} />
            {exporting === 'csv' ? 'Exporting…' : 'CSV'}
          </button>
        </div>
      </div>
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
