import { create } from 'zustand'

export type ViewKey = 'sessions' | 'tasks' | 'pipeline' | 'audit' | 'settings'

interface UiState {
  activeView: ViewKey
  sidebarCollapsed: boolean
  /** Currently active project ID for multi-project filtering */
  activeProjectId: string | null
  /** Task view mode: list or kanban board */
  taskViewMode: 'list' | 'kanban'
  setActiveView: (v: ViewKey) => void
  toggleSidebar: () => void
  setActiveProjectId: (id: string | null) => void
  setTaskViewMode: (mode: 'list' | 'kanban') => void
}

export const useUiStore = create<UiState>((set) => ({
  activeView: 'sessions',
  sidebarCollapsed: false,
  activeProjectId: null,
  taskViewMode: 'list',
  setActiveView: (v) => set({ activeView: v }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setActiveProjectId: (id) => set({ activeProjectId: id }),
  setTaskViewMode: (mode) => set({ taskViewMode: mode })
}))
