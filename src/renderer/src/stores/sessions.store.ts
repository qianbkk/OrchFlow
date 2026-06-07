import { create } from 'zustand'
import type { AgentEvent, Session } from '@shared/types'
import { COMPACT_PREVIEW_LINES } from '@shared/constants'

export interface SessionLog {
  sessionId: string
  lines: string[]
  status: Session['status']
  agentType: Session['agentType']
  taskId: string
  updatedAt: number
}

interface SessionsState {
  byId: Record<string, SessionLog>
  selectedId: string | null
  select: (id: string | null) => void
  upsert: (session: Session) => void
  setStatus: (sessionId: string, status: Session['status']) => void
  applyEvent: (event: AgentEvent) => void
  loadAll: (sessions: Session[]) => void
  remove: (sessionId: string) => void
}

const trim = (lines: string[]): string[] =>
  lines.length > COMPACT_PREVIEW_LINES ? lines.slice(-COMPACT_PREVIEW_LINES) : lines

const emptyLog = (s: { id: string; status: Session['status']; agentType: Session['agentType']; taskId: string }): SessionLog => ({
  sessionId: s.id,
  lines: [],
  status: s.status,
  agentType: s.agentType,
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
  applyEvent: (event) =>
    set((state) => {
      const existing =
        state.byId[event.sessionId] ??
        emptyLog({
          id: event.sessionId,
          status: 'idle',
          agentType: 'claude',
          taskId: event.taskId ?? ''
        })
      const updates: Partial<SessionLog> = { updatedAt: Date.now() }
      if (event.type === 'output' || event.type === 'tool_call' || event.type === 'tool_result') {
        updates.lines = trim([...existing.lines, event.content])
      }
      if (event.type === 'status_change' && event.status) {
        updates.status = event.status
      }
      if (event.type === 'error') {
        updates.lines = trim([...existing.lines, `[error] ${event.content}`])
      }
      if (event.type === 'done') {
        updates.lines = trim([...existing.lines, '[done]'])
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
