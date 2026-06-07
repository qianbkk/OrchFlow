import { describe, it, expect, beforeEach } from 'vitest'
import { useUiStore } from './ui.store'

describe('ui.store', () => {
  beforeEach(() => {
    useUiStore.setState({ activeView: 'sessions', sidebarCollapsed: false })
  })

  it('starts on sessions view by default', () => {
    expect(useUiStore.getState().activeView).toBe('sessions')
  })

  it('setActiveView switches views', () => {
    useUiStore.getState().setActiveView('tasks')
    expect(useUiStore.getState().activeView).toBe('tasks')
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
})
