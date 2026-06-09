// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'

// Mock Electron before importing approval-gate (it uses broadcast → BrowserWindow,
// and notifier → database → app.getPath)
vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [] },
  app: {
    getPath: () => '/tmp/orchflow-test',
    isReady: () => true
  }
}))

// Mock the notifier to avoid database dependency in tests
vi.mock('./notifier', () => ({
  notifier: { notify: () => {} }
}))

import type { ToolCall } from '@shared/types'
import { approvalGate } from './approval-gate'

/** Tests for approval-gate risk assessment (U-11).
 *  Tests the assessRisk function indirectly through the request API. */
describe('approval-gate', () => {
  const makeToolCall = (type: ToolCall['type'], desc = 'test'): ToolCall => ({
    type,
    description: desc,
    detail: desc
  })

  describe('request/approve lifecycle', () => {
    it('creates a pending request', async () => {
      const tc = makeToolCall('file_read')
      const promise = approvalGate.request('session-1', 'task-1', tc)
      const queue = approvalGate.list()
      expect(queue.length).toBeGreaterThanOrEqual(1)
      expect(queue[queue.length - 1].status).toBe('pending')
      // Clean up
      approvalGate.approve(queue[queue.length - 1].id)
      const result = await promise
      expect(result).toBe(true)
    })

    it('approve resolves to true', async () => {
      const tc = makeToolCall('shell')
      const promise = approvalGate.request('session-2', 'task-2', tc)
      const queue = approvalGate.list()
      const req = queue[queue.length - 1]
      approvalGate.approve(req.id)
      expect(await promise).toBe(true)
    })

    it('reject resolves to false', async () => {
      const tc = makeToolCall('file_delete')
      const promise = approvalGate.request('session-3', 'task-3', tc)
      const queue = approvalGate.list()
      const req = queue[queue.length - 1]
      approvalGate.reject(req.id)
      expect(await promise).toBe(false)
    })
  })

  describe('risk assessment', () => {
    it('file_delete is high risk', async () => {
      const tc = makeToolCall('file_delete', 'rm -rf /tmp/test')
      const promise = approvalGate.request('s', 't', tc)
      const queue = approvalGate.list()
      const req = queue[queue.length - 1]
      expect(req.riskLevel).toBe('high')
      approvalGate.approve(req.id)
      await promise
    })

    it('git_force_push is high risk', async () => {
      const tc = makeToolCall('git_force_push', 'git push --force')
      const promise = approvalGate.request('s', 't', tc)
      const queue = approvalGate.list()
      const req = queue[queue.length - 1]
      expect(req.riskLevel).toBe('high')
      approvalGate.approve(req.id)
      await promise
    })

    it('file_read is low risk', async () => {
      const tc = makeToolCall('file_read', 'cat /etc/hosts')
      const promise = approvalGate.request('s', 't', tc)
      const queue = approvalGate.list()
      const req = queue[queue.length - 1]
      expect(req.riskLevel).toBe('low')
      approvalGate.approve(req.id)
      await promise
    })

    it('shell is medium risk', async () => {
      const tc = makeToolCall('shell', 'ls -la')
      const promise = approvalGate.request('s', 't', tc)
      const queue = approvalGate.list()
      const req = queue[queue.length - 1]
      expect(req.riskLevel).toBe('medium')
      approvalGate.approve(req.id)
      await promise
    })
  })

  describe('edge cases', () => {
    it('approving non-existent request returns false', () => {
      expect(approvalGate.approve('nonexistent-id')).toBe(false)
    })

    it('rejecting non-existent request returns false', () => {
      expect(approvalGate.reject('nonexistent-id')).toBe(false)
    })

    it('double approve is idempotent (second returns false)', async () => {
      const tc = makeToolCall('file_write')
      const promise = approvalGate.request('s', 't', tc)
      const queue = approvalGate.list()
      const req = queue[queue.length - 1]
      expect(approvalGate.approve(req.id)).toBe(true)
      expect(approvalGate.approve(req.id)).toBe(false)
      await promise
    })
  })
})
