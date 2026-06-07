import { useEffect, useState } from 'react'
import { Plus, FolderOpen, GitMerge } from 'lucide-react'
import type { Project, Task } from '@shared/types'
import { TaskCreateDialog } from '../components/TaskCreateDialog'
import { DiffViewer } from '../components/DiffViewer'

export function TasksView(): React.JSX.Element {
  const [project, setProject] = useState<Project | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [loading, setLoading] = useState(true)
  const [openProjectDialog, setOpenProjectDialog] = useState(false)
  const [diffTask, setDiffTask] = useState<Task | null>(null)

  const reload = async (): Promise<void> => {
    try {
      const p = await window.orchflow.projects.current()
      setProject(p)
      if (p) {
        const list = await window.orchflow.tasks.list({ projectId: p.id })
        setTasks(list)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void reload()
  }, [])

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-[var(--color-text-2)]">
        Loading…
      </div>
    )
  }

  if (!project) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="max-w-md rounded-lg border border-[var(--color-border-1)] bg-[var(--color-bg-2)] p-8 text-center">
          <FolderOpen size={32} className="mx-auto mb-3 text-[var(--color-text-2)]" />
          <h3 className="mb-2 font-semibold">No project opened</h3>
          <p className="mb-4 text-sm text-[var(--color-text-1)]">
            Open a git repository to start creating tasks.
          </p>
          <button
            onClick={() => setOpenProjectDialog(true)}
            className="rounded bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            Open Project
          </button>
          {openProjectDialog && (
            <ProjectPicker
              onClose={() => setOpenProjectDialog(false)}
              onPicked={async () => {
                setOpenProjectDialog(false)
                await reload()
              }}
            />
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-[var(--color-border-1)] bg-[var(--color-bg-2)] px-6 py-3">
        <div>
          <h2 className="font-semibold">{project.name}</h2>
          <p className="text-xs text-[var(--color-text-2)]">{project.rootPath}</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 rounded bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
        >
          <Plus size={14} />
          New Task
        </button>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {tasks.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[var(--color-border-1)] p-12 text-center">
            <p className="text-sm text-[var(--color-text-2)]">
              No tasks yet. Click <span className="font-medium text-[var(--color-text-0)]">New Task</span>{' '}
              to create the first one.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {tasks.map((t) => (
              <li
                key={t.id}
                className="rounded-lg border border-[var(--color-border-1)] bg-[var(--color-bg-2)] p-3"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{t.title}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      t.status === 'done'
                        ? 'bg-[var(--color-accent-2)]/20 text-[var(--color-accent-2)]'
                        : t.status === 'failed'
                          ? 'bg-[var(--color-danger)]/20 text-[var(--color-danger)]'
                          : 'bg-[var(--color-accent)]/20 text-[var(--color-accent)]'
                    }`}
                  >
                    {t.status}
                  </span>
                </div>
                {t.description && (
                  <p className="mt-1 line-clamp-2 text-sm text-[var(--color-text-1)]">
                    {t.description}
                  </p>
                )}
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-xs text-[var(--color-text-2)]">
                    {t.agentType ?? 'auto'} · {t.mode} · {new Date(t.createdAt).toLocaleString()}
                  </span>
                  {t.worktreePath && (
                    <button
                      onClick={() => setDiffTask(t)}
                      className="flex items-center gap-1 rounded px-2 py-0.5 text-xs text-[var(--color-text-1)] hover:bg-[var(--color-bg-3)]"
                    >
                      <GitMerge size={12} />
                      Review / Merge
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {showCreate && project && (
        <TaskCreateDialog
          projectId={project.id}
          onClose={() => setShowCreate(false)}
          onCreated={async () => {
            setShowCreate(false)
            await reload()
          }}
        />
      )}
      {diffTask && (
        <DiffViewer
          task={diffTask}
          onClose={() => setDiffTask(null)}
          onMerged={() => void reload()}
          onDiscarded={() => void reload()}
        />
      )}
    </div>
  )
}

interface ProjectPickerProps {
  onClose: () => void
  onPicked: () => void
}

function ProjectPicker({ onClose, onPicked }: ProjectPickerProps): React.JSX.Element {
  const [path, setPath] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (): Promise<void> => {
    if (!path.trim()) return
    setBusy(true)
    setError(null)
    try {
      await window.orchflow.projects.open(path.trim())
      onPicked()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="w-full max-w-md rounded-lg border border-[var(--color-border-1)] bg-[var(--color-bg-1)] p-6 shadow-2xl">
        <h3 className="mb-2 font-semibold">Open Project</h3>
        <p className="mb-3 text-sm text-[var(--color-text-1)]">
          Enter the absolute path to a git repository on your machine.
        </p>
        <input
          value={path}
          onChange={(e) => setPath(e.target.value)}
          placeholder="C:\Users\you\projects\my-app"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submit()
          }}
          className="mb-2 w-full rounded border border-[var(--color-border-1)] bg-[var(--color-bg-0)] px-3 py-2 font-mono text-sm focus:border-[var(--color-accent)] focus:outline-none"
        />
        {error && (
          <p className="mb-2 text-sm text-[var(--color-danger)]">{error}</p>
        )}
        <div className="mt-3 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded px-3 py-1.5 text-sm text-[var(--color-text-1)] hover:bg-[var(--color-bg-3)]"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy || !path.trim()}
            className="rounded bg-[var(--color-accent)] px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? 'Opening…' : 'Open'}
          </button>
        </div>
      </div>
    </div>
  )
}
