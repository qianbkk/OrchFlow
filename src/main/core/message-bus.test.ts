// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { DEFAULT_MESSAGE_CONFIG, KANBAN_COLUMNS, PIPELINE_LAYOUT, AUTO_ROUTER_WEIGHTS, FILE_IMPORT_FILTERS } from '@shared/constants'

describe('Phase 1/2 constants', () => {
  it('KANBAN_COLUMNS has 4 columns', () => {
    expect(KANBAN_COLUMNS).toHaveLength(4)
    expect(KANBAN_COLUMNS.map((c) => c.key)).toEqual(['queued', 'running', 'review', 'done'])
  })

  it('KANBAN_COLUMNS cover all task statuses', () => {
    const allStatuses = KANBAN_COLUMNS.flatMap((c) => [...c.statuses])
    expect(allStatuses).toContain('created')
    expect(allStatuses).toContain('running')
    expect(allStatuses).toContain('done')
    expect(allStatuses).toContain('failed')
    expect(allStatuses).toContain('pending_review')
  })

  it('PIPELINE_LAYOUT has sensible dimensions', () => {
    expect(PIPELINE_LAYOUT.NODE_WIDTH).toBeGreaterThan(0)
    expect(PIPELINE_LAYOUT.NODE_HEIGHT).toBeGreaterThan(0)
    expect(PIPELINE_LAYOUT.NODE_GAP_X).toBeGreaterThan(0)
    expect(PIPELINE_LAYOUT.NODE_GAP_Y).toBeGreaterThan(0)
  })

  it('DEFAULT_MESSAGE_CONFIG has valid defaults', () => {
    expect(DEFAULT_MESSAGE_CONFIG.trigger).toBe('on_task_done')
    expect(DEFAULT_MESSAGE_CONFIG.contentTypes).toContain('text')
    expect(DEFAULT_MESSAGE_CONFIG.contentTypes).toContain('diff')
    expect(DEFAULT_MESSAGE_CONFIG.receiveAction).toBe('auto_continue')
  })

  it('AUTO_ROUTER_WEIGHTS are positive', () => {
    expect(AUTO_ROUTER_WEIGHTS.IDLE_BONUS).toBeGreaterThan(0)
    expect(AUTO_ROUTER_WEIGHTS.RUNNING_PENALTY).toBeGreaterThan(0)
    expect(AUTO_ROUTER_WEIGHTS.CAPABILITY_MATCH_BONUS).toBeGreaterThan(0)
    expect(AUTO_ROUTER_WEIGHTS.LAST_SUCCESS_BONUS).toBeGreaterThan(0)
  })

  it('FILE_IMPORT_FILTERS supports md/json/txt', () => {
    const allExts = FILE_IMPORT_FILTERS.flatMap((f) => f.extensions)
    expect(allExts).toContain('md')
    expect(allExts).toContain('json')
    expect(allExts).toContain('txt')
  })
})
