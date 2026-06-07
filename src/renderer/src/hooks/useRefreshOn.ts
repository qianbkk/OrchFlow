import { useEffect } from 'react'

/** Subscribes to one or more IPC channels and calls `refresh` on each event.
 *  Replaces the repeated `useEffect + on() + cleanup` boilerplate
 *  in NotificationCenter, ApprovalCenter, SessionsView, AuditView, TasksView. */
export function useRefreshOn(channels: string[], refresh: () => void | Promise<void>): void {
  useEffect(() => {
    const offs = channels.map((ch) => window.orchflow.on(ch, () => void refresh()))
    return () => {
      for (const off of offs) off()
    }
    // channels is expected to be stable; refresh is intentionally not in deps to avoid re-subscribing
    // on every parent re-render. Callers should use useCallback for refresh if it captures state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channels.join('|')])
}
