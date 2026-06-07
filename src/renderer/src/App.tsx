import { useEffect, useState } from 'react'
import { TitleBar } from './components/TitleBar'
import { Sidebar } from './components/Sidebar'
import { SessionsView } from './views/SessionsView'
import { TasksView } from './views/TasksView'
import { AuditView } from './views/AuditView'
import { SettingsView } from './views/SettingsView'
import { ApprovalCenter } from './components/ApprovalCenter'
import { useUiStore, type ViewKey } from './stores/ui.store'
import { useSessionsStore } from './stores/sessions.store'

const VIEWS: Record<ViewKey, React.ComponentType> = {
  sessions: SessionsView,
  tasks: TasksView,
  audit: AuditView,
  settings: SettingsView
}

function App(): React.JSX.Element {
  const activeView = useUiStore((s) => s.activeView)
  const setActiveView = useUiStore((s) => s.setActiveView)
  const [appInfo, setAppInfo] = useState<{ name: string; version: string } | null>(null)

  useEffect(() => {
    void window.orchflow
      .getAppInfo()
      .then(setAppInfo)
      .catch((err: unknown) => {
        console.error('[App] getAppInfo failed:', err)
      })
  }, [])

  // PRD §3.4.3: Ctrl+Shift+S creates a manual checkpoint for the
  // currently selected session. The menu accelerator (main/menu.ts)
  // broadcasts 'shortcut:createCheckpoint' when focused.
  useEffect(() => {
    const off1 = window.orchflow.on('shortcut:createCheckpoint', async () => {
      const selectedId = useSessionsStore.getState().selectedId
      if (!selectedId) return
      try {
        await window.orchflow.checkpoints.create(selectedId, 'Manual checkpoint (Ctrl+Shift+S)')
      } catch (err) {
        console.error('[shortcut] checkpoint create failed:', err)
      }
    })
    // PRD §3.7: click a Windows notification or in-app notification
    // → focus the window + navigate to the related Session or Task.
    const off2 = window.orchflow.on('notification:navigate', (payload: unknown) => {
      const p = payload as { sessionId?: string; taskId?: string }
      if (p.sessionId) {
        setActiveView('sessions')
        useSessionsStore.getState().select(p.sessionId)
      } else if (p.taskId) {
        setActiveView('tasks')
      }
    })
    return () => {
      off1()
      off2()
    }
  }, [setActiveView])

  const Active = VIEWS[activeView] ?? SessionsView

  return (
    <div className="flex h-full flex-col">
      <TitleBar appName={appInfo?.name ?? 'OrchFlow'} appVersion={appInfo?.version} />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar active={activeView} onChange={(v) => setActiveView(v)} />
        <main className="flex-1 overflow-hidden bg-[var(--color-bg-1)]">
          <Active />
        </main>
      </div>
      <ApprovalCenter />
    </div>
  )
}

export default App
