import { describe, it, expect, beforeEach } from 'vitest'
import { useSessionsStore } from './sessions.store'
import type { AgentEvent } from '@shared/types'
import { COMPACT_PREVIEW_LINES } from '@shared/constants'

describe('sessions.store.applyEvent', () => {
  beforeEach(() => {
    // Reset store state between tests
    useSessionsStore.setState({ byId: {}, selectedId: null })
  })

  const baseEvent = (overrides: Partial<AgentEvent>): AgentEvent => ({
    type: 'output',
    timestamp: Date.now(),
    sessionId: 'sess-1',
    taskId: 'task-1',
    content: '',
    ...overrides
  })

  it('creates a log entry on first event for an unknown session', () => {
    const event = baseEvent({ content: 'hello' })
    useSessionsStore.getState().applyEvent(event)
    const log = useSessionsStore.getState().byId['sess-1']
    expect(log).toBeDefined()
    expect(log.lines).toEqual(['hello'])
    expect(log.fullLines).toEqual(['hello'])
    expect(log.agentType).toBe('claude')
    expect(log.status).toBe('idle')
  })

  it('trims output lines to COMPACT_PREVIEW_LINES', () => {
    // Push more lines than the limit
    for (let i = 0; i < COMPACT_PREVIEW_LINES + 10; i++) {
      useSessionsStore
        .getState()
        .applyEvent(baseEvent({ content: `line-${i}` }))
    }
    const log = useSessionsStore.getState().byId['sess-1']
    expect(log.lines.length).toBe(COMPACT_PREVIEW_LINES)
    expect(log.lines[0]).toBe('line-10')
    expect(log.lines[COMPACT_PREVIEW_LINES - 1]).toBe(`line-${COMPACT_PREVIEW_LINES + 9}`)
  })

  it('updates status on status_change events', () => {
    useSessionsStore.getState().applyEvent(baseEvent({}))
    useSessionsStore
      .getState()
      .applyEvent(baseEvent({ type: 'status_change', status: 'running' }))
    const log = useSessionsStore.getState().byId['sess-1']
    expect(log.status).toBe('running')
  })

  it('sets status=done and appends [done] on done event', () => {
    useSessionsStore.getState().applyEvent(baseEvent({}))
    useSessionsStore.getState().applyEvent(baseEvent({ type: 'done' }))
    const log = useSessionsStore.getState().byId['sess-1']
    expect(log.status).toBe('done')
    expect(log.lines[log.lines.length - 1]).toBe('[done]')
  })

  it('appends [error] prefix on error event', () => {
    useSessionsStore.getState().applyEvent(baseEvent({}))
    useSessionsStore
      .getState()
      .applyEvent(baseEvent({ type: 'error', content: 'something broke' }))
    const log = useSessionsStore.getState().byId['sess-1']
    expect(log.lines[log.lines.length - 1]).toBe('[error] something broke')
  })

  it('does not lose existing lines when applying a status_change event', () => {
    useSessionsStore.getState().applyEvent(baseEvent({ content: 'first' }))
    useSessionsStore.getState().applyEvent(baseEvent({ content: 'second' }))
    useSessionsStore
      .getState()
      .applyEvent(baseEvent({ type: 'status_change', status: 'running' }))
    const log = useSessionsStore.getState().byId['sess-1']
    expect(log.lines).toEqual(['first', 'second'])
    expect(log.status).toBe('running')
  })
})

describe('sessions.store.setMode', () => {
  beforeEach(() => {
    useSessionsStore.setState({ byId: {}, selectedId: null })
  })

  it('updates mode on an existing session log', () => {
    useSessionsStore
      .getState()
      .applyEvent({
        type: 'output',
        timestamp: Date.now(),
        sessionId: 'sess-1',
        content: 'x'
      })
    useSessionsStore.getState().setMode('sess-1', 'interactive')
    expect(useSessionsStore.getState().byId['sess-1'].mode).toBe('interactive')
  })

  it('is a no-op for unknown sessions', () => {
    useSessionsStore.getState().setMode('no-such-session', 'interactive')
    expect(useSessionsStore.getState().byId['no-such-session']).toBeUndefined()
  })
})
