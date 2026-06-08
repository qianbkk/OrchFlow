import { useState, useEffect } from 'react'
import type { TaskCreateInput, TaskBatchCreateInput, TaskImportInput, AgentType, TaskMode } from '@shared/types'
import type { DetectedAgent } from '@shared/types'
import { Modal } from './Modal'

type Tab = 'simple' | 'list' | 'plan' | 'import'

interface TaskCreateDialogProps {
  projectId: string
  onClose: () => void
  onCreated: () => void
}

const TABS: { key: Tab; label: string; desc: string }[] = [
  { key: 'simple', label: 'Simple', desc: 'Single task with natural language description' },
  { key: 'list', label: 'Task List', desc: 'Multiple sub-tasks, one per line with optional dependencies' },
  { key: 'plan', label: 'Agent Plan', desc: 'Let an agent decompose the goal into sub-tasks' },
  { key: 'import', label: 'Import', desc: 'Import tasks from .md, .json, or .txt file' }
]

/** PRD §3.2: Four task creation modes — Simple / Task List / Agent Planning / File Import. */
export function TaskCreateDialog({ projectId, onClose, onCreated }: TaskCreateDialogProps): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('simple')
  const [agents, setAgents] = useState<DetectedAgent[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void window.orchflow.agents.detectInstalled().then(setAgents)
  }, [])

  const installedAgents = agents.filter((a) => a.installed).map((a) => a.type)

  return (
    <Modal onClose={onClose} title="New Task" widthClass="max-w-2xl">
      {/* Tab bar */}
      <div className="flex border-b border-[var(--color-border-1)]">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
              tab === t.key
                ? 'border-b-2 border-[var(--color-accent)] text-[var(--color-accent)]'
                : 'text-[var(--color-text-2)] hover:text-[var(--color-text-1)]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="p-4">
        <p className="mb-3 text-xs text-[var(--color-text-2)]">{TABS.find((t) => t.key === tab)?.desc}</p>

        {tab === 'simple' && (
          <SimpleTab
            projectId={projectId}
            installedAgents={installedAgents}
            submitting={submitting}
            setSubmitting={setSubmitting}
            error={error}
            setError={setError}
            onCreated={onCreated}
          />
        )}
        {tab === 'list' && (
          <ListTab
            projectId={projectId}
            installedAgents={installedAgents}
            submitting={submitting}
            setSubmitting={setSubmitting}
            error={error}
            setError={setError}
            onCreated={onCreated}
          />
        )}
        {tab === 'plan' && (
          <PlanTab
            projectId={projectId}
            installedAgents={installedAgents}
            submitting={submitting}
            setSubmitting={setSubmitting}
            error={error}
            setError={setError}
            onCreated={onCreated}
          />
        )}
        {tab === 'import' && (
          <ImportTab
            projectId={projectId}
            installedAgents={installedAgents}
            submitting={submitting}
            setSubmitting={setSubmitting}
            error={error}
            setError={setError}
            onCreated={onCreated}
          />
        )}
      </div>
    </Modal>
  )
}

// ===== Shared Components =====

function AgentSelector({ value, onChange, agents }: {
  value: AgentType | ''
  onChange: (v: AgentType | '') => void
  agents: AgentType[]
}): React.JSX.Element {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as AgentType | '')}
      className="rounded border border-[var(--color-border-1)] bg-[var(--color-bg-0)] px-2 py-1.5 text-sm focus:border-[var(--color-accent)] focus:outline-none"
    >
      <option value="">Auto (system picks)</option>
      {agents.map((a) => (
        <option key={a} value={a}>{a}</option>
      ))}
    </select>
  )
}

function ModeSelector({ value, onChange }: {
  value: TaskMode
  onChange: (v: TaskMode) => void
}): React.JSX.Element {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as TaskMode)}
      className="rounded border border-[var(--color-border-1)] bg-[var(--color-bg-0)] px-2 py-1.5 text-sm focus:border-[var(--color-accent)] focus:outline-none"
    >
      <option value="single">Single (independent)</option>
      <option value="broadcast">Broadcast (compare agents)</option>
      <option value="divide">Divide (sub-tasks)</option>
      <option value="pipeline">Pipeline (sequential)</option>
    </select>
  )
}

// ===== Tab: Simple =====

function SimpleTab({ projectId, installedAgents, submitting, setSubmitting, error, setError, onCreated }: {
  projectId: string; installedAgents: AgentType[]; submitting: boolean
  setSubmitting: (v: boolean) => void; error: string | null; setError: (v: string | null) => void
  onCreated: () => void
}): React.JSX.Element {
  const [description, setDescription] = useState('')
  const [agent, setAgent] = useState<AgentType | ''>('')
  const [mode, setMode] = useState<TaskMode>('single')

  const submit = async (): Promise<void> => {
    if (!description.trim()) { setError('Description is required'); return }
    setSubmitting(true); setError(null)
    try {
      if (mode === 'broadcast' && installedAgents.length > 1) {
        const input: TaskBatchCreateInput = {
          projectId, mode: 'broadcast', description: description.trim(),
          agentTypes: installedAgents, assignmentMode: 'auto'
        }
        await window.orchflow.tasks.createBatch(input)
      } else {
        const input: TaskCreateInput = {
          projectId, title: description.trim().split('\n')[0].slice(0, 80) || 'Untitled task',
          description: description.trim(), mode, assignmentMode: 'auto',
          agentType: agent || undefined, persistOnClose: false
        }
        await window.orchflow.tasks.create(input)
      }
      onCreated()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally { setSubmitting(false) }
  }

  return (
    <div className="space-y-3">
      <textarea
        value={description} onChange={(e) => setDescription(e.target.value)}
        rows={5} autoFocus
        placeholder="Describe the task in natural language…"
        className="w-full resize-none rounded border border-[var(--color-border-1)] bg-[var(--color-bg-0)] px-3 py-2 text-sm focus:border-[var(--color-accent)] focus:outline-none"
      />
      <div className="flex items-center gap-3">
        <label className="text-xs text-[var(--color-text-2)]">Agent:</label>
        <AgentSelector value={agent} onChange={setAgent} agents={installedAgents} />
        <label className="text-xs text-[var(--color-text-2)]">Mode:</label>
        <ModeSelector value={mode} onChange={setMode} />
      </div>
      {error && <div className="rounded bg-[var(--color-danger)]/10 px-3 py-2 text-sm text-[var(--color-danger)]">{error}</div>}
      <div className="flex justify-end gap-2">
        <button onClick={submit} disabled={submitting || !description.trim()}
          className="rounded bg-[var(--color-accent)] px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50">
          {submitting ? 'Creating…' : 'Create Task'}
        </button>
      </div>
    </div>
  )
}

// ===== Tab: List (Mode B) =====

function ListTab({ projectId, installedAgents, submitting, setSubmitting, error, setError, onCreated }: {
  projectId: string; installedAgents: AgentType[]; submitting: boolean
  setSubmitting: (v: boolean) => void; error: string | null; setError: (v: string | null) => void
  onCreated: () => void
}): React.JSX.Element {
  const [text, setText] = useState('')
  const [agent, setAgent] = useState<AgentType | ''>('')

  const submit = async (): Promise<void> => {
    if (!text.trim()) { setError('At least one task line is required'); return }
    setSubmitting(true); setError(null)
    try {
      // Parse lines: each line is a task, optional `> dep1, dep2` syntax for dependencies
      const lines = text.trim().split('\n').filter((l) => l.trim())
      const parsedTasks = lines.map((line) => {
        const depMatch = line.match(/^(.+?)\s*>\s*(.+)$/)
        if (depMatch) {
          return { title: depMatch[1].trim(), deps: depMatch[2].split(',').map((s) => s.trim()) }
        }
        return { title: line.trim(), deps: [] as string[] }
      }).filter((t) => t.title)

      // Create tasks one by one (first pass: create all)
      const createdIds: string[] = []
      for (const pt of parsedTasks) {
        const task = await window.orchflow.tasks.create({
          projectId, title: pt.title.slice(0, 80),
          mode: parsedTasks.length > 1 ? 'pipeline' : 'single',
          assignmentMode: 'auto', agentType: agent || undefined
        })
        createdIds.push(task.id)
      }

      // Second pass: add dependencies (by matching title to task index)
      const titleToId = new Map<string, string>()
      for (let i = 0; i < parsedTasks.length; i++) {
        titleToId.set(parsedTasks[i].title.toLowerCase(), createdIds[i])
      }
      for (let i = 0; i < parsedTasks.length; i++) {
        for (const depTitle of parsedTasks[i].deps) {
          const depId = titleToId.get(depTitle.toLowerCase())
          if (depId && depId !== createdIds[i]) {
            await window.orchflow.tasks.addDependency(createdIds[i], depId)
          }
        }
      }

      onCreated()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally { setSubmitting(false) }
  }

  return (
    <div className="space-y-3">
      <textarea
        value={text} onChange={(e) => setText(e.target.value)}
        rows={8} autoFocus
        placeholder={`One task per line. Use > for dependencies:\n\nAdd login form\nAdd signup page > Add login form\nWrite unit tests > Add login form, Add signup page`}
        className="w-full resize-none rounded border border-[var(--color-border-1)] bg-[var(--color-bg-0)] px-3 py-2 font-mono text-sm focus:border-[var(--color-accent)] focus:outline-none"
      />
      <p className="text-xs text-[var(--color-text-2)]">
        Syntax: <code className="rounded bg-[var(--color-bg-3)] px-1">task title &gt; dependency1, dependency2</code>
      </p>
      <div className="flex items-center gap-3">
        <label className="text-xs text-[var(--color-text-2)]">Agent:</label>
        <AgentSelector value={agent} onChange={setAgent} agents={installedAgents} />
      </div>
      {error && <div className="rounded bg-[var(--color-danger)]/10 px-3 py-2 text-sm text-[var(--color-danger)]">{error}</div>}
      <div className="flex justify-end gap-2">
        <button onClick={submit} disabled={submitting || !text.trim()}
          className="rounded bg-[var(--color-accent)] px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50">
          {submitting ? 'Creating…' : 'Create Tasks'}
        </button>
      </div>
    </div>
  )
}

// ===== Tab: Plan (Mode C) =====

function PlanTab({ projectId, installedAgents, submitting, setSubmitting, error, setError, onCreated }: {
  projectId: string; installedAgents: AgentType[]; submitting: boolean
  setSubmitting: (v: boolean) => void; error: string | null; setError: (v: string | null) => void
  onCreated: () => void
}): React.JSX.Element {
  const [goal, setGoal] = useState('')
  const [planJson, setPlanJson] = useState('')
  const [planningAgent, setPlanningAgent] = useState<AgentType>(installedAgents[0] ?? 'claude')
  const [step, setStep] = useState<'input' | 'review'>('input')

  const generatePlan = async (): Promise<void> => {
    if (!goal.trim()) { setError('Goal description is required'); return }
    setSubmitting(true); setError(null)
    try {
      const result = await window.orchflow.tasks.createFromPlan({
        projectId, goal: goal.trim(), planningAgent
      })
      // The planning session was started; the user needs to wait for it to complete
      // and then paste the JSON output. For now, switch to review mode.
      if (result.length > 0) {
        setStep('review')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally { setSubmitting(false) }
  }

  const createFromPlan = async (): Promise<void> => {
    if (!planJson.trim()) { setError('Plan JSON is required'); return }
    setSubmitting(true); setError(null)
    try {
      await window.orchflow.tasks.createFromPlan({
        projectId, goal: goal.trim(), planningAgent, planJson: planJson.trim()
      })
      onCreated()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally { setSubmitting(false) }
  }

  return (
    <div className="space-y-3">
      {step === 'input' ? (
        <>
          <div>
            <label className="mb-1 block text-xs text-[var(--color-text-2)]">Goal description</label>
            <textarea
              value={goal} onChange={(e) => setGoal(e.target.value)}
              rows={4} autoFocus
              placeholder="e.g., Refactor the authentication module to use JWT tokens instead of sessions"
              className="w-full resize-none rounded border border-[var(--color-border-1)] bg-[var(--color-bg-0)] px-3 py-2 text-sm focus:border-[var(--color-accent)] focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-3">
            <label className="text-xs text-[var(--color-text-2)]">Planning agent:</label>
            <AgentSelector value={planningAgent} onChange={(v) => v && setPlanningAgent(v)} agents={installedAgents} />
          </div>
          {error && <div className="rounded bg-[var(--color-danger)]/10 px-3 py-2 text-sm text-[var(--color-danger)]">{error}</div>}
          <div className="flex justify-end gap-2">
            <button onClick={generatePlan} disabled={submitting || !goal.trim()}
              className="rounded bg-[var(--color-accent)] px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50">
              {submitting ? 'Planning…' : 'Generate Plan'}
            </button>
          </div>
        </>
      ) : (
        <>
          <div>
            <label className="mb-1 block text-xs text-[var(--color-text-2)]">
              Paste the JSON plan output from the planning agent:
            </label>
            <textarea
              value={planJson} onChange={(e) => setPlanJson(e.target.value)}
              rows={8} autoFocus
              placeholder={`[{"title":"Set up JWT library","description":"Install jsonwebtoken..."},{"title":"Update auth middleware","description":"Replace session check..."}]`}
              className="w-full resize-none rounded border border-[var(--color-border-1)] bg-[var(--color-bg-0)] px-3 py-2 font-mono text-sm focus:border-[var(--color-accent)] focus:outline-none"
            />
          </div>
          <button onClick={() => setStep('input')} className="text-xs text-[var(--color-text-2)] hover:underline">
            ← Back to goal input
          </button>
          {error && <div className="rounded bg-[var(--color-danger)]/10 px-3 py-2 text-sm text-[var(--color-danger)]">{error}</div>}
          <div className="flex justify-end gap-2">
            <button onClick={createFromPlan} disabled={submitting || !planJson.trim()}
              className="rounded bg-[var(--color-accent)] px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50">
              {submitting ? 'Creating…' : 'Create Tasks from Plan'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// ===== Tab: Import (Mode D) =====

function ImportTab({ projectId, installedAgents, submitting, setSubmitting, error, setError, onCreated }: {
  projectId: string; installedAgents: AgentType[]; submitting: boolean
  setSubmitting: (v: boolean) => void; error: string | null; setError: (v: string | null) => void
  onCreated: () => void
}): React.JSX.Element {
  const [filePath, setFilePath] = useState('')
  const [format, setFormat] = useState<'markdown' | 'json' | 'text'>('markdown')
  const [agent, setAgent] = useState<AgentType | ''>('')

  const browse = async (): Promise<void> => {
    const path = await window.orchflow.dialog.openFile([
      { name: 'Task Files', extensions: ['md', 'json', 'txt'] }
    ])
    if (path) {
      setFilePath(path)
      if (path.endsWith('.json')) setFormat('json')
      else if (path.endsWith('.txt')) setFormat('text')
      else setFormat('markdown')
    }
  }

  const submit = async (): Promise<void> => {
    if (!filePath.trim()) { setError('Please select a file'); return }
    setSubmitting(true); setError(null)
    try {
      const input: TaskImportInput = {
        projectId, filePath: filePath.trim(), format,
        assignmentMode: 'auto', agentType: agent || undefined
      }
      await window.orchflow.tasks.importFromFile(input)
      onCreated()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally { setSubmitting(false) }
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-xs text-[var(--color-text-2)]">File path</label>
        <div className="flex gap-2">
          <input
            value={filePath} onChange={(e) => setFilePath(e.target.value)}
            placeholder="Select or paste path to .md, .json, or .txt file"
            className="flex-1 rounded border border-[var(--color-border-1)] bg-[var(--color-bg-0)] px-3 py-2 text-sm focus:border-[var(--color-accent)] focus:outline-none"
          />
          <button onClick={browse}
            className="rounded border border-[var(--color-border-1)] bg-[var(--color-bg-2)] px-3 py-2 text-sm hover:bg-[var(--color-bg-3)]">
            Browse…
          </button>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <label className="text-xs text-[var(--color-text-2)]">Format:</label>
        <select value={format} onChange={(e) => setFormat(e.target.value as 'markdown' | 'json' | 'text')}
          className="rounded border border-[var(--color-border-1)] bg-[var(--color-bg-0)] px-2 py-1.5 text-sm">
          <option value="markdown">Markdown</option>
          <option value="json">JSON</option>
          <option value="text">Plain text (one per line)</option>
        </select>
        <label className="text-xs text-[var(--color-text-2)]">Agent:</label>
        <AgentSelector value={agent} onChange={setAgent} agents={installedAgents} />
      </div>
      {error && <div className="rounded bg-[var(--color-danger)]/10 px-3 py-2 text-sm text-[var(--color-danger)]">{error}</div>}
      <div className="flex justify-end gap-2">
        <button onClick={submit} disabled={submitting || !filePath.trim()}
          className="rounded bg-[var(--color-accent)] px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50">
          {submitting ? 'Importing…' : 'Import Tasks'}
        </button>
      </div>
    </div>
  )
}
