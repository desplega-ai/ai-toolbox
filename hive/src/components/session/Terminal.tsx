import { useEffect, useRef, useLayoutEffect, useState } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import { invoke } from '@tauri-apps/api/core'
import { listen, UnlistenFn } from '@tauri-apps/api/event'
import '@xterm/xterm/css/xterm.css'

interface Props {
  sessionId: string
  cwd: string
  resumeSession?: string
  onExit?: (code: number | null) => void
}

interface PtyOutput {
  session_id: string
  data: string
}

interface PtyExit {
  session_id: string
  code: number | null
}

export function Terminal({ sessionId, cwd, resumeSession, onExit }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<XTerm | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const [ready, setReady] = useState(false)

  // Initialize terminal
  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return

    container.innerHTML = ''

    const terminal = new XTerm({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: '"Hack Nerd Font Mono", "Hack Nerd Font", ui-monospace, "SF Mono", Menlo, Monaco, Consolas, monospace',
      scrollback: 1000,
      theme: {
        background: '#1a1d23',
        foreground: '#e4e4e4',
        cursor: '#e4e4e4',
        cursorAccent: '#1a1d23',
        selectionBackground: '#3a3d43',
        black: '#1a1d23',
        red: '#ff6b6b',
        green: '#69db7c',
        yellow: '#ffd43b',
        blue: '#74c0fc',
        magenta: '#da77f2',
        cyan: '#66d9e8',
        white: '#e4e4e4',
        brightBlack: '#5c6370',
        brightRed: '#ff8787',
        brightGreen: '#8ce99a',
        brightYellow: '#ffe066',
        brightBlue: '#91d5ff',
        brightMagenta: '#e599f7',
        brightCyan: '#99e9f2',
        brightWhite: '#ffffff',
      },
    })

    const fitAddon = new FitAddon()
    const unicode11Addon = new Unicode11Addon()
    terminal.loadAddon(fitAddon)
    terminal.loadAddon(unicode11Addon)
    terminal.unicode.activeVersion = '11'
    terminal.open(container)

    terminalRef.current = terminal
    fitAddonRef.current = fitAddon

    // Fit after a frame to ensure layout is complete
    requestAnimationFrame(() => {
      try {
        fitAddon.fit()
        console.log('[Terminal] Fit complete:', terminal.cols, 'x', terminal.rows)
        setReady(true)
      } catch (e) {
        console.error('[Terminal] Fit error:', e)
      }
    })

    return () => {
      terminal.dispose()
    }
  }, [])

  // Handle PTY connection after terminal is ready
  useEffect(() => {
    if (!ready) return

    const terminal = terminalRef.current
    const fitAddon = fitAddonRef.current
    if (!terminal || !fitAddon) return

    // Handle user input
    const disposeOnData = terminal.onData((data) => {
      invoke('write_to_pty', { sessionId, data }).catch(console.error)
    })

    // Handle resize with debounce
    let resizeTimeout: number | null = null
    let lastCols = terminal.cols
    let lastRows = terminal.rows

    const handleResize = () => {
      if (resizeTimeout) {
        clearTimeout(resizeTimeout)
      }
      resizeTimeout = window.setTimeout(() => {
        try {
          fitAddon.fit()
          // Only send resize if dimensions actually changed
          if (terminal.cols !== lastCols || terminal.rows !== lastRows) {
            lastCols = terminal.cols
            lastRows = terminal.rows
            console.log('[Terminal] Resize:', terminal.cols, 'x', terminal.rows)
            invoke('resize_pty', {
              sessionId,
              rows: terminal.rows,
              cols: terminal.cols,
            }).catch(console.error)
          }
        } catch {
          // Ignore
        }
      }, 100)
    }

    const container = containerRef.current
    const resizeObserver = new ResizeObserver(handleResize)
    if (container) {
      resizeObserver.observe(container)
    }

    // Create PTY session
    console.log('[Terminal] Creating PTY:', terminal.cols, 'x', terminal.rows)
    invoke('create_pty_session', {
      request: {
        session_id: sessionId,
        cwd,
        rows: terminal.rows,
        cols: terminal.cols,
        resume_session: resumeSession || null,
      },
    }).then(() => {
      console.log('[Terminal] PTY created')
    }).catch((err) => {
      console.error('[Terminal] PTY error:', err)
      terminal.writeln(`\x1b[31mError: ${err}\x1b[0m`)
    })

    // Listen for PTY output
    let unlistenOutput: UnlistenFn | null = null
    let unlistenExit: UnlistenFn | null = null

    listen<PtyOutput>('pty-output', (event) => {
      if (event.payload.session_id === sessionId) {
        terminal.write(event.payload.data)
      }
    }).then((unlisten) => {
      unlistenOutput = unlisten
    })

    listen<PtyExit>('pty-exit', (event) => {
      if (event.payload.session_id === sessionId) {
        terminal.writeln(`\r\n\x1b[90m[Exited: ${event.payload.code}]\x1b[0m`)
        onExit?.(event.payload.code)
      }
    }).then((unlisten) => {
      unlistenExit = unlisten
    })

    return () => {
      if (resizeTimeout) clearTimeout(resizeTimeout)
      disposeOnData.dispose()
      unlistenOutput?.()
      unlistenExit?.()
      resizeObserver.disconnect()
      invoke('close_pty_session', { sessionId }).catch(console.error)
    }
  }, [ready, sessionId, cwd, resumeSession, onExit])

  return (
    <div style={{ width: '100%', height: '100%', padding: '8px', backgroundColor: '#1a1d23', boxSizing: 'border-box' }}>
      <div
        ref={containerRef}
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  )
}
