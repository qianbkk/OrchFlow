// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { HIGH_RISK_TOOL_PATTERNS, AGENT_DEFAULTS, APP_NAME } from '@shared/constants'

describe('shared/constants', () => {
  it('APP_NAME is OrchFlow', () => {
    expect(APP_NAME).toBe('OrchFlow')
  })

  it('all required agent types have defaults', () => {
    expect(AGENT_DEFAULTS.claude).toBeDefined()
    expect(AGENT_DEFAULTS.codex).toBeDefined()
    expect(AGENT_DEFAULTS.copilot).toBeDefined()
    // Each default must have a displayName, cliBinary, detect, package
    for (const [type, def] of Object.entries(AGENT_DEFAULTS)) {
      expect(def.displayName, `${type}.displayName`).toBeTruthy()
      expect(def.cliBinary, `${type}.cliBinary`).toBeTruthy()
      expect(def.detect, `${type}.detect`).toBeInstanceOf(Array)
      expect(def.detect.length, `${type}.detect not empty`).toBeGreaterThan(0)
      expect(def.package, `${type}.package`).toBeTruthy()
    }
  })

  it('HIGH_RISK_TOOL_PATTERNS match the documented dangerous commands', () => {
    const matches = (input: string, expectedType?: string): boolean =>
      HIGH_RISK_TOOL_PATTERNS.some(
        (r) => r.pattern.test(input) && (!expectedType || r.type === expectedType)
      )

    // Should match
    expect(matches('rm -rf /tmp/foo', 'file_delete')).toBe(true)
    expect(matches('rmdir C:\\folder', 'file_delete')).toBe(true)
    expect(matches('git push origin main --force', 'force_push')).toBe(true)
    expect(matches('DROP TABLE users', 'db_destructive')).toBe(true)
    expect(matches('truncate table orders', 'db_destructive')).toBe(true)
    expect(matches('npm install lodash', 'install_deps')).toBe(true)
    expect(matches('pnpm add react', 'install_deps')).toBe(true)
    expect(matches('yarn add foo', 'install_deps')).toBe(true)

    // Should NOT match
    expect(matches('cat /etc/passwd')).toBe(false)
    expect(matches('git commit -m "fix"')).toBe(false)
    expect(matches('ls -la')).toBe(false)
    expect(matches('git push origin main')).toBe(false)
  })

  it('no HIGH_RISK_TOOL_PATTERNS regex has the /g flag', () => {
    // A /g regex would cause .test() to advance lastIndex across calls,
    // breaking assessRisk() in approval-gate.ts which reuses these patterns.
    for (const rule of HIGH_RISK_TOOL_PATTERNS) {
      expect(rule.pattern.global, `${rule.pattern} should not be global`).toBe(false)
    }
  })
})
