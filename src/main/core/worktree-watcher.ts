import { watch, FSWatcher, statSync } from 'node:fs'
import { basename } from 'node:path'
import { broadcast } from './broadcast'
interface WatcherState { watcher: FSWatcher; debounceTimers: Map<string, NodeJS.Timeout> }
const activeWatchers = new Map<string, WatcherState>()
export const worktreeWatcher = {
  start(sessionId: string, worktreePath: string, taskId: string): void {
    if (activeWatchers.has(sessionId)) return
    try {
      const watcher = watch(worktreePath, { recursive: true }, (_eventType, filename) => {
        if (!filename) return
        if (filename.startsWith('.git') || filename.includes('\\.git\\') || filename.includes('/.git/')) return
        const fullPath = `${worktreePath}\\${filename}`
        const state = activeWatchers.get(sessionId)
        if (!state) return
        const existingTimer = state.debounceTimers.get(fullPath)
        if (existingTimer) clearTimeout(existingTimer)
        const timer = setTimeout(() => {
          state.debounceTimers.delete(fullPath)
          let size = 0
          try { size = statSync(fullPath).size } catch {}
          broadcast('worktree:file-change', { sessionId, taskId, filename: basename(filename), relativePath: filename, size, timestamp: Date.now() })
        }, 300)
        state.debounceTimers.set(fullPath, timer)
      })
      activeWatchers.set(sessionId, { watcher, debounceTimers: new Map() })
    } catch (err) { console.error('[OrchFlow Watcher] Start failed:', err) }
  },
  stop(sessionId: string): void {
    const state = activeWatchers.get(sessionId)
    if (state) {
      state.watcher.close()
      state.debounceTimers.forEach(t => clearTimeout(t))
      activeWatchers.delete(sessionId)
    }
  }
}
