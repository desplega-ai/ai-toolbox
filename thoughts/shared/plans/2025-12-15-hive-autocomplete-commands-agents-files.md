# Hive Autocomplete: Commands, Agents, and File References

## Overview

Implement autocomplete in Hive's MessageInput that supports:
1. **Commands** with `/` prefix (e.g., `/compact`, `/clear`, `/help`)
2. **Agents** with `@` prefix (e.g., `@qa-expert`, `@codebase-analyzer`)
3. **File references** with `@` prefix (e.g., `@src/main/index.ts`)

The autocomplete triggers on `/` or `@` characters, shows a dropdown with filtered suggestions, and inserts the selected item into the input.

## Current State Analysis

### Existing Implementation
- **MessageInput.tsx** (`hive/src/renderer/components/session/MessageInput.tsx:1-187`): Textarea with auto-resize (2-10 lines), draft persistence via Zustand, external editor support (Ctrl+G)
- **SDK Types** (`hive/src/shared/sdk-types.ts:1-10`): `SDKInitMessage` includes `slash_commands: string[]` and optionally `agents?: string[]`
- **File System IPC** (`hive/src/main/ipc-handlers.ts:445-447`): `fs:read-directory` handler already exists
- **File System Utils** (`hive/src/main/file-system.ts:6-45`): `readDirectory()` function for recursive directory reading

### Missing Features
- No trigger detection for `/` or `@`
- No autocomplete dropdown component
- No cursor position tracking
- No file index for fuzzy search
- No storage for available commands/agents from SDK init

### Key Discoveries
- SDK init message provides `slash_commands` array which can be stored on session start (`sdk-types.ts:7`)
- Agents are NOT invoked via `@agent-name` syntax - they're invoked via Task tool internally
- File references with `@` are a Hive-specific convenience feature
- Current `readDirectory` only returns `.md` files and skips hidden directories - needs modification for general file indexing

## Desired End State

After completing this plan:

1. **Command Autocomplete**: Type `/` to see available slash commands, filtered as you type
2. **Agent Autocomplete**: Type `@` to see available agents, with descriptions
3. **File Autocomplete**: Type `@` followed by characters to fuzzy-search project files
4. **Categorized Dropdown**: `@` shows agents first (with header), then files (with header)
5. **Keyboard Navigation**: Arrow keys, Enter to select, Escape to dismiss
6. **Fuzzy Matching**: Files matched via fuse.js for typo-tolerant search
7. **Gitignore Respect**: File index excludes `.gitignore` patterns and common directories

### Verification
- Type `/` in MessageInput - see dropdown with `/compact`, `/clear`, etc.
- Type `/com` - see filtered results with `/compact` highlighted
- Press Enter - `/compact` inserted into input
- Type `@qa` - see "Agents" header with `@qa-expert` option
- Type `@src/main` - see "Files" header with matching files from project
- Escape dismisses dropdown, clicking outside dismisses dropdown

## What We're NOT Doing

1. **Auto-invoking agents**: `@agent-name` just inserts text, not auto-triggers Task tool
2. **Auto-reading files**: `@file/path` just inserts the path, Claude decides to read it
3. **Multi-project file index**: Index is per-session based on project directory
4. **Real-time file watching**: File index built on session start, not live-updated
5. **Command descriptions**: Using just names from SDK, not fetching full `supportedCommands()`
6. **Agent creation UI**: Using pre-defined agents, not UI for defining custom agents

## Implementation Approach

Build in layers:
1. **Install dependencies**: `fuse.js`, `ignore`, `textarea-caret`
2. **File indexer in main process**: Build file index respecting .gitignore
3. **Autocomplete data store**: Store commands, agents, file index in Zustand
4. **Autocomplete dropdown component**: Positioned at caret, keyboard navigable
5. **Integrate with MessageInput**: Trigger detection, dropdown display, selection handling

---

## Phase 1: Dependencies & File Indexer

### Overview
Install required dependencies and create file indexing infrastructure in main process.

### Changes Required:

#### 1. Install Dependencies
**Location**: `hive/`

```bash
cd /Users/taras/Documents/code/ai-toolbox/hive
pnpm add fuse.js ignore textarea-caret
```

#### 2. File Indexer Module
**File**: `hive/src/main/file-indexer.ts` (new file)

```typescript
import ignore, { Ignore } from 'ignore';
import fs from 'fs/promises';
import path from 'path';

export interface FileEntry {
  path: string;      // Relative path from project root
  name: string;      // Filename only
  type: 'file' | 'directory';
}

// Cache file index per project directory
const fileIndexCache = new Map<string, FileEntry[]>();

// Default patterns to always ignore
const DEFAULT_IGNORES = [
  '.git',
  'node_modules',
  '.DS_Store',
  '*.log',
  'dist',
  'build',
  '.next',
  '.cache',
  '.vite',
  '__pycache__',
  '*.pyc',
  '.env',
  '.env.*',
  'coverage',
  '.nyc_output',
];

export async function buildFileIndex(projectRoot: string): Promise<FileEntry[]> {
  const ig = ignore();

  // Load .gitignore if exists
  const gitignorePath = path.join(projectRoot, '.gitignore');
  try {
    const gitignoreContent = await fs.readFile(gitignorePath, 'utf-8');
    ig.add(gitignoreContent);
  } catch {
    // No .gitignore, continue
  }

  // Always ignore common patterns
  ig.add(DEFAULT_IGNORES);

  const files: FileEntry[] = [];

  async function walk(dir: string, relativePath = '') {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      // Directory not readable
      return;
    }

    for (const entry of entries) {
      const entryRelativePath = relativePath
        ? `${relativePath}/${entry.name}`
        : entry.name;

      // Check if ignored
      if (ig.ignores(entryRelativePath)) continue;

      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        // Add directory entry
        files.push({
          path: entryRelativePath,
          name: entry.name,
          type: 'directory',
        });
        await walk(fullPath, entryRelativePath);
      } else {
        files.push({
          path: entryRelativePath,
          name: entry.name,
          type: 'file',
        });
      }
    }
  }

  await walk(projectRoot);

  // Cache the result
  fileIndexCache.set(projectRoot, files);

  return files;
}

export function getFileIndex(projectRoot: string): FileEntry[] {
  return fileIndexCache.get(projectRoot) || [];
}

export function clearFileIndex(projectRoot: string): void {
  fileIndexCache.delete(projectRoot);
}
```

#### 3. Add IPC Handlers for File Indexing
**File**: `hive/src/main/ipc-handlers.ts`

Add near the other file system handlers:

```typescript
import { buildFileIndex, getFileIndex, clearFileIndex, type FileEntry } from './file-indexer';

// In registerIpcHandlers function, add:

// File index for autocomplete
ipcMain.handle('fs:build-file-index', async (_, { projectPath }) => {
  return buildFileIndex(projectPath);
});

ipcMain.handle('fs:get-file-index', (_, { projectPath }) => {
  return getFileIndex(projectPath);
});

ipcMain.handle('fs:clear-file-index', (_, { projectPath }) => {
  clearFileIndex(projectPath);
});
```

#### 4. Update IPC Types
**File**: `hive/src/shared/types.ts`

Add to IpcChannels interface:

```typescript
'fs:build-file-index': { params: { projectPath: string }; result: FileEntry[] };
'fs:get-file-index': { params: { projectPath: string }; result: FileEntry[] };
'fs:clear-file-index': { params: { projectPath: string }; result: void };
```

Also add FileEntry type export:

```typescript
export interface FileEntry {
  path: string;
  name: string;
  type: 'file' | 'directory';
}
```

### Success Criteria:

#### Automated Verification:
- [x] Dependencies install: `cd hive && pnpm add fuse.js ignore textarea-caret`
- [x] TypeScript compiles: `cd hive && pnpm exec tsc --noEmit`
- [x] App starts: `cd hive && pnpm start`

#### Manual Verification:
- [x] Open DevTools console, call `window.electronAPI.invoke('fs:build-file-index', { projectPath: '/path/to/project' })`
- [x] Verify array of FileEntry objects returned
- [x] Verify `node_modules`, `.git`, etc. are excluded

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to Phase 2.

---

## Phase 2: Autocomplete Data Store

### Overview
Create Zustand store to hold autocomplete data (commands, agents, file index) and hooks for searching.

### Changes Required:

#### 1. Autocomplete Store
**File**: `hive/src/renderer/lib/autocomplete-store.ts` (new file)

```typescript
import { create } from 'zustand';
import Fuse from 'fuse.js';

// Types
export interface CommandItem {
  name: string;
  description?: string;
  argumentHint?: string;
}

export interface AgentItem {
  name: string;
  description: string;
}

export interface FileItem {
  path: string;
  name: string;
  type: 'file' | 'directory';
}

export type AutocompleteItem =
  | { type: 'command'; item: CommandItem }
  | { type: 'agent'; item: AgentItem }
  | { type: 'file'; item: FileItem };

// Store interface
interface AutocompleteState {
  // Raw data
  commands: CommandItem[];
  agents: AgentItem[];
  fileIndex: FileItem[];

  // Fuse instances for fuzzy search
  fileFuse: Fuse<FileItem> | null;

  // Actions
  setCommands: (commands: string[]) => void;
  setAgents: (agents: AgentItem[]) => void;
  setFileIndex: (files: FileItem[]) => void;
  clearFileIndex: () => void;

  // Search functions
  searchCommands: (query: string, limit?: number) => CommandItem[];
  searchAgents: (query: string, limit?: number) => AgentItem[];
  searchFiles: (query: string, limit?: number) => FileItem[];
}

// Default agents (Hive-specific)
const DEFAULT_AGENTS: AgentItem[] = [
  { name: 'qa-expert', description: 'Expert QA engineer for testing' },
  { name: 'codebase-analyzer', description: 'Analyzes codebase implementation' },
  { name: 'codebase-locator', description: 'Locates files and components' },
  { name: 'codebase-pattern-finder', description: 'Finds similar implementations' },
  { name: 'web-search-researcher', description: 'Researches questions via web' },
];

export const useAutocompleteStore = create<AutocompleteState>((set, get) => ({
  commands: [],
  agents: DEFAULT_AGENTS,
  fileIndex: [],
  fileFuse: null,

  setCommands: (commandNames) => {
    const commands: CommandItem[] = commandNames.map((name) => ({
      name: name.startsWith('/') ? name.slice(1) : name,
    }));
    set({ commands });
  },

  setAgents: (agents) => {
    set({ agents: [...DEFAULT_AGENTS, ...agents] });
  },

  setFileIndex: (files) => {
    const fuse = new Fuse(files, {
      keys: [
        { name: 'name', weight: 0.7 },
        { name: 'path', weight: 0.3 },
      ],
      threshold: 0.4,
      includeScore: true,
      ignoreLocation: true,
      minMatchCharLength: 1,
    });
    set({ fileIndex: files, fileFuse: fuse });
  },

  clearFileIndex: () => {
    set({ fileIndex: [], fileFuse: null });
  },

  searchCommands: (query, limit = 10) => {
    const { commands } = get();
    if (!query) return commands.slice(0, limit);

    const lowerQuery = query.toLowerCase();
    return commands
      .filter((cmd) => cmd.name.toLowerCase().includes(lowerQuery))
      .slice(0, limit);
  },

  searchAgents: (query, limit = 5) => {
    const { agents } = get();
    if (!query) return agents.slice(0, limit);

    const lowerQuery = query.toLowerCase();
    return agents
      .filter(
        (agent) =>
          agent.name.toLowerCase().includes(lowerQuery) ||
          agent.description.toLowerCase().includes(lowerQuery)
      )
      .slice(0, limit);
  },

  searchFiles: (query, limit = 10) => {
    const { fileIndex, fileFuse } = get();
    if (!fileFuse) return [];
    if (!query) return fileIndex.slice(0, limit);

    return fileFuse.search(query, { limit }).map((result) => result.item);
  },
}));

// Hook to build file index for a project
export function useBuildFileIndex() {
  const setFileIndex = useAutocompleteStore((s) => s.setFileIndex);

  return async (projectPath: string) => {
    const files = await window.electronAPI.invoke<FileItem[]>(
      'fs:build-file-index',
      { projectPath }
    );
    setFileIndex(files);
    return files;
  };
}
```

#### 2. Store Commands from SDK Init Message
**File**: `hive/src/renderer/App.tsx`

In the global session message listener, capture commands from init message:

```typescript
import { useAutocompleteStore } from '@/lib/autocomplete-store';

// Inside the App component or a new hook:
const setCommands = useAutocompleteStore((s) => s.setCommands);

// In the session:message handler, add:
if (message.type === 'system' && message.subtype === 'init') {
  const initMessage = message as SDKInitMessage;
  if (initMessage.slash_commands) {
    setCommands(initMessage.slash_commands);
  }
}
```

#### 3. Update SDK Types for Full Init Message
**File**: `hive/src/shared/sdk-types.ts`

Update SDKInitMessage to include all fields:

```typescript
export interface SDKInitMessage {
  type: 'system';
  subtype: 'init';
  session_id: string;
  model: string;
  tools: string[];
  apiKeySource: string;
  slash_commands?: string[];
  agents?: string[];
  skills?: string[];
  plugins?: { name: string; path: string }[];
  mcp_servers?: { name: string; status: string }[];
}
```

### Success Criteria:

#### Automated Verification:
- [x] TypeScript compiles: `cd hive && pnpm exec tsc --noEmit`
- [x] App starts: `cd hive && pnpm start`

#### Manual Verification:
- [ ] Start a session, verify commands populated in store (check DevTools)
- [ ] Verify `searchCommands('com')` returns commands containing 'com'
- [ ] Verify `searchFiles('index')` returns files containing 'index'

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to Phase 3.

---

## Phase 3: Autocomplete Dropdown Component

### Overview
Create the autocomplete dropdown UI component with keyboard navigation.

### Changes Required:

#### 1. Autocomplete Dropdown Component
**File**: `hive/src/renderer/components/session/AutocompleteDropdown.tsx` (new file)

```tsx
import React from 'react';
import { Command, User, FileText, Folder } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AutocompleteItem, CommandItem, AgentItem, FileItem } from '@/lib/autocomplete-store';

interface AutocompleteDropdownProps {
  items: AutocompleteItem[];
  selectedIndex: number;
  onSelect: (item: AutocompleteItem) => void;
  position: { top: number; left: number };
  visible: boolean;
}

export function AutocompleteDropdown({
  items,
  selectedIndex,
  onSelect,
  position,
  visible,
}: AutocompleteDropdownProps) {
  const listRef = React.useRef<HTMLDivElement>(null);

  // Scroll selected item into view
  React.useEffect(() => {
    if (listRef.current && selectedIndex >= 0) {
      const selectedEl = listRef.current.children[selectedIndex] as HTMLElement;
      if (selectedEl) {
        selectedEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  if (!visible || items.length === 0) return null;

  // Group items by type
  const commands = items.filter((i) => i.type === 'command');
  const agents = items.filter((i) => i.type === 'agent');
  const files = items.filter((i) => i.type === 'file');

  let currentIndex = 0;

  return (
    <div
      className="fixed z-50 min-w-[280px] max-w-[400px] max-h-[300px] overflow-auto bg-[var(--background)] border border-[var(--border)] rounded-lg shadow-lg"
      style={{ top: position.top, left: position.left }}
      ref={listRef}
    >
      {/* Commands Section */}
      {commands.length > 0 && (
        <>
          <div className="px-3 py-1.5 text-xs font-semibold text-[var(--foreground-muted)] bg-[var(--secondary)] border-b border-[var(--border)]">
            Commands
          </div>
          {commands.map((item) => {
            const idx = currentIndex++;
            return (
              <CommandItemRow
                key={`cmd-${item.item.name}`}
                item={item.item as CommandItem}
                selected={idx === selectedIndex}
                onClick={() => onSelect(item)}
              />
            );
          })}
        </>
      )}

      {/* Agents Section */}
      {agents.length > 0 && (
        <>
          <div className="px-3 py-1.5 text-xs font-semibold text-[var(--foreground-muted)] bg-[var(--secondary)] border-b border-[var(--border)]">
            Agents
          </div>
          {agents.map((item) => {
            const idx = currentIndex++;
            return (
              <AgentItemRow
                key={`agent-${item.item.name}`}
                item={item.item as AgentItem}
                selected={idx === selectedIndex}
                onClick={() => onSelect(item)}
              />
            );
          })}
        </>
      )}

      {/* Files Section */}
      {files.length > 0 && (
        <>
          <div className="px-3 py-1.5 text-xs font-semibold text-[var(--foreground-muted)] bg-[var(--secondary)] border-b border-[var(--border)]">
            Files
          </div>
          {files.map((item) => {
            const idx = currentIndex++;
            return (
              <FileItemRow
                key={`file-${item.item.path}`}
                item={item.item as FileItem}
                selected={idx === selectedIndex}
                onClick={() => onSelect(item)}
              />
            );
          })}
        </>
      )}
    </div>
  );
}

function CommandItemRow({
  item,
  selected,
  onClick,
}: {
  item: CommandItem;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 px-3 py-2 cursor-pointer',
        selected ? 'bg-[var(--primary)]/10' : 'hover:bg-[var(--secondary)]'
      )}
      onClick={onClick}
    >
      <Command className="h-4 w-4 text-[var(--primary)]" />
      <span className="font-mono text-sm">/{item.name}</span>
      {item.description && (
        <span className="text-xs text-[var(--foreground-muted)] ml-auto truncate max-w-[150px]">
          {item.description}
        </span>
      )}
    </div>
  );
}

function AgentItemRow({
  item,
  selected,
  onClick,
}: {
  item: AgentItem;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 px-3 py-2 cursor-pointer',
        selected ? 'bg-[var(--primary)]/10' : 'hover:bg-[var(--secondary)]'
      )}
      onClick={onClick}
    >
      <User className="h-4 w-4 text-[var(--accent)]" />
      <div className="flex-1 min-w-0">
        <span className="font-mono text-sm">@{item.name}</span>
        <p className="text-xs text-[var(--foreground-muted)] truncate">
          {item.description}
        </p>
      </div>
    </div>
  );
}

function FileItemRow({
  item,
  selected,
  onClick,
}: {
  item: FileItem;
  selected: boolean;
  onClick: () => void;
}) {
  const Icon = item.type === 'directory' ? Folder : FileText;

  return (
    <div
      className={cn(
        'flex items-center gap-2 px-3 py-2 cursor-pointer',
        selected ? 'bg-[var(--primary)]/10' : 'hover:bg-[var(--secondary)]'
      )}
      onClick={onClick}
    >
      <Icon className="h-4 w-4 text-[var(--foreground-muted)]" />
      <div className="flex-1 min-w-0">
        <span className="font-mono text-sm truncate">{item.name}</span>
        <p className="text-xs text-[var(--foreground-muted)] truncate">
          {item.path}
        </p>
      </div>
    </div>
  );
}
```

### Success Criteria:

#### Automated Verification:
- [x] TypeScript compiles: `cd hive && pnpm exec tsc --noEmit`

#### Manual Verification:
- [ ] Component renders (will test in Phase 4)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to Phase 4.

---

## Phase 4: MessageInput Integration

### Overview
Integrate autocomplete into MessageInput with trigger detection, caret positioning, and selection handling.

### Changes Required:

#### 1. Autocomplete Hook
**File**: `hive/src/renderer/hooks/useAutocomplete.ts` (new file)

```typescript
import React from 'react';
import getCaretCoordinates from 'textarea-caret';
import { useAutocompleteStore, type AutocompleteItem } from '@/lib/autocomplete-store';

interface TriggerState {
  active: boolean;
  trigger: '/' | '@' | null;
  query: string;
  startIndex: number;
}

interface AutocompleteHookResult {
  // State
  items: AutocompleteItem[];
  selectedIndex: number;
  position: { top: number; left: number };
  visible: boolean;

  // Handlers
  handleInputChange: (value: string, cursorPosition: number, textarea: HTMLTextAreaElement) => void;
  handleKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => boolean; // Returns true if event was handled
  handleSelect: (item: AutocompleteItem) => string; // Returns new input value
  dismiss: () => void;
}

export function useAutocomplete(currentInput: string): AutocompleteHookResult {
  const [triggerState, setTriggerState] = React.useState<TriggerState>({
    active: false,
    trigger: null,
    query: '',
    startIndex: 0,
  });
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const [position, setPosition] = React.useState({ top: 0, left: 0 });

  const searchCommands = useAutocompleteStore((s) => s.searchCommands);
  const searchAgents = useAutocompleteStore((s) => s.searchAgents);
  const searchFiles = useAutocompleteStore((s) => s.searchFiles);

  // Compute items based on trigger
  const items = React.useMemo((): AutocompleteItem[] => {
    if (!triggerState.active || !triggerState.trigger) return [];

    if (triggerState.trigger === '/') {
      return searchCommands(triggerState.query).map((item) => ({
        type: 'command' as const,
        item,
      }));
    }

    if (triggerState.trigger === '@') {
      const agents = searchAgents(triggerState.query, 5);
      const files = searchFiles(triggerState.query, 10);

      const result: AutocompleteItem[] = [];

      // Add agents first (if query is short or matches agents)
      if (triggerState.query.length <= 3 || agents.length > 0) {
        agents.forEach((item) => result.push({ type: 'agent', item }));
      }

      // Add files
      files.forEach((item) => result.push({ type: 'file', item }));

      return result;
    }

    return [];
  }, [triggerState, searchCommands, searchAgents, searchFiles]);

  // Reset selected index when items change
  React.useEffect(() => {
    setSelectedIndex(0);
  }, [items]);

  const handleInputChange = (
    value: string,
    cursorPosition: number,
    textarea: HTMLTextAreaElement
  ) => {
    // Find if we're in a trigger context
    const textBeforeCursor = value.slice(0, cursorPosition);

    // Look for trigger character
    let triggerIndex = -1;
    let trigger: '/' | '@' | null = null;

    // Check for @ trigger (more recent takes precedence)
    const atIndex = textBeforeCursor.lastIndexOf('@');
    if (atIndex >= 0) {
      // Verify it's a valid trigger position (start of input or after whitespace)
      if (atIndex === 0 || /\s/.test(textBeforeCursor[atIndex - 1])) {
        const query = textBeforeCursor.slice(atIndex + 1);
        // Valid if no spaces in query
        if (!/\s/.test(query)) {
          triggerIndex = atIndex;
          trigger = '@';
        }
      }
    }

    // Check for / trigger (only at start of input or after newline)
    const slashIndex = textBeforeCursor.lastIndexOf('/');
    if (slashIndex >= 0 && (slashIndex === 0 || textBeforeCursor[slashIndex - 1] === '\n')) {
      const query = textBeforeCursor.slice(slashIndex + 1);
      if (!/\s/.test(query)) {
        // / takes precedence if it's more recent
        if (slashIndex > atIndex || trigger === null) {
          triggerIndex = slashIndex;
          trigger = '/';
        }
      }
    }

    if (trigger && triggerIndex >= 0) {
      const query = textBeforeCursor.slice(triggerIndex + 1);

      // Calculate dropdown position
      const coords = getCaretCoordinates(textarea, triggerIndex);
      const rect = textarea.getBoundingClientRect();

      setPosition({
        top: rect.top + coords.top + coords.height + 4,
        left: rect.left + coords.left,
      });

      setTriggerState({
        active: true,
        trigger,
        query,
        startIndex: triggerIndex,
      });
    } else {
      setTriggerState({ active: false, trigger: null, query: '', startIndex: 0 });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): boolean => {
    if (!triggerState.active || items.length === 0) return false;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, items.length - 1));
        return true;

      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
        return true;

      case 'Tab':
      case 'Enter':
        e.preventDefault();
        return true; // Handled in parent by calling handleSelect

      case 'Escape':
        e.preventDefault();
        setTriggerState({ active: false, trigger: null, query: '', startIndex: 0 });
        return true;

      default:
        return false;
    }
  };

  const handleSelect = (item: AutocompleteItem): string => {
    const beforeTrigger = currentInput.slice(0, triggerState.startIndex);
    const afterCursor = currentInput.slice(
      triggerState.startIndex + 1 + triggerState.query.length
    );

    let insertText = '';
    if (item.type === 'command') {
      insertText = `/${item.item.name} `;
    } else if (item.type === 'agent') {
      insertText = `@${item.item.name} `;
    } else if (item.type === 'file') {
      insertText = `@${item.item.path} `;
    }

    // Dismiss autocomplete
    setTriggerState({ active: false, trigger: null, query: '', startIndex: 0 });

    return beforeTrigger + insertText + afterCursor;
  };

  const dismiss = () => {
    setTriggerState({ active: false, trigger: null, query: '', startIndex: 0 });
  };

  return {
    items,
    selectedIndex,
    position,
    visible: triggerState.active && items.length > 0,
    handleInputChange,
    handleKeyDown,
    handleSelect,
    dismiss,
  };
}
```

#### 2. Update MessageInput Component
**File**: `hive/src/renderer/components/session/MessageInput.tsx`

Replace the entire file with updated version:

```tsx
import React from 'react';
import { Send, Square, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useDraftsStore } from '@/lib/store';
import { useAutocomplete } from '@/hooks/useAutocomplete';
import { AutocompleteDropdown } from './AutocompleteDropdown';

// Line height in pixels (14px font * 1.5 line-height ≈ 21px)
const LINE_HEIGHT = 21;
const MIN_LINES = 2;
const MAX_LINES = 10;

interface MessageInputProps {
  onSend: (message: string) => void;
  onInterrupt: () => void;
  isRunning: boolean;
  disabled?: boolean;
  sessionId: string;
  projectId: string;
}

export function MessageInput({
  onSend,
  onInterrupt,
  isRunning,
  disabled,
  sessionId,
  projectId,
}: MessageInputProps) {
  const [input, setInput] = React.useState('');
  const [editorFileId, setEditorFileId] = React.useState<string | null>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  const getDraftForSession = useDraftsStore((state) => state.getDraftForSession);
  const saveDraft = useDraftsStore((state) => state.saveDraft);
  const deleteDraft = useDraftsStore((state) => state.deleteDraft);

  // Autocomplete hook
  const autocomplete = useAutocomplete(input);

  // Load draft on mount or session change
  React.useEffect(() => {
    const draft = getDraftForSession(sessionId);
    if (draft) {
      setInput(draft.text);
    } else {
      setInput('');
    }
  }, [sessionId, getDraftForSession]);

  // Save draft on change (debounced)
  React.useEffect(() => {
    const timer = setTimeout(() => {
      saveDraft(projectId, sessionId, input);
    }, 500);
    return () => clearTimeout(timer);
  }, [input, projectId, sessionId, saveDraft]);

  // Listen for focus-message-input event (triggered by Cmd+N)
  React.useEffect(() => {
    const handler = () => {
      textareaRef.current?.focus();
    };
    window.addEventListener('focus-message-input', handler);
    return () => window.removeEventListener('focus-message-input', handler);
  }, []);

  // Listen for file changes from editor
  React.useEffect(() => {
    if (!editorFileId) return;

    const unsub = window.electronAPI.on('prompt-file:changed', (data: unknown) => {
      const { fileId, content } = data as { fileId: string; content: string };
      if (fileId === editorFileId) {
        setInput(content);
      }
    });

    return () => {
      unsub();
      window.electronAPI.invoke('prompt-file:close', { fileId: editorFileId });
      setEditorFileId(null);
    };
  }, [editorFileId]);

  // Sync input changes back to editor file (debounced)
  React.useEffect(() => {
    if (!editorFileId) return;

    const timer = setTimeout(() => {
      window.electronAPI.invoke('prompt-file:update', {
        fileId: editorFileId,
        content: input,
      });
    }, 300);

    return () => clearTimeout(timer);
  }, [input, editorFileId]);

  // Handle input change with autocomplete trigger detection
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setInput(newValue);

    // Notify autocomplete of change
    if (textareaRef.current) {
      autocomplete.handleInputChange(
        newValue,
        e.target.selectionStart,
        textareaRef.current
      );
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isRunning && !disabled) {
      onSend(input.trim());
      setInput('');
      deleteDraft(sessionId);
      autocomplete.dismiss();
      if (editorFileId) {
        window.electronAPI.invoke('prompt-file:close', { fileId: editorFileId });
        setEditorFileId(null);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Let autocomplete handle first
    if (autocomplete.visible) {
      const handled = autocomplete.handleKeyDown(e);
      if (handled) {
        // Handle Enter/Tab selection
        if (e.key === 'Enter' || e.key === 'Tab') {
          const selectedItem = autocomplete.items[autocomplete.selectedIndex];
          if (selectedItem) {
            const newValue = autocomplete.handleSelect(selectedItem);
            setInput(newValue);
          }
        }
        return;
      }
    }

    // Default Enter behavior (send message)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }

    // Ctrl+G: Open in editor
    if (e.key === 'g' && e.ctrlKey) {
      e.preventDefault();
      handleOpenInEditor();
    }
  };

  const handleOpenInEditor = async () => {
    if (editorFileId) {
      await window.electronAPI.invoke('prompt-file:focus', { fileId: editorFileId });
      return;
    }

    try {
      const result = await window.electronAPI.invoke<{ fileId: string; filePath: string }>(
        'prompt-file:open',
        { content: input, sessionId }
      );
      setEditorFileId(result.fileId);
    } catch (error) {
      console.error('Failed to open in editor:', error);
    }
  };

  const handleAutocompleteSelect = (item: (typeof autocomplete.items)[0]) => {
    const newValue = autocomplete.handleSelect(item);
    setInput(newValue);
    textareaRef.current?.focus();
  };

  // Auto-resize textarea
  React.useEffect(() => {
    if (textareaRef.current) {
      const minHeight = MIN_LINES * LINE_HEIGHT;
      const maxHeight = MAX_LINES * LINE_HEIGHT;
      textareaRef.current.style.height = 'auto';
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = `${Math.max(minHeight, Math.min(scrollHeight, maxHeight))}px`;
    }
  }, [input]);

  return (
    <form onSubmit={handleSubmit} className="p-4 border-t border-[var(--border)] relative">
      <div className="flex gap-2 items-end">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            // Delay dismiss to allow click on dropdown
            setTimeout(() => autocomplete.dismiss(), 200);
          }}
          placeholder={
            isRunning
              ? 'Claude is working...'
              : 'Type a message... (/ for commands, @ for files)'
          }
          disabled={isRunning || disabled}
          rows={MIN_LINES}
          className="flex-1 px-3 py-2 rounded border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] placeholder:text-[var(--foreground-muted)] disabled:opacity-50 resize-none font-mono text-sm leading-[21px]"
        />
        <div className="flex flex-col gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={handleOpenInEditor}
                disabled={isRunning || disabled}
                className={editorFileId ? 'border-[var(--primary)] text-[var(--primary)]' : ''}
              >
                <ExternalLink className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <span>Edit in external editor (Ctrl+G)</span>
            </TooltipContent>
          </Tooltip>
          {isRunning ? (
            <Button type="button" variant="destructive" size="icon" onClick={onInterrupt}>
              <Square className="h-4 w-4" />
            </Button>
          ) : (
            <Button type="submit" size="icon" disabled={!input.trim() || disabled}>
              <Send className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Autocomplete Dropdown */}
      <AutocompleteDropdown
        items={autocomplete.items}
        selectedIndex={autocomplete.selectedIndex}
        onSelect={handleAutocompleteSelect}
        position={autocomplete.position}
        visible={autocomplete.visible}
      />
    </form>
  );
}
```

#### 3. Add hooks directory alias
**File**: `hive/vite.renderer.config.mjs`

Update aliases to include hooks:

```javascript
resolve: {
  alias: {
    '@': path.resolve(__dirname, 'src/renderer'),
    '@shared': path.resolve(__dirname, 'src/shared'),
  },
},
```

### Success Criteria:

#### Automated Verification:
- [x] TypeScript compiles: `cd hive && pnpm exec tsc --noEmit`
- [x] App starts: `cd hive && pnpm start`

#### Manual Verification:
- [ ] Type `/` in MessageInput - see dropdown with commands
- [ ] Type `/com` - see filtered `/compact` command
- [ ] Press Enter - command inserted with trailing space
- [ ] Type `@qa` - see agents dropdown
- [ ] Type `@src` - see files dropdown (after agents)
- [ ] Arrow keys navigate, Escape dismisses

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to Phase 5.

---

## Phase 5: File Index Integration with Session

### Overview
Build file index when session starts and store available commands.

### Changes Required:

#### 1. Update SessionView to Build File Index
**File**: `hive/src/renderer/components/views/SessionView.tsx`

Add file index building when session mounts:

```typescript
import { useBuildFileIndex } from '@/lib/autocomplete-store';

// Inside SessionView component:
const buildFileIndex = useBuildFileIndex();

// Build file index when session opens
React.useEffect(() => {
  if (projectDirectory) {
    buildFileIndex(projectDirectory);
  }
}, [projectDirectory, buildFileIndex]);
```

#### 2. Update App.tsx to Capture Commands from Init
**File**: `hive/src/renderer/App.tsx`

In `useGlobalSessionMessageListener`, add command capture:

```typescript
import { useAutocompleteStore } from '@/lib/autocomplete-store';

// Inside the hook or App component
const setCommands = useAutocompleteStore((s) => s.setCommands);

// In the message handler for 'session:message':
if (message.type === 'system' && 'subtype' in message && message.subtype === 'init') {
  const initMessage = message as SDKInitMessage;
  if (initMessage.slash_commands) {
    setCommands(initMessage.slash_commands);
  }
}
```

#### 3. Export Types from Autocomplete Store
**File**: `hive/src/renderer/lib/autocomplete-store.ts`

Ensure all types are exported and fix any import issues.

### Success Criteria:

#### Automated Verification:
- [x] TypeScript compiles: `cd hive && pnpm exec tsc --noEmit`
- [x] App starts: `cd hive && pnpm start`

#### Manual Verification:
- [x] Open a project session
- [x] Type `/` - see populated commands (defaults + SDK after first message)
- [x] Type `@` - see agents AND project files
- [x] Type `@src/main` - see filtered project files
- [ ] Verify commands update when a new session starts

**Implementation Note**: This is the final phase for core autocomplete functionality. Further enhancements can be added later.

---

## Phase 6: Additional Enhancements (Implemented)

These enhancements were added beyond the original plan during implementation.

### 6.1 Load Commands/Agents from Filesystem

Instead of relying only on SDK init messages, commands and agents are now loaded directly from:
- `~/.claude/commands/*.md` - User-level commands
- `~/.claude/agents/*.md` - User-level agents
- `{cwd}/.claude/commands/*.md` - Project-level commands
- `{cwd}/.claude/agents/*.md` - Project-level agents
- `~/.claude/plugins/cache/{org}/{plugin}/{version}/commands/*.md` - Plugin commands
- `~/.claude/plugins/cache/{org}/{plugin}/{version}/agents/*.md` - Plugin agents

**New Files:**
- `hive/src/main/claude-config.ts` - Scans directories and parses markdown frontmatter

**IPC Handlers Added:**
- `claude:load-commands` - Load all commands for a project
- `claude:load-agents` - Load all agents for a project

**Naming Convention:**
- Plugin commands: `plugin-name:command` (e.g., `base:create-plan`)
- Plugin agents: `plugin-name:agent-name` (e.g., `base:codebase-analyzer`)

### 6.2 Default Commands

Default commands are available immediately without waiting for SDK init:
- `/compact`, `/clear`, `/help`, `/bug`, `/init`, `/memory`, `/model`
- `/permissions`, `/cost`, `/doctor`, `/review`, `/pr-comments`
- `/mcp`, `/vim`, `/terminal-setup`, `/config`, `/logout`, `/login`

### 6.3 Syntax Highlighting in Input

The MessageInput now highlights tokens in different colors:
- **Commands** (`/...`): Primary color (blue/purple)
- **Agents** (`@agent-name`): Accent color
- **Files** (`@path/to/file.ext`): Emerald/green

Implementation uses a backdrop div overlay technique:
- Transparent textarea for actual input (preserves caret and selection)
- Hidden div behind renders the same text with colored spans

### Success Criteria:
- [x] Commands loaded from ~/.claude and plugins on session open
- [x] Agents loaded from ~/.claude and plugins on session open
- [x] Plugin naming format: `plugin:name`
- [x] Syntax highlighting for commands, agents, and files

---

## Testing Strategy

### Manual Testing Steps

1. **Command Autocomplete**:
   - Type `/` at start of input - see all commands
   - Type `/com` - see filtered commands
   - Navigate with arrows, select with Enter
   - Verify `/compact` works when sent

2. **Agent Autocomplete**:
   - Type `@` anywhere - see agents section first
   - Type `@qa` - see filtered agents
   - Select agent - verify `@qa-expert` inserted

3. **File Autocomplete**:
   - Type `@src` - see files matching path
   - Type `@index` - see fuzzy matches for filename
   - Select file - verify full relative path inserted

4. **Keyboard Navigation**:
   - Arrow down/up navigates selection
   - Enter/Tab selects
   - Escape dismisses
   - Clicking outside dismisses

5. **Edge Cases**:
   - Type `@` in middle of text - should trigger
   - Type `/` in middle of text - should NOT trigger (only start/newline)
   - Multiple triggers in same line
   - Very long file paths

---

## Performance Considerations

- **File index** cached per project directory
- **Fuse.js** instance created once when file index set
- **Debounced** search (not on every keystroke)
- **Limited results** (10 files, 5 agents, 10 commands max)
- **Memoized** search results via useMemo

---

## Future Enhancements (Out of Scope)

1. **Real-time file watching**: Update index when files change
2. **Agent invocation syntax**: Auto-trigger Task tool for `@agent` mentions
3. **File content preview**: Show file preview in dropdown
4. **Recent files**: Prioritize recently opened files
5. **Custom agents UI**: Define agents in Hive settings
6. **Skills autocomplete**: Add support for `/skill:name` syntax

---

## References

### Related Research:
- `thoughts/shared/research/2025-12-15-hive-autocomplete-commands-agents-files.md`
- `thoughts/shared/research/2025-12-15-hive-electron-app-research.md`

### Previous Plan:
- `thoughts/shared/plans/2025-12-15-hive-v0.2-claude-sdk-integration.md`

### Code References:
- `hive/src/renderer/components/session/MessageInput.tsx` - Input with autocomplete and syntax highlighting
- `hive/src/renderer/components/session/AutocompleteDropdown.tsx` - Dropdown UI component
- `hive/src/renderer/hooks/useAutocomplete.ts` - Autocomplete logic hook
- `hive/src/renderer/lib/autocomplete-store.ts` - Zustand store for autocomplete data
- `hive/src/main/file-indexer.ts` - File index builder with .gitignore support
- `hive/src/main/claude-config.ts` - Load commands/agents from ~/.claude and plugins
- `hive/src/main/ipc-handlers.ts` - IPC handlers for file index and config loading
- `hive/src/shared/sdk-types.ts` - SDK init message types with slash_commands

### External Resources:
- [fuse.js](https://www.fusejs.io/) - Fuzzy search library
- [ignore](https://github.com/kaelzhang/node-ignore) - .gitignore pattern matching
- [textarea-caret-position](https://github.com/component/textarea-caret-position) - Cursor position tracking
