# Hive Phase 8 - Thoughts Pane Implementation Plan

## Overview

Implement the Thoughts Pane for Hive - a file browser and markdown editor for the `thoughts/` directory within each project. This feature enables users to view, edit, and annotate thought documents, with support for inline comments that Claude can read and respond to.

## Current State Analysis

- **SessionView.tsx**: Has a placeholder tab at line 65: `{activeTab === 'thoughts' && <PlaceholderTab title="Thoughts" />}`
- **IPC handlers**: Existing patterns for database and dialog operations in `ipc-handlers.ts`
- **File watching**: chokidar is documented in research but not yet installed
- **Monaco Editor**: Not yet installed, but Solarized theme configs exist in research docs

### Key Discoveries:
- Comment syntax confirmed: `<!-- hive-comment(nanoid): content -->` with closing `<!-- hive-comment(nanoid) -->` (`2025-12-14-markdown-comment-parsing-persistence.md:410`)
- Monaco Solarized themes defined in UX spec (`2025-12-15-hive-ux-ui-design-spec.md:637-681`)
- File tree + editor layout specified (`2025-12-15-hive-ux-ui-design-spec.md:310-317`)
- unified/remark recommended for comment parsing (`2025-12-14-markdown-comment-parsing-persistence.md:51`)

## Desired End State

After completing this plan:

1. **Thoughts Tab** displays a split pane with file tree (left) and editor (right)
2. **File Tree** shows `{project.directory}/thoughts/` directory structure
3. **Monaco Editor** with Solarized theme (light/dark) for markdown editing
4. **File Watching** auto-refreshes when files change on disk
5. **Comment System** parses and displays hive-comments with UI for adding new ones
6. **Send to Claude** button collects comments and sends them to the active session

### Verification:
- `pnpm start` launches app with functional Thoughts tab
- Opening a project with a `thoughts/` directory shows files in tree
- Clicking a `.md` file opens it in the editor
- Editing and saving a file persists changes to disk
- External file edits trigger UI refresh
- Adding a comment inserts proper HTML comment syntax
- Theme toggle changes Monaco editor theme

## What We're NOT Doing

1. **Multi-file comments** - Comments span single files only
2. **Comment threading/replies** - Simple flat comments only
3. **Collaborative editing** - No CRDT/Yjs in this phase
4. **Diff view in editor** - Just editing, no git diff overlay
5. **Markdown preview pane** - Edit mode only (preview deferred)
6. **Create new files** - Only edit existing files (create deferred)
7. **Delete files** - View and edit only

## Implementation Approach

Build incrementally:
1. Install dependencies (Monaco, chokidar, unified ecosystem)
2. Add IPC handlers for file system operations
3. Create file tree component
4. Integrate Monaco editor with Solarized themes
5. Implement file watching
6. Add comment parsing and UI
7. Wire up "Send to Claude" functionality

---

## Phase 8.1: Dependencies

### Overview
Install all required packages for the Thoughts Pane.

### Changes Required:

#### 1. Install Dependencies
**Location**: `hive/`

```bash
cd /Users/taras/Documents/code/ai-toolbox/hive

# Monaco Editor
pnpm add @monaco-editor/react monaco-editor

# File watching
pnpm add chokidar
pnpm add -D @types/chokidar

# Markdown parsing (unified ecosystem)
pnpm add unified remark-parse remark-stringify remark-frontmatter
pnpm add unist-util-visit
pnpm add -D @types/mdast @types/unist
```

### Success Criteria:

#### Automated Verification:
- [x] All packages install: `cd hive && pnpm install` (no errors)
- [x] TypeScript compiles: `cd hive && pnpm exec tsc --noEmit`

#### Manual Verification:
- [x] `node_modules/@monaco-editor` directory exists
- [x] `node_modules/chokidar` directory exists
- [x] `node_modules/unified` directory exists

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to Phase 8.2.

---

## Phase 8.2: File System IPC Handlers

### Overview
Add IPC handlers for reading, writing, and watching the thoughts directory.

### Changes Required:

#### 1. Update Shared Types
**File**: `hive/src/shared/types.ts`

Add after existing types:

```typescript
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

export interface FileContent {
  path: string;
  content: string;
  comments: HiveComment[];
}

// Add to IpcChannels
export interface IpcChannels {
  // ... existing channels ...
  'fs:read-directory': { params: { path: string }; result: FileNode[] };
  'fs:read-file': { params: { path: string }; result: FileContent };
  'fs:write-file': { params: { path: string; content: string }; result: void };
  'fs:watch-start': { params: { path: string }; result: void };
  'fs:watch-stop': { params: void; result: void };
}

export interface IpcEvents {
  'fs:file-changed': { path: string; event: 'add' | 'change' | 'unlink' };
}
```

#### 2. Create Comment Parser Module
**File**: `hive/src/main/comment-parser.ts`

```typescript
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkFrontmatter from 'remark-frontmatter';
import { visit } from 'unist-util-visit';
import type { Root, Html } from 'mdast';
import type { HiveComment } from '../shared/types';

const processor = unified()
  .use(remarkParse)
  .use(remarkFrontmatter, ['yaml']);

export function parseHiveComments(markdown: string): HiveComment[] {
  const tree = processor.parse(markdown) as Root;
  const comments: HiveComment[] = [];
  const openComments = new Map<string, { content: string; startLine: number }>();

  visit(tree, 'html', (node: Html) => {
    // Opening comment: <!-- hive-comment(id): content -->
    const openMatch = node.value.match(/<!--\s*hive-comment\(([^)]+)\):\s*(.+?)\s*-->/);
    if (openMatch) {
      const [, id, content] = openMatch;
      openComments.set(id, {
        content,
        startLine: node.position?.start.line ?? 0,
      });
      return;
    }

    // Closing comment: <!-- hive-comment(id) -->
    const closeMatch = node.value.match(/<!--\s*hive-comment\(([^)]+)\)\s*-->/);
    if (closeMatch) {
      const [, id] = closeMatch;
      const open = openComments.get(id);
      if (open) {
        comments.push({
          id,
          content: open.content,
          startLine: open.startLine,
          endLine: node.position?.end.line ?? 0,
        });
        openComments.delete(id);
      }
    }
  });

  return comments;
}

export function insertComment(
  markdown: string,
  line: number,
  commentId: string,
  commentContent: string
): string {
  const lines = markdown.split('\n');
  const openTag = `<!-- hive-comment(${commentId}): ${commentContent} -->`;
  const closeTag = `<!-- hive-comment(${commentId}) -->`;

  // Insert opening tag before the line, closing tag after
  // For now, wrap the single line
  if (line > 0 && line <= lines.length) {
    lines.splice(line - 1, 0, openTag);
    lines.splice(line + 1, 0, closeTag);
  }

  return lines.join('\n');
}

export function removeComment(markdown: string, commentId: string): string {
  // Remove both opening and closing tags
  const openPattern = new RegExp(`<!--\\s*hive-comment\\(${commentId}\\):[^>]*-->\\n?`, 'g');
  const closePattern = new RegExp(`<!--\\s*hive-comment\\(${commentId}\\)\\s*-->\\n?`, 'g');

  return markdown.replace(openPattern, '').replace(closePattern, '');
}
```

#### 3. Create File Watcher Module
**File**: `hive/src/main/file-watcher.ts`

```typescript
import chokidar, { FSWatcher } from 'chokidar';
import { BrowserWindow } from 'electron';
import path from 'path';

let watcher: FSWatcher | null = null;

export function startWatching(thoughtsPath: string, mainWindow: BrowserWindow): void {
  stopWatching();

  watcher = chokidar.watch(thoughtsPath, {
    ignored: /(^|[\/\\])\../, // ignore dotfiles
    persistent: true,
    ignoreInitial: true,
    depth: 10,
    awaitWriteFinish: {
      stabilityThreshold: 300,
      pollInterval: 100,
    },
  });

  watcher.on('all', (event, filePath) => {
    // Only notify about markdown files
    if (path.extname(filePath) === '.md') {
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send('fs:file-changed', {
          path: filePath,
          event: event as 'add' | 'change' | 'unlink',
        });
      }
    }
  });
}

export function stopWatching(): void {
  if (watcher) {
    watcher.close();
    watcher = null;
  }
}
```

#### 4. Create File System Module
**File**: `hive/src/main/file-system.ts`

```typescript
import fs from 'fs/promises';
import path from 'path';
import type { FileNode, FileContent } from '../shared/types';
import { parseHiveComments } from './comment-parser';

export async function readDirectory(dirPath: string): Promise<FileNode[]> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const nodes: FileNode[] = [];

    for (const entry of entries) {
      // Skip hidden files
      if (entry.name.startsWith('.')) continue;

      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        const children = await readDirectory(fullPath);
        nodes.push({
          name: entry.name,
          path: fullPath,
          type: 'directory',
          children,
        });
      } else if (entry.name.endsWith('.md')) {
        nodes.push({
          name: entry.name,
          path: fullPath,
          type: 'file',
        });
      }
    }

    // Sort: directories first, then files, alphabetically
    return nodes.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'directory' ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
  } catch (error) {
    console.error('Error reading directory:', dirPath, error);
    return [];
  }
}

export async function readFile(filePath: string): Promise<FileContent> {
  const content = await fs.readFile(filePath, 'utf-8');
  const comments = parseHiveComments(content);

  return {
    path: filePath,
    content,
    comments,
  };
}

export async function writeFile(filePath: string, content: string): Promise<void> {
  await fs.writeFile(filePath, content, 'utf-8');
}

export async function directoryExists(dirPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(dirPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}
```

#### 5. Update IPC Handlers
**File**: `hive/src/main/ipc-handlers.ts`

Add imports at the top:

```typescript
import { readDirectory, readFile, writeFile, directoryExists } from './file-system';
import { startWatching, stopWatching } from './file-watcher';
```

Add handlers in `registerIpcHandlers` function:

```typescript
  // File system handlers
  ipcMain.handle('fs:read-directory', async (_, { path }) => {
    return readDirectory(path);
  });

  ipcMain.handle('fs:read-file', async (_, { path }) => {
    return readFile(path);
  });

  ipcMain.handle('fs:write-file', async (_, { path, content }) => {
    return writeFile(path, content);
  });

  ipcMain.handle('fs:watch-start', async (_, { path }) => {
    const exists = await directoryExists(path);
    if (exists) {
      startWatching(path, mainWindow);
    }
  });

  ipcMain.handle('fs:watch-stop', () => {
    stopWatching();
  });
```

### Success Criteria:

#### Automated Verification:
- [x] TypeScript compiles: `cd hive && pnpm exec tsc --noEmit`
- [x] App starts without errors: `cd hive && pnpm start`

#### Manual Verification:
- [ ] No console errors related to IPC handlers
- [ ] File operations can be tested via DevTools console

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to Phase 8.3.

---

## Phase 8.3: File Tree Component

### Overview
Create the file tree component for browsing the thoughts directory.

### Changes Required:

#### 1. Create File Tree Component
**File**: `hive/src/renderer/components/thoughts/FileTree.tsx`

```tsx
import React from 'react';
import { ChevronRight, ChevronDown, FileText, Folder, FolderOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FileNode } from '../../../shared/types';

interface FileTreeProps {
  nodes: FileNode[];
  selectedPath: string | null;
  onSelectFile: (path: string) => void;
  expandedDirs: Set<string>;
  onToggleDir: (path: string) => void;
}

export function FileTree({
  nodes,
  selectedPath,
  onSelectFile,
  expandedDirs,
  onToggleDir,
}: FileTreeProps) {
  return (
    <div className="py-1">
      {nodes.map((node) => (
        <FileTreeNode
          key={node.path}
          node={node}
          depth={0}
          selectedPath={selectedPath}
          onSelectFile={onSelectFile}
          expandedDirs={expandedDirs}
          onToggleDir={onToggleDir}
        />
      ))}
    </div>
  );
}

interface FileTreeNodeProps {
  node: FileNode;
  depth: number;
  selectedPath: string | null;
  onSelectFile: (path: string) => void;
  expandedDirs: Set<string>;
  onToggleDir: (path: string) => void;
}

function FileTreeNode({
  node,
  depth,
  selectedPath,
  onSelectFile,
  expandedDirs,
  onToggleDir,
}: FileTreeNodeProps) {
  const isExpanded = expandedDirs.has(node.path);
  const isSelected = selectedPath === node.path;
  const paddingLeft = depth * 12 + 8;

  const handleClick = () => {
    if (node.type === 'directory') {
      onToggleDir(node.path);
    } else {
      onSelectFile(node.path);
    }
  };

  return (
    <div>
      <button
        onClick={handleClick}
        className={cn(
          'w-full flex items-center gap-1 py-1 text-sm text-left',
          'hover:bg-[var(--sidebar-accent)] transition-colors',
          isSelected && 'bg-[var(--sidebar-accent)] text-[var(--primary)]'
        )}
        style={{ paddingLeft }}
      >
        {node.type === 'directory' ? (
          <>
            {isExpanded ? (
              <ChevronDown className="h-3 w-3 flex-shrink-0" />
            ) : (
              <ChevronRight className="h-3 w-3 flex-shrink-0" />
            )}
            {isExpanded ? (
              <FolderOpen className="h-4 w-4 flex-shrink-0 text-[var(--warning)]" />
            ) : (
              <Folder className="h-4 w-4 flex-shrink-0 text-[var(--warning)]" />
            )}
          </>
        ) : (
          <>
            <span className="w-3" />
            <FileText className="h-4 w-4 flex-shrink-0 text-[var(--foreground-muted)]" />
          </>
        )}
        <span className="truncate">{node.name}</span>
      </button>

      {node.type === 'directory' && isExpanded && node.children && (
        <div>
          {node.children.map((child) => (
            <FileTreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              onSelectFile={onSelectFile}
              expandedDirs={expandedDirs}
              onToggleDir={onToggleDir}
            />
          ))}
        </div>
      )}
    </div>
  );
}
```

#### 2. Create Thoughts Pane Container
**File**: `hive/src/renderer/components/thoughts/ThoughtsPane.tsx`

```tsx
import React from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { FileTree } from './FileTree';
import { ThoughtsEditor } from './ThoughtsEditor';
import { RefreshCw, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { FileNode, FileContent } from '../../../shared/types';

interface ThoughtsPaneProps {
  projectDirectory: string;
}

export function ThoughtsPane({ projectDirectory }: ThoughtsPaneProps) {
  const [nodes, setNodes] = React.useState<FileNode[]>([]);
  const [selectedPath, setSelectedPath] = React.useState<string | null>(null);
  const [fileContent, setFileContent] = React.useState<FileContent | null>(null);
  const [expandedDirs, setExpandedDirs] = React.useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = React.useState(true);
  const [hasThoughtsDir, setHasThoughtsDir] = React.useState(true);

  const thoughtsPath = `${projectDirectory}/thoughts`;

  // Load directory structure
  const loadDirectory = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await window.electronAPI.invoke<FileNode[]>('fs:read-directory', {
        path: thoughtsPath,
      });
      setNodes(result);
      setHasThoughtsDir(true);
    } catch (error) {
      console.error('Failed to load thoughts directory:', error);
      setHasThoughtsDir(false);
    } finally {
      setIsLoading(false);
    }
  }, [thoughtsPath]);

  // Initial load
  React.useEffect(() => {
    loadDirectory();
  }, [loadDirectory]);

  // Start file watcher
  React.useEffect(() => {
    window.electronAPI.invoke('fs:watch-start', { path: thoughtsPath });

    const unsubscribe = window.electronAPI.on('fs:file-changed', (data: unknown) => {
      const { path, event } = data as { path: string; event: string };

      // Refresh directory on any change
      loadDirectory();

      // If the currently open file changed, reload it
      if (selectedPath === path && event === 'change') {
        loadFile(path);
      }
    });

    return () => {
      unsubscribe();
      window.electronAPI.invoke('fs:watch-stop');
    };
  }, [thoughtsPath, selectedPath, loadDirectory]);

  // Load file content
  const loadFile = async (path: string) => {
    try {
      const content = await window.electronAPI.invoke<FileContent>('fs:read-file', { path });
      setFileContent(content);
    } catch (error) {
      console.error('Failed to load file:', error);
    }
  };

  const handleSelectFile = (path: string) => {
    setSelectedPath(path);
    loadFile(path);
  };

  const handleToggleDir = (path: string) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const handleSaveFile = async (content: string) => {
    if (!selectedPath) return;

    try {
      await window.electronAPI.invoke('fs:write-file', {
        path: selectedPath,
        content,
      });
      // Reload to get updated comments
      loadFile(selectedPath);
    } catch (error) {
      console.error('Failed to save file:', error);
    }
  };

  const handleOpenInEditor = () => {
    // TODO: Open project in $EDITOR
    console.log('Open in external editor:', projectDirectory);
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-[var(--foreground-muted)]">Loading thoughts...</p>
      </div>
    );
  }

  if (!hasThoughtsDir) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4">
        <p className="text-[var(--foreground-muted)]">
          No thoughts/ directory found in this project.
        </p>
        <p className="text-sm text-[var(--foreground-muted)]">
          Create a thoughts/ directory to start organizing your research and plans.
        </p>
      </div>
    );
  }

  return (
    <PanelGroup direction="horizontal" autoSaveId="hive-thoughts-layout">
      {/* File Tree Panel */}
      <Panel id="thoughts-tree" defaultSize={25} minSize={15} maxSize={40}>
        <div className="h-full flex flex-col bg-[var(--sidebar)]">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border)]">
            <span className="text-sm font-medium">thoughts/</span>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={loadDirectory}
                title="Refresh"
              >
                <RefreshCw className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={handleOpenInEditor}
                title="Open in external editor"
              >
                <ExternalLink className="h-3 w-3" />
              </Button>
            </div>
          </div>

          {/* Tree */}
          <div className="flex-1 overflow-auto">
            {nodes.length === 0 ? (
              <p className="text-sm text-[var(--foreground-muted)] p-3">
                No markdown files found
              </p>
            ) : (
              <FileTree
                nodes={nodes}
                selectedPath={selectedPath}
                onSelectFile={handleSelectFile}
                expandedDirs={expandedDirs}
                onToggleDir={handleToggleDir}
              />
            )}
          </div>
        </div>
      </Panel>

      <PanelResizeHandle className="w-1 bg-[var(--border)] hover:bg-[var(--primary)] transition-colors" />

      {/* Editor Panel */}
      <Panel id="thoughts-editor" minSize={50}>
        {fileContent ? (
          <ThoughtsEditor
            fileContent={fileContent}
            onSave={handleSaveFile}
          />
        ) : (
          <div className="h-full flex items-center justify-center">
            <p className="text-[var(--foreground-muted)]">
              Select a file to view
            </p>
          </div>
        )}
      </Panel>
    </PanelGroup>
  );
}
```

#### 3. Create Placeholder Editor (will be replaced in Phase 8.4)
**File**: `hive/src/renderer/components/thoughts/ThoughtsEditor.tsx`

```tsx
import React from 'react';
import type { FileContent } from '../../../shared/types';

interface ThoughtsEditorProps {
  fileContent: FileContent;
  onSave: (content: string) => void;
}

export function ThoughtsEditor({ fileContent, onSave }: ThoughtsEditorProps) {
  const [content, setContent] = React.useState(fileContent.content);
  const [isDirty, setIsDirty] = React.useState(false);

  React.useEffect(() => {
    setContent(fileContent.content);
    setIsDirty(false);
  }, [fileContent.path, fileContent.content]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
    setIsDirty(true);
  };

  const handleSave = () => {
    onSave(content);
    setIsDirty(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault();
      handleSave();
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--border)] bg-[var(--background-secondary)]">
        <span className="text-sm font-medium truncate">
          {fileContent.path.split('/').pop()}
          {isDirty && <span className="ml-1 text-[var(--warning)]">*</span>}
        </span>
        <button
          onClick={handleSave}
          disabled={!isDirty}
          className="px-3 py-1 text-sm rounded bg-[var(--primary)] text-[var(--primary-foreground)] disabled:opacity-50"
        >
          Save
        </button>
      </div>

      {/* Textarea placeholder - will be replaced with Monaco */}
      <textarea
        value={content}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        className="flex-1 p-4 font-mono text-sm bg-[var(--background)] text-[var(--foreground)] resize-none focus:outline-none"
        placeholder="Loading..."
      />

      {/* Comments indicator */}
      {fileContent.comments.length > 0 && (
        <div className="px-4 py-2 border-t border-[var(--border)] bg-[var(--background-secondary)]">
          <span className="text-xs text-[var(--foreground-muted)]">
            {fileContent.comments.length} comment(s) found
          </span>
        </div>
      )}
    </div>
  );
}
```

#### 4. Update SessionView
**File**: `hive/src/renderer/components/views/SessionView.tsx`

Replace the import section and add ThoughtsPane import:

```tsx
import React from 'react';
import { cn } from '@/lib/utils';
import { ThoughtsPane } from '../thoughts/ThoughtsPane';
import type { Session } from '../../../shared/types';
import { useTabContext } from '../layout/MainLayout';
```

Replace line 65 (`{activeTab === 'thoughts' && <PlaceholderTab title="Thoughts" />}`) with:

```tsx
{activeTab === 'thoughts' && (
  <ThoughtsPane projectDirectory={project?.directory ?? ''} />
)}
```

Add this near the top of the function to get project from context:

```tsx
const { project } = useTabContext();
```

### Success Criteria:

#### Automated Verification:
- [x] TypeScript compiles: `cd hive && pnpm exec tsc --noEmit`
- [x] App starts: `cd hive && pnpm start`

#### Manual Verification:
- [ ] Thoughts tab shows file tree on left, editor on right
- [ ] File tree displays `thoughts/` directory structure
- [ ] Clicking a markdown file shows its content
- [ ] Editing content and saving (Cmd+S) persists to disk
- [ ] Resize handle between panels works
- [ ] Empty state shows when no `thoughts/` directory exists

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to Phase 8.4.

---

## Phase 8.4: Monaco Editor Integration

### Overview
Replace the textarea with Monaco Editor including Solarized themes.

### Changes Required:

#### 1. Create Monaco Theme Definitions
**File**: `hive/src/renderer/lib/monaco-themes.ts`

```typescript
import type { editor } from 'monaco-editor';

export const solarizedLight: editor.IStandaloneThemeData = {
  base: 'vs',
  inherit: true,
  rules: [
    { token: 'comment', foreground: '93a1a1', fontStyle: 'italic' },
    { token: 'keyword', foreground: '859900' },
    { token: 'string', foreground: '2aa198' },
    { token: 'number', foreground: 'd33682' },
    { token: 'type', foreground: 'b58900' },
    { token: 'function', foreground: '268bd2' },
    { token: 'variable', foreground: '657b83' },
    { token: 'constant', foreground: 'cb4b16' },
    { token: 'heading', foreground: 'cb4b16', fontStyle: 'bold' },
    { token: 'emphasis', fontStyle: 'italic' },
    { token: 'strong', fontStyle: 'bold' },
  ],
  colors: {
    'editor.background': '#fdf6e3',
    'editor.foreground': '#657b83',
    'editor.lineHighlightBackground': '#eee8d5',
    'editor.selectionBackground': '#eee8d5',
    'editorCursor.foreground': '#657b83',
    'editorLineNumber.foreground': '#93a1a1',
    'editorLineNumber.activeForeground': '#657b83',
    'editor.wordHighlightBackground': '#eee8d550',
    'editorBracketMatch.background': '#eee8d5',
    'editorBracketMatch.border': '#93a1a1',
  },
};

export const solarizedDark: editor.IStandaloneThemeData = {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'comment', foreground: '586e75', fontStyle: 'italic' },
    { token: 'keyword', foreground: '859900' },
    { token: 'string', foreground: '2aa198' },
    { token: 'number', foreground: 'd33682' },
    { token: 'type', foreground: 'b58900' },
    { token: 'function', foreground: '268bd2' },
    { token: 'variable', foreground: '839496' },
    { token: 'constant', foreground: 'cb4b16' },
    { token: 'heading', foreground: 'cb4b16', fontStyle: 'bold' },
    { token: 'emphasis', fontStyle: 'italic' },
    { token: 'strong', fontStyle: 'bold' },
  ],
  colors: {
    'editor.background': '#002b36',
    'editor.foreground': '#839496',
    'editor.lineHighlightBackground': '#073642',
    'editor.selectionBackground': '#073642',
    'editorCursor.foreground': '#839496',
    'editorLineNumber.foreground': '#586e75',
    'editorLineNumber.activeForeground': '#839496',
    'editor.wordHighlightBackground': '#07364250',
    'editorBracketMatch.background': '#073642',
    'editorBracketMatch.border': '#586e75',
  },
};
```

#### 2. Update ThoughtsEditor with Monaco
**File**: `hive/src/renderer/components/thoughts/ThoughtsEditor.tsx`

Replace entire file:

```tsx
import React from 'react';
import Editor, { OnMount } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import { solarizedLight, solarizedDark } from '@/lib/monaco-themes';
import { useThemeStore } from '@/lib/store';
import { MessageSquare, Save, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { FileContent, HiveComment } from '../../../shared/types';

interface ThoughtsEditorProps {
  fileContent: FileContent;
  onSave: (content: string) => void;
  onSendComments?: (comments: HiveComment[]) => void;
}

export function ThoughtsEditor({ fileContent, onSave, onSendComments }: ThoughtsEditorProps) {
  const [content, setContent] = React.useState(fileContent.content);
  const [isDirty, setIsDirty] = React.useState(false);
  const editorRef = React.useRef<editor.IStandaloneCodeEditor | null>(null);
  const { resolvedTheme } = useThemeStore();

  React.useEffect(() => {
    setContent(fileContent.content);
    setIsDirty(false);
  }, [fileContent.path, fileContent.content]);

  const handleEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;

    // Register Solarized themes
    monaco.editor.defineTheme('solarized-light', solarizedLight);
    monaco.editor.defineTheme('solarized-dark', solarizedDark);

    // Set theme based on current app theme
    monaco.editor.setTheme(resolvedTheme === 'dark' ? 'solarized-dark' : 'solarized-light');

    // Add save keybinding
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      handleSave();
    });
  };

  // Update theme when app theme changes
  React.useEffect(() => {
    if (editorRef.current) {
      const monaco = (window as any).monaco;
      if (monaco) {
        monaco.editor.setTheme(resolvedTheme === 'dark' ? 'solarized-dark' : 'solarized-light');
      }
    }
  }, [resolvedTheme]);

  const handleChange = (value: string | undefined) => {
    if (value !== undefined) {
      setContent(value);
      setIsDirty(value !== fileContent.content);
    }
  };

  const handleSave = () => {
    onSave(content);
    setIsDirty(false);
  };

  const handleSendComments = () => {
    if (onSendComments && fileContent.comments.length > 0) {
      onSendComments(fileContent.comments);
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--border)] bg-[var(--background-secondary)]">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">
            {fileContent.path.split('/').pop()}
          </span>
          {isDirty && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--warning)]/20 text-[var(--warning)]">
              unsaved
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {fileContent.comments.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSendComments}
              className="gap-1"
              title="Send comments to Claude"
            >
              <Send className="h-3 w-3" />
              <span className="text-xs">{fileContent.comments.length}</span>
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSave}
            disabled={!isDirty}
            className="gap-1"
          >
            <Save className="h-3 w-3" />
            Save
          </Button>
        </div>
      </div>

      {/* Monaco Editor */}
      <div className="flex-1">
        <Editor
          height="100%"
          language="markdown"
          value={content}
          onChange={handleChange}
          onMount={handleEditorMount}
          theme={resolvedTheme === 'dark' ? 'solarized-dark' : 'solarized-light'}
          options={{
            fontFamily: 'Hack, "Fira Code", monospace',
            fontSize: 14,
            lineHeight: 1.6,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            lineNumbers: 'on',
            renderLineHighlight: 'line',
            scrollbar: {
              verticalScrollbarSize: 8,
              horizontalScrollbarSize: 8,
            },
            padding: { top: 8, bottom: 8 },
          }}
        />
      </div>

      {/* Comments Panel */}
      {fileContent.comments.length > 0 && (
        <div className="border-t border-[var(--border)] bg-[var(--background-secondary)]">
          <div className="px-4 py-2">
            <div className="flex items-center gap-2 text-sm text-[var(--foreground-muted)]">
              <MessageSquare className="h-4 w-4" />
              <span>{fileContent.comments.length} comment(s)</span>
            </div>
          </div>
          <div className="max-h-32 overflow-auto px-4 pb-2">
            {fileContent.comments.map((comment) => (
              <div
                key={comment.id}
                className="text-xs py-1 border-l-2 border-[var(--primary)] pl-2 mb-1"
              >
                <span className="text-[var(--foreground-muted)]">
                  Lines {comment.startLine}-{comment.endLine}:
                </span>{' '}
                {comment.content}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

### Success Criteria:

#### Automated Verification:
- [x] TypeScript compiles: `cd hive && pnpm exec tsc --noEmit`
- [x] App starts: `cd hive && pnpm start`

#### Manual Verification:
- [ ] Monaco Editor renders in the Thoughts tab
- [ ] Syntax highlighting works for markdown
- [ ] Cmd+S saves the file
- [ ] Theme switches correctly when toggling Light/Dark mode
- [ ] Comments panel shows parsed hive-comments
- [ ] Editor is scrollable and responsive

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to Phase 8.5.

---

## Phase 8.5: Comment UI & Send to Claude

### Overview
Add UI for creating comments and sending them to the active Claude session.

### Changes Required:

#### 1. Create Comment Dialog Component
**File**: `hive/src/renderer/components/thoughts/AddCommentDialog.tsx`

```tsx
import React from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { nanoid } from 'nanoid';

interface AddCommentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (comment: string) => void;
  selectedText?: string;
  line: number;
}

export function AddCommentDialog({
  isOpen,
  onClose,
  onSubmit,
  selectedText,
  line,
}: AddCommentDialogProps) {
  const [comment, setComment] = React.useState('');
  const inputRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  React.useEffect(() => {
    if (!isOpen) {
      setComment('');
    }
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (comment.trim()) {
      onSubmit(comment.trim());
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Dialog */}
      <div className="relative w-full max-w-md bg-[var(--background)] rounded-lg shadow-xl border border-[var(--border)]">
        <form onSubmit={handleSubmit}>
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
            <h2 className="text-lg font-semibold">Add Comment</h2>
            <Button variant="ghost" size="icon" type="button" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Content */}
          <div className="p-4 space-y-4">
            <p className="text-sm text-[var(--foreground-muted)]">
              Line {line}
              {selectedText && (
                <>
                  : <code className="bg-[var(--secondary)] px-1 rounded">{selectedText.slice(0, 50)}...</code>
                </>
              )}
            </p>

            <textarea
              ref={inputRef}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Add feedback for Claude to review..."
              className="w-full h-24 px-3 py-2 rounded border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] placeholder:text-[var(--foreground-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
            />

            <p className="text-xs text-[var(--foreground-muted)]">
              This will insert a hive-comment tag that Claude can see and respond to.
            </p>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2 p-4 border-t border-[var(--border)]">
            <Button variant="ghost" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!comment.trim()}>
              Add Comment
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

#### 2. Add nanoid dependency (already installed from database phase, but verify)

```bash
cd /Users/taras/Documents/code/ai-toolbox/hive
pnpm add nanoid
```

#### 3. Update ThoughtsEditor to support adding comments
**File**: `hive/src/renderer/components/thoughts/ThoughtsEditor.tsx`

Add imports:

```tsx
import { nanoid } from 'nanoid';
import { AddCommentDialog } from './AddCommentDialog';
import { insertComment } from '@/lib/comment-utils';
```

Add state and handlers inside the component (after the existing state):

```tsx
const [showCommentDialog, setShowCommentDialog] = React.useState(false);
const [commentLine, setCommentLine] = React.useState(1);
const [selectedText, setSelectedText] = React.useState('');

const handleAddComment = () => {
  if (editorRef.current) {
    const selection = editorRef.current.getSelection();
    const model = editorRef.current.getModel();

    if (selection && model) {
      const line = selection.startLineNumber;
      const text = model.getValueInRange(selection);
      setCommentLine(line);
      setSelectedText(text);
      setShowCommentDialog(true);
    }
  }
};

const handleCommentSubmit = (commentContent: string) => {
  const commentId = nanoid(10);
  const newContent = insertComment(content, commentLine, commentId, commentContent);
  setContent(newContent);
  setIsDirty(true);

  // Auto-save after adding comment
  onSave(newContent);
};
```

Add a comment button in the header (after the Save button):

```tsx
<Button
  variant="ghost"
  size="sm"
  onClick={handleAddComment}
  className="gap-1"
  title="Add comment at cursor"
>
  <MessageSquare className="h-3 w-3" />
  Comment
</Button>
```

Add the dialog before the closing div:

```tsx
<AddCommentDialog
  isOpen={showCommentDialog}
  onClose={() => setShowCommentDialog(false)}
  onSubmit={handleCommentSubmit}
  selectedText={selectedText}
  line={commentLine}
/>
```

#### 4. Create comment utilities for renderer
**File**: `hive/src/renderer/lib/comment-utils.ts`

```typescript
export function insertComment(
  markdown: string,
  line: number,
  commentId: string,
  commentContent: string
): string {
  const lines = markdown.split('\n');
  const openTag = `<!-- hive-comment(${commentId}): ${commentContent} -->`;
  const closeTag = `<!-- hive-comment(${commentId}) -->`;

  // Insert opening tag before the line, closing tag after
  if (line > 0 && line <= lines.length) {
    // Insert after the current line
    lines.splice(line, 0, closeTag);
    lines.splice(line - 1, 0, openTag);
  }

  return lines.join('\n');
}

export function removeComment(markdown: string, commentId: string): string {
  const openPattern = new RegExp(`<!--\\s*hive-comment\\(${commentId}\\):[^>]*-->\\n?`, 'g');
  const closePattern = new RegExp(`<!--\\s*hive-comment\\(${commentId}\\)\\s*-->\\n?`, 'g');

  return markdown.replace(openPattern, '').replace(closePattern, '');
}

export function formatCommentsForClaude(comments: Array<{ id: string; content: string; startLine: number; endLine: number }>): string {
  if (comments.length === 0) return '';

  const header = 'Please review and address the following comments:\n\n';
  const commentsList = comments.map((c, i) =>
    `${i + 1}. [Lines ${c.startLine}-${c.endLine}] ${c.content}`
  ).join('\n');

  return header + commentsList;
}
```

#### 5. Wire up Send to Claude
**File**: `hive/src/renderer/components/thoughts/ThoughtsPane.tsx`

Add import:

```tsx
import { formatCommentsForClaude } from '@/lib/comment-utils';
```

Add handler:

```tsx
const handleSendComments = (comments: HiveComment[]) => {
  const prompt = formatCommentsForClaude(comments);
  // TODO: Send to active Claude session via SDK
  // For now, log it
  console.log('Send to Claude:', prompt);

  // Could also copy to clipboard
  navigator.clipboard.writeText(prompt);
  alert('Comments copied to clipboard! You can paste them into the Agent tab.');
};
```

Update ThoughtsEditor usage:

```tsx
<ThoughtsEditor
  fileContent={fileContent}
  onSave={handleSaveFile}
  onSendComments={handleSendComments}
/>
```

### Success Criteria:

#### Automated Verification:
- [x] TypeScript compiles: `cd hive && pnpm exec tsc --noEmit`
- [x] App starts: `cd hive && pnpm start`

#### Manual Verification:
- [ ] Clicking "Comment" button opens dialog
- [ ] Adding a comment inserts proper HTML tags in the file
- [ ] Comments appear in the comments panel below editor
- [ ] "Send" button formats comments and copies to clipboard
- [ ] Comments persist after saving and reopening file

**Implementation Note**: This is the final phase for the Thoughts Pane. After completing all verification, the feature is ready for use.

---

## Testing Strategy

### Unit Tests (Deferred):
- Comment parsing with various edge cases
- File tree node sorting
- Comment insertion/removal

### Integration Tests (Deferred):
- IPC handler file operations
- File watcher events
- Monaco editor save flow

### Manual Testing Steps:

1. **Fresh Project Test**:
   - Create a project without `thoughts/` directory
   - Verify empty state message
   - Create `thoughts/` directory externally
   - Verify UI updates (file watcher)

2. **Editing Flow Test**:
   - Open a markdown file
   - Make edits
   - Verify unsaved indicator
   - Save with Cmd+S
   - Verify file on disk

3. **Comment Flow Test**:
   - Add a comment via dialog
   - Verify HTML tags in file
   - Reopen file, verify comments parse
   - Click Send, verify clipboard content

4. **Theme Test**:
   - Toggle theme in settings
   - Verify Monaco theme changes

---

## Performance Considerations

- **File watching**: chokidar with `awaitWriteFinish` prevents excessive events
- **Large directories**: Tree rendering is depth-limited (10 levels)
- **Monaco lazy loading**: Editor loads on-demand via dynamic import

---

## References

### Related Research:
- `thoughts/shared/research/2025-12-15-hive-electron-app-research.md` - Core architecture
- `thoughts/shared/research/2025-12-15-hive-ux-ui-design-spec.md` - UI specification (Monaco themes lines 637-681)
- `thoughts/shared/research/2025-12-14-markdown-comment-parsing-persistence.md` - Comment system

### External Resources:
- [Monaco Editor React](https://github.com/suren-atoyan/monaco-react)
- [unified/remark](https://unifiedjs.com/)
- [chokidar](https://github.com/paulmillr/chokidar)
- [nanoid](https://github.com/ai/nanoid)

### Previous Plan:
- `thoughts/shared/plans/2025-12-15-hive-v0.1-foundation-setup.md` - Phase 1-6 foundation

---

## Additional Features (Post-Plan)

The following features were added after the initial plan was completed:

### Fuse.js File Search
- Search input at top of file tree
- Fuzzy matching on file paths and names using fuse.js
- Shows flat list of results when searching (instead of tree view)
- Displays relative path under each filename
- Clear button to reset search
- Empty state when no matches
