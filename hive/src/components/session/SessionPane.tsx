import { useState, useCallback, useEffect, useRef } from 'react'
import { Terminal } from './Terminal'
import { getSessionForProject, createSessionForProject, markSessionExited } from '../../lib/session-store'
import type { WorkingDirectory } from '../../lib/types'

interface Props {
  workingDir: WorkingDirectory | null
}

interface SessionState {
  sessionId: string
  exited: boolean
}

export function SessionPane({ workingDir }: Props) {
  const [session, setSession] = useState<SessionState | null>(null)
  const [loading, setLoading] = useState(false)
  const currentPathRef = useRef<string | null>(null)

  // Load or clear session when project changes
  useEffect(() => {
    if (!workingDir) {
      setSession(null)
      currentPathRef.current = null
      return
    }

    // If we're switching to a different project, clear current session display
    if (currentPathRef.current !== workingDir.path) {
      setSession(null)
      currentPathRef.current = workingDir.path
    }

    // Check if there's an existing session for this project
    getSessionForProject(workingDir.path).then((existingSession) => {
      if (existingSession && currentPathRef.current === workingDir.path) {
        setSession({
          sessionId: existingSession.sessionId,
          exited: existingSession.exited,
        })
      }
    })
  }, [workingDir])

  const startSession = useCallback(async () => {
    if (!workingDir) return

    setLoading(true)
    try {
      const newSession = await createSessionForProject(workingDir.path)
      setSession({
        sessionId: newSession.sessionId,
        exited: false,
      })
    } finally {
      setLoading(false)
    }
  }, [workingDir])

  const handleExit = useCallback((_code: number | null) => {
    if (workingDir) {
      markSessionExited(workingDir.path)
    }
    setSession((prev) => prev ? { ...prev, exited: true } : null)
  }, [workingDir])

  if (!workingDir) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-900 text-gray-400">
        Open a folder to start a Claude session
      </div>
    )
  }

  if (!session) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-gray-900 text-gray-400 gap-4">
        <div className="text-center">
          <h2 className="text-lg font-medium text-gray-200 mb-2">{workingDir.name}</h2>
          <p className="text-sm text-gray-500">{workingDir.path}</p>
        </div>
        <button
          onClick={startSession}
          disabled={loading}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors font-medium disabled:opacity-50"
        >
          {loading ? 'Starting...' : 'Start Claude Session'}
        </button>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-gray-900">
      <div className="px-3 py-2 border-b border-gray-700 flex items-center justify-between bg-gray-800">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${session.exited ? 'bg-gray-500' : 'bg-green-500'}`} />
          <span className="text-sm font-medium">{workingDir.name}</span>
        </div>
        <div className="flex items-center gap-2">
          {session.exited && (
            <button
              onClick={startSession}
              disabled={loading}
              className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-500 disabled:opacity-50"
            >
              New Session
            </button>
          )}
          <span className="text-xs text-gray-500">{session.sessionId.slice(0, 16)}...</span>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        <Terminal
          key={session.sessionId}
          sessionId={session.sessionId}
          cwd={workingDir.path}
          onExit={handleExit}
        />
      </div>
    </div>
  )
}
