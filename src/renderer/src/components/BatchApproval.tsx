import { useEffect, useState } from 'react'
import { Shield, Check, X, CheckSquare, XSquare, AlertTriangle } from 'lucide-react'
import type { ApprovalRequest, RiskLevel } from '@shared/types'

const RISK_ORDER: Record<RiskLevel, number> = { high: 0, medium: 1, low: 2 }
const RISK_COLOR: Record<RiskLevel, string> = {
  high: 'text-[var(--color-danger)] border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10',
  medium: 'text-[var(--color-warn)] border-[var(--color-warn)]/40 bg-[var(--color-warn)]/10',
  low: 'text-[var(--color-text-1)] border-[var(--color-border-1)] bg-[var(--color-bg-2)]'
}

/** PRD §3.4.2: Batch approval view — list all pending approvals sorted by risk,
 *  with bulk approve/reject actions and per-risk-level filtering. */
export function BatchApproval(): React.JSX.Element | null {
  const [pending, setPending] = useState<ApprovalRequest[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)

  const refresh = async (): Promise<void> => {
    const list = (await window.orchflow.approval.getQueue()) as ApprovalRequest[]
    // Sort by risk: high → medium → low
    list.sort((a, b) => RISK_ORDER[a.riskLevel] - RISK_ORDER[b.riskLevel])
    setPending(list)
  }

  useEffect(() => {
    void refresh()
    const off1 = window.orchflow.on('approval:request', () => { void refresh() })
    const off2 = window.orchflow.on('approval:resolved', () => { void refresh() })
    return () => { off1(); off2() }
  }, [])

  if (pending.length === 0) return null

  const toggleSelect = (id: string): void => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAll = (): void => {
    setSelected(new Set(pending.map((r) => r.id)))
  }

  const selectNone = (): void => {
    setSelected(new Set())
  }

  const selectByRisk = (risk: RiskLevel): void => {
    setSelected(new Set(pending.filter((r) => r.riskLevel === risk).map((r) => r.id)))
  }

  const approveSelected = async (): Promise<void> => {
    if (selected.size === 0) return
    setBusy(true)
    try {
      await window.orchflow.approval.batchApprove(Array.from(selected))
      setPending((prev) => prev.filter((r) => !selected.has(r.id)))
      setSelected(new Set())
    } catch (err) {
      console.error('[BatchApproval] batch approve failed:', err)
    } finally {
      setBusy(false)
    }
  }

  const rejectSelected = async (): Promise<void> => {
    if (selected.size === 0) return
    setBusy(true)
    try {
      // Reject individually since batchReject may not be implemented yet
      for (const id of selected) {
        await window.orchflow.approval.reject(id)
      }
      setPending((prev) => prev.filter((r) => !selected.has(r.id)))
      setSelected(new Set())
    } catch (err) {
      console.error('[BatchApproval] batch reject failed:', err)
    } finally {
      setBusy(false)
    }
  }

  const decide = async (id: string, approve: boolean): Promise<void> => {
    if (approve) await window.orchflow.approval.approve(id)
    else await window.orchflow.approval.reject(id)
    setPending((prev) => prev.filter((r) => r.id !== id))
    setSelected((prev) => { const next = new Set(prev); next.delete(id); return next })
  }

  const highCount = pending.filter((r) => r.riskLevel === 'high').length
  const medCount = pending.filter((r) => r.riskLevel === 'medium').length
  const lowCount = pending.filter((r) => r.riskLevel === 'low').length

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header with bulk actions */}
      <div className="border-b border-[var(--color-border-1)] bg-[var(--color-bg-2)] px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield size={16} className="text-[var(--color-warn)]" />
            <span className="text-sm font-semibold">Pending Approvals ({pending.length})</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={selectAll} className="rounded px-2 py-1 text-xs hover:bg-[var(--color-bg-3)]">
              Select All
            </button>
            <button onClick={selectNone} className="rounded px-2 py-1 text-xs hover:bg-[var(--color-bg-3)]">
              Clear
            </button>
          </div>
        </div>

        {/* Quick-select by risk */}
        <div className="mt-2 flex items-center gap-2">
          <span className="text-xs text-[var(--color-text-2)]">Select by risk:</span>
          {highCount > 0 && (
            <button onClick={() => selectByRisk('high')} className="rounded bg-[var(--color-danger)]/20 px-2 py-0.5 text-xs text-[var(--color-danger)] hover:bg-[var(--color-danger)]/30">
              High ({highCount})
            </button>
          )}
          {medCount > 0 && (
            <button onClick={() => selectByRisk('medium')} className="rounded bg-[var(--color-warn)]/20 px-2 py-0.5 text-xs text-[var(--color-warn)] hover:bg-[var(--color-warn)]/30">
              Medium ({medCount})
            </button>
          )}
          {lowCount > 0 && (
            <button onClick={() => selectByRisk('low')} className="rounded bg-[var(--color-bg-3)] px-2 py-0.5 text-xs hover:bg-[var(--color-bg-3)]">
              Low ({lowCount})
            </button>
          )}
        </div>

        {/* Bulk action buttons */}
        {selected.size > 0 && (
          <div className="mt-2 flex items-center gap-2">
            <span className="text-xs text-[var(--color-text-2)]">{selected.size} selected:</span>
            <button
              onClick={approveSelected}
              disabled={busy}
              className="flex items-center gap-1 rounded bg-[var(--color-accent)] px-2 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              <CheckSquare size={12} /> Approve Selected
            </button>
            <button
              onClick={rejectSelected}
              disabled={busy}
              className="flex items-center gap-1 rounded border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 px-2 py-1 text-xs text-[var(--color-danger)] hover:bg-[var(--color-danger)]/20 disabled:opacity-50"
            >
              <XSquare size={12} /> Reject Selected
            </button>
          </div>
        )}
      </div>

      {/* Approval list */}
      <div className="flex-1 overflow-auto">
        <ul className="divide-y divide-[var(--color-border-1)]">
          {pending.map((req) => (
            <li key={req.id} className={`flex items-start gap-3 px-4 py-3 hover:bg-[var(--color-bg-2)] ${RISK_COLOR[req.riskLevel]}`}>
              <input
                type="checkbox"
                checked={selected.has(req.id)}
                onChange={() => toggleSelect(req.id)}
                className="mt-1"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-xs">
                  <AlertTriangle size={12} />
                  <span className="font-semibold uppercase">{req.riskLevel} risk</span>
                  <span className="text-[var(--color-text-2)]">·</span>
                  <span>{req.toolCall.type}</span>
                  <span className="text-[var(--color-text-2)]">·</span>
                  <span className="font-mono text-[var(--color-text-2)]">{req.sessionId.slice(0, 8)}</span>
                </div>
                <p className="mt-1 text-sm">{req.toolCall.description}</p>
                {req.toolCall.detail && (
                  <pre className="mt-1 max-h-20 overflow-auto rounded bg-black/30 p-1.5 text-[10px] text-[var(--color-text-1)]">
                    {req.toolCall.detail}
                  </pre>
                )}
                {req.toolCall.filesAffected && req.toolCall.filesAffected.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {req.toolCall.filesAffected.slice(0, 5).map((f) => (
                      <span key={f} className="rounded bg-[var(--color-bg-3)] px-1.5 py-0.5 font-mono text-[10px]">
                        {f}
                      </span>
                    ))}
                    {req.toolCall.filesAffected.length > 5 && (
                      <span className="text-[10px] text-[var(--color-text-2)]">
                        +{req.toolCall.filesAffected.length - 5} more
                      </span>
                    )}
                  </div>
                )}
              </div>
              <div className="flex shrink-0 gap-1">
                <button
                  onClick={() => void decide(req.id, false)}
                  disabled={busy}
                  className="flex items-center gap-1 rounded border border-[var(--color-border-1)] bg-[var(--color-bg-0)] px-2 py-1 text-xs hover:bg-[var(--color-bg-2)] disabled:opacity-50"
                >
                  <X size={12} /> Reject
                </button>
                <button
                  onClick={() => void decide(req.id, true)}
                  disabled={busy}
                  className="flex items-center gap-1 rounded bg-[var(--color-accent)] px-2 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
                >
                  <Check size={12} /> Approve
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
