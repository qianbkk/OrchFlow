import { useEffect, useState } from 'react'
import { GitCommit, RotateCcw, Clock, Eye } from 'lucide-react'
import type { Checkpoint } from '@shared/types'
import { Modal } from './Modal'
import { StatusPill } from './StatusPill'

interface CheckpointTimelineProps {
  sessionId: string
}

const TYPE_LABEL: Record<Checkpoint['type'], string> = {
  auto: 'Auto',
  manual: 'Manual',
  pre_approval: 'Before approval'
}

const TYPE_TONE: Record<Checkpoint['type'], Parameters<typeof StatusPill>[0]['tone']> = {
  auto: 'muted',
  manual: 'accent',
  pre_approval: 'warn'
}

/** Vertical timeline of checkpoints for a session.
 *  PRD §3.4.3: "在 Session 时间线上点击任意 Checkpoint 标记 — 显示回滚预览
 *  （将撤销哪些操作） — 确认后 git 回退到对应提交" */
export function CheckpointTimeline({ sessionId }: CheckpointTimelineProps): React.JSX.Element {
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([])
  const [loading, setLoading] = useState(true)
  const [previewCp, setPreviewCp] = useState<Checkpoint | null>(null)
  const [rollbackCp, setRollbackCp] = useState<Checkpoint | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = async (): Promise<void> => {
    setLoading(true)
    try {
      const list = await window.orchflow.checkpoints.list(sessionId)
      setCheckpoints(list)
    } catch (err) {
      console.error('[CheckpointTimeline] list failed:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [sessionId])

  const confirmRollback = async (): Promise<void> => {
    if (!rollbackCp) return
    setBusy(true)
    try {
      await window.orchflow.checkpoints.rollback(rollbackCp.id)
      setRollbackCp(null)
      setPreviewCp(null)
      await refresh()
    } catch (err) {
      console.error('[CheckpointTimeline] rollback failed:', err)
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return <p className="py-2 text-xs text-[var(--color-text-2)]">Loading checkpoints…</p>
  }

  return (
    <>
      <div className="relative ml-4 border-l-2 border-[var(--color-border-1)] pl-6 space-y-3 py-2">
        {checkpoints.length === 0 && (
          <p className="text-xs italic text-[var(--color-text-2)]">No checkpoints yet</p>
        )}
        {checkpoints.map((cp) => (
          <div key={cp.id} className="relative group">
            {/* Marker dot */}
            <div className="absolute -left-[31px] top-1 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-bg-2)] border-2 border-[var(--color-accent)]">
              <GitCommit size={10} className="text-[var(--color-accent)]" />
            </div>
            {/* Content */}
            <div className="rounded-lg border border-[var(--color-border-1)] bg-[var(--color-bg-2)] p-3 hover:border-[var(--color-accent)]/40 transition-colors">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium truncate">
                      {cp.description || 'Checkpoint'}
                    </p>
                    <StatusPill tone={TYPE_TONE[cp.type]}>{TYPE_LABEL[cp.type]}</StatusPill>
                  </div>
                  <p className="mt-0.5 flex items-center gap-2 text-xs text-[var(--color-text-2)]">
                    <Clock size={10} />
                    {new Date(cp.timestamp).toLocaleString()}
                    {cp.gitCommit && (
                      <span className="font-mono">{cp.gitCommit.slice(0, 7)}</span>
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {cp.gitCommit && (
                    <>
                      <button
                        onClick={() => setPreviewCp(cp)}
                        disabled={busy}
                        className="flex items-center gap-1 rounded border border-[var(--color-border-1)] bg-[var(--color-bg-0)] px-2 py-1 text-xs hover:bg-[var(--color-bg-3)] disabled:opacity-50 disabled:pointer-events-none"
                        title="Preview rollback diff"
                      >
                        <Eye size={10} /> Preview
                      </button>
                      <button
                        onClick={() => setRollbackCp(cp)}
                        disabled={busy}
                        className="flex items-center gap-1 rounded border border-[var(--color-warn)]/40 bg-[var(--color-warn)]/10 px-2 py-1 text-xs text-[var(--color-warn)] hover:bg-[var(--color-warn)]/20 disabled:opacity-50 disabled:pointer-events-none"
                      >
                        <RotateCcw size={10} /> Rollback
                      </button>
                    </>
                  )}
                  {!cp.gitCommit && (
                    <span className="text-[10px] italic text-[var(--color-text-2)]">
                      No commit captured
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {previewCp && (
        <RollbackPreview
          cp={previewCp}
          onClose={() => setPreviewCp(null)}
          onConfirmRollback={() => {
            setRollbackCp(previewCp)
            setPreviewCp(null)
          }}
        />
      )}

      {rollbackCp && (
        <Modal onClose={() => setRollbackCp(null)} title="Confirm Rollback">
          <div className="p-4 space-y-3">
            <p className="text-sm">
              Roll back to checkpoint{' '}
              <span className="font-mono">{rollbackCp.gitCommit?.slice(0, 7)}</span>
              {' '}taken at {new Date(rollbackCp.timestamp).toLocaleString()}?
            </p>
            <p className="text-xs text-[var(--color-text-2)]">
              This will run <code>git reset --hard</code> to the saved commit and attempt
              to restore any stashed changes. Uncommitted changes in the worktree will be lost.
            </p>
            {rollbackCp.description && (
              <p className="rounded bg-[var(--color-bg-2)] p-2 text-xs italic">
                "{rollbackCp.description}"
              </p>
            )}
          </div>
          <div className="flex justify-end gap-2 border-t border-[var(--color-border-1)] px-4 py-3">
            <button
              onClick={() => setRollbackCp(null)}
              className="rounded px-3 py-1.5 text-sm text-[var(--color-text-1)] hover:bg-[var(--color-bg-3)]"
            >
              Cancel
            </button>
            <button
              onClick={confirmRollback}
              disabled={busy}
              className="rounded bg-[var(--color-warn)] px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {busy ? 'Rolling back…' : 'Confirm Rollback'}
            </button>
          </div>
        </Modal>
      )}
    </>
  )
}

interface RollbackPreviewProps {
  cp: Checkpoint
  onClose: () => void
  onConfirmRollback: () => void
}

function RollbackPreview({ cp, onClose, onConfirmRollback }: RollbackPreviewProps): React.JSX.Element {
  const [diff, setDiff] = useState<import('@shared/types').DiffResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeFile, setActiveFile] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      try {
        const d = await window.orchflow.checkpoints.rollbackDiff(cp.id)
        setDiff(d)
        if (d.files.length > 0) setActiveFile(d.files[0].path)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setLoading(false)
      }
    })()
  }, [cp.id])

  return (
    <Modal
      onClose={onClose}
      title={`Rollback Preview — ${cp.gitCommit?.slice(0, 7) ?? 'checkpoint'}`}
      widthClass="max-w-4xl"
      heightClass="h-[70vh] flex-col"
    >
      <div className="border-b border-[var(--color-border-1)] px-4 py-2 text-xs text-[var(--color-text-2)]">
        <p>
          These are the changes that would be <strong>undone</strong> by rolling back.
          Files shown here have been modified since the checkpoint was taken.
        </p>
      </div>
      <div className="flex flex-1 overflow-hidden">
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
            No changes since this checkpoint — rolling back would be a no-op.
          </div>
        ) : (
          <>
            <ul className="w-64 shrink-0 overflow-auto border-r border-[var(--color-border-1)] bg-[var(--color-bg-2)] p-2">
              {diff.files.map((f) => (
                <li key={f.path}>
                  <button
                    onClick={() => setActiveFile(f.path)}
                    className={`flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-xs hover:bg-[var(--color-bg-3)]/60 ${
                      activeFile === f.path ? 'bg-[var(--color-bg-3)]' : ''
                    }`}
                  >
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
              {diff.files.find((f) => f.path === activeFile)?.diff || 'Select a file'}
            </pre>
          </>
        )}
      </div>
      <div className="flex justify-end gap-2 border-t border-[var(--color-border-1)] px-4 py-3">
        <button
          onClick={onClose}
          className="rounded px-3 py-1.5 text-sm text-[var(--color-text-1)] hover:bg-[var(--color-bg-3)]"
        >
          Cancel
        </button>
        <button
          onClick={onConfirmRollback}
          className="rounded bg-[var(--color-warn)] px-4 py-1.5 text-sm font-medium text-white hover:opacity-90"
        >
          <RotateCcw size={12} className="mr-1 inline" />
          Rollback to this checkpoint
        </button>
      </div>
    </Modal>
  )
}
