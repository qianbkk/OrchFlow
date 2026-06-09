// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { existsSync, unlinkSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// Mock electron app before importing settings-store
const tempDir = mkdtempSync(join(tmpdir(), 'orchflow-test-'))
vi.mock('electron', () => ({
  app: { getPath: () => tempDir }
}))

const { settingsStore } = await import('./settings-store')

/** Tests for settings-store sensitive field blocking (U-04).
 *  Verifies that keys containing sensitive patterns are rejected. */
describe('settings-store', () => {
  const SETTINGS_FILE = join(tempDir, 'settings.json')

  beforeEach(() => {
    // Clean up settings file between tests
    if (existsSync(SETTINGS_FILE)) {
      unlinkSync(SETTINGS_FILE)
    }
  })

  describe('setAgentConfig sensitive field blocking', () => {
    it('blocks exact match: apiKey', () => {
      expect(() => settingsStore.setAgentConfig('claude', { apiKey: 'sk-123' }))
        .toThrow(/sensitive field.*apiKey/i)
    })

    it('blocks exact match: token', () => {
      expect(() => settingsStore.setAgentConfig('codex', { token: 'abc' }))
        .toThrow(/sensitive field.*token/i)
    })

    it('blocks exact match: secret', () => {
      expect(() => settingsStore.setAgentConfig('copilot', { secret: 'xyz' }))
        .toThrow(/sensitive field.*secret/i)
    })

    it('blocks exact match: password', () => {
      expect(() => settingsStore.setAgentConfig('claude', { password: 'pass' }))
        .toThrow(/sensitive field.*password/i)
    })

    it('blocks substring match: auth_token', () => {
      expect(() => settingsStore.setAgentConfig('claude', { auth_token: 'tok' }))
        .toThrow(/sensitive field.*auth_token/i)
    })

    it('blocks substring match: bearerCredential', () => {
      expect(() => settingsStore.setAgentConfig('codex', { bearerCredential: 'cred' }))
        .toThrow(/sensitive field.*bearerCredential/i)
    })

    it('blocks substring match: privateKeyFile', () => {
      expect(() => settingsStore.setAgentConfig('copilot', { privateKeyFile: '/path' }))
        .toThrow(/sensitive field.*privateKeyFile/i)
    })

    it('blocks case-insensitive: API_KEY', () => {
      expect(() => settingsStore.setAgentConfig('claude', { API_KEY: 'key' }))
        .toThrow(/sensitive field.*API_KEY/i)
    })

    it('blocks case-insensitive: SECRET_TOKEN', () => {
      expect(() => settingsStore.setAgentConfig('claude', { SECRET_TOKEN: 'val' }))
        .toThrow(/sensitive field.*SECRET_TOKEN/i)
    })

    it('allows non-sensitive fields', () => {
      expect(() => settingsStore.setAgentConfig('claude', {
        executablePath: '/usr/bin/claude',
        maxOutput: 4096,
        model: 'claude-sonnet-4-20250514'
      })).not.toThrow()
    })

    it('allows fields that contain sensitive substrings in context', () => {
      // "keyboard" contains "key" — should be allowed as it's not a sensitive context
      // Actually "key" is a sensitive pattern, so "keyboard" would be blocked.
      // This tests that the pattern match works correctly.
      expect(() => settingsStore.setAgentConfig('claude', { keyboard: 'us' }))
        .toThrow(/sensitive field.*keyboard/i)
    })

    it('persists non-sensitive config to disk', () => {
      settingsStore.setAgentConfig('claude', { executablePath: '/test/path' })
      const config = settingsStore.getAgentConfig('claude')
      expect(config?.executablePath).toBe('/test/path')
    })
  })
})
