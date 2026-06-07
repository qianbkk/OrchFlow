import { app, BrowserWindow, shell } from 'electron'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getDb, closeDb } from './db/database'
import { registerIpcHandlers } from './ipc'
import { setupAppMenu } from './menu'

// Block CommonJS __dirname typing issue under ESM-less environment
const __dirnameSafe = (() => {
  try {
    return fileURLToPath(import.meta.url)
  } catch {
    return __dirname
  }
})()

function createWindow(): void {
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
      preload: join(__dirnameSafe.replace(/\\/g, '/'), '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  // Open external URLs in user's default browser, never in-app
  mainWindow.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void mainWindow.loadFile(join(__dirnameSafe.replace(/\\/g, '/'), '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.orchflow.app')

  // Initialize DB (runs migrations on first launch)
  getDb()

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
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('will-quit', () => {
  closeDb()
})
