import { useCallback } from 'react';
import { useLocalStorage } from './useLocalStorage';
import { DEFAULT_MODEL } from '@/lib/constants';
import { track } from '@/lib/analytics';
import type { Tab, TabsState, TabType } from '@/types/tabs';

const generateId = () => Math.random().toString(36).substr(2, 9);

export function useTabs() {
  const [state, setState] = useLocalStorage<TabsState>('hn-tabs', {
    tabs: [],
    activeTabId: null,
  });

  const createTab = useCallback((type: TabType, title?: string, dashboardId?: string) => {
    // For singleton tabs (dashboard, api-docs), reuse existing tab if one exists
    if (type === 'dashboard' || type === 'api-docs') {
      const existing = state.tabs.find(t => t.type === type);
      if (existing) {
        setState((prev) => ({ ...prev, activeTabId: existing.id }));
        return existing.id;
      }
    }

    const newTab: Tab = {
      id: generateId(),
      type,
      title: title || (
        type === 'notebook' ? 'New Chat' :
        type === 'dashboard' ? 'Dashboard' :
        type === 'api-docs' ? 'API Docs' :
        'Post Tester'
      ),
      defaultModel: type === 'notebook' ? DEFAULT_MODEL : undefined,
      messages: type === 'notebook' ? [] : undefined,
      dashboardId: type === 'dashboard' ? dashboardId : undefined,
      ideaTesterInput: type === 'idea-tester' ? { title: '', type: 'story' } : undefined,
    };
    setState((prev) => ({
      tabs: [...prev.tabs, newTab],
      activeTabId: newTab.id,
    }));
    track.tabCreated(type);
    return newTab.id;
  }, [setState, state.tabs]);

  const closeTab = useCallback((tabId: string) => {
    const closingTab = state.tabs.find(t => t.id === tabId);
    setState((prev) => {
      const newTabs = prev.tabs.filter(t => t.id !== tabId);
      const newActiveId = prev.activeTabId === tabId
        ? (newTabs.length > 0 ? newTabs[newTabs.length - 1]?.id ?? null : null)
        : prev.activeTabId;
      return { tabs: newTabs, activeTabId: newActiveId };
    });
    if (closingTab) {
      track.tabClosed(closingTab.type);
    }
  }, [setState, state.tabs]);

  const setActiveTab = useCallback((tabId: string | null) => {
    setState((prev) => ({ ...prev, activeTabId: tabId }));
  }, [setState]);

  const updateTab = useCallback((tabId: string, updates: Partial<Tab>) => {
    setState((prev) => ({
      ...prev,
      tabs: prev.tabs.map(t => t.id === tabId ? { ...t, ...updates } : t),
    }));
  }, [setState]);

  const resetTabs = useCallback(() => {
    track.reset(state.tabs.length);
    // Clear tabs state
    setState({ tabs: [], activeTabId: null });

    // Clear all app-related localStorage
    const keysToRemove = Object.keys(localStorage).filter(key =>
      key.startsWith('hn-') ||
      key.startsWith('ai-gateway:') ||
      key.startsWith('queryResults:')
    );
    keysToRemove.forEach(key => localStorage.removeItem(key));
  }, [setState, state.tabs.length]);

  return {
    tabs: state.tabs,
    activeTabId: state.activeTabId,
    activeTab: state.tabs.find(t => t.id === state.activeTabId),
    createTab,
    closeTab,
    setActiveTab,
    updateTab,
    resetTabs,
  };
}
