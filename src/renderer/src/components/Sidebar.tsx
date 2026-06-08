import { Terminal, ListTodo, ScrollText, Settings as SettingsIcon, Plus, GitBranch } from 'lucide-react'
import type { ViewKey } from '../stores/ui.store'

interface SidebarProps {
  active: ViewKey
  onChange: (v: ViewKey) => void
}

interface NavItem {
  key: ViewKey
  label: string
  icon: React.ComponentType<{ size?: number }>
}

const ITEMS: NavItem[] = [
  { key: 'sessions', label: 'Sessions', icon: Terminal },
  { key: 'tasks', label: 'Tasks', icon: ListTodo },
  { key: 'pipeline', label: 'Pipeline', icon: GitBranch },
  { key: 'audit', label: 'Audit', icon: ScrollText },
  { key: 'settings', label: 'Settings', icon: SettingsIcon }
]

export function Sidebar({ active, onChange }: SidebarProps): React.JSX.Element {
  return (
    <aside className="flex w-48 shrink-0 flex-col border-r border-[var(--color-border-1)] bg-[var(--color-bg-2)]">
      <nav className="flex-1 p-2">
        {ITEMS.map((item) => {
          const Icon = item.icon
          const isActive = active === item.key
          return (
            <button
              key={item.key}
              onClick={() => onChange(item.key)}
              className={`mb-1 flex w-full items-center gap-2.5 rounded px-3 py-2 text-left text-sm transition-colors ${
                isActive
                  ? 'bg-[var(--color-bg-3)] text-[var(--color-text-0)]'
                  : 'text-[var(--color-text-1)] hover:bg-[var(--color-bg-3)]/60 hover:text-[var(--color-text-0)]'
              }`}
            >
              <Icon size={16} />
              <span>{item.label}</span>
            </button>
          )
        })}
      </nav>
      <div className="p-2">
        <button
          onClick={() => onChange('tasks')}
          className="flex w-full items-center justify-center gap-2 rounded bg-[var(--color-accent)]/20 px-3 py-2 text-sm font-medium text-[var(--color-accent)] hover:bg-[var(--color-accent)]/30"
          title="New Task (Ctrl+N)"
        >
          <Plus size={16} />
          New Task
        </button>
      </div>
    </aside>
  )
}
