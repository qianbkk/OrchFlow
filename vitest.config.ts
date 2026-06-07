import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * Vitest config for OrchFlow. Two test environments:
 *
 *   - 'node': for main process code (runs with Node runtime)
 *   - 'jsdom': for renderer code (React components, Zustand stores)
 *
 * Path aliases mirror the electron.vite.config.ts aliases so imports like
 * `@shared/types` resolve the same way in tests as in production.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@renderer': resolve(__dirname, 'src/renderer/src')
    }
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: ['node_modules', 'out', 'release-app'],
    // Main-process tests need a different environment (node); override per-file
    // via `// @vitest-environment node` pragma at the top of the file.
    setupFiles: [],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: ['**/*.test.ts', '**/*.test.tsx', 'src/main/index.ts']
    }
  }
})
