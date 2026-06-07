import { randomUUID } from 'node:crypto'
import { HIGH_RISK_TOOL_PATTERNS } from '@shared/constants'
import type { ApprovalRequest, RiskLevel, ToolCall } from '@shared/types'
import { broadcast } from './broadcast'
import { notifier } from './notifier'

const queue: ApprovalRequest[] = []
const pending = new Map<string, { resolve: (approved: boolean) => void; timer: NodeJS.Timeout | null }>()

const TYPE_RISK: Record<ToolCall['type'], RiskLevel> = {
  file_delete: 'high',
  file_read: 'low',
  file_write: 'low',
  shell: 'medium',
  install_deps: 'medium',
  git_push: 'medium',
  git_force_push: 'high',
  db_destructive: 'high',
  merge: 'medium',
  other: 'medium'
}

function assessRisk(toolCall: ToolCall): RiskLevel {
  const haystack = [toolCall.description, toolCall.detail].filter(Boolean).join('\n')
  for (const rule of HIGH_RISK_TOOL_PATTERNS) {
    if (rule.pattern.test(haystack)) return rule.risk
  }
  return TYPE_RISK[toolCall.type]
}

function resolve(requestId: string, decision: 'approved' | 'rejected'): boolean {
  const req = queue.find((r) => r.id === requestId)
  const entry = pending.get(requestId)
  if (!req || !entry) return false
  req.status = decision
  req.resolvedAt = Date.now()
  if (entry.timer) clearTimeout(entry.timer)
  entry.resolve(decision === 'approved')
  pending.delete(requestId)
  const idx = queue.indexOf(req)
  if (idx >= 0) queue.splice(idx, 1)
  broadcast('approval:resolved', req)
  return true
}

export const approvalGate = {
  async request(sessionId: string, taskId: string, toolCall: ToolCall): Promise<boolean> {
    const riskLevel = assessRisk(toolCall)
    const request: ApprovalRequest = {
      id: randomUUID(),
      sessionId,
      taskId,
      toolCall,
      riskLevel,
      timestamp: Date.now(),
      status: 'pending'
    }
    queue.push(request)

    // Use a placeholder pending entry so `approve` / `reject` are always
    // callable, even if called synchronously by the renderer before the
    // Promise callback has a chance to register the real one.
    let resolveFn!: (approved: boolean) => void
    const promise = new Promise<boolean>((r) => {
      resolveFn = r
    })
    const timer = setTimeout(() => {
      request.status = 'rejected'
      request.resolvedAt = Date.now()
      request.resolvedBy = 'timeout'
      const idx = queue.indexOf(request)
      if (idx >= 0) queue.splice(idx, 1)
      pending.delete(request.id)
      broadcast('approval:resolved', request)
      resolveFn(false)
    }, 5 * 60 * 1000)
    pending.set(request.id, { resolve: resolveFn, timer })

    broadcast('approval:request', request)
    notifier.notify({
      type: 'approval_required',
      title: `${riskLevel.toUpperCase()} risk action pending`,
      body: toolCall.type,
      sessionId,
      taskId
    })

    return promise
  },

  approve: (requestId: string): boolean => resolve(requestId, 'approved'),
  reject: (requestId: string): boolean => resolve(requestId, 'rejected'),

  list(): ApprovalRequest[] {
    return [...queue]
  }
}
