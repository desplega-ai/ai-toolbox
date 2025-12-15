import { Store } from '@tauri-apps/plugin-store'

interface SessionInfo {
  sessionId: string
  createdAt: number
  exited: boolean
}

// In-memory cache of active sessions per project path
const activeSessions = new Map<string, SessionInfo>()

let store: Store | null = null

async function getStore(): Promise<Store> {
  if (!store) {
    store = await Store.load('sessions.json')
  }
  return store
}

export async function getSessionForProject(projectPath: string): Promise<SessionInfo | null> {
  // Check in-memory cache first
  const cached = activeSessions.get(projectPath)
  if (cached && !cached.exited) {
    return cached
  }

  // Check persistent store
  try {
    const s = await getStore()
    const saved = await s.get<SessionInfo>(projectPath)
    if (saved && !saved.exited) {
      activeSessions.set(projectPath, saved)
      return saved
    }
  } catch (e) {
    console.error('[SessionStore] Error loading session:', e)
  }

  return null
}

export async function createSessionForProject(projectPath: string): Promise<SessionInfo> {
  const session: SessionInfo = {
    sessionId: `session-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    createdAt: Date.now(),
    exited: false,
  }

  activeSessions.set(projectPath, session)

  try {
    const s = await getStore()
    await s.set(projectPath, session)
    await s.save()
  } catch (e) {
    console.error('[SessionStore] Error saving session:', e)
  }

  return session
}

export async function markSessionExited(projectPath: string): Promise<void> {
  const session = activeSessions.get(projectPath)
  if (session) {
    session.exited = true
    activeSessions.set(projectPath, session)

    try {
      const s = await getStore()
      await s.set(projectPath, session)
      await s.save()
    } catch (e) {
      console.error('[SessionStore] Error updating session:', e)
    }
  }
}

export async function clearSessionForProject(projectPath: string): Promise<void> {
  activeSessions.delete(projectPath)

  try {
    const s = await getStore()
    await s.delete(projectPath)
    await s.save()
  } catch (e) {
    console.error('[SessionStore] Error clearing session:', e)
  }
}
