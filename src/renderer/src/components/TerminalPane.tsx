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
  /** In interactive mode: forward each xterm keystroke to the parent so it
   *  can be piped back to the PTY via IPC. */
  onData?: (data: string) => void
  /** In interactive mode: notify parent when the terminal resizes (so the
   *  PTY can update COLUMNS/LINES). */
  onResize?: (cols: number, rows: number) => void
  /** Whether the terminal is displayed in fullscreen mode (CSS fixed overlay).
   *  The terminal DOM element stays the same — only its position changes. */
  fullscreen?: boolean
  className?: string
}

export function TerminalPane({
  resizeKey,
  onReady,
  onData,
  onResize,
  fullscreen,
  className
}: TerminalPaneProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const onReadyRef = useRef(onReady)
  const onDataRef = useRef(onData)
  const onResizeRef = useRef(onResize)
  onReadyRef.current = onReady
  onDataRef.current = onData
  onResizeRef.current = onResize

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

    // Forward keystrokes to parent (used in interactive mode)
    term.onData((data: string) => {
      onDataRef.current?.(data)
    })

    // Helper: fit the terminal to its container and notify the parent of
    // the new (cols, rows). Centralizes the try/catch that appears in
    // initial fit, window resize, resizeKey change, and fullscreen toggle.
    const refit = (): void => {
      try {
        fit.fit()
        onResizeRef.current?.(term.cols, term.rows)
      } catch (err) {
        // xterm throws if the container has zero size (e.g. during layout);
        // safe to ignore — a subsequent fit will succeed.
        void err
      }
    }

    refit()

    termRef.current = term
    fitRef.current = fit

    if (onReadyRef.current) {
      onReadyRef.current({
        write: (d) => term.write(d),
        writeln: (d) => term.writeln(d),
        clear: () => term.clear()
      })
    }

    window.addEventListener('resize', refit)
    const ro = new ResizeObserver(refit)
    ro.observe(containerRef.current)

    return () => {
      window.removeEventListener('resize', refit)
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
        if (termRef.current) onResizeRef.current?.(termRef.current.cols, termRef.current.rows)
      } catch (err) {
        void err
      }
    }
  }, [resizeKey])

  // Re-fit when entering/exiting fullscreen
  useEffect(() => {
    if (!fitRef.current) return undefined
    // Small delay to let CSS transition settle before fitting
    const t = setTimeout(() => {
      try {
        fitRef.current?.fit()
        if (termRef.current) onResizeRef.current?.(termRef.current.cols, termRef.current.rows)
      } catch (err) {
        void err
      }
    }, 50)
    return () => clearTimeout(t)
  }, [fullscreen])

  return (
    <div
      ref={containerRef}
      className={
        fullscreen
          ? 'fixed inset-0 z-40 h-full w-full bg-[#0b1020]'
          : `h-full w-full overflow-hidden ${className ?? ''}`
      }
    />
  )
}
