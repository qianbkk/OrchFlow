import { create } from 'zustand'
import type { AgentEvent, Session } from '@shared/types'

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
  append: (sessionId: string, line: string) => void
  setStatus: (sessionId: string, status: Session['status']) => void
  applyEvent: (event: AgentEvent) => void
  loadAll: (sessions: Session[]) => void
}

const MAX_LINES = 500

export const useSessionsStore = create<SessionsState>((set) => ({
  byId: {},
  selectedId: null,
  select: (id) => set({ selectedId: id }),
  loadAll: (sessions) =>
    set(() => ({
      byId: Object.fromEntries(
        sessions.map((s) => [
          s.id,
          {
            sessionId: s.id,
            lines: [],
            status: s.status,
            agentType: s.agentType,
            taskId: s.taskId,
            updatedAt: Date.now()
          }
        ])
      )
    })),
  upsert: (session) =>
    set((state) => ({
      byId: {
        ...state.byId,
        [session.id]: state.byId[session.id] ?? {
          sessionId: session.id,
          lines: [],
          status: session.status,
          agentType: session.agentType,
          taskId: session.taskId,
          updatedAt: Date.now()
        }
      }
    })),
  append: (sessionId, line) =>
    set((state) => {
      const existing = state.byId[sessionId]
      if (!existing) return state
      const lines = [...existing.lines, line]
      if (lines.length > MAX_LINES) lines.splice(0, lines.length - MAX_LINES)
      return {
        byId: {
          ...state.byId,
          [sessionId]: { ...existing, lines, updatedAt: Date.now() }
        }
      }
    }),
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
      const existing = state.byId[event.sessionId] ?? {
        sessionId: event.sessionId,
        lines: [],
        status: 'idle' as const,
        agentType: 'claude' as const,
        taskId: event.taskId ?? '',
        updatedAt: Date.now()
      }
      const updates: Partial<SessionLog> = { updatedAt: Date.now() }
      if (event.type === 'output' || event.type === 'tool_call' || event.type === 'tool_result') {
        const lines = [...existing.lines, event.content]
        if (lines.length > MAX_LINES) lines.splice(0, lines.length - MAX_LINES)
        updates.lines = lines
      }
      if (event.type === 'status_change' && event.status) {
        updates.status = event.status
      }
      if (event.type === 'error') {
        const lines = [...existing.lines, `[error] ${event.content}`]
        if (lines.length > MAX_LINES) lines.splice(0, lines.length - MAX_LINES)
        updates.lines = lines
      }
      if (event.type === 'done') {
        const lines = [...existing.lines, '[done]']
        if (lines.length > MAX_LINES) lines.splice(0, lines.length - MAX_LINES)
        updates.lines = lines
        updates.status = 'done'
      }
      return {
        byId: { ...state.byId, [event.sessionId]: { ...existing, ...updates } }
      }
    })
}))
