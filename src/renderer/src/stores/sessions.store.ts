import { create } from 'zustand'
import type { AgentEvent, Session } from '@shared/types'
import { COMPACT_PREVIEW_LINES } from '@shared/constants'

/** Maximum lines kept in the full output buffer (matches xterm.js scrollback). */
const FULL_BUFFER_LINES = 5000

export interface SessionLog {
  sessionId: string
  /** Compact preview (COMPACT_PREVIEW_LINES) for the task list / sidebar. */
  lines: string[]
  /** Full output history for the terminal pane (up to FULL_BUFFER_LINES). */
  fullLines: string[]
  status: Session['status']
  agentType: Session['agentType']
  mode: Session['mode']
  taskId: string
  updatedAt: number
}

interface SessionsState {
  byId: Record<string, SessionLog>
  selectedId: string | null
  select: (id: string | null) => void
  upsert: (session: Session) => void
  setStatus: (sessionId: string, status: Session['status']) => void
  setMode: (sessionId: string, mode: Session['mode']) => void
  applyEvent: (event: AgentEvent) => void
  loadAll: (sessions: Session[]) => void
  remove: (sessionId: string) => void
}

const trim = (lines: string[]): string[] =>
  lines.length > COMPACT_PREVIEW_LINES ? lines.slice(-COMPACT_PREVIEW_LINES) : lines

const trimFull = (lines: string[]): string[] =>
  lines.length > FULL_BUFFER_LINES ? lines.slice(-FULL_BUFFER_LINES) : lines

const emptyLog = (s: {
  id: string
  status: Session['status']
  agentType: Session['agentType']
  mode: Session['mode']
  taskId: string
}): SessionLog => ({
  sessionId: s.id,
  lines: [],
  fullLines: [],
  status: s.status,
  agentType: s.agentType,
  mode: s.mode,
  taskId: s.taskId,
  updatedAt: Date.now()
})

export const useSessionsStore = create<SessionsState>((set) => ({
  byId: {},
  selectedId: null,
  select: (id) => set({ selectedId: id }),
  loadAll: (sessions) =>
    set(() => ({
      byId: Object.fromEntries(sessions.map((s) => [s.id, emptyLog(s)]))
    })),
  upsert: (session) =>
    set((state) => ({
      byId: {
        ...state.byId,
        [session.id]: state.byId[session.id] ?? emptyLog(session)
      }
    })),
  setStatus: (sessionId, status) =>
    set((state) => {
      const existing = state.byId[sessionId]
      if (!existing) return state
      return {
        byId: { ...state.byId, [sessionId]: { ...existing, status, updatedAt: Date.now() } }
      }
    }),
  setMode: (sessionId, mode) =>
    set((state) => {
      const existing = state.byId[sessionId]
      if (!existing) return state
      return { byId: { ...state.byId, [sessionId]: { ...existing, mode, updatedAt: Date.now() } } }
    }),
  applyEvent: (event) =>
    set((state) => {
      const existing =
        state.byId[event.sessionId] ??
        emptyLog({
          id: event.sessionId,
          status: 'idle',
          agentType: 'claude',
          mode: 'headless',
          taskId: event.taskId ?? ''
        })
      const updates: Partial<SessionLog> = { updatedAt: Date.now() }
      if (event.type === 'output' || event.type === 'tool_call' || event.type === 'tool_result') {
        updates.lines = trim([...existing.lines, event.content])
        updates.fullLines = trimFull([...existing.fullLines, event.content])
      }
      if (event.type === 'status_change' && event.status) {
        updates.status = event.status
      }
      if (event.type === 'error') {
        const line = `[error] ${event.content}`
        updates.lines = trim([...existing.lines, line])
        updates.fullLines = trimFull([...existing.fullLines, line])
      }
      if (event.type === 'done') {
        updates.lines = trim([...existing.lines, '[done]'])
        updates.fullLines = trimFull([...existing.fullLines, '[done]'])
        updates.status = 'done'
      }
      return {
        byId: { ...state.byId, [event.sessionId]: { ...existing, ...updates } }
      }
    }),
  remove: (sessionId) =>
    set((state) => {
      const { [sessionId]: _, ...rest } = state.byId
      void _
      return { byId: rest }
    })
}))
