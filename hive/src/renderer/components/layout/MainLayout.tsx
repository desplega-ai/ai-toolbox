import React from 'react';
import { Panel, PanelGroup, PanelResizeHandle, type ImperativePanelHandle } from 'react-resizable-panels';
import { TopBar } from './TopBar';
import { Sidebar } from './Sidebar';
import { usePreferencesStore } from '@/lib/store';
import type { Tab, TabsState, Project, Session, ClaudeModel, PermissionMode } from '../../../shared/types';
import type { PermissionRequest } from '../../../shared/sdk-types';

interface TabState {
  project: Project | null;
  session: Session | null;
  sessions: Session[];
}

interface MainLayoutProps {
  children: React.ReactNode;
}

const DEFAULT_TABS_STATE: TabsState = {
  tabs: [{ id: '1', title: 'Start', projectId: null, sessionId: null }],
  activeTabId: '1',
};

export function MainLayout({ children }: MainLayoutProps) {
  const [tabs, setTabs] = React.useState<Tab[]>(DEFAULT_TABS_STATE.tabs);
  const [activeTabId, setActiveTabId] = React.useState(DEFAULT_TABS_STATE.activeTabId);
  const [isLoaded, setIsLoaded] = React.useState(false);

  // Each tab has its own state
  const [tabStates, setTabStates] = React.useState<Record<string, TabState>>({});

  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false);
  const sidebarPanelRef = React.useRef<ImperativePanelHandle>(null);
  const [editingTabId, setEditingTabId] = React.useState<string | null>(null);
  // Track pending approval counts per session
  const [pendingApprovalCounts, setPendingApprovalCounts] = React.useState<Record<string, number>>({});
  // Get hideBackfilledSessions preference
  const hideBackfilledSessions = usePreferencesStore((state) => state.hideBackfilledSessions);

  // Get current tab's state
  const currentTabState = tabStates[activeTabId] || { project: null, session: null, sessions: [] };

  // Listen for session status updates globally
  React.useEffect(() => {
    const unsubStatus = window.electronAPI.on('session:status', (data: unknown) => {
      const { sessionId, status } = data as { sessionId: string; status: Session['status'] };

      // Update session status in all tab states that have this session
      setTabStates(prev => {
        const updated: Record<string, TabState> = {};
        for (const [tabId, tabState] of Object.entries(prev)) {
          const updatedSessions = tabState.sessions.map(s =>
            s.id === sessionId ? { ...s, status, updatedAt: Date.now() } : s
          );
          const updatedSession = tabState.session?.id === sessionId
            ? { ...tabState.session, status, updatedAt: Date.now() }
            : tabState.session;
          updated[tabId] = { ...tabState, sessions: updatedSessions, session: updatedSession };
        }
        return updated;
      });

      // Clear pending approval counts when session ends
      if (['idle', 'error', 'finished'].includes(status)) {
        setPendingApprovalCounts(prev => {
          const { [sessionId]: _, ...rest } = prev;
          return rest;
        });
      }
    });

    const unsubPermission = window.electronAPI.on('session:permission-request', (request: unknown) => {
      const req = request as PermissionRequest;
      // Increment pending approval count
      setPendingApprovalCounts(prev => ({
        ...prev,
        [req.sessionId]: (prev[req.sessionId] || 0) + 1,
      }));
    });

    const unsubApprovalResolved = window.electronAPI.on('session:approval-resolved', (data: unknown) => {
      const { sessionId, count, all } = data as { sessionId: string; count?: number; all?: boolean };
      setPendingApprovalCounts(prev => {
        if (all) {
          // Clear all for this session
          const { [sessionId]: _, ...rest } = prev;
          return rest;
        }
        // Decrement by count
        const current = prev[sessionId] || 0;
        const newCount = current - (count || 1);
        if (newCount <= 0) {
          const { [sessionId]: _, ...rest } = prev;
          return rest;
        }
        return { ...prev, [sessionId]: newCount };
      });
    });

    return () => {
      unsubStatus();
      unsubPermission();
      unsubApprovalResolved();
    };
  }, []);

  // Load tabs from main process on mount
  React.useEffect(() => {
    async function loadTabs() {
      try {
        const state = await window.electronAPI.invoke<TabsState>('tabs:get');
        if (state?.tabs?.length > 0) {
          setTabs(state.tabs);
          setActiveTabId(state.activeTabId);
        }
      } catch (e) {
        console.error('Failed to load tabs:', e);
      } finally {
        setIsLoaded(true);
      }
    }
    loadTabs();
  }, []);

  // Save tabs to main process when they change
  React.useEffect(() => {
    if (!isLoaded) return;
    window.electronAPI.invoke('tabs:set', { tabs, activeTabId });
  }, [tabs, activeTabId, isLoaded]);

  // Load project/sessions for a tab
  const loadTabProject = React.useCallback(async (tabId: string, projectId: string | null) => {
    if (!projectId) {
      setTabStates(prev => ({
        ...prev,
        [tabId]: { project: null, session: null, sessions: [] },
      }));
      return;
    }

    try {
      const projects = await window.electronAPI.invoke<Project[]>('db:projects:list');
      const project = projects.find(p => p.id === projectId);

      if (project) {
        const sessions = await window.electronAPI.invoke<Session[]>('db:sessions:list', { projectId });
        setTabStates(prev => ({
          ...prev,
          [tabId]: { project, session: null, sessions },
        }));

        // Load pending approval counts for all sessions
        const counts: Record<string, number> = {};
        for (const session of sessions) {
          const approvals = await window.electronAPI.invoke<PermissionRequest[]>(
            'session:get-pending-approvals',
            { sessionId: session.id }
          );
          if (approvals.length > 0) {
            counts[session.id] = approvals.length;
          }
        }
        if (Object.keys(counts).length > 0) {
          setPendingApprovalCounts(prev => ({ ...prev, ...counts }));
        }
      } else {
        // Project was deleted
        setTabStates(prev => ({
          ...prev,
          [tabId]: { project: null, session: null, sessions: [] },
        }));
        // Update tab to remove project reference
        setTabs(prev => prev.map(t =>
          t.id === tabId ? { ...t, projectId: null, sessionId: null, title: 'Start' } : t
        ));
      }
    } catch (e) {
      console.error('Failed to load project:', e);
    }
  }, []);

  // Load active tab's project on initial load
  React.useEffect(() => {
    if (!isLoaded) return;
    const activeTab = tabs.find(t => t.id === activeTabId);
    if (activeTab?.projectId && !tabStates[activeTabId]) {
      loadTabProject(activeTabId, activeTab.projectId);
    }
  }, [isLoaded, activeTabId, tabs, tabStates, loadTabProject]);

  const handleTabChange = React.useCallback((tabId: string) => {
    setActiveTabId(tabId);
    const tab = tabs.find(t => t.id === tabId);

    // Load tab's project if not already loaded
    if (tab?.projectId && !tabStates[tabId]) {
      loadTabProject(tabId, tab.projectId);
    }
  }, [tabs, tabStates, loadTabProject]);

  const handleNewTab = () => {
    const newTab: Tab = {
      id: Date.now().toString(),
      title: 'Start',
      projectId: null,
      sessionId: null,
    };
    setTabs([...tabs, newTab]);
    setActiveTabId(newTab.id);
    setTabStates(prev => ({
      ...prev,
      [newTab.id]: { project: null, session: null, sessions: [] },
    }));
  };

  const handleCloseTab = (id: string) => {
    if (tabs.length === 1) return;
    const newTabs = tabs.filter(t => t.id !== id);
    setTabs(newTabs);

    // Clean up tab state
    setTabStates(prev => {
      const { [id]: _, ...rest } = prev;
      return rest;
    });

    if (activeTabId === id) {
      const lastTab = newTabs[newTabs.length - 1];
      handleTabChange(lastTab.id);
    }
  };

  const handleRenameTab = (id: string, newTitle: string) => {
    setTabs(prev => prev.map(t =>
      t.id === id ? { ...t, title: newTitle } : t
    ));
    setEditingTabId(null);
  };

  const handleSessionSelect = (session: Session) => {
    setTabStates(prev => ({
      ...prev,
      [activeTabId]: { ...prev[activeTabId], session },
    }));
    // Update tab's sessionId
    setTabs(prev => prev.map(t =>
      t.id === activeTabId ? { ...t, sessionId: session.id } : t
    ));
  };

  const handleToggleSidebar = () => {
    const panel = sidebarPanelRef.current;
    if (panel) {
      if (sidebarCollapsed) {
        panel.expand();
      } else {
        panel.collapse();
      }
    }
  };

  // Functions to update current tab's state (passed to children via context or props)
  const setCurrentProject = (project: Project | null) => {
    setTabStates(prev => ({
      ...prev,
      [activeTabId]: { ...prev[activeTabId], project, session: null, sessions: [] },
    }));
    setTabs(prev => prev.map(t =>
      t.id === activeTabId
        ? { ...t, projectId: project?.id || null, sessionId: null, title: project?.name || 'Start' }
        : t
    ));

    // Load sessions if project is set
    if (project) {
      window.electronAPI.invoke<Session[]>('db:sessions:list', { projectId: project.id })
        .then(sessions => {
          setTabStates(prev => ({
            ...prev,
            [activeTabId]: { ...prev[activeTabId], sessions },
          }));
        });
    }
  };

  const setCurrentSession = (session: Session | null) => {
    setTabStates(prev => ({
      ...prev,
      [activeTabId]: { ...prev[activeTabId], session },
    }));
    setTabs(prev => prev.map(t =>
      t.id === activeTabId ? { ...t, sessionId: session?.id || null } : t
    ));
  };

  const setSessions = (sessions: Session[]) => {
    setTabStates(prev => ({
      ...prev,
      [activeTabId]: { ...prev[activeTabId], sessions },
    }));
  };

  const updateSessionModel = (sessionId: string, model: ClaudeModel) => {
    setTabStates(prev => {
      const updated: Record<string, TabState> = {};
      for (const [tabId, tabState] of Object.entries(prev)) {
        const updatedSessions = tabState.sessions.map(s =>
          s.id === sessionId ? { ...s, model } : s
        );
        const updatedSession = tabState.session?.id === sessionId
          ? { ...tabState.session, model }
          : tabState.session;
        updated[tabId] = { ...tabState, sessions: updatedSessions, session: updatedSession };
      }
      return updated;
    });
  };

  const updateSessionPermissionMode = (sessionId: string, mode: PermissionMode, expiresAt: number | null) => {
    setTabStates(prev => {
      const updated: Record<string, TabState> = {};
      for (const [tabId, tabState] of Object.entries(prev)) {
        const updatedSessions = tabState.sessions.map(s =>
          s.id === sessionId ? { ...s, permissionMode: mode, permissionExpiresAt: expiresAt } : s
        );
        const updatedSession = tabState.session?.id === sessionId
          ? { ...tabState.session, permissionMode: mode, permissionExpiresAt: expiresAt }
          : tabState.session;
        updated[tabId] = { ...tabState, sessions: updatedSessions, session: updatedSession };
      }
      return updated;
    });
  };

  // Provide tab state to children
  const tabContext = {
    currentProject: currentTabState.project,
    currentSession: currentTabState.session,
    sessions: currentTabState.sessions,
    setCurrentProject,
    setCurrentSession,
    setSessions,
    updateSessionModel,
    updateSessionPermissionMode,
  };

  // Keyboard shortcuts
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle Cmd/Ctrl shortcuts
      if (!e.metaKey && !e.ctrlKey) return;

      // Cmd+1-9: Switch to tab by index
      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= 9) {
        e.preventDefault();
        const tabIndex = num - 1;
        if (tabIndex < tabs.length) {
          handleTabChange(tabs[tabIndex].id);
        }
        return;
      }

      switch (e.key.toLowerCase()) {
        case 'w':
          // Cmd+W: Close current tab
          e.preventDefault();
          if (tabs.length > 1) {
            handleCloseTab(activeTabId);
          }
          break;
        case 't':
          // Cmd+T: New tab
          e.preventDefault();
          handleNewTab();
          break;
        case 'n':
          // Cmd+N: New session (dispatches event for ProjectView to handle)
          e.preventDefault();
          window.dispatchEvent(new Event('create-new-session'));
          break;
        case 'o':
          // Cmd+O: Open project selector (dispatches event for StartView to handle)
          e.preventDefault();
          window.dispatchEvent(new Event('open-project-selector'));
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [tabs, activeTabId, handleCloseTab, handleNewTab, handleTabChange]);

  if (!isLoaded) {
    return <div className="h-screen w-screen flex items-center justify-center">Loading...</div>;
  }

  return (
    <TabContext.Provider value={tabContext}>
      <div className="h-screen w-screen flex flex-col overflow-hidden">
        <TopBar
          tabs={tabs}
          activeTab={activeTabId}
          onTabChange={handleTabChange}
          onNewTab={handleNewTab}
          onCloseTab={handleCloseTab}
          onRenameTab={handleRenameTab}
          editingTabId={editingTabId}
          onStartEditing={setEditingTabId}
          onSettings={() => window.dispatchEvent(new Event('open-settings'))}
          onAnalytics={() => window.dispatchEvent(new Event('open-analytics'))}
        />

        <div className="flex-1 overflow-hidden">
          {currentTabState.project ? (
            <PanelGroup direction="horizontal" autoSaveId="hive-main-layout">
              <Panel
                ref={sidebarPanelRef}
                id="sidebar"
                defaultSize={20}
                minSize={10}
                maxSize={40}
                collapsible
                collapsedSize={2}
                onCollapse={() => setSidebarCollapsed(true)}
                onExpand={() => setSidebarCollapsed(false)}
              >
                <Sidebar
                  sessions={currentTabState.sessions}
                  currentSessionId={currentTabState.session?.id ?? null}
                  onSessionSelect={handleSessionSelect}
                  isCollapsed={sidebarCollapsed}
                  onToggleCollapse={handleToggleSidebar}
                  pendingApprovalCounts={pendingApprovalCounts}
                  hideBackfilledSessions={hideBackfilledSessions}
                />
              </Panel>

              <PanelResizeHandle className="w-px bg-[var(--foreground-muted)]/30 hover:bg-[var(--primary)] transition-colors" />

              <Panel id="content" minSize={50}>
                {children}
              </Panel>
            </PanelGroup>
          ) : (
            children
          )}
        </div>
      </div>
    </TabContext.Provider>
  );
}

// Context for tab state
interface TabContextValue {
  currentProject: Project | null;
  currentSession: Session | null;
  sessions: Session[];
  setCurrentProject: (project: Project | null) => void;
  setCurrentSession: (session: Session | null) => void;
  setSessions: (sessions: Session[]) => void;
  updateSessionModel: (sessionId: string, model: ClaudeModel) => void;
  updateSessionPermissionMode: (sessionId: string, mode: PermissionMode, expiresAt: number | null) => void;
}

const TabContext = React.createContext<TabContextValue | null>(null);

export function useTabContext() {
  const context = React.useContext(TabContext);
  if (!context) {
    throw new Error('useTabContext must be used within MainLayout');
  }
  return context;
}
