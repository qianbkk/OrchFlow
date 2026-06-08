import { useEffect, useState, useCallback } from 'react'
import { Download, Filter, Search } from 'lucide-react'
import type { AuditEntry, AuditFilters, RiskLevel } from '@shared/types'

export function AuditView(): React.JSX.Element {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [allEntries, setAllEntries] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState<'json' | 'csv' | null>(null)
  const [showFilters, setShowFilters] = useState(false)

  // Filter state
  const [search, setSearch] = useState('')
  const [actorFilter, setActorFilter] = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [riskFilter, setRiskFilter] = useState<RiskLevel | ''>('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const loadAll = useCallback(async () => {
    try {
      const result = await window.orchflow.audit.query({})
      setAllEntries(result)
    } catch (err) {
      console.error('[AuditView] query failed:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void loadAll() }, [loadAll])

  // Apply client-side filters
  useEffect(() => {
    let filtered = allEntries

    if (search) {
      const lower = search.toLowerCase()
      filtered = filtered.filter((e) =>
        e.actor.toLowerCase().includes(lower) ||
        e.actionType.toLowerCase().includes(lower) ||
        (e.actionDetailJson ?? '').toLowerCase().includes(lower)
      )
    }
    if (actorFilter) {
      filtered = filtered.filter((e) => e.actor === actorFilter)
    }
    if (actionFilter) {
      filtered = filtered.filter((e) => e.actionType === actionFilter)
    }
    if (riskFilter) {
      filtered = filtered.filter((e) => e.riskLevel === riskFilter)
    }
    if (dateFrom) {
      const from = new Date(dateFrom).getTime()
      filtered = filtered.filter((e) => e.timestamp >= from)
    }
    if (dateTo) {
      const to = new Date(dateTo).getTime() + 86400000 // end of day
      filtered = filtered.filter((e) => e.timestamp <= to)
    }

    setEntries(filtered)
  }, [allEntries, search, actorFilter, actionFilter, riskFilter, dateFrom, dateTo])

  // Unique values for filter dropdowns
  const actors = [...new Set(allEntries.map((e) => e.actor))].sort()
  const actionTypes = [...new Set(allEntries.map((e) => e.actionType))].sort()

  const buildFilters = (): AuditFilters => {
    const f: AuditFilters = {}
    if (actorFilter) f.actor = actorFilter
    if (actionFilter) f.actionType = actionFilter
    if (riskFilter) f.riskLevel = riskFilter
    if (dateFrom) f.from = new Date(dateFrom).getTime()
    if (dateTo) f.to = new Date(dateTo).getTime() + 86400000
    return f
  }

  const download = async (format: 'json' | 'csv'): Promise<void> => {
    setExporting(format)
    try {
      const content = await window.orchflow.audit.export(buildFilters(), format)
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

  const clearFilters = (): void => {
    setSearch(''); setActorFilter(''); setActionFilter('')
    setRiskFilter(''); setDateFrom(''); setDateTo('')
  }

  const hasFilters = search || actorFilter || actionFilter || riskFilter || dateFrom || dateTo

  return (
    <div className="flex h-full flex-col overflow-hidden p-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-2)]">
          Audit Log ({entries.length}{entries.length !== allEntries.length ? ` / ${allEntries.length}` : ''})
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFilters((v) => !v)}
            className={`flex items-center gap-1 rounded border px-2 py-1 text-xs hover:bg-[var(--color-bg-3)] ${
              showFilters || hasFilters ? 'border-[var(--color-accent)] text-[var(--color-accent)]' : 'border-[var(--color-border-1)]'
            }`}
          >
            <Filter size={12} /> Filters
          </button>
          <button
            onClick={() => void download('json')}
            disabled={exporting !== null || entries.length === 0}
            className="flex items-center gap-1 rounded border border-[var(--color-border-1)] bg-[var(--color-bg-2)] px-2 py-1 text-xs hover:bg-[var(--color-bg-3)] disabled:opacity-50"
          >
            <Download size={12} /> {exporting === 'json' ? '…' : 'JSON'}
          </button>
          <button
            onClick={() => void download('csv')}
            disabled={exporting !== null || entries.length === 0}
            className="flex items-center gap-1 rounded border border-[var(--color-border-1)] bg-[var(--color-bg-2)] px-2 py-1 text-xs hover:bg-[var(--color-bg-3)] disabled:opacity-50"
          >
            <Download size={12} /> {exporting === 'csv' ? '…' : 'CSV'}
          </button>
        </div>
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="mb-3 rounded-lg border border-[var(--color-border-1)] bg-[var(--color-bg-2)] p-3">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-[10px] uppercase text-[var(--color-text-2)]">Search</label>
              <div className="relative">
                <Search size={12} className="absolute left-2 top-1.5 text-[var(--color-text-2)]" />
                <input
                  value={search} onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search entries…"
                  className="w-full rounded border border-[var(--color-border-1)] bg-[var(--color-bg-0)] py-1 pl-7 pr-2 text-xs focus:border-[var(--color-accent)] focus:outline-none"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-[10px] uppercase text-[var(--color-text-2)]">Actor</label>
              <select value={actorFilter} onChange={(e) => setActorFilter(e.target.value)}
                className="w-full rounded border border-[var(--color-border-1)] bg-[var(--color-bg-0)] px-2 py-1 text-xs">
                <option value="">All actors</option>
                {actors.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[10px] uppercase text-[var(--color-text-2)]">Action Type</label>
              <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}
                className="w-full rounded border border-[var(--color-border-1)] bg-[var(--color-bg-0)] px-2 py-1 text-xs">
                <option value="">All actions</option>
                {actionTypes.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[10px] uppercase text-[var(--color-text-2)]">Risk Level</label>
              <select value={riskFilter} onChange={(e) => setRiskFilter(e.target.value as RiskLevel | '')}
                className="w-full rounded border border-[var(--color-border-1)] bg-[var(--color-bg-0)] px-2 py-1 text-xs">
                <option value="">All risks</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[10px] uppercase text-[var(--color-text-2)]">From</label>
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                className="w-full rounded border border-[var(--color-border-1)] bg-[var(--color-bg-0)] px-2 py-1 text-xs" />
            </div>
            <div>
              <label className="mb-1 block text-[10px] uppercase text-[var(--color-text-2)]">To</label>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
                className="w-full rounded border border-[var(--color-border-1)] bg-[var(--color-bg-0)] px-2 py-1 text-xs" />
            </div>
          </div>
          {hasFilters && (
            <button onClick={clearFilters} className="mt-2 text-xs text-[var(--color-accent)] hover:underline">
              Clear all filters
            </button>
          )}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-[var(--color-text-2)]">Loading…</p>
      ) : entries.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--color-border-1)] p-8 text-center text-sm text-[var(--color-text-2)]">
          {hasFilters ? 'No entries match the current filters.' : 'No audit entries yet. Operations will be logged here as you work.'}
        </div>
      ) : (
        <ul className="flex-1 space-y-1 overflow-auto">
          {entries.map((e) => (
            <li key={e.id} className="rounded border border-[var(--color-border-1)] bg-[var(--color-bg-2)] p-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[var(--color-text-2)]">
                  {new Date(e.timestamp).toLocaleString()}
                </span>
                <span className="font-medium">{e.actor}</span>
                <span className="text-[var(--color-text-1)]">{e.actionType}</span>
                {e.riskLevel && (
                  <span className={`rounded px-1.5 py-0.5 ${
                    e.riskLevel === 'high' ? 'bg-[var(--color-danger)]/20 text-[var(--color-danger)]'
                      : e.riskLevel === 'medium' ? 'bg-[var(--color-warn)]/20 text-[var(--color-warn)]'
                        : 'bg-[var(--color-text-2)]/20 text-[var(--color-text-1)]'
                  }`}>{e.riskLevel}</span>
                )}
                {e.taskId && (
                  <span className="font-mono text-[10px] text-[var(--color-text-2)]">
                    task:{e.taskId.slice(0, 6)}
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
