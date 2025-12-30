import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Project, Session, ClaudeModel, PermissionMode, Preferences } from '../../shared/types';
import type { SDKMessage } from '../../shared/sdk-types';

interface ThemeState {
  theme: 'light' | 'dark' | 'system';
  resolvedTheme: 'light' | 'dark';
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'system',
      resolvedTheme: 'light',
      setTheme: (theme) => {
        const resolvedTheme =
          theme === 'system'
            ? window.matchMedia('(prefers-color-scheme: dark)').matches
              ? 'dark'
              : 'light'
            : theme;

        // Apply to document
        document.documentElement.classList.toggle('dark', resolvedTheme === 'dark');

        set({ theme, resolvedTheme });
      },
    }),
    {
      name: 'hive-theme',
    }
  )
);

// Initialize theme on load
export function initializeTheme() {
  const store = useThemeStore.getState();
  store.setTheme(store.theme);

  // Listen for system theme changes
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    const currentStore = useThemeStore.getState();
    if (currentStore.theme === 'system') {
      currentStore.setTheme('system');
    }
  });
}

// Preferences store for reactive preference access
interface PreferencesState {
  hideBackfilledSessions: boolean;
  setHideBackfilledSessions: (hide: boolean) => void;
  loadFromPreferences: (prefs: Partial<Preferences>) => void;
}

export const usePreferencesStore = create<PreferencesState>((set) => ({
  hideBackfilledSessions: false,
  setHideBackfilledSessions: (hide) => set({ hideBackfilledSessions: hide }),
  loadFromPreferences: (prefs) => set({
    hideBackfilledSessions: prefs.hideBackfilledSessions ?? false,
  }),
}));

// Initialize preferences from main process
export async function initializePreferences() {
  try {
    const prefs = await window.electronAPI.invoke<Preferences>('preferences:get');
    usePreferencesStore.getState().loadFromPreferences(prefs);
  } catch (e) {
    console.error('Failed to load preferences:', e);
  }
}

// App state store
interface AppState {
  projects: Project[];
  currentProject: Project | null;
  sessions: Session[];
  currentSession: Session | null;
  setProjects: (projects: Project[]) => void;
  setCurrentProject: (project: Project | null) => void;
  setSessions: (sessions: Session[]) => void;
  setCurrentSession: (session: Session | null) => void;
  updateSessionStatus: (sessionId: string, status: Session['status']) => void;
  updateSessionModel: (sessionId: string, model: ClaudeModel) => void;
  updateSessionPermissionMode: (sessionId: string, mode: PermissionMode, expiresAt: number | null) => void;
  updateSessionName: (sessionId: string, name: string) => void;
  updateSessionClaudeSessionId: (sessionId: string, claudeSessionId: string) => void;
  updateSessionActionType: (sessionId: string, actionType: Session['actionType']) => void;
}

export const useAppStore = create<AppState>((set) => ({
  projects: [],
  currentProject: null,
  sessions: [],
  currentSession: null,
  setProjects: (projects) => set({ projects }),
  setCurrentProject: (currentProject) => set({ currentProject }),
  setSessions: (sessions) => set({ sessions }),
  setCurrentSession: (currentSession) => set({ currentSession }),
  updateSessionStatus: (sessionId, status) => set((state) => ({
    sessions: state.sessions.map((s) =>
      s.id === sessionId ? { ...s, status } : s
    ),
    currentSession: state.currentSession?.id === sessionId
      ? { ...state.currentSession, status }
      : state.currentSession,
  })),
  updateSessionModel: (sessionId, model) => set((state) => ({
    sessions: state.sessions.map((s) =>
      s.id === sessionId ? { ...s, model } : s
    ),
    currentSession: state.currentSession?.id === sessionId
      ? { ...state.currentSession, model }
      : state.currentSession,
  })),
  updateSessionPermissionMode: (sessionId, mode, expiresAt) => set((state) => ({
    sessions: state.sessions.map((s) =>
      s.id === sessionId ? { ...s, permissionMode: mode, permissionExpiresAt: expiresAt } : s
    ),
    currentSession: state.currentSession?.id === sessionId
      ? { ...state.currentSession, permissionMode: mode, permissionExpiresAt: expiresAt }
      : state.currentSession,
  })),
  updateSessionName: (sessionId, name) => set((state) => ({
    sessions: state.sessions.map((s) =>
      s.id === sessionId ? { ...s, name } : s
    ),
    currentSession: state.currentSession?.id === sessionId
      ? { ...state.currentSession, name }
      : state.currentSession,
  })),
  updateSessionClaudeSessionId: (sessionId, claudeSessionId) => set((state) => ({
    sessions: state.sessions.map((s) =>
      s.id === sessionId ? { ...s, claudeSessionId } : s
    ),
    currentSession: state.currentSession?.id === sessionId
      ? { ...state.currentSession, claudeSessionId }
      : state.currentSession,
  })),
  updateSessionActionType: (sessionId, actionType) => set((state) => ({
    sessions: state.sessions.map((s) =>
      s.id === sessionId ? { ...s, actionType, updatedAt: Date.now() } : s
    ),
    currentSession: state.currentSession?.id === sessionId
      ? { ...state.currentSession, actionType, updatedAt: Date.now() }
      : state.currentSession,
  })),
}));

// Draft interface
interface Draft {
  id: string;
  projectId: string;
  sessionId: string | null; // null for project-level drafts
  text: string;
  createdAt: number;
  updatedAt: number;
}

// Drafts store - persisted to localStorage
interface DraftsState {
  drafts: Draft[];
  // Get draft for a specific session
  getDraftForSession: (sessionId: string) => Draft | undefined;
  // Get all drafts for a project
  getDraftsForProject: (projectId: string) => Draft[];
  // Save or update a draft
  saveDraft: (projectId: string, sessionId: string | null, text: string) => void;
  // Delete a draft
  deleteDraft: (sessionId: string) => void;
  // Clear empty drafts
  clearEmptyDrafts: () => void;
}

export const useDraftsStore = create<DraftsState>()(
  persist(
    (set, get) => ({
      drafts: [],
      getDraftForSession: (sessionId) => {
        return get().drafts.find(d => d.sessionId === sessionId);
      },
      getDraftsForProject: (projectId) => {
        return get().drafts.filter(d => d.projectId === projectId && d.text.trim());
      },
      saveDraft: (projectId, sessionId, text) => {
        set((state) => {
          const existingIndex = state.drafts.findIndex(d => d.sessionId === sessionId);
          const now = Date.now();

          if (existingIndex >= 0) {
            // Update existing draft
            const updated = [...state.drafts];
            updated[existingIndex] = {
              ...updated[existingIndex],
              text,
              updatedAt: now,
            };
            return { drafts: updated };
          } else if (text.trim()) {
            // Create new draft only if there's text
            const newDraft: Draft = {
              id: `draft-${now}`,
              projectId,
              sessionId,
              text,
              createdAt: now,
              updatedAt: now,
            };
            return { drafts: [...state.drafts, newDraft] };
          }
          return state;
        });
      },
      deleteDraft: (sessionId) => {
        set((state) => ({
          drafts: state.drafts.filter(d => d.sessionId !== sessionId),
        }));
      },
      clearEmptyDrafts: () => {
        set((state) => ({
          drafts: state.drafts.filter(d => d.text.trim()),
        }));
      },
    }),
    {
      name: 'hive-drafts',
    }
  )
);

// Session messages store - in-memory cache, loaded from ~/.claude JSONL files
interface SessionMessagesState {
  messagesBySession: Record<string, SDKMessage[]>;
  streamingTextBySession: Record<string, string>;
  loadedSessions: Set<string>; // Track which sessions have been loaded from JSONL
  addMessage: (sessionId: string, message: SDKMessage) => void;
  setMessages: (sessionId: string, messages: SDKMessage[]) => void;
  appendStreamingText: (sessionId: string, text: string) => void;
  clearStreamingText: (sessionId: string) => void;
  clearSession: (sessionId: string) => void;
  markLoaded: (sessionId: string) => void;
  isLoaded: (sessionId: string) => boolean;
}

export const useSessionMessagesStore = create<SessionMessagesState>((set, get) => ({
  messagesBySession: {},
  streamingTextBySession: {},
  loadedSessions: new Set(),
  addMessage: (sessionId, message) => set((state) => {
    const existingMessages = state.messagesBySession[sessionId] || [];

    // Check for duplicate by uuid (for tool_use messages)
    const msgUuid = (message as { uuid?: string }).uuid;
    let newMessages: SDKMessage[];

    if (msgUuid) {
      // If message has a uuid, replace existing message with same uuid (for updates)
      const existingIndex = existingMessages.findIndex(
        (m) => (m as { uuid?: string }).uuid === msgUuid
      );
      if (existingIndex >= 0) {
        // Replace existing message but preserve original timestamp for ordering
        const existingTimestamp = (existingMessages[existingIndex] as { timestamp?: string }).timestamp;
        const updatedMessage = {
          ...message,
          timestamp: existingTimestamp || (message as { timestamp?: string }).timestamp || new Date().toISOString(),
        };
        newMessages = [...existingMessages];
        newMessages[existingIndex] = updatedMessage;
      } else {
        // New message - add timestamp if missing
        const messageWithTimestamp = (message as { timestamp?: string }).timestamp
          ? message
          : { ...message, timestamp: new Date().toISOString() };
        newMessages = [...existingMessages, messageWithTimestamp];
      }
    } else {
      // No uuid - just add with timestamp
      const messageWithTimestamp = (message as { timestamp?: string }).timestamp
        ? message
        : { ...message, timestamp: new Date().toISOString() };
      newMessages = [...existingMessages, messageWithTimestamp];
    }

    // Sort messages by timestamp to maintain correct order
    newMessages.sort((a, b) => {
      const aTime = (a as { timestamp?: string }).timestamp || '';
      const bTime = (b as { timestamp?: string }).timestamp || '';
      return aTime.localeCompare(bTime);
    });

    return {
      messagesBySession: {
        ...state.messagesBySession,
        [sessionId]: newMessages,
      },
    };
  }),
  setMessages: (sessionId, messages) => set((state) => ({
    messagesBySession: {
      ...state.messagesBySession,
      [sessionId]: messages,
    },
  })),
  appendStreamingText: (sessionId, text) => set((state) => ({
    streamingTextBySession: {
      ...state.streamingTextBySession,
      [sessionId]: (state.streamingTextBySession[sessionId] || '') + text,
    },
  })),
  clearStreamingText: (sessionId) => set((state) => ({
    streamingTextBySession: {
      ...state.streamingTextBySession,
      [sessionId]: '',
    },
  })),
  clearSession: (sessionId) => set((state) => {
    const { [sessionId]: _, ...restMessages } = state.messagesBySession;
    const { [sessionId]: __, ...restStreaming } = state.streamingTextBySession;
    const newLoadedSessions = new Set(state.loadedSessions);
    newLoadedSessions.delete(sessionId);
    return {
      messagesBySession: restMessages,
      streamingTextBySession: restStreaming,
      loadedSessions: newLoadedSessions,
    };
  }),
  markLoaded: (sessionId) => set((state) => {
    const newLoadedSessions = new Set(state.loadedSessions);
    newLoadedSessions.add(sessionId);
    return { loadedSessions: newLoadedSessions };
  }),
  isLoaded: (sessionId) => get().loadedSessions.has(sessionId),
}));

// File Viewer store - for viewing files in split pane
interface FileViewerFile {
  path: string;
  line?: number;
}

interface FileViewerState {
  openFile: FileViewerFile | null;
  setOpenFile: (file: FileViewerFile | null) => void;
  closeFile: () => void;
}

export const useFileViewerStore = create<FileViewerState>((set) => ({
  openFile: null,
  setOpenFile: (file) => set({ openFile: file }),
  closeFile: () => set({ openFile: null }),
}));
