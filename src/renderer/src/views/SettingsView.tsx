import { useEffect, useState } from 'react'
import type { DetectedAgent } from '@shared/types'
import { AGENT_DEFAULTS } from '@shared/constants'
import { StatusPill } from '../components/StatusPill'

interface ApiKeyFieldProps {
  agentType: string
}

function ApiKeyField({ agentType }: ApiKeyFieldProps): React.JSX.Element {
  const [hasKey, setHasKey] = useState(false)
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  const refresh = async (): Promise<void> => {
    const hasKey = await window.orchflow.settings.apiKeyExists(agentType)
    setHasKey(hasKey)
  }

  useEffect(() => {
    void refresh()
  }, [agentType])

  const save = async (): Promise<void> => {
    if (!value) return
    setStatus('saving')
    setError(null)
    try {
      await window.orchflow.settings.set(`apiKey:${agentType}`, value)
      setValue('')
      setEditing(false)
      setStatus('saved')
      await refresh()
      setTimeout(() => setStatus('idle'), 1500)
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const remove = async (): Promise<void> => {
    setStatus('saving')
    setError(null)
    try {
      await window.orchflow.settings.set(`apiKey:${agentType}`, '')
      await refresh()
      setStatus('idle')
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-2">
        {hasKey ? (
          <>
            <span className="text-xs text-[var(--color-text-2)]">API key configured</span>
            <button
              onClick={() => setEditing(true)}
              className="rounded border border-[var(--color-border-1)] bg-[var(--color-bg-0)] px-2 py-0.5 text-xs hover:bg-[var(--color-bg-3)]"
            >
              Replace
            </button>
            <button
              onClick={remove}
              className="rounded border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 px-2 py-0.5 text-xs text-[var(--color-danger)] hover:bg-[var(--color-danger)]/20"
            >
              Remove
            </button>
          </>
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="rounded bg-[var(--color-accent)] px-3 py-0.5 text-xs font-medium text-white"
          >
            Set API key
          </button>
        )}
        {status === 'saved' && <span className="text-xs text-[var(--color-accent-2)]">✓</span>}
      </div>
    )
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <input
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Paste new API key"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter') void save()
            if (e.key === 'Escape') {
              setValue('')
              setEditing(false)
            }
          }}
          className="flex-1 rounded border border-[var(--color-border-1)] bg-[var(--color-bg-0)] px-2 py-1 text-sm focus:border-[var(--color-accent)] focus:outline-none"
        />
        <button
          onClick={save}
          disabled={status === 'saving' || !value}
          className="rounded bg-[var(--color-accent)] px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
        >
          {status === 'saving' ? 'Saving…' : 'Save'}
        </button>
        <button
          onClick={() => {
            setValue('')
            setEditing(false)
            setError(null)
          }}
          className="rounded border border-[var(--color-border-1)] bg-[var(--color-bg-0)] px-2 py-1 text-xs hover:bg-[var(--color-bg-3)]"
        >
          Cancel
        </button>
      </div>
      {error && <p className="text-xs text-[var(--color-danger)]">{error}</p>}
    </div>
  )
}

export function SettingsView(): React.JSX.Element {
  const [agents, setAgents] = useState<DetectedAgent[]>([])

  useEffect(() => {
    void window.orchflow.agents.detectInstalled().then(setAgents)
  }, [])

  return (
    <div className="h-full overflow-auto p-6">
      <h2 className="mb-4 text-lg font-semibold">Settings</h2>

      <section className="mb-6">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-2)]">
          Agent CLIs
        </h3>
        <div className="space-y-3">
          {(['claude', 'codex', 'copilot'] as const).map((type) => {
            const det = agents.find((a) => a.type === type)
            return (
              <div
                key={type}
                className="rounded-lg border border-[var(--color-border-1)] bg-[var(--color-bg-2)] p-4"
              >
                <div className="mb-2 flex items-center justify-between">
                  <div>
                    <div className="font-medium">{AGENT_DEFAULTS[type].displayName}</div>
                    <div className="text-xs text-[var(--color-text-2)]">
                      Package: <code>{AGENT_DEFAULTS[type].package}</code>
                    </div>
                    {det?.path && (
                      <div className="text-xs text-[var(--color-text-2)]">
                        Detected: <code>{det.path}</code> {det.version && `(v${det.version})`}
                      </div>
                    )}
                  </div>
                  <StatusPill tone={det?.installed ? 'accent2' : 'danger'}>
                    {det?.installed ? 'installed' : 'missing'}
                  </StatusPill>
                </div>
                <ApiKeyField agentType={type} />
              </div>
            )
          })}
        </div>
      </section>

      <p className="text-xs text-[var(--color-text-2)]">
        API keys are stored securely in Windows Credential Manager via keytar, never on disk.
      </p>
    </div>
  )
}
