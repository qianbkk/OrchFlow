import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'

interface TerminalPaneProps {
  /** Resize trigger — increment to force fit+redraw */
  resizeKey?: number
  /** Ref-based input/output hook (consumed by parent for sending lines) */
  onReady?: (api: { write: (data: string) => void; writeln: (data: string) => void; clear: () => void }) => void
  className?: string
}

export function TerminalPane({ resizeKey, onReady, className }: TerminalPaneProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const onReadyRef = useRef(onReady)
  onReadyRef.current = onReady

  useEffect(() => {
    if (!containerRef.current) return

    const term = new Terminal({
      fontSize: 13,
      fontFamily: 'ui-monospace, "Cascadia Code", Consolas, "Courier New", monospace',
      theme: {
        background: '#0b1020',
        foreground: '#e6e9f2',
        cursor: '#7c8cff',
        selectionBackground: '#2a3658',
        black: '#111729',
        red: '#ef4444',
        green: '#5ed3a5',
        yellow: '#f5a524',
        blue: '#7c8cff',
        magenta: '#c084fc',
        cyan: '#67e8f9',
        white: '#e6e9f2',
        brightBlack: '#6c7795',
        brightRed: '#f87171',
        brightGreen: '#86efac',
        brightYellow: '#fbbf24',
        brightBlue: '#a5b4fc',
        brightMagenta: '#d8b4fe',
        brightCyan: '#a5f3fc',
        brightWhite: '#ffffff'
      },
      cursorBlink: true,
      convertEol: true,
      scrollback: 5000
    })
    const fit = new FitAddon()
    const webLinks = new WebLinksAddon()
    term.loadAddon(fit)
    term.loadAddon(webLinks)
    term.open(containerRef.current)

    // Initial fit
    try {
      fit.fit()
    } catch (err) {
      // xterm throws if container has 0 size
      console.warn('[TerminalPane] initial fit failed:', err)
    }

    termRef.current = term
    fitRef.current = fit

    if (onReadyRef.current) {
      onReadyRef.current({
        write: (d) => term.write(d),
        writeln: (d) => term.writeln(d),
        clear: () => term.clear()
      })
    }

    const onResize = (): void => {
      try {
        fit.fit()
      } catch (err) {
        // ignore
        void err
      }
    }
    window.addEventListener('resize', onResize)
    const ro = new ResizeObserver(onResize)
    ro.observe(containerRef.current)

    return () => {
      window.removeEventListener('resize', onResize)
      ro.disconnect()
      term.dispose()
      termRef.current = null
      fitRef.current = null
    }
  }, [])

  // Force re-fit on resizeKey change
  useEffect(() => {
    if (fitRef.current) {
      try {
        fitRef.current.fit()
      } catch (err) {
        void err
      }
    }
  }, [resizeKey])

  return <div ref={containerRef} className={`h-full w-full overflow-hidden ${className ?? ''}`} />
}
