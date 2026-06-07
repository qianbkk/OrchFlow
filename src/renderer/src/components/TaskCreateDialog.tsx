import { useState } from 'react'
import type { TaskCreateInput } from '@shared/types'
import { Modal } from './Modal'

interface TaskCreateDialogProps {
  projectId: string
  onClose: () => void
  onCreated: () => void
}

/** Phase 0 task creation per PRD §3.2.1 Mode A: single natural-language
 *  description (no separate title, no Phase 1+ collaboration modes). */
export function TaskCreateDialog({
  projectId,
  onClose,
  onCreated
}: TaskCreateDialogProps): React.JSX.Element {
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (): Promise<void> => {
    if (!description.trim()) {
      setError('Description is required')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const input: TaskCreateInput = {
        projectId,
        title: description.trim().split('\n')[0].slice(0, 80) || 'Untitled task',
        description: description.trim(),
        mode: 'single',
        assignmentMode: 'auto',
        persistOnClose: false
      }
      await window.orchflow.tasks.create(input)
      onCreated()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal onClose={onClose} title="New Task">
      <div className="space-y-3 p-4">
        <div>
          <label className="mb-1 block text-xs text-[var(--color-text-2)]">
            Describe the task in natural language
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={6}
            autoFocus
            placeholder="e.g., Add a login form with email and password validation. Update the auth API and add a new component for the form."
            className="w-full resize-none rounded border border-[var(--color-border-1)] bg-[var(--color-bg-0)] px-3 py-2 text-sm focus:border-[var(--color-accent)] focus:outline-none"
          />
          <p className="mt-1 text-xs text-[var(--color-text-2)]">
            The first line becomes the task title. The Claude Code agent in this project's worktree
            will pick it up automatically.
          </p>
        </div>

        {error && (
          <div className="rounded bg-[var(--color-danger)]/10 px-3 py-2 text-sm text-[var(--color-danger)]">
            {error}
          </div>
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
          onClick={submit}
          disabled={submitting || !description.trim()}
          className="rounded bg-[var(--color-accent)] px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {submitting ? 'Creating…' : 'Create Task'}
        </button>
      </div>
    </Modal>
  )
}
