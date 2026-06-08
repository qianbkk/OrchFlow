import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/** Catches rendering errors in child components and shows a recovery UI
 *  instead of a white screen. Users can retry or reload the app. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ErrorBoundary] caught:', error, info.componentStack)
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-4 bg-[var(--color-bg-1)] p-8">
          <h2 className="text-lg font-semibold text-[var(--color-danger)]">Something went wrong</h2>
          <pre className="max-h-48 max-w-lg overflow-auto rounded bg-[var(--color-bg-0)] p-3 text-xs text-[var(--color-text-2)]">
            {this.state.error.message}
          </pre>
          <div className="flex gap-2">
            <button
              onClick={() => this.setState({ error: null })}
              className="rounded border border-[var(--color-border-1)] bg-[var(--color-bg-2)] px-4 py-2 text-sm hover:bg-[var(--color-bg-3)]"
            >
              Retry
            </button>
            <button
              onClick={() => window.location.reload()}
              className="rounded bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              Reload App
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
