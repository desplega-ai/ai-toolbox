// Project and session types
export interface Project {
  id: string;
  name: string;
  directory: string;
  settings: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export type ClaudeModel = 'claude-opus-4-5' | 'claude-sonnet-4-5' | 'claude-haiku-4-5';

export const CLAUDE_MODELS: { value: ClaudeModel; label: string }[] = [
  { value: 'claude-opus-4-5', label: 'Opus' },
  { value: 'claude-sonnet-4-5', label: 'Sonnet' },
  { value: 'claude-haiku-4-5', label: 'Haiku' },
];

export const DEFAULT_MODEL: ClaudeModel = 'claude-opus-4-5';

// Permission modes for Claude SDK
export type PermissionMode = 'default' | 'acceptEdits' | 'plan' | 'bypassPermissions';

export const PERMISSION_MODES: { value: PermissionMode; label: string; description: string; requiresConfirmation: boolean }[] = [
  { value: 'default', label: 'Default', description: 'Standard permission prompts', requiresConfirmation: false },
  { value: 'acceptEdits', label: 'Accept Edits', description: 'Auto-accept file edits', requiresConfirmation: false },
  { value: 'plan', label: 'Plan Only', description: 'No execution, planning only', requiresConfirmation: false },
  { value: 'bypassPermissions', label: 'Bypass All', description: 'Bypass all permission checks', requiresConfirmation: true },
];

export const DEFAULT_PERMISSION_MODE: PermissionMode = 'default';

export const PERMISSION_DURATIONS = [15, 30, 60, 120] as const;
export type PermissionDuration = typeof PERMISSION_DURATIONS[number];

export interface Session {
  id: string;
  projectId: string;
  claudeSessionId: string | null;
  name: string;
  model: ClaudeModel;
  permissionMode: PermissionMode;
  permissionExpiresAt: number | null;
  actionType: 'research' | 'plan' | 'implement' | 'freeform';
  status: 'pending' | 'running' | 'waiting' | 'idle' | 'error' | 'finished' | 'archived';
  metadata: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export interface Worktree {
  id: string;
  projectId: string;
  path: string;
  branch: string;
  description: string | null;
  createdAt: number;
}

// Tab types
export interface Tab {
  id: string;
  title: string;
  projectId: string | null;
  sessionId: string | null;
}

export interface TabsState {
  tabs: Tab[];
  activeTabId: string;
}

// Preferences types
export interface Preferences {
  theme: 'light' | 'dark' | 'system';
  defaultModel: string;
  defaultActionType: Session['actionType'];
  recentDirectories: string[];
  editorCommand: string;
  terminalCommand: string;
  notifications: {
    inputRequired: boolean;
    sessionComplete: boolean;
  };
  hideBackfilledSessions: boolean;
}

// File system types for Thoughts pane
export interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileNode[];
}

export interface HiveComment {
  id: string;
  content: string;
  startLine: number;
  endLine: number;
}

// Database-backed thought comment with lifecycle tracking
export interface ThoughtComment {
  id: string;
  projectId: string;
  filePath: string;
  content: string;
  selectedText: string;        // The text that was selected when creating the comment
  contextBefore: string;       // ~30 chars before selection for fuzzy matching
  contextAfter: string;        // ~30 chars after selection for fuzzy matching
  status: 'pending' | 'sent' | 'archived';
  gitCommit: string | null;
  sentToSessionId: string | null;
  sentAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface FileContent {
  path: string;
  content: string;
  comments: HiveComment[];
}

// File entry for autocomplete file index
export interface FileEntry {
  path: string;
  name: string;
  type: 'file' | 'directory';
}

// IPC types
export interface IpcChannels {
  'db:projects:list': { params: void; result: Project[] };
  'db:projects:create': { params: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>; result: Project };
  'db:projects:delete': { params: { id: string }; result: void };
  'db:sessions:list': { params: { projectId: string }; result: Session[] };
  'db:sessions:create': { params: Omit<Session, 'id' | 'createdAt' | 'updatedAt'>; result: Session };
  'preferences:get': { params: void; result: Preferences };
  'preferences:set': { params: Partial<Preferences>; result: void };
  'dialog:open-directory': { params: void; result: string | null };
  'fs:read-directory': { params: { path: string }; result: FileNode[] };
  'fs:read-file': { params: { path: string }; result: FileContent };
  'fs:write-file': { params: { path: string; content: string }; result: void };
  'fs:watch-start': { params: { path: string }; result: void };
  'fs:watch-stop': { params: void; result: void };
  'fs:build-file-index': { params: { projectPath: string }; result: FileEntry[] };
  'fs:get-file-index': { params: { projectPath: string }; result: FileEntry[] };
  'fs:clear-file-index': { params: { projectPath: string }; result: void };
}

export interface IpcEvents {
  'fs:file-changed': { path: string; event: 'add' | 'change' | 'unlink' };
}

// Git types for Diff tab
export interface FileDiff {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  oldPath?: string;
  additions: number;
  deletions: number;
}

export interface DiffContent {
  path: string;
  original: string;
  modified: string;
  language: string;
}

export interface GitStatus {
  isRepo: boolean;
  branch: string | null;
  changedFiles: FileDiff[];
  error?: string;
}
