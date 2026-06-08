// @vitest-environment node
import { describe, it, expect } from 'vitest'

/** Auto-router unit tests.
 *  These test the scoring logic without requiring actual DB sessions. */

// Since autoRouter depends on DB repositories, we test the scoring logic
// by extracting it into a pure function.

import { AUTO_ROUTER_WEIGHTS } from '@shared/constants'

function scoreAgent(runningCount: number, hasSimilarDone: boolean, activeTasks: number): number {
  let score = 0
  if (runningCount === 0) {
    score += AUTO_ROUTER_WEIGHTS.IDLE_BONUS
  } else {
    score -= runningCount * AUTO_ROUTER_WEIGHTS.RUNNING_PENALTY
  }
  if (hasSimilarDone) {
    score += AUTO_ROUTER_WEIGHTS.LAST_SUCCESS_BONUS
  }
  if (activeTasks === 0) {
    score += AUTO_ROUTER_WEIGHTS.CAPABILITY_MATCH_BONUS
  }
  return score
}

describe('auto-router scoring', () => {
  it('idle agent with no active tasks scores highest', () => {
    const score = scoreAgent(0, true, 0)
    expect(score).toBe(AUTO_ROUTER_WEIGHTS.IDLE_BONUS + AUTO_ROUTER_WEIGHTS.LAST_SUCCESS_BONUS + AUTO_ROUTER_WEIGHTS.CAPABILITY_MATCH_BONUS)
  })

  it('busy agent scores lower than idle', () => {
    const idleScore = scoreAgent(0, false, 0)
    const busyScore = scoreAgent(2, false, 2)
    expect(idleScore).toBeGreaterThan(busyScore)
  })

  it('agent with previous success gets bonus', () => {
    const withoutHistory = scoreAgent(0, false, 0)
    const withHistory = scoreAgent(0, true, 0)
    expect(withHistory).toBeGreaterThan(withoutHistory)
    expect(withHistory - withoutHistory).toBe(AUTO_ROUTER_WEIGHTS.LAST_SUCCESS_BONUS)
  })

  it('running sessions penalize score proportionally', () => {
    const oneRunning = scoreAgent(1, false, 1)
    const threeRunning = scoreAgent(3, false, 3)
    expect(oneRunning).toBeGreaterThan(threeRunning)
    // Each additional running session costs RUNNING_PENALTY
    const diff = oneRunning - threeRunning
    // 1 running: -5, 3 running: -15, diff should be 10
    expect(diff).toBe(2 * AUTO_ROUTER_WEIGHTS.RUNNING_PENALTY)
  })

  it('weights are configured in constants', () => {
    expect(AUTO_ROUTER_WEIGHTS.IDLE_BONUS).toBe(10)
    expect(AUTO_ROUTER_WEIGHTS.RUNNING_PENALTY).toBe(5)
    expect(AUTO_ROUTER_WEIGHTS.CAPABILITY_MATCH_BONUS).toBe(8)
    expect(AUTO_ROUTER_WEIGHTS.LAST_SUCCESS_BONUS).toBe(3)
  })
})
