import { useEffect, useState } from 'react'
import type { DetectedAgent } from '@shared/types'
import { AGENT_DEFAULTS } from '@shared/constants'

interface ApiKeyFieldProps {
  agentType: string
}

function ApiKeyField({ agentType }: ApiKeyFieldProps): React.JSX.Element {
  const [value, setValue] = useState('')
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle')

  useEffect(() => {
    void window.orchflow.settings.get(`apiKey:${agentType}`).then((v: unknown) => {
      if (typeof v === 'string' && v) setValue('••••••••')
    })
  }, [agentType])

  const save = async (): Promise<void> => {
    if (!value || value === '••••••••') return
    setStatus('saving')
    await window.orchflow.settings.set(`apiKey:${agentType}`, value)
    setValue('••••••••')
    setStatus('saved')
    setTimeout(() => setStatus('idle'), 1500)
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="password"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Enter API key"
        className="flex-1 rounded border border-[var(--color-border-1)] bg-[var(--color-bg-0)] px-2 py-1 text-sm focus:border-[var(--color-accent)] focus:outline-none"
      />
      <button
        onClick={save}
        disabled={status === 'saving' || !value || value === '••••••••'}
        className="rounded bg-[var(--color-accent)] px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
      >
        {status === 'saving' ? '…' : status === 'saved' ? '✓' : 'Save'}
      </button>
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
            const def = AGENT_DEFAULTS[type]
            const det = agents.find((a) => a.type === type)
            return (
              <div
                key={type}
                className="rounded-lg border border-[var(--color-border-1)] bg-[var(--color-bg-2)] p-4"
              >
                <div className="mb-2 flex items-center justify-between">
                  <div>
                    <div className="font-medium">{def.displayName}</div>
                    <div className="text-xs text-[var(--color-text-2)]">
                      Package: <code>{def.package}</code>
                    </div>
                    {det?.path && (
                      <div className="text-xs text-[var(--color-text-2)]">
                        Detected: <code>{det.path}</code> {det.version && `(v${det.version})`}
                      </div>
                    )}
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      det?.installed
                        ? 'bg-[var(--color-accent-2)]/20 text-[var(--color-accent-2)]'
                        : 'bg-[var(--color-danger)]/20 text-[var(--color-danger)]'
                    }`}
                  >
                    {det?.installed ? 'installed' : 'missing'}
                  </span>
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
