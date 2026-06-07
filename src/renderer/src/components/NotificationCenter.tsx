import { useEffect, useRef, useState } from 'react'
import { Bell, X, XCircle, CheckCircle2, AlertTriangle, Info } from 'lucide-react'
import type { Notification, NotificationType } from '@shared/types'

const TYPE_ICON: Record<NotificationType, React.ComponentType<{ size?: number; className?: string }>> = {
  task_done: CheckCircle2,
  task_failed: XCircle,
  approval_required: AlertTriangle,
  agent_crashed: XCircle,
  rate_limit: AlertTriangle,
  checkpoint_created: Info,
  info: Info
}

const TYPE_COLOR: Record<NotificationType, string> = {
  task_done: 'text-[var(--color-accent-2)]',
  task_failed: 'text-[var(--color-danger)]',
  approval_required: 'text-[var(--color-warn)]',
  agent_crashed: 'text-[var(--color-danger)]',
  rate_limit: 'text-[var(--color-warn)]',
  checkpoint_created: 'text-[var(--color-accent)]',
  info: 'text-[var(--color-text-1)]'
}

export function NotificationCenter(): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<Notification[]>([])
  const panelRef = useRef<HTMLDivElement | null>(null)

  const refresh = async (): Promise<void> => {
    const list = (await window.orchflow.notifications.list()) as Notification[]
    setItems(list)
  }

  useEffect(() => {
    void refresh()
    const off = window.orchflow.on('notification:new', () => {
      void refresh()
    })
    return () => {
      off()
    }
  }, [])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent): void => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const unread = items.filter((n) => !n.read).length
  const markRead = async (id: number): Promise<void> => {
    await window.orchflow.notifications.markRead(id)
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)))
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative rounded p-1.5 text-[var(--color-text-1)] hover:bg-[var(--color-bg-3)] hover:text-[var(--color-text-0)]"
        title="Notifications"
        aria-label="Notifications"
      >
        <Bell size={16} />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--color-danger)] px-1 text-[10px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-9 z-40 w-80 max-h-96 overflow-auto rounded-lg border border-[var(--color-border-1)] bg-[var(--color-bg-1)] shadow-2xl">
          <div className="flex items-center justify-between border-b border-[var(--color-border-1)] px-3 py-2">
            <span className="text-sm font-semibold">Notifications</span>
            <button
              onClick={() => setOpen(false)}
              className="rounded p-0.5 text-[var(--color-text-1)] hover:bg-[var(--color-bg-3)]"
              aria-label="Close"
            >
              <X size={14} />
            </button>
          </div>
          {items.length === 0 ? (
            <p className="p-4 text-center text-sm text-[var(--color-text-2)]">No notifications yet</p>
          ) : (
            <ul>
              {items.map((n) => {
                const Icon = TYPE_ICON[n.type]
                return (
                  <li
                    key={n.id}
                    onClick={() => {
                      if (!n.read) void markRead(n.id)
                    }}
                    className={`flex cursor-pointer items-start gap-2 border-b border-[var(--color-border-1)]/50 p-3 hover:bg-[var(--color-bg-2)] ${
                      n.read ? 'opacity-60' : ''
                    }`}
                  >
                    <Icon size={14} className={`mt-0.5 shrink-0 ${TYPE_COLOR[n.type]}`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">{n.title}</div>
                      {n.body && (
                        <div className="line-clamp-2 text-xs text-[var(--color-text-1)]">
                          {n.body}
                        </div>
                      )}
                      <div className="mt-0.5 text-[10px] text-[var(--color-text-2)]">
                        {new Date(n.timestamp).toLocaleString()}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
