import { useEffect, useState } from 'react'
import { TitleBar } from './components/TitleBar'
import { Sidebar } from './components/Sidebar'
import { SessionsView } from './views/SessionsView'
import { TasksView } from './views/TasksView'
import { AuditView } from './views/AuditView'
import { SettingsView } from './views/SettingsView'
import { ApprovalCenter } from './components/ApprovalCenter'
import { useUiStore, type ViewKey } from './stores/ui.store'

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
