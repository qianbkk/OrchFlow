import { useEffect, useState } from 'react'
import type { Task, DiffResult } from '@shared/types'
import { Modal } from './Modal'

interface BroadcastCompareProps {
  /** Tasks created from the same broadcast — each has a different agent's result */
  tasks: Task[]
  onClose: () => void
}

/** PRD §3.3.1 Mode 1 (Broadcast): Compare results from multiple agents
 *  that each independently completed the same task. User picks the best result. */
export function BroadcastCompare({ tasks, onClose }: BroadcastCompareProps): React.JSX.Element {
  const [diffs, setDiffs] = useState<Map<string, DiffResult>>(new Map())
  const [loading, setLoading] = useState(true)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      const results = new Map<string, DiffResult>()
      for (const task of tasks) {
        if (task.worktreePath && (task.status === 'done' || task.status === 'pending_review')) {
          try {
            const diff = await window.orchflow.git.getDiff(task.worktreePath)
            results.set(task.id, diff)
          } catch {
            // diff may fail if worktree is clean
          }
        }
      }
      setDiffs(results)
      if (tasks.length > 0) setSelectedTaskId(tasks[0].id)
      setLoading(false)
    })()
  }, [tasks])

  const selectedDiff = selectedTaskId ? diffs.get(selectedTaskId) : null
  const selectedTask = tasks.find((t) => t.id === selectedTaskId)

  const mergeSelected = async (): Promise<void> => {
    if (!selectedTaskId) return
    try {
      await window.orchflow.git.merge(selectedTaskId)
      onClose()
    } catch (err) {
      console.error('[BroadcastCompare] merge failed:', err)
    }
  }

  return (
    <Modal onClose={onClose} title="Broadcast Comparison" widthClass="max-w-5xl" heightClass="h-[80vh] flex-col">
      <div className="border-b border-[var(--color-border-1)] px-4 py-2">
        <p className="text-xs text-[var(--color-text-2)]">
          Compare results from {tasks.length} agents that each independently completed the same task.
          Select the best result to merge.
        </p>
      </div>

      {/* Agent tabs */}
      <div className="flex border-b border-[var(--color-border-1)]">
        {tasks.map((task) => {
          const diff = diffs.get(task.id)
          const fileCount = diff?.files.length ?? 0
          return (
            <button
              key={task.id}
              onClick={() => setSelectedTaskId(task.id)}
              className={`flex items-center gap-2 border-b-2 px-4 py-2 text-xs transition-colors ${
                selectedTaskId === task.id
                  ? 'border-[var(--color-accent)] text-[var(--color-accent)]'
                  : 'border-transparent text-[var(--color-text-2)] hover:text-[var(--color-text-1)]'
              }`}
            >
              <span className="font-medium capitalize">{task.agentType}</span>
              <span className="rounded bg-[var(--color-bg-3)] px-1.5 py-0.5 text-[10px]">
                {task.status}
              </span>
              {fileCount > 0 && (
                <span className="text-[10px] text-[var(--color-text-2)]">
                  {fileCount} file{fileCount !== 1 ? 's' : ''}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Diff content */}
      <div className="flex flex-1 overflow-hidden">
        {loading ? (
          <div className="flex flex-1 items-center justify-center text-sm text-[var(--color-text-2)]">
            Loading diffs…
          </div>
        ) : !selectedDiff || selectedDiff.files.length === 0 ? (
          <div className="flex flex-1 items-center justify-center text-sm text-[var(--color-text-2)]">
            {selectedTask?.status === 'done' ? 'No file changes (clean worktree)' : 'Task not yet completed'}
          </div>
        ) : (
          <>
            <ul className="w-64 shrink-0 overflow-auto border-r border-[var(--color-border-1)] bg-[var(--color-bg-2)] p-2">
              {selectedDiff.files.map((f) => (
                <li key={f.path} className="mb-1 rounded px-2 py-1 text-xs hover:bg-[var(--color-bg-3)]">
                  <div className="flex items-center justify-between">
                    <span className="font-mono truncate" title={f.path}>{f.path}</span>
                    <span className="shrink-0 text-[10px] text-[var(--color-text-2)]">
                      +{f.additions} −{f.deletions}
                    </span>
                  </div>
                  <span className={`text-[10px] ${
                    f.status === 'added' ? 'text-green-400'
                      : f.status === 'deleted' ? 'text-red-400'
                        : 'text-yellow-400'
                  }`}>
                    {f.status}
                  </span>
                </li>
              ))}
            </ul>
            <pre className="flex-1 overflow-auto bg-[var(--color-bg-0)] p-3 font-mono text-xs leading-relaxed">
              {selectedDiff.files.map((f) => f.diff).join('\n')}
            </pre>
          </>
        )}
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2 border-t border-[var(--color-border-1)] px-4 py-3">
        <button onClick={onClose}
          className="rounded px-3 py-1.5 text-sm text-[var(--color-text-1)] hover:bg-[var(--color-bg-3)]">
          Close
        </button>
        {selectedTask?.status === 'done' && (
          <button onClick={mergeSelected}
            className="rounded bg-[var(--color-accent)] px-4 py-1.5 text-sm font-medium text-white hover:opacity-90">
            Merge {selectedTask.agentType} Result
          </button>
        )}
      </div>
    </Modal>
  )
}
