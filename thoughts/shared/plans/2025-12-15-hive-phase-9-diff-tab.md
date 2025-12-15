# Hive Phase 9: Diff Tab Implementation Plan

## Overview

Implement the Diff tab in Hive's SessionView to show git changes made during a Claude Code session. The tab displays file changes since the session started, with side-by-side diff viewing powered by Monaco DiffEditor (already installed).

## Current State Analysis

### What Exists:
- **Placeholder Diff tab** at `SessionView.tsx:679` - renders `<PlaceholderTab title="Diff" />`
- **Monaco Editor** already installed (`@monaco-editor/react: ^4.7.0`) and configured with Solarized themes in `monaco-themes.ts`
- **Session data model** tracks `claudeSessionId`, `createdAt`, `projectDirectory`
- **No git integration** - need to add `simple-git` package
- **Worktree table** exists in database schema (unused) - could potentially be leveraged

### Key Files:
- `hive/src/renderer/components/views/SessionView.tsx:679` - Diff tab placeholder
- `hive/src/renderer/components/thoughts/ThoughtsEditor.tsx` - Monaco setup reference
- `hive/src/renderer/lib/monaco-themes.ts` - Solarized themes
- `hive/src/main/ipc-handlers.ts` - IPC registration
- `hive/src/shared/types.ts` - Type definitions

## Desired End State

After completing this plan:

1. **Diff Tab shows file changes** made during the session (since session start time)
2. **File list** on the left side showing changed files with status icons (added/modified/deleted)
3. **Monaco DiffEditor** on the right showing side-by-side diff of selected file
4. **View toggle** between side-by-side and unified diff modes
5. **Refresh button** to update diffs manually
6. **Empty state** when no changes or not in a git repository

### Verification:
- Open a session that has made file changes
- Diff tab shows list of changed files
- Clicking a file shows the diff in Monaco DiffEditor
- Toggle between side-by-side and unified views
- Works correctly for added, modified, and deleted files
- Shows helpful message when no changes detected

## What We're NOT Doing

1. **Real-time file watching** - Manual refresh only (real-time adds complexity)
2. **Commit functionality** - Just viewing diffs, not creating commits
3. **Branch management** - No branch switching or worktree operations
4. **Git history** - No log viewer or blame
5. **Conflict resolution** - No merge conflict handling
6. **Staging area** - No staging/unstaging of changes
7. **Per-tool-call diffs** - Session-level diffs only (not per message)

## Implementation Approach

1. Add `simple-git` for git operations in main process
2. Create IPC handlers for git diff operations
3. Build `DiffTab` component with file list and Monaco DiffEditor
4. Extract file changes based on session start time
5. Use existing Monaco themes and patterns from ThoughtsPane

---

## Phase 1: Git Integration Layer

### Overview
Add `simple-git` package and create IPC handlers for git operations.

### Changes Required:

#### 1. Install Dependencies
**Location**: `hive/`

```bash
cd /Users/taras/Documents/code/ai-toolbox/hive
pnpm add simple-git
```

#### 2. Create Git Service Module
**File**: `hive/src/main/git-service.ts`

```typescript
import simpleGit, { SimpleGit, DiffResult, FileStatusResult } from 'simple-git';
import path from 'path';

export interface FileDiff {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  oldPath?: string; // For renamed files
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

// Detect language from file extension
function getLanguageFromPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const langMap: Record<string, string> = {
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.json': 'json',
    '.md': 'markdown',
    '.css': 'css',
    '.scss': 'scss',
    '.html': 'html',
    '.py': 'python',
    '.rs': 'rust',
    '.go': 'go',
    '.java': 'java',
    '.c': 'c',
    '.cpp': 'cpp',
    '.h': 'c',
    '.hpp': 'cpp',
    '.rb': 'ruby',
    '.php': 'php',
    '.swift': 'swift',
    '.kt': 'kotlin',
    '.sql': 'sql',
    '.sh': 'shell',
    '.bash': 'shell',
    '.zsh': 'shell',
    '.yml': 'yaml',
    '.yaml': 'yaml',
    '.toml': 'toml',
    '.xml': 'xml',
    '.svg': 'xml',
  };
  return langMap[ext] || 'plaintext';
}

export class GitService {
  private git: SimpleGit;
  private cwd: string;

  constructor(cwd: string) {
    this.cwd = cwd;
    this.git = simpleGit(cwd);
  }

  /**
   * Get the status of the git repository including all changed files.
   */
  async getStatus(): Promise<GitStatus> {
    try {
      const isRepo = await this.git.checkIsRepo();
      if (!isRepo) {
        return { isRepo: false, branch: null, changedFiles: [] };
      }

      const [status, diffSummary] = await Promise.all([
        this.git.status(),
        this.git.diffSummary(['HEAD']),
      ]);

      const changedFiles: FileDiff[] = [];

      // Process status for unstaged and untracked files
      for (const file of status.files) {
        let fileStatus: FileDiff['status'];

        // Determine status from git status codes
        if (file.index === '?' || file.working_dir === '?') {
          fileStatus = 'added';
        } else if (file.index === 'D' || file.working_dir === 'D') {
          fileStatus = 'deleted';
        } else if (file.index === 'R' || file.working_dir === 'R') {
          fileStatus = 'renamed';
        } else {
          fileStatus = 'modified';
        }

        // Find diff stats for this file
        const diffFile = diffSummary.files.find(f => f.file === file.path);

        changedFiles.push({
          path: file.path,
          status: fileStatus,
          additions: diffFile?.insertions || 0,
          deletions: diffFile?.deletions || 0,
        });
      }

      return {
        isRepo: true,
        branch: status.current || null,
        changedFiles,
      };
    } catch (error) {
      console.error('[GitService] Error getting status:', error);
      return {
        isRepo: false,
        branch: null,
        changedFiles: [],
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get diff content for a specific file.
   * Returns original (HEAD) and modified (working tree) content.
   */
  async getFileDiff(filePath: string): Promise<DiffContent | null> {
    try {
      const fullPath = path.join(this.cwd, filePath);
      const fs = await import('fs/promises');

      // Get the original content from HEAD
      let original = '';
      try {
        original = await this.git.show([`HEAD:${filePath}`]);
      } catch {
        // File is new (not in HEAD)
        original = '';
      }

      // Get the current working tree content
      let modified = '';
      try {
        modified = await fs.readFile(fullPath, 'utf-8');
      } catch {
        // File was deleted
        modified = '';
      }

      return {
        path: filePath,
        original,
        modified,
        language: getLanguageFromPath(filePath),
      };
    } catch (error) {
      console.error(`[GitService] Error getting diff for ${filePath}:`, error);
      return null;
    }
  }

  /**
   * Get changes since a specific timestamp.
   * This filters the changed files to only those modified after the given time.
   */
  async getChangesSince(timestamp: number): Promise<FileDiff[]> {
    const status = await this.getStatus();
    if (!status.isRepo) return [];

    // Filter files by modification time
    const fs = await import('fs/promises');
    const filteredFiles: FileDiff[] = [];

    for (const file of status.changedFiles) {
      try {
        const fullPath = path.join(this.cwd, file.path);
        const stats = await fs.stat(fullPath);

        // Include if modified after the timestamp
        if (stats.mtimeMs >= timestamp) {
          filteredFiles.push(file);
        }
      } catch {
        // File might be deleted, include it anyway if status is 'deleted'
        if (file.status === 'deleted') {
          filteredFiles.push(file);
        }
      }
    }

    return filteredFiles;
  }
}
```

#### 3. Add IPC Handlers for Git Operations
**File**: `hive/src/main/ipc-handlers.ts` (additions)

Add these handlers to the existing `registerIpcHandlers` function:

```typescript
// Import at top of file
import { GitService, type GitStatus, type DiffContent, type FileDiff } from './git-service';

// Add to registerIpcHandlers function:

// Git operations
ipcMain.handle('git:get-status', async (_, { cwd }: { cwd: string }): Promise<GitStatus> => {
  const git = new GitService(cwd);
  return git.getStatus();
});

ipcMain.handle('git:get-file-diff', async (_, { cwd, filePath }: { cwd: string; filePath: string }): Promise<DiffContent | null> => {
  const git = new GitService(cwd);
  return git.getFileDiff(filePath);
});

ipcMain.handle('git:get-changes-since', async (_, { cwd, timestamp }: { cwd: string; timestamp: number }): Promise<FileDiff[]> => {
  const git = new GitService(cwd);
  return git.getChangesSince(timestamp);
});
```

#### 4. Update IPC Types
**File**: `hive/src/shared/types.ts` (additions)

Add these types:

```typescript
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
```

### Success Criteria:

#### Automated Verification:
- [x] Dependencies installed: `cd hive && pnpm install`
- [x] TypeScript compiles: `cd hive && pnpm exec tsc --noEmit`
- [x] App starts: `cd hive && pnpm start`

#### Manual Verification:
- [x] No errors in console when app starts
- [x] Git service can be instantiated (verify via DevTools console if needed)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to Phase 2.

---

## Phase 2: Diff Tab Component - File List

### Overview
Create the DiffTab component with a file list showing changed files.

### Changes Required:

#### 1. Create DiffTab Component
**File**: `hive/src/renderer/components/session/DiffTab.tsx`

```tsx
import React from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { RefreshCw, GitBranch, FileText, FilePlus, FileMinus, FileEdit, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { FileDiff, DiffContent, GitStatus } from '../../../shared/types';

interface DiffTabProps {
  projectDirectory: string;
  sessionStartTime: number;
}

export function DiffTab({ projectDirectory, sessionStartTime }: DiffTabProps) {
  const [status, setStatus] = React.useState<GitStatus | null>(null);
  const [changedFiles, setChangedFiles] = React.useState<FileDiff[]>([]);
  const [selectedFile, setSelectedFile] = React.useState<string | null>(null);
  const [diffContent, setDiffContent] = React.useState<DiffContent | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isLoadingDiff, setIsLoadingDiff] = React.useState(false);

  // Load git status and changes
  const loadChanges = React.useCallback(async () => {
    setIsLoading(true);
    try {
      // Get git status first
      const gitStatus = await window.electronAPI.invoke<GitStatus>('git:get-status', {
        cwd: projectDirectory,
      });
      setStatus(gitStatus);

      if (gitStatus.isRepo) {
        // Get changes since session started
        const changes = await window.electronAPI.invoke<FileDiff[]>('git:get-changes-since', {
          cwd: projectDirectory,
          timestamp: sessionStartTime,
        });
        setChangedFiles(changes);

        // Select first file if none selected
        if (changes.length > 0 && !selectedFile) {
          setSelectedFile(changes[0].path);
        }
      }
    } catch (error) {
      console.error('Failed to load git status:', error);
    } finally {
      setIsLoading(false);
    }
  }, [projectDirectory, sessionStartTime, selectedFile]);

  // Initial load
  React.useEffect(() => {
    loadChanges();
  }, [loadChanges]);

  // Load diff content when file is selected
  React.useEffect(() => {
    if (!selectedFile) {
      setDiffContent(null);
      return;
    }

    async function loadDiff() {
      setIsLoadingDiff(true);
      try {
        const content = await window.electronAPI.invoke<DiffContent | null>('git:get-file-diff', {
          cwd: projectDirectory,
          filePath: selectedFile,
        });
        setDiffContent(content);
      } catch (error) {
        console.error('Failed to load diff:', error);
        setDiffContent(null);
      } finally {
        setIsLoadingDiff(false);
      }
    }

    loadDiff();
  }, [selectedFile, projectDirectory]);

  // Not a git repo
  if (status && !status.isRepo) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4">
        <AlertCircle className="h-12 w-12 text-[var(--foreground-muted)]" />
        <p className="text-[var(--foreground-muted)]">
          This project is not a git repository.
        </p>
        <p className="text-sm text-[var(--foreground-muted)]">
          Initialize git to track file changes.
        </p>
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-[var(--foreground-muted)]">Loading git status...</p>
      </div>
    );
  }

  // No changes
  if (changedFiles.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4">
        <FileText className="h-12 w-12 text-[var(--foreground-muted)]" />
        <p className="text-[var(--foreground-muted)]">
          No file changes detected in this session.
        </p>
        <Button variant="outline" size="sm" onClick={loadChanges}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>
    );
  }

  return (
    <PanelGroup direction="horizontal" autoSaveId="hive-diff-layout">
      {/* File List Panel */}
      <Panel id="diff-files" defaultSize={25} minSize={15} maxSize={40}>
        <div className="h-full flex flex-col bg-[var(--sidebar)]">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border)]">
            <div className="flex items-center gap-2">
              <GitBranch className="h-4 w-4 text-[var(--foreground-muted)]" />
              <span className="text-sm font-medium">{status?.branch || 'unknown'}</span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={loadChanges}
              title="Refresh"
            >
              <RefreshCw className="h-3 w-3" />
            </Button>
          </div>

          {/* File Count */}
          <div className="px-3 py-2 text-xs text-[var(--foreground-muted)] border-b border-[var(--border)]">
            {changedFiles.length} file{changedFiles.length !== 1 ? 's' : ''} changed
          </div>

          {/* File List */}
          <div className="flex-1 overflow-auto">
            {changedFiles.map((file) => (
              <FileListItem
                key={file.path}
                file={file}
                isSelected={selectedFile === file.path}
                onClick={() => setSelectedFile(file.path)}
              />
            ))}
          </div>
        </div>
      </Panel>

      <PanelResizeHandle className="w-1 bg-[var(--border)] hover:bg-[var(--primary)] transition-colors" />

      {/* Diff Viewer Panel */}
      <Panel id="diff-viewer" minSize={50}>
        {selectedFile && diffContent ? (
          <DiffViewer content={diffContent} isLoading={isLoadingDiff} />
        ) : (
          <div className="h-full flex items-center justify-center">
            <p className="text-[var(--foreground-muted)]">
              {isLoadingDiff ? 'Loading diff...' : 'Select a file to view diff'}
            </p>
          </div>
        )}
      </Panel>
    </PanelGroup>
  );
}

// File list item component
interface FileListItemProps {
  file: FileDiff;
  isSelected: boolean;
  onClick: () => void;
}

function FileListItem({ file, isSelected, onClick }: FileListItemProps) {
  const StatusIcon = {
    added: FilePlus,
    modified: FileEdit,
    deleted: FileMinus,
    renamed: FileEdit,
  }[file.status];

  const statusColor = {
    added: 'text-[var(--success)]',
    modified: 'text-[var(--warning)]',
    deleted: 'text-[var(--destructive)]',
    renamed: 'text-[var(--primary)]',
  }[file.status];

  // Get filename and directory
  const parts = file.path.split('/');
  const filename = parts.pop() || file.path;
  const directory = parts.length > 0 ? parts.join('/') + '/' : '';

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors',
        'hover:bg-[var(--sidebar-accent)]',
        isSelected && 'bg-[var(--sidebar-accent)]'
      )}
    >
      <StatusIcon className={cn('h-4 w-4 flex-shrink-0', statusColor)} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          <span className="text-sm truncate">{filename}</span>
          {(file.additions > 0 || file.deletions > 0) && (
            <span className="text-xs text-[var(--foreground-muted)] flex-shrink-0">
              <span className="text-[var(--success)]">+{file.additions}</span>
              {' '}
              <span className="text-[var(--destructive)]">-{file.deletions}</span>
            </span>
          )}
        </div>
        {directory && (
          <div className="text-xs text-[var(--foreground-muted)] truncate">
            {directory}
          </div>
        )}
      </div>
    </button>
  );
}

// Placeholder for DiffViewer - will be implemented in Phase 3
function DiffViewer({ content, isLoading }: { content: DiffContent; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-[var(--foreground-muted)]">Loading diff...</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-2 border-b border-[var(--border)] bg-[var(--background-secondary)]">
        <span className="text-sm font-medium">{content.path}</span>
      </div>
      <div className="flex-1 flex items-center justify-center">
        <p className="text-[var(--foreground-muted)]">
          Monaco DiffEditor will be added in Phase 3
        </p>
      </div>
    </div>
  );
}
```

#### 2. Update SessionView to Use DiffTab
**File**: `hive/src/renderer/components/views/SessionView.tsx`

Replace the placeholder Diff tab rendering (line 679) with the actual component.

First, add the import at the top:
```typescript
import { DiffTab } from '@/components/session/DiffTab';
```

Then replace line 679:
```typescript
{activeTab === 'diff' && <PlaceholderTab title="Diff" />}
```

With:
```typescript
{activeTab === 'diff' && (
  <DiffTab
    projectDirectory={projectDirectory}
    sessionStartTime={session.createdAt}
  />
)}
```

### Success Criteria:

#### Automated Verification:
- [x] TypeScript compiles: `cd hive && pnpm exec tsc --noEmit`
- [x] App starts: `cd hive && pnpm start`

#### Manual Verification:
- [x] Diff tab shows file list panel
- [x] Changed files appear with status icons
- [x] Files show additions/deletions counts
- [x] Clicking a file selects it
- [x] Empty state shows when no changes
- [x] Not-a-repo state shows for non-git projects
- [x] Refresh button reloads the file list

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to Phase 3.

---

## Phase 3: Monaco DiffEditor Integration

### Overview
Replace the placeholder DiffViewer with Monaco DiffEditor for side-by-side diff viewing.

### Changes Required:

#### 1. Update DiffViewer in DiffTab.tsx
**File**: `hive/src/renderer/components/session/DiffTab.tsx`

Replace the placeholder `DiffViewer` function with the full implementation:

```tsx
// Add imports at the top
import { DiffEditor, type OnMount as DiffOnMount } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import { solarizedLight, solarizedDark } from '@/lib/monaco-themes';
import { useThemeStore } from '@/lib/store';
import { Columns2, AlignJustify } from 'lucide-react';

// Replace the DiffViewer function:

interface DiffViewerProps {
  content: DiffContent;
  isLoading: boolean;
}

function DiffViewer({ content, isLoading }: DiffViewerProps) {
  const { resolvedTheme } = useThemeStore();
  const [sideBySide, setSideBySide] = React.useState(true);
  const monacoRef = React.useRef<typeof import('monaco-editor') | null>(null);

  const handleEditorMount: DiffOnMount = (editor, monaco) => {
    monacoRef.current = monaco;

    // Register Solarized themes if not already registered
    monaco.editor.defineTheme('solarized-light', solarizedLight);
    monaco.editor.defineTheme('solarized-dark', solarizedDark);
    monaco.editor.setTheme(resolvedTheme === 'dark' ? 'solarized-dark' : 'solarized-light');
  };

  // Update theme when app theme changes
  React.useEffect(() => {
    if (monacoRef.current) {
      monacoRef.current.editor.setTheme(resolvedTheme === 'dark' ? 'solarized-dark' : 'solarized-light');
    }
  }, [resolvedTheme]);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-[var(--foreground-muted)]">Loading diff...</p>
      </div>
    );
  }

  // Handle added files (no original content)
  const isNewFile = content.original === '' && content.modified !== '';
  // Handle deleted files (no modified content)
  const isDeletedFile = content.original !== '' && content.modified === '';

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--border)] bg-[var(--background-secondary)]">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{content.path}</span>
          {isNewFile && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--success)]/20 text-[var(--success)]">
              new file
            </span>
          )}
          {isDeletedFile && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--destructive)]/20 text-[var(--destructive)]">
              deleted
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant={sideBySide ? 'secondary' : 'ghost'}
            size="icon"
            className="h-7 w-7"
            onClick={() => setSideBySide(true)}
            title="Side by side"
          >
            <Columns2 className="h-4 w-4" />
          </Button>
          <Button
            variant={!sideBySide ? 'secondary' : 'ghost'}
            size="icon"
            className="h-7 w-7"
            onClick={() => setSideBySide(false)}
            title="Unified"
          >
            <AlignJustify className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Monaco DiffEditor */}
      <div className="flex-1">
        <DiffEditor
          height="100%"
          language={content.language}
          original={content.original}
          modified={content.modified}
          theme={resolvedTheme === 'dark' ? 'solarized-dark' : 'solarized-light'}
          onMount={handleEditorMount}
          options={{
            readOnly: true,
            renderSideBySide: sideBySide,
            fontFamily: 'Hack, "Fira Code", monospace',
            fontSize: 13,
            lineHeight: 1.5,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            renderLineHighlight: 'none',
            scrollbar: {
              verticalScrollbarSize: 8,
              horizontalScrollbarSize: 8,
            },
            padding: { top: 8, bottom: 8 },
            // Diff-specific options
            renderOverviewRuler: false,
            ignoreTrimWhitespace: false,
            renderIndicators: true,
            originalEditable: false,
          }}
        />
      </div>
    </div>
  );
}
```

#### 2. Add Missing Lucide Icons Import
Update the imports at the top of `DiffTab.tsx` to include the new icons:

```typescript
import {
  RefreshCw,
  GitBranch,
  FileText,
  FilePlus,
  FileMinus,
  FileEdit,
  AlertCircle,
  Columns2,
  AlignJustify
} from 'lucide-react';
```

### Success Criteria:

#### Automated Verification:
- [x] TypeScript compiles: `cd hive && pnpm exec tsc --noEmit`
- [x] App starts: `cd hive && pnpm start`

#### Manual Verification:
- [x] Monaco DiffEditor loads and displays diffs
- [x] Side-by-side view shows original on left, modified on right
- [x] Unified view shows inline diff
- [x] Toggle buttons switch between views
- [x] New files show empty left panel with "new file" badge
- [x] Deleted files show empty right panel with "deleted" badge
- [x] Syntax highlighting works based on file type
- [x] Solarized theme matches the rest of the app
- [x] Theme changes when app theme is toggled

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to Phase 4.

---

## Phase 4: Polish and Edge Cases

### Overview
Add finishing touches, handle edge cases, and improve UX.

### Changes Required:

#### 1. Add Keyboard Navigation
**File**: `hive/src/renderer/components/session/DiffTab.tsx`

Add keyboard navigation for file list:

```tsx
// Add this inside DiffTab component, after the state declarations:

// Keyboard navigation
const handleKeyDown = React.useCallback((e: KeyboardEvent) => {
  if (changedFiles.length === 0) return;

  const currentIndex = selectedFile
    ? changedFiles.findIndex(f => f.path === selectedFile)
    : -1;

  if (e.key === 'ArrowDown' || e.key === 'j') {
    e.preventDefault();
    const nextIndex = Math.min(currentIndex + 1, changedFiles.length - 1);
    setSelectedFile(changedFiles[nextIndex].path);
  } else if (e.key === 'ArrowUp' || e.key === 'k') {
    e.preventDefault();
    const prevIndex = Math.max(currentIndex - 1, 0);
    setSelectedFile(changedFiles[prevIndex].path);
  }
}, [changedFiles, selectedFile]);

React.useEffect(() => {
  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}, [handleKeyDown]);
```

#### 2. Add Summary Statistics Header
**File**: `hive/src/renderer/components/session/DiffTab.tsx`

Add a summary showing total additions/deletions. Update the file count section:

```tsx
{/* Summary Stats */}
<div className="px-3 py-2 text-xs border-b border-[var(--border)]">
  <div className="flex items-center justify-between">
    <span className="text-[var(--foreground-muted)]">
      {changedFiles.length} file{changedFiles.length !== 1 ? 's' : ''} changed
    </span>
    <span>
      <span className="text-[var(--success)]">
        +{changedFiles.reduce((sum, f) => sum + f.additions, 0)}
      </span>
      {' '}
      <span className="text-[var(--destructive)]">
        -{changedFiles.reduce((sum, f) => sum + f.deletions, 0)}
      </span>
    </span>
  </div>
</div>
```

#### 3. Handle Binary Files
**File**: `hive/src/main/git-service.ts`

Update `getFileDiff` to handle binary files:

```typescript
async getFileDiff(filePath: string): Promise<DiffContent | null> {
  try {
    const fullPath = path.join(this.cwd, filePath);
    const fs = await import('fs/promises');

    // Check if file is binary
    const isBinaryFile = await this.isBinary(fullPath);
    if (isBinaryFile) {
      return {
        path: filePath,
        original: '(Binary file)',
        modified: '(Binary file)',
        language: 'plaintext',
      };
    }

    // ... rest of existing implementation
  } catch (error) {
    // ...
  }
}

private async isBinary(filePath: string): Promise<boolean> {
  try {
    const fs = await import('fs/promises');
    const buffer = await fs.readFile(filePath);
    // Check first 8000 bytes for null bytes (common binary indicator)
    const chunk = buffer.slice(0, 8000);
    for (let i = 0; i < chunk.length; i++) {
      if (chunk[i] === 0) return true;
    }
    return false;
  } catch {
    return false;
  }
}
```

#### 4. Add File Open in Editor Action
**File**: `hive/src/renderer/components/session/DiffTab.tsx`

Add button to open file in external editor. Update the DiffViewer header:

```tsx
{/* In DiffViewer header, add this button: */}
<Button
  variant="ghost"
  size="icon"
  className="h-7 w-7"
  onClick={() => window.electronAPI.invoke('shell:open-in-editor', {
    path: `${projectDirectory}/${content.path}`
  })}
  title="Open in editor"
>
  <ExternalLink className="h-4 w-4" />
</Button>
```

Don't forget to add `ExternalLink` to the imports and pass `projectDirectory` as a prop to `DiffViewer`.

### Success Criteria:

#### Automated Verification:
- [x] TypeScript compiles: `cd hive && pnpm exec tsc --noEmit`
- [x] App starts: `cd hive && pnpm start`

#### Manual Verification:
- [x] Arrow keys / j/k navigate file list
- [x] Summary shows total additions and deletions
- [x] Binary files show "(Binary file)" message instead of crashing
- [x] "Open in editor" button works
- [x] All previous functionality still works

**Implementation Note**: This is the final phase. After completing all verification, the Diff tab is ready for use.

---

## Additional Features (Post-Plan)

The following features were added after the initial plan was completed:

### 1. Expand/Collapse Unchanged Lines
- Toggle button to show only changed chunks vs full file
- Uses Monaco's `hideUnchangedRegions` option
- Shows 3 context lines around changes
- Default is collapsed (only showing changes)

### 2. Diff Stats in Tab Label
- Shows `+X -Y` metrics directly in the Diff tab label
- Stats load eagerly when session opens (not just when tab is clicked)
- Updates when files change

### 3. Fuse.js File Search
- Search input at top of file list
- Fuzzy matching on file paths
- Keyboard shortcuts: `Cmd/Ctrl+F` to focus, `Escape` to clear
- Shows "X of Y files" when filtering
- Empty state when no matches

### 4. Scroll Position Fix
- Fixed bug where file list scroll reset when clicking files
- Removed `selectedFile` from `loadChanges` dependencies

---

## Testing Strategy

### Unit Tests (Deferred)
Unit tests for git-service.ts will be added in a future phase.

### Manual Testing Steps

1. **Basic Flow Test**:
   - Create a new session in a git-initialized project
   - Make some file changes via Claude
   - Open Diff tab
   - Verify files appear with correct status
   - Click through files and verify diffs render

2. **Edge Cases**:
   - Test with new files (no original)
   - Test with deleted files (no modified)
   - Test with renamed files
   - Test with binary files
   - Test with very large diffs

3. **Non-Git Project**:
   - Open a project without git
   - Verify helpful error message appears

4. **Empty State**:
   - Open Diff tab on a session with no changes
   - Verify empty state message appears

## Performance Considerations

- **Lazy loading**: Diff content only loads when file is selected
- **Monaco virtualization**: Built-in, handles large files well
- **Caching**: Consider adding diff caching in future if performance issues arise
- **File filtering**: Changes filtered by session start time to reduce irrelevant files

## Future Enhancements (Out of Scope)

- Per-tool-call diffs (show what each Claude action changed)
- Git staging/commit from within Hive
- Branch comparison
- Blame view
- File history timeline
- Real-time file watching for live diff updates

## References

### Related Research:
- `thoughts/shared/plans/2025-12-15-hive-v0.1-foundation-setup.md` - Foundation plan
- `thoughts/shared/plans/2025-12-15-hive-v0.2-claude-sdk-integration.md` - SDK integration

### External Resources:
- [simple-git Documentation](https://github.com/steveukx/git-js)
- [Monaco DiffEditor API](https://microsoft.github.io/monaco-editor/typedoc/interfaces/editor.IStandaloneDiffEditorConstructionOptions.html)
- [@monaco-editor/react](https://github.com/suren-atoyan/monaco-react)
