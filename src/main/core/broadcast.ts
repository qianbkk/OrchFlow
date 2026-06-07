import { BrowserWindow } from 'electron'

/** Send a payload to every open BrowserWindow's renderer. Wraps send() in try/catch
 *  because a destroyed window can throw on send. Used by session-manager, approval-gate, notifier. */
export function broadcast(channel: string, payload: unknown): void {
  for (const w of BrowserWindow.getAllWindows()) {
    try {
      w.webContents.send(channel, payload)
    } catch (err) {
      console.error(`[broadcast:${channel}] send failed:`, err)
    }
  }
}
