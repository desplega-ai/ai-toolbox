import { useEffect, useCallback, useState } from 'react'

type Pane = 'sidebar' | 'session' | 'thoughts'

const PANES: Pane[] = ['sidebar', 'session', 'thoughts']

export function useKeyboardNavigation() {
  const [focusedPane, setFocusedPane] = useState<Pane>('session')

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Skip if typing in an input
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
      return
    }

    // Cmd+[ and Cmd+] to cycle between panes (macOS style)
    if (e.metaKey && !e.altKey && !e.ctrlKey && !e.shiftKey) {
      if (e.key === '[') {
        e.preventDefault()
        setFocusedPane(prev => {
          const idx = PANES.indexOf(prev)
          return PANES[(idx - 1 + PANES.length) % PANES.length]
        })
      } else if (e.key === ']') {
        e.preventDefault()
        setFocusedPane(prev => {
          const idx = PANES.indexOf(prev)
          return PANES[(idx + 1) % PANES.length]
        })
      }
    }
  }, [])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  return { focusedPane, setFocusedPane }
}
