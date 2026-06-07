import { Settings as SettingsIcon, Bell } from 'lucide-react'
import { useUiStore } from '../stores/ui.store'

interface TitleBarProps {
  appName: string
  appVersion?: string
}

export function TitleBar({ appName, appVersion }: TitleBarProps): React.JSX.Element {
  const setActiveView = useUiStore((s) => s.setActiveView)
  return (
    <header
      className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--color-border-1)] bg-[var(--color-bg-2)] px-4"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <div className="flex items-center gap-3">
        <div className="h-6 w-6 rounded bg-gradient-to-br from-[var(--color-accent)] to-[var(--color-accent-2)]" />
        <h1 className="text-sm font-semibold tracking-wide">{appName}</h1>
        {appVersion && <span className="text-xs text-[var(--color-text-2)]">v{appVersion}</span>}
      </div>
      <div className="flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <button
          onClick={() => setActiveView('settings')}
          className="rounded p-1.5 text-[var(--color-text-1)] hover:bg-[var(--color-bg-3)] hover:text-[var(--color-text-0)]"
          title="设置"
          aria-label="Settings"
        >
          <Bell size={16} />
        </button>
        <button
          onClick={() => setActiveView('settings')}
          className="rounded p-1.5 text-[var(--color-text-1)] hover:bg-[var(--color-bg-3)] hover:text-[var(--color-text-0)]"
          title="设置"
          aria-label="Open settings"
        >
          <SettingsIcon size={16} />
        </button>
      </div>
    </header>
  )
}
