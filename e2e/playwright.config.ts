import { defineConfig } from '@playwright/test'

/**
 * Playwright E2E config for OrchFlow.
 *
 * Tests launch the built Electron app (out/main/index.js) and interact
 * with the renderer window via standard Playwright APIs.
 *
 * Usage:
 *   npx playwright test --config=e2e/playwright.config.ts
 *
 * Prerequisites:
 *   npm run build  (must build first — tests use production output)
 */
export default defineConfig({
  testDir: '.',
  timeout: 30_000,
  retries: 0,
  reporter: [['list']],
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
})
