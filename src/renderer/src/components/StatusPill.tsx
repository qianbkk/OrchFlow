import { ReactNode } from 'react'

export type StatusTone = 'accent' | 'accent2' | 'warn' | 'danger' | 'muted'

const TONE_CLASS: Record<StatusTone, string> = {
  accent: 'bg-[var(--color-accent)]/20 text-[var(--color-accent)]',
  accent2: 'bg-[var(--color-accent-2)]/20 text-[var(--color-accent-2)]',
  warn: 'bg-[var(--color-warn)]/20 text-[var(--color-warn)]',
  danger: 'bg-[var(--color-danger)]/20 text-[var(--color-danger)]',
  muted: 'bg-[var(--color-text-2)]/20 text-[var(--color-text-1)]'
}

interface StatusPillProps {
  tone: StatusTone
  children: ReactNode
}

/** Small rounded status indicator. */
export function StatusPill({ tone, children }: StatusPillProps): React.JSX.Element {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs ${TONE_CLASS[tone]}`}
    >
      {children}
    </span>
  )
}
