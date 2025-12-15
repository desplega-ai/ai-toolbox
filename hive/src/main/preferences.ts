import ElectronStore from 'electron-store';
import { app } from 'electron';
import path from 'path';
import type { Preferences, TabsState } from '../shared/types';

const HIVE_DIR = path.join(app.getPath('home'), '.hive');

// Handle ESM default export issue
const Store = (ElectronStore as unknown as { default: typeof ElectronStore }).default || ElectronStore;

export const preferences = new Store<Preferences>({
  name: 'preferences',
  cwd: HIVE_DIR,
  defaults: {
    theme: 'system',
    defaultModel: 'claude-sonnet-4-5',
    defaultActionType: 'freeform',
    recentDirectories: [],
    editorCommand: 'code',
    terminalCommand: process.platform === 'darwin' ? 'Terminal' : 'gnome-terminal',
    notifications: {
      inputRequired: true,
      sessionComplete: true,
    },
    hideBackfilledSessions: false,
  },
});

// Separate store for UI state (tabs, etc.)
const defaultTab = { id: '1', title: 'Start', projectId: null, sessionId: null };
export const uiState = new Store<{ tabs: TabsState }>({
  name: 'ui-state',
  cwd: HIVE_DIR,
  defaults: {
    tabs: {
      tabs: [defaultTab],
      activeTabId: '1',
    },
  },
});

export function getPreferences(): Preferences {
  return {
    theme: preferences.get('theme'),
    defaultModel: preferences.get('defaultModel'),
    defaultActionType: preferences.get('defaultActionType'),
    recentDirectories: preferences.get('recentDirectories'),
    editorCommand: preferences.get('editorCommand'),
    terminalCommand: preferences.get('terminalCommand'),
    notifications: preferences.get('notifications'),
    hideBackfilledSessions: preferences.get('hideBackfilledSessions'),
  };
}

export function setPreferences(updates: Partial<Preferences>): void {
  for (const [key, value] of Object.entries(updates)) {
    preferences.set(key as keyof Preferences, value);
  }
}

export function addRecentDirectory(dir: string): void {
  const recent = preferences.get('recentDirectories');
  const filtered = recent.filter(d => d !== dir);
  const updated = [dir, ...filtered].slice(0, 10);
  preferences.set('recentDirectories', updated);
}

export function getTabsState(): TabsState {
  return uiState.get('tabs');
}

export function setTabsState(state: TabsState): void {
  uiState.set('tabs', state);
}
