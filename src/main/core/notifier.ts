import { BrowserWindow, Notification as ElectronNotification } from 'electron'
import type { Notification, NotificationType } from '@shared/types'
import { NotificationRepository } from '../db/repositories/notification.repository'

const repo = new NotificationRepository()

export const notifier = {
  notify(input: {
    type: NotificationType
    title: string
    body: string
    taskId?: string
    sessionId?: string
  }): void {
    const item: Omit<Notification, 'id'> = {
      timestamp: Date.now(),
      type: input.type,
      title: input.title,
      body: input.body,
      taskId: input.taskId,
      sessionId: input.sessionId,
      read: false
    }
    const id = repo.create(item)

    // Send to all renderers
    for (const w of BrowserWindow.getAllWindows()) {
      try {
        w.webContents.send('notification:new', { ...item, id })
      } catch (err) {
        console.error('[notifier] send failed:', err)
      }
    }

    // Windows native notification
    try {
      if (ElectronNotification.isSupported()) {
        const n = new ElectronNotification({
          title: input.title,
          body: input.body,
          silent: false
        })
        n.on('click', () => {
          try {
            const w = BrowserWindow.getAllWindows()[0]
            if (w) {
              if (w.isMinimized()) w.restore()
              w.focus()
            }
          } catch (err) {
            console.error('[notifier] focus failed:', err)
          }
        })
        n.show()
      }
    } catch (err) {
      console.warn('[notifier] native notification failed:', err)
    }
  }
}
