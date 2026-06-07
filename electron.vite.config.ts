import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Packages that must remain external (runtime `require()` inside them).
// @lydell/node-pty does `require('@lydell/node-pty-<plat>-<arch>')` at runtime;
// Rollup can't statically analyze that, so we whitelist both the wrapper
// and the platform-specific package.
const RUNTIME_REQUIRED = [
  '@lydell/node-pty',
  '@lydell/node-pty-win32-x64',
  '@lydell/node-pty-win32-arm64',
  '@lydell/node-pty-linux-x64',
  '@lydell/node-pty-linux-arm64',
  '@lydell/node-pty-darwin-x64',
  '@lydell/node-pty-darwin-arm64',
  'keytar',
  'better-sqlite3'
]

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'src/shared')
      }
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts')
        },
        external: RUNTIME_REQUIRED
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'src/shared')
      }
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts')
        }
      }
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'src/shared'),
        '@renderer': resolve(__dirname, 'src/renderer/src')
      }
    },
    plugins: [react(), tailwindcss()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html')
        }
      }
    }
  }
})
