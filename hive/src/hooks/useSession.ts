import { useState, useCallback } from 'react'
import { startSession, resumeSession, type SessionState, type ClaudeMessage } from '../lib/claude-session'

export function useSession(projectPath: string | null) {
  const [state, setState] = useState<SessionState>({
    sessionId: null,
    messages: [],
    isRunning: false,
    error: null
  })

  const sendMessage = useCallback(async (prompt: string) => {
    if (!projectPath) return

    setState(prev => ({
      ...prev,
      isRunning: true,
      error: null
    }))

    const callbacks = {
      onMessage: (message: ClaudeMessage) => {
        setState(prev => ({
          ...prev,
          messages: [...prev.messages, message]
        }))
      },
      onSessionId: (id: string) => {
        setState(prev => ({
          ...prev,
          sessionId: id
        }))
      },
      onError: (error: Error) => {
        setState(prev => ({
          ...prev,
          isRunning: false,
          error: error.message
        }))
      },
      onComplete: () => {
        setState(prev => ({
          ...prev,
          isRunning: false
        }))
      }
    }

    if (state.sessionId) {
      await resumeSession(state.sessionId, prompt, callbacks)
    } else {
      await startSession(projectPath, prompt, callbacks)
    }
  }, [projectPath, state.sessionId])

  const clearSession = useCallback(() => {
    setState({
      sessionId: null,
      messages: [],
      isRunning: false,
      error: null
    })
  }, [])

  return {
    ...state,
    sendMessage,
    clearSession
  }
}
