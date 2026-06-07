import { Menu, BrowserWindow } from 'electron'

/** Set up the Electron application menu.
 *
 *  Menu is hidden (`autoHideMenuBar: true` on the BrowserWindow) but the
 *  accelerators still fire when the window is focused. This gives us
 *  PRD §3.4.3's "Ctrl+Shift+S manual checkpoint" without exposing a
 *  visible menubar in the UI. */
export function setupAppMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Create Checkpoint',
          accelerator: 'CommandOrControl+Shift+S',
          click: (_item, win) => {
            // Renderer owns the "currently selected session" state; tell it
            // to create a manual checkpoint.
            const target = (win as BrowserWindow | undefined) ?? BrowserWindow.getAllWindows()[0]
            target?.webContents.send('shortcut:createCheckpoint')
          }
        },
        { type: 'separator' },
        { role: 'quit', label: 'Exit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' }
      ]
    }
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}
