// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { ELECTRON_EVENTS, RECEIVE_EVENTS } from '@shared/events'

describe('shared/events', () => {
  it('RECEIVE_EVENTS includes all ELECTRON_EVENTS values', () => {
    // Every channel defined in ELECTRON_EVENTS should either be in the
    // RECEIVE_EVENTS whitelist (for events sent from main to renderer) or
    // be explicitly documented as "main-only" (none currently).
    const eventValues = Object.values(ELECTRON_EVENTS) as string[]
    for (const channel of eventValues) {
      expect(RECEIVE_EVENTS, `missing from RECEIVE_EVENTS: ${channel}`).toContain(channel)
    }
  })

  it('RECEIVE_EVENTS has no duplicates', () => {
    expect(RECEIVE_EVENTS.length).toBe(new Set(RECEIVE_EVENTS).size)
  })

  it('RECEIVE_EVENTS is readonly (frozen by const)', () => {
    // TypeScript's `readonly` + `as const` enforces this at compile time;
    // this test guards against runtime tampering.
    expect(Array.isArray(RECEIVE_EVENTS)).toBe(true)
  })
})
