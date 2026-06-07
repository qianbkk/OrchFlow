import { useEffect, useState } from 'react'
import { X, GitMerge, Trash2, Archive, Plus, Minus, Edit2 } from 'lucide-react'
import type { DiffResult, DiffFile, Task } from '@shared/types'

interface DiffViewerProps {
  task: Task
  onClose: () => void
  onMerged?: () => void
  onDiscarded?: () => void
}

export function DiffViewer({ task, onClose, onMerged, onDiscarded }: DiffViewerProps): React.JSX.Element {
  const [diff, setDiff] = useState<DiffResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeFile, setActiveFile] = useState<string | null>(null)
  const [busy, setBusy] = useState<'merge' | 'discard' | 'keep' | null>(null)

  useEffect(() => {
    if (!task.worktreePath) return
    void window.orchflow.git
      .getDiff(task.worktreePath)
      .then((d) => {
        setDiff(d as DiffResult)
        if (d.files.length > 0) setActiveFile(d.files[0].path)
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }, [task.worktreePath])

  const doAction = async (action: 'merge' | 'discard' | 'keep'): Promise<void> => {
    setBusy(action)
    try {
      if (action === 'merge') {
        await window.orchflow.git.merge(task.id)
        onMerged?.()
      } else if (action === 'discard') {
        await window.orchflow.git.discard(task.id)
        onDiscarded?.()
      } else {
        await window.orchflow.git.keep(task.id)
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="flex h-[80vh] w-full max-w-5xl flex-col rounded-lg border border-[var(--color-border-1)] bg-[var(--color-bg-1)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--color-border-1)] px-4 py-3">
          <div>
            <h3 className="font-semibold">Review Changes — {task.title}</h3>
            {diff && (
              <p className="text-xs text-[var(--color-text-2)]">
                {diff.files.length} file(s) changed ·{' '}
                <span className="text-[var(--color-accent-2)]">+{diff.summary.added}</span> ·{' '}
                <span className="text-[var(--color-danger)]">−{diff.summary.removed}</span> ·{' '}
                <span className="text-[var(--color-warn)]">~{diff.summary.modified}</span>
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-[var(--color-text-1)] hover:bg-[var(--color-bg-3)]"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {loading ? (
          <div className="flex flex-1 items-center justify-center text-sm text-[var(--color-text-2)]">
            Loading diff…
          </div>
        ) : error ? (
          <div className="flex flex-1 items-center justify-center p-4 text-sm text-[var(--color-danger)]">
            {error}
          </div>
        ) : !diff || diff.files.length === 0 ? (
          <div className="flex flex-1 items-center justify-center text-sm text-[var(--color-text-2)]">
            No changes in this worktree.
          </div>
        ) : (
          <div className="flex flex-1 overflow-hidden">
            <ul className="w-64 shrink-0 overflow-auto border-r border-[var(--color-border-1)] bg-[var(--color-bg-2)] p-2">
              {diff.files.map((f) => (
                <li key={f.path}>
                  <button
                    onClick={() => setActiveFile(f.path)}
                    className={`flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-xs hover:bg-[var(--color-bg-3)]/60 ${
                      activeFile === f.path ? 'bg-[var(--color-bg-3)]' : ''
                    }`}
                  >
                    <FileStatusIcon status={f.status} />
                    <span className="flex-1 truncate font-mono" title={f.path}>
                      {f.path}
                    </span>
                    <span className="text-[10px] text-[var(--color-text-2)]">
                      +{f.additions} −{f.deletions}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <pre className="flex-1 overflow-auto bg-[var(--color-bg-0)] p-3 font-mono text-xs">
              {(() => {
                const file = diff.files.find((f) => f.path === activeFile)
                if (!file) return 'Select a file'
                return file.diff || '(empty diff)'
              })()}
            </pre>
          </div>
        )}

        <div className="flex justify-end gap-2 border-t border-[var(--color-border-1)] px-4 py-3">
          <button
            onClick={() => void doAction('discard')}
            disabled={busy !== null}
            className="flex items-center gap-1.5 rounded border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 px-3 py-1.5 text-sm text-[var(--color-danger)] hover:bg-[var(--color-danger)]/20 disabled:opacity-50"
          >
            <Trash2 size={14} />
            {busy === 'discard' ? 'Discarding…' : 'Discard'}
          </button>
          <button
            onClick={() => void doAction('keep')}
            disabled={busy !== null}
            className="flex items-center gap-1.5 rounded border border-[var(--color-border-1)] bg-[var(--color-bg-2)] px-3 py-1.5 text-sm hover:bg-[var(--color-bg-3)] disabled:opacity-50"
          >
            <Archive size={14} />
            Keep
          </button>
          <button
            onClick={() => void doAction('merge')}
            disabled={busy !== null}
            className="flex items-center gap-1.5 rounded bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            <GitMerge size={14} />
            {busy === 'merge' ? 'Merging…' : 'Merge to main'}
          </button>
        </div>
      </div>
    </div>
  )
}

function FileStatusIcon({ status }: { status: DiffFile['status'] }): React.JSX.Element {
  switch (status) {
    case 'added':
      return <Plus size={12} className="text-[var(--color-accent-2)]" />
    case 'deleted':
      return <Minus size={12} className="text-[var(--color-danger)]" />
    case 'modified':
      return <Edit2 size={12} className="text-[var(--color-warn)]" />
    case 'renamed':
      return <Edit2 size={12} className="text-[var(--color-accent)]" />
  }
}
