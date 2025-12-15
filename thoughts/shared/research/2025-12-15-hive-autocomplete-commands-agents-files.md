---
date: 2025-12-15T18:00:00Z
researcher: Claude
git_commit: 6b4b2155cf0919ab041090eda7146fe45ead7472
branch: main
repository: ai-toolbox
topic: "Hive - Autocomplete for Commands, Agents, and File References"
tags: [research, hive, autocomplete, commands, agents, file-references, react]
status: complete
last_updated: 2025-12-15
last_updated_by: Claude
related: ["2025-12-15-hive-electron-app-research.md", "2025-12-15-hive-v0.2-claude-sdk-integration.md"]
---

# Research: Hive - Autocomplete for Commands, Agents, and File References

**Date**: 2025-12-15T18:00:00Z
**Researcher**: Claude
**Git Commit**: 6b4b2155cf0919ab041090eda7146fe45ead7472
**Branch**: main
**Repository**: ai-toolbox

## Research Question

How to implement autocomplete in the Hive text input that supports:
1. **Commands** with `/` prefix (e.g., `/research`, `/plan`, `/compact`)
2. **Agents** with `@` prefix (e.g., `@qa-expert`, `@codebase-analyzer`)
3. **File references** with `@` prefix (e.g., `@src/main/index.ts`)

## Summary

Implementing autocomplete in Hive requires:

1. **Data Sources**:
   - **Commands**: Available via SDK's `SDKSystemMessage.slash_commands` array from init message
   - **Agents**: Available via SDK's `SDKSystemMessage.agents` array (optional) + custom definitions
   - **Files**: Available via existing `fs:read-directory` IPC handler

2. **UI Implementation**:
   - Recommended library: `react-textarea-autocomplete` (GitHub-style, works with textarea)
   - Alternative: `react-mentions` (Discord/Slack style)
   - For cursor positioning: `textarea-caret-position` library

3. **Key Findings**:
   - SDK does NOT use `@agent-name` syntax - agents are invoked via Task tool internally
   - File references with `@` would be a Hive-specific feature
   - Commands can be sent directly as prompt text (e.g., `"/compact"`)

## Detailed Findings

### 1. Claude SDK Commands

#### Built-in Commands
The Claude Agent SDK provides these built-in slash commands:
- `/compact` - Compresses conversation history to reduce context size
- `/clear` - Clears conversation history
- `/help` - Shows available commands
- `/cost` - Shows token/cost information
- `/context` - Shows context usage

#### Discovering Commands from SDK

**Method 1: Init Message**
```typescript
for await (const message of response) {
  if (message.type === 'system' && message.subtype === 'init') {
    const commands = message.slash_commands; // string[]
    console.log('Available commands:', commands);
  }
}
```

**Method 2: Query API**
```typescript
const commands = await query.supportedCommands();
// Returns: Array<{ name: string; description: string; argumentHint: string }>
```

#### Custom Commands
Custom commands can be defined:
- **Project**: `.claude/commands/*.md`
- **User**: `~/.claude/commands/*.md`

Format:
```markdown
---
allowed-tools: Read, Grep, Glob
description: Research codebase patterns
argument-hint: [query]
---

Your command prompt here with $1 for arguments
```

#### Sending Commands
Commands are sent as plain prompt text:
```typescript
await sessionManager.startSession(sessionId, '/compact', cwd);
```

### 2. Claude SDK Agents (Subagents)

#### Built-in Agents
- **Plan Subagent**: Used automatically in plan mode
- **Explore Subagent**: Read-only codebase exploration

**Note**: There are NO pre-defined `@qa-expert` or `@codebase-analyzer` agents. These are custom user-defined agents.

#### Discovering Agents from SDK

Agents are optionally available in the init message:
```typescript
for await (const message of response) {
  if (message.type === 'system' && message.subtype === 'init') {
    const agents = message.agents; // string[] | undefined
  }
}
```

#### Defining Custom Agents

**Programmatic (SDK options)**:
```typescript
query({
  prompt: "Review code",
  options: {
    agents: {
      'security-reviewer': {
        description: 'Expert security code reviewer',
        prompt: 'You are a security expert...',
        tools: ['Read', 'Grep', 'Glob'],
        model: 'sonnet'
      }
    }
  }
});
```

**Filesystem**:
- **Project**: `.claude/agents/*.md`
- **User**: `~/.claude/agents/*.md`

#### Agent Invocation
Agents are invoked via the Task tool internally, NOT via `@agent-name` syntax. The `@` syntax would be a Hive UI convenience that maps to Task tool calls.

### 3. File References

#### Current Hive Implementation

Hive already has file system support:

**IPC Handlers** (`hive/src/main/ipc-handlers.ts:445-451`):
```typescript
ipcMain.handle('fs:read-directory', async (_, { path: dirPath }) => {
  return readDirectory(dirPath);
});

ipcMain.handle('fs:read-file', async (_, { path: filePath }) => {
  return readFile(filePath);
});
```

**FileTree Component** (`hive/src/renderer/components/thoughts/FileTree.tsx`):
- Recursive tree display
- Handles `FileNode` type with name, path, type, children
- Currently used for thoughts/ directory browsing

**FileLink Component** (`hive/src/renderer/components/ui/file-link.tsx`):
- Clickable file paths that open in editor
- Uses `shell:open-in-editor` IPC

#### Implementation for File Autocomplete

To support `@<file>` references:
1. Build a file index of the project directory on session start
2. Filter files as user types after `@`
3. Insert file path reference that Claude can use for context

### 4. Current MessageInput Implementation

**Location**: `hive/src/renderer/components/session/MessageInput.tsx`

Current features:
- Textarea with auto-resize (2-10 lines)
- Draft persistence via Zustand
- External editor support (Ctrl+G)
- Send/Interrupt buttons

Missing features:
- No trigger detection for `/` or `@`
- No autocomplete dropdown
- No cursor position tracking

### 5. Autocomplete UI Libraries

#### Recommended: react-textarea-autocomplete

```bash
pnpm add @webscopeio/react-textarea-autocomplete
```

```tsx
import ReactTextareaAutocomplete from '@webscopeio/react-textarea-autocomplete';

<ReactTextareaAutocomplete
  trigger={{
    "/": {
      dataProvider: (token) => commands.filter(c => c.name.includes(token)),
      component: CommandItem,
      output: (item) => `/${item.name}`
    },
    "@": {
      dataProvider: (token) => {
        // First check if it's an agent
        const agents = availableAgents.filter(a => a.name.includes(token));
        if (agents.length) return agents.map(a => ({ type: 'agent', ...a }));
        // Then search files
        return fileIndex.filter(f => f.path.includes(token))
          .map(f => ({ type: 'file', ...f }));
      },
      component: MentionItem,
      output: (item) => item.type === 'agent' ? `@${item.name}` : `@${item.path}`
    }
  }}
  loadingComponent={LoadingSpinner}
  renderToBody // Prevents overflow issues
/>
```

**Key props**:
- `trigger`: Object defining trigger characters and handlers
- `dataProvider`: Function returning filtered suggestions (supports async)
- `component`: React component to render each suggestion
- `output`: Transform selected item to text
- `renderToBody`: Renders dropdown at document end

#### Alternative: react-mentions

```bash
pnpm add react-mentions
```

```tsx
import { MentionsInput, Mention } from 'react-mentions';

<MentionsInput value={value} onChange={handleChange}>
  <Mention
    trigger="/"
    data={commands}
    markup="/[__display__]"
    renderSuggestion={CommandSuggestion}
  />
  <Mention
    trigger="@"
    data={agentsAndFiles}
    markup="@[__display__]"
    renderSuggestion={MentionSuggestion}
  />
</MentionsInput>
```

#### For Custom Implementation: textarea-caret-position

```bash
pnpm add textarea-caret
```

```typescript
import getCaretCoordinates from 'textarea-caret';

const handleInput = (e) => {
  const textarea = e.target;
  const pos = textarea.selectionStart;
  const char = textarea.value[pos - 1];

  if (char === '/' || char === '@') {
    const coords = getCaretCoordinates(textarea, pos);
    setDropdownPosition({ top: coords.top + coords.height, left: coords.left });
    setTriggerChar(char);
    setTriggerQuery('');
  }
};
```

### 6. Recommended Implementation Approach

#### Phase 1: Basic Command Autocomplete

1. Store available commands from SDK init message in session state
2. Add trigger detection for `/` in MessageInput
3. Show dropdown with filtered commands
4. Insert selected command text

#### Phase 2: Agent Autocomplete

1. Define Hive's custom agents in `options.agents`
2. Store agent definitions with descriptions
3. Show agents in `@` dropdown (before file search)
4. Track which triggers agent invocation via Task tool

#### Phase 3: File Reference Autocomplete

1. On session start, index project files via `fs:read-directory` (recursively)
2. Respect `.gitignore` patterns when building the index
3. Cache file paths in memory with fuzzy search via fuse.js
4. When `@` typed and no agent matches, fuzzy search files
5. Insert relative file path that Claude can use for context

### 7. File Indexing with Fuzzy Search

#### Fuse.js for Fuzzy Matching

```bash
pnpm add fuse.js
```

```typescript
import Fuse from 'fuse.js';

interface FileEntry {
  path: string;      // Relative path from project root
  name: string;      // Filename only
  type: 'file' | 'directory';
}

// Create fuse instance with file index
const fuse = new Fuse<FileEntry>(fileIndex, {
  keys: [
    { name: 'name', weight: 0.7 },     // Filename matches weighted higher
    { name: 'path', weight: 0.3 },     // Path matches for context
  ],
  threshold: 0.4,        // 0 = exact match, 1 = match anything
  includeScore: true,
  ignoreLocation: true,  // Don't penalize matches later in string
  minMatchCharLength: 2,
});

// Search files
function searchFiles(query: string, limit = 10): FileEntry[] {
  const results = fuse.search(query, { limit });
  return results.map(r => r.item);
}
```

#### Respecting .gitignore

Use the `ignore` package to parse and apply .gitignore patterns:

```bash
pnpm add ignore
```

```typescript
// src/main/file-indexer.ts
import ignore, { Ignore } from 'ignore';
import fs from 'fs/promises';
import path from 'path';

interface FileIndexer {
  files: FileEntry[];
  ig: Ignore;
}

async function buildFileIndex(projectRoot: string): Promise<FileEntry[]> {
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
  ig.add([
    '.git',
    'node_modules',
    '.DS_Store',
    '*.log',
    'dist',
    'build',
    '.next',
    '.cache',
  ]);

  const files: FileEntry[] = [];

  async function walk(dir: string, relativePath = '') {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const entryRelativePath = relativePath
        ? `${relativePath}/${entry.name}`
        : entry.name;

      // Check if ignored
      if (ig.ignores(entryRelativePath)) continue;

      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        // Add directory entry (optional)
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
  return files;
}
```

#### IPC Handler for File Indexing

```typescript
// src/main/ipc-handlers.ts

// Cache file index per project
const fileIndexCache = new Map<string, FileEntry[]>();

ipcMain.handle('fs:build-file-index', async (_, { projectPath }) => {
  const files = await buildFileIndex(projectPath);
  fileIndexCache.set(projectPath, files);
  return files;
});

ipcMain.handle('fs:get-file-index', async (_, { projectPath }) => {
  return fileIndexCache.get(projectPath) || [];
});

// Optional: Invalidate cache on file changes via chokidar
```

#### Renderer-side Search Hook

```typescript
// src/renderer/hooks/useFileSearch.ts
import Fuse from 'fuse.js';
import { useState, useEffect, useMemo } from 'react';

interface FileEntry {
  path: string;
  name: string;
  type: 'file' | 'directory';
}

export function useFileSearch(projectPath: string) {
  const [fileIndex, setFileIndex] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadIndex() {
      setLoading(true);
      const files = await window.electronAPI.invoke<FileEntry[]>(
        'fs:build-file-index',
        { projectPath }
      );
      setFileIndex(files);
      setLoading(false);
    }
    loadIndex();
  }, [projectPath]);

  const fuse = useMemo(() => {
    return new Fuse(fileIndex, {
      keys: [
        { name: 'name', weight: 0.7 },
        { name: 'path', weight: 0.3 },
      ],
      threshold: 0.4,
      includeScore: true,
      ignoreLocation: true,
    });
  }, [fileIndex]);

  const search = (query: string, limit = 10): FileEntry[] => {
    if (!query) return fileIndex.slice(0, limit);
    return fuse.search(query, { limit }).map(r => r.item);
  };

  return { search, loading, fileCount: fileIndex.length };
}
```

#### Data Structure

```typescript
interface AutocompleteData {
  commands: Array<{
    name: string;
    description: string;
    argumentHint?: string;
  }>;
  agents: Array<{
    name: string;
    description: string;
    icon?: string;
  }>;
  files: Array<{
    path: string;  // Relative to project
    name: string;
    type: 'file' | 'directory';
  }>;
}
```

## Code References

- `hive/src/renderer/components/session/MessageInput.tsx` - Current input component
- `hive/src/main/ipc-handlers.ts:445-451` - File system IPC handlers
- `hive/src/renderer/components/thoughts/FileTree.tsx` - Existing file tree component
- `hive/src/renderer/components/ui/file-link.tsx` - File link component pattern
- `hive/src/main/file-system.ts` - File system utilities
- `hive/src/shared/types.ts` - FileNode type definition

## Architecture Recommendation

```
MessageInput.tsx
├── useAutocomplete hook
│   ├── Trigger detection (/,  @)
│   ├── Query filtering
│   └── Dropdown positioning
├── AutocompleteDropdown component
│   ├── CommandItem (/)
│   ├── AgentItem (@)
│   └── FileItem (@)
└── Integration with existing textarea
```

## SDK Types Reference

```typescript
// From SDK init message
interface SDKSystemMessage {
  type: 'system';
  subtype: 'init';
  session_id: string;
  model: string;
  tools: string[];
  slash_commands: string[];  // Available commands
  agents?: string[];         // Available agent names
  skills: string[];
  plugins: { name: string; path: string }[];
  mcp_servers: { name: string; status: string }[];
}

// From query.supportedCommands()
interface SlashCommand {
  name: string;
  description: string;
  argumentHint: string;
}
```

## Related Research

- [2025-12-15-hive-electron-app-research.md](./2025-12-15-hive-electron-app-research.md) - Electron architecture
- [2025-12-15-hive-claude-sdk-integration.md](./2025-12-15-hive-claude-sdk-integration.md) - SDK integration patterns
- [2025-12-15-hive-v0.2-claude-sdk-integration.md](../plans/2025-12-15-hive-v0.2-claude-sdk-integration.md) - Implementation plan

## External Resources

**Libraries**:
- [react-textarea-autocomplete](https://github.com/webscopeio/react-textarea-autocomplete) - GitHub-style textarea autocomplete
- [react-mentions](https://github.com/signavio/react-mentions) - Discord/Slack-style mentions
- [textarea-caret-position](https://github.com/component/textarea-caret-position) - Cursor position tracking
- [@floating-ui/react](https://floating-ui.com/docs/react) - Dropdown positioning
- [fuse.js](https://www.fusejs.io/) - Lightweight fuzzy search library
- [ignore](https://github.com/kaelzhang/node-ignore) - .gitignore pattern matching

**Documentation**:
- [Claude Agent SDK - Slash Commands](https://platform.claude.com/docs/en/agent-sdk/slash-commands)
- [Claude Agent SDK - Subagents](https://platform.claude.com/docs/en/agent-sdk/subagents)
- [Claude Agent SDK - TypeScript Reference](https://platform.claude.com/docs/en/api/agent-sdk/typescript)

## Open Questions

1. **Agent invocation UX**: Should `@agent-name` in the input automatically invoke the agent, or just reference it in the prompt for Claude to decide?

2. **File context injection**: Should `@file` automatically read and inject file contents, or just reference the path for Claude to read via tools?

3. **Disambiguation**: When `@` is typed, how to distinguish between agent mention and file reference? Options:
   - Search agents first, then files
   - Use different prefixes (`@agent:` vs `@file:`)
   - Show categorized dropdown with headers
