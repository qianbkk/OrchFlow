import { describe, it, expect, beforeEach } from 'vitest'
import { useUiStore } from './ui.store'

describe('ui.store', () => {
  beforeEach(() => {
    useUiStore.setState({ activeView: 'sessions', sidebarCollapsed: false, activeProjectId: null, taskViewMode: 'list' })
  })

  it('starts on sessions view by default', () => {
    expect(useUiStore.getState().activeView).toBe('sessions')
  })

  it('setActiveView switches views', () => {
    useUiStore.getState().setActiveView('tasks')
    expect(useUiStore.getState().activeView).toBe('tasks')
    useUiStore.getState().setActiveView('pipeline')
    expect(useUiStore.getState().activeView).toBe('pipeline')
    useUiStore.getState().setActiveView('audit')
    expect(useUiStore.getState().activeView).toBe('audit')
    useUiStore.getState().setActiveView('settings')
    expect(useUiStore.getState().activeView).toBe('settings')
  })

  it('toggleSidebar flips collapsed state', () => {
    expect(useUiStore.getState().sidebarCollapsed).toBe(false)
    useUiStore.getState().toggleSidebar()
    expect(useUiStore.getState().sidebarCollapsed).toBe(true)
    useUiStore.getState().toggleSidebar()
    expect(useUiStore.getState().sidebarCollapsed).toBe(false)
  })

  it('setActiveProjectId updates project context', () => {
    expect(useUiStore.getState().activeProjectId).toBeNull()
    useUiStore.getState().setActiveProjectId('proj-1')
    expect(useUiStore.getState().activeProjectId).toBe('proj-1')
    useUiStore.getState().setActiveProjectId(null)
    expect(useUiStore.getState().activeProjectId).toBeNull()
  })

  it('setTaskViewMode switches between list and kanban', () => {
    expect(useUiStore.getState().taskViewMode).toBe('list')
    useUiStore.getState().setTaskViewMode('kanban')
    expect(useUiStore.getState().taskViewMode).toBe('kanban')
  })
})
