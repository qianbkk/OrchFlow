import { app, BrowserWindow, shell, session } from 'electron'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getDb, closeDb } from './db/database'
import { registerIpcHandlers, registerApprovedPath } from './ipc'
import { setupAppMenu } from './menu'
import { ProjectRepository } from './db/repositories/project.repository'
import { toWorktreeBasePath } from './git/worktree'

// Block CommonJS __dirname typing issue under ESM-less environment
const __dirnameSafe = (() => {
  try {
    return fileURLToPath(import.meta.url)
  } catch {
    return __dirname
  }
})()

/** Production CSP — strict policy for packaged builds.
 *  Dev mode needs permissive CSP (Vite HMR injects inline scripts). */
const PROD_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  "connect-src 'self'"
].join('; ')

function installCSP(): void {
  if (is.dev) return
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [PROD_CSP]
      }
    })
  })
}

function createWindow(): void {
  // __dirnameSafe points to out/main; preload is at out/preload (two levels up)
  const preloadPath = join(__dirnameSafe.replace(/\\/g, '/'), '../../preload/index.js')
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0b1020',
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: preloadPath,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // Log renderer load errors (useful for debugging packaged builds)
  mainWindow.webContents.on('did-fail-load', (_e, code, desc) => {
    console.error(`[main] Renderer load failed: code=${code}, desc=${desc}`)
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  // Open external URLs in user's default browser, never in-app
  // SECURITY: only allow safe protocols (SEC-007)
  const ALLOWED_PROTOCOLS = new Set(['https:', 'http:'])
  mainWindow.webContents.setWindowOpenHandler((details) => {
    try {
      const url = new URL(details.url)
      if (ALLOWED_PROTOCOLS.has(url.protocol)) {
        void shell.openExternal(details.url)
      } else {
        console.warn(`[main] Blocked external URL with disallowed protocol: ${url.protocol}`)
      }
    } catch {
      // Invalid URL — block it
    }
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    const htmlPath = join(__dirnameSafe.replace(/\\/g, '/'), '../renderer/index.html')
    void mainWindow.loadFile(htmlPath)
  }
}

app.whenReady().then(() => {
  try {
    electronApp.setAppUserModelId('com.orchflow.app')

    // Install CSP for production (dev mode uses permissive CSP for Vite HMR)
    installCSP()

    // Initialize DB (runs migrations on first launch)
    getDb()

    // Re-register all known project paths so validateUserPath works immediately
    // after startup, even before the user opens a project via the dialog.
    const projectRepo = new ProjectRepository()
    for (const p of projectRepo.list()) {
      registerApprovedPath(p.rootPath)
      registerApprovedPath(toWorktreeBasePath(p.rootPath))
    }

    // Register all IPC handlers
    registerIpcHandlers()

    // Menu accelerators (hidden menubar, shortcuts still fire when focused)
    setupAppMenu()

    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
      }
    })
  } catch (err) {
    // ERR-init: Show error dialog instead of blank window on startup failure
    const { dialog: errDialog } = require('electron') as typeof import('electron')
    errDialog.showErrorBox(
      'OrchFlow Startup Failed',
      `The application failed to start:\n\n${err instanceof Error ? err.message : String(err)}\n\nPlease report this issue.`
    )
    app.quit()
  }
}).catch((err) => {
  console.error('[main] app.whenReady() failed:', err)
  app.quit()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('will-quit', () => {
  closeDb()
})
