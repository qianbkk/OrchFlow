import { randomUUID } from 'node:crypto'
import { BrowserWindow } from 'electron'
import { HIGH_RISK_TOOL_PATTERNS } from '@shared/constants'
import type { ApprovalRequest, RiskLevel, ToolCall } from '@shared/types'
import { notifier } from './notifier'

const queue: ApprovalRequest[] = []
const pending = new Map<string, { resolve: (approved: boolean) => void; timer: NodeJS.Timeout | null }>()

function assessRisk(toolCall: ToolCall): RiskLevel {
  // High-risk pattern match wins
  for (const rule of HIGH_RISK_TOOL_PATTERNS) {
    if (rule.pattern.test(toolCall.description) || (toolCall.detail && rule.pattern.test(toolCall.detail))) {
      return rule.risk
    }
  }
  // Default by tool type
  switch (toolCall.type) {
    case 'file_delete':
    case 'git_force_push':
    case 'db_destructive':
      return 'high'
    case 'shell':
    case 'install_deps':
    case 'merge':
      return 'medium'
    case 'file_write':
    case 'file_read':
      return 'low'
    default:
      return 'medium'
  }
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

    // Notify all open renderer windows
    for (const w of BrowserWindow.getAllWindows()) {
      try {
        w.webContents.send('approval:request', request)
      } catch (err) {
        console.error('[approval-gate] send failed:', err)
      }
    }

    notifier.notify({
      type: 'approval_required',
      title: `${riskLevel.toUpperCase()} risk action pending`,
      body: toolCall.description.slice(0, 100),
      sessionId,
      taskId
    })

    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        // Default deny after 5 minutes
        request.status = 'rejected'
        const idx = queue.indexOf(request)
        if (idx >= 0) queue.splice(idx, 1)
        pending.delete(request.id)
        resolve(false)
      }, 5 * 60 * 1000)
      pending.set(request.id, { resolve, timer })
    })
  },

  approve(requestId: string): boolean {
    const req = queue.find((r) => r.id === requestId)
    const entry = pending.get(requestId)
    if (!req || !entry) return false
    req.status = 'approved'
    req.resolvedAt = Date.now()
    if (entry.timer) clearTimeout(entry.timer)
    entry.resolve(true)
    pending.delete(requestId)
    const idx = queue.indexOf(req)
    if (idx >= 0) queue.splice(idx, 1)

    for (const w of BrowserWindow.getAllWindows()) {
      try {
        w.webContents.send('approval:resolved', req)
      } catch (err) {
        console.error('[approval-gate] notify failed:', err)
      }
    }
    return true
  },

  reject(requestId: string): boolean {
    const req = queue.find((r) => r.id === requestId)
    const entry = pending.get(requestId)
    if (!req || !entry) return false
    req.status = 'rejected'
    req.resolvedAt = Date.now()
    if (entry.timer) clearTimeout(entry.timer)
    entry.resolve(false)
    pending.delete(requestId)
    const idx = queue.indexOf(req)
    if (idx >= 0) queue.splice(idx, 1)

    for (const w of BrowserWindow.getAllWindows()) {
      try {
        w.webContents.send('approval:resolved', req)
      } catch (err) {
        console.error('[approval-gate] notify failed:', err)
      }
    }
    return true
  },

  list(): ApprovalRequest[] {
    return [...queue]
  }
}
