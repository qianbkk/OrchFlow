import { useEffect, useState } from 'react'
import { Shield, Check, X } from 'lucide-react'
import type { ApprovalRequest, RiskLevel } from '@shared/types'

const RISK_COLOR: Record<RiskLevel, string> = {
  high: 'text-[var(--color-danger)] border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10',
  medium: 'text-[var(--color-warn)] border-[var(--color-warn)]/40 bg-[var(--color-warn)]/10',
  low: 'text-[var(--color-text-1)] border-[var(--color-border-1)] bg-[var(--color-bg-2)]'
}

export function ApprovalCenter(): React.JSX.Element | null {
  const [pending, setPending] = useState<ApprovalRequest[]>([])

  useEffect(() => {
    const refresh = async (): Promise<void> => {
      const list = (await window.orchflow.approval.getQueue()) as ApprovalRequest[]
      setPending(list)
    }
    void refresh()
    const off = window.orchflow.on('approval:request', () => {
      void refresh()
    })
    const off2 = window.orchflow.on('approval:resolved', () => {
      void refresh()
    })
    return () => {
      off()
      off2()
    }
  }, [])

  if (pending.length === 0) return null

  const decide = async (id: string, approve: boolean): Promise<void> => {
    if (approve) await window.orchflow.approval.approve(id)
    else await window.orchflow.approval.reject(id)
    setPending((prev) => prev.filter((r) => r.id !== id))
  }

  return (
    <div className="pointer-events-none fixed right-4 top-16 z-30 flex w-96 max-w-[calc(100vw-2rem)] flex-col gap-2">
      {pending.map((req) => (
        <div
          key={req.id}
          className={`pointer-events-auto rounded-lg border p-3 shadow-xl ${RISK_COLOR[req.riskLevel]}`}
        >
          <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide">
            <Shield size={12} />
            {req.riskLevel} risk · {req.toolCall.type}
          </div>
          <p className="mb-1 text-sm">{req.toolCall.description}</p>
          {req.toolCall.detail && (
            <pre className="mb-2 max-h-32 overflow-auto rounded bg-black/30 p-2 text-[11px] text-[var(--color-text-1)]">
              {req.toolCall.detail}
            </pre>
          )}
          {req.toolCall.filesAffected && req.toolCall.filesAffected.length > 0 && (
            <ul className="mb-2 text-xs text-[var(--color-text-2)]">
              {req.toolCall.filesAffected.slice(0, 3).map((f) => (
                <li key={f} className="truncate font-mono">
                  {f}
                </li>
              ))}
              {req.toolCall.filesAffected.length > 3 && (
                <li className="text-[10px]">
                  +{req.toolCall.filesAffected.length - 3} more
                </li>
              )}
            </ul>
          )}
          <div className="flex justify-end gap-2">
            <button
              onClick={() => void decide(req.id, false)}
              className="flex items-center gap-1 rounded border border-[var(--color-border-1)] bg-[var(--color-bg-0)] px-2 py-1 text-xs hover:bg-[var(--color-bg-2)]"
            >
              <X size={12} /> Reject
            </button>
            <button
              onClick={() => void decide(req.id, true)}
              className="flex items-center gap-1 rounded bg-[var(--color-accent)] px-2 py-1 text-xs font-medium text-white hover:opacity-90"
            >
              <Check size={12} /> Approve
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
