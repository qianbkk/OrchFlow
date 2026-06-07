import { useState } from 'react'
import { X } from 'lucide-react'
import type { AgentType, TaskCreateInput } from '@shared/types'

interface TaskCreateDialogProps {
  projectId: string
  onClose: () => void
  onCreated: () => void
}

export function TaskCreateDialog({
  projectId,
  onClose,
  onCreated
}: TaskCreateDialogProps): React.JSX.Element {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [agentType, setAgentType] = useState<AgentType | ''>('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (): Promise<void> => {
    if (!title.trim()) {
      setError('Title is required')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const input: TaskCreateInput = {
        projectId,
        title: title.trim(),
        description: description.trim() || undefined,
        mode: 'single',
        assignmentMode: agentType ? 'manual' : 'auto',
        agentType: agentType || undefined,
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="w-full max-w-lg rounded-lg border border-[var(--color-border-1)] bg-[var(--color-bg-1)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--color-border-1)] px-4 py-3">
          <h3 className="font-semibold">New Task</h3>
          <button
            onClick={onClose}
            className="rounded p-1 text-[var(--color-text-1)] hover:bg-[var(--color-bg-3)]"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3 p-4">
          <div>
            <label className="mb-1 block text-xs text-[var(--color-text-2)]">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Add login form validation"
              className="w-full rounded border border-[var(--color-border-1)] bg-[var(--color-bg-0)] px-3 py-2 text-sm focus:border-[var(--color-accent)] focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-[var(--color-text-2)]">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="Describe what the agent should do. Leave empty to use title only."
              className="w-full resize-none rounded border border-[var(--color-border-1)] bg-[var(--color-bg-0)] px-3 py-2 text-sm focus:border-[var(--color-accent)] focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-[var(--color-text-2)]">Agent</label>
            <div className="grid grid-cols-4 gap-1.5">
              {(['claude', 'codex', 'copilot'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setAgentType(agentType === t ? '' : t)}
                  className={`rounded border px-2 py-1.5 text-xs font-medium transition-colors ${
                    agentType === t
                      ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/20 text-[var(--color-accent)]'
                      : 'border-[var(--color-border-1)] text-[var(--color-text-1)] hover:border-[var(--color-text-2)]'
                  }`}
                >
                  {t}
                </button>
              ))}
              <button
                onClick={() => setAgentType('')}
                className={`rounded border px-2 py-1.5 text-xs font-medium ${
                  agentType === ''
                    ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/20 text-[var(--color-accent)]'
                    : 'border-[var(--color-border-1)] text-[var(--color-text-1)] hover:border-[var(--color-text-2)]'
                }`}
              >
                auto
              </button>
            </div>
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
            disabled={submitting || !title.trim()}
            className="rounded bg-[var(--color-accent)] px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {submitting ? 'Creating…' : 'Create Task'}
          </button>
        </div>
      </div>
    </div>
  )
}
