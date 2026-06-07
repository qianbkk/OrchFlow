import { create } from 'zustand'

export type ViewKey = 'sessions' | 'tasks' | 'audit' | 'settings'

interface UiState {
  activeView: ViewKey
  setActiveView: (v: ViewKey) => void
  sidebarCollapsed: boolean
  toggleSidebar: () => void
}

export const useUiStore = create<UiState>((set) => ({
  activeView: 'sessions',
  setActiveView: (v) => set({ activeView: v }),
  sidebarCollapsed: false,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed }))
}))
