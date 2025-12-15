---
date: 2025-12-15T10:30:00Z
researcher: Claude
git_commit: 9e21b0505afee30a99059894d8956b2bc374d1c2
branch: main
repository: ai-toolbox
topic: "Hive - macOS App for Managing AI CLI Agents (Electron Approach)"
tags: [research, hive, electron, claude-sdk, claude-agent-sdk, desktop-app]
status: complete
last_updated: 2025-12-15
last_updated_by: Claude
supersedes: ["2025-12-14-hive-macos-app-research.md", "2025-12-14-tauri-window-management-patterns.md"]
---

# Research: Hive - macOS App for Managing AI CLI Agents (Electron Approach)

**Date**: 2025-12-15T10:30:00Z
**Researcher**: Claude
**Git Commit**: 9e21b0505afee30a99059894d8956b2bc374d1c2
**Branch**: main
**Repository**: ai-toolbox

## Research Question

How to build a macOS desktop app (using Electron) to manage Claude Code sessions across multiple projects, with:
- Dashboard view of all projects and sessions
- Four action types: Research, Plan, Implement, Free-form
- Side-by-side thoughts/ directory viewing and editing
- Google Docs-like commenting that agents can pick up
- Window management (split panes, multiple windows, named sessions)
- Notifications on input required
- Auto-installation of cc-plugin

## Summary

Building "Hive" is highly feasible using **Electron** with the **Claude Agent SDK (TypeScript)**. Unlike Tauri (which uses a WebView without Node.js runtime), Electron's main process has full Node.js access, allowing direct use of the `@anthropic-ai/claude-agent-sdk` package for programmatic Claude integration.

**Why Electron over Tauri?**
- **Direct SDK access**: Claude Agent SDK requires Node.js runtime (`crypto.randomUUID()`, etc.) - Electron's main process provides this
- **Mature ecosystem**: electron-vite, electron-store, chokidar all work out of the box
- **Simpler architecture**: No need for CLI spawning workarounds
- **Trade-off**: Larger bundle size (~100MB vs ~600KB), but worth it for SDK integration

## Detailed Findings

### 1. Claude Agent SDK Integration

**Package**: `@anthropic-ai/claude-agent-sdk`
**Documentation**: [Claude Agent SDK TypeScript Reference](https://platform.claude.com/docs/en/api/agent-sdk/typescript)

#### Installation

```bash
npm install @anthropic-ai/claude-agent-sdk
```

#### Basic Query Pattern

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

const response = query({
  prompt: "Help me analyze this codebase",
  options: {
    model: "claude-sonnet-4-5",
    workingDirectory: "/path/to/project"
  }
});

for await (const message of response) {
  if (message.type === 'assistant') {
    console.log(message.content);
  } else if (message.type === 'system' && message.subtype === 'init') {
    console.log(`Session ID: ${message.session_id}`);
  }
}
```

#### Session Management

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

// Start new session and capture ID
let sessionId: string | undefined;

const initialResponse = query({
  prompt: "Help me build a REST API",
  options: { model: "claude-sonnet-4-5" }
});

for await (const message of initialResponse) {
  if (message.type === 'system' && message.subtype === 'init') {
    sessionId = message.session_id;
  }
}

// Resume session later
const resumedResponse = query({
  prompt: "Now add rate limiting",
  options: {
    resume: sessionId,
    model: "claude-sonnet-4-5"
  }
});

// Fork session (explore alternative without modifying original)
const forkedResponse = query({
  prompt: "Actually, let's try GraphQL instead",
  options: {
    resume: sessionId,
    forkSession: true,
    model: "claude-sonnet-4-5"
  }
});
```

#### Message Types

| Type | Description |
|------|-------------|
| `system` (subtype: `init`) | Session initialization with `session_id` |
| `assistant` | Claude's response with text/tool_use blocks |
| `tool_call` | Tool being executed |
| `tool_result` | Result from tool execution |
| `error` | Error during execution |

#### Permission Handling

```typescript
const response = query({
  prompt: "Review authentication module",
  options: {
    model: "claude-sonnet-4-5",
    permissionMode: "default",  // or "acceptEdits", "bypassPermissions"
    canUseTool: async (toolName, input) => {
      // Custom permission logic
      if (toolName === 'Bash' && input.command.includes('rm -rf')) {
        return { behavior: "deny", message: "Destructive commands not allowed" };
      }
      return { behavior: "allow" };
    }
  }
});
```

#### Budget Control

```typescript
const response = query({
  prompt: "Comprehensive code analysis",
  options: {
    model: "claude-sonnet-4-5",
    maxBudgetUsd: 5.0  // Stop if cost exceeds $5
  }
});
```

### 2. Electron Architecture

#### Project Setup with electron-vite

```bash
# Create new project
npm create @quick-start/electron@latest hive -- --template react-ts

# Or with pnpm
pnpm create @quick-start/electron hive --template react-ts
```

#### Project Structure

```
hive/
├── electron.vite.config.ts     # Unified Vite config
├── package.json
├── tsconfig.json
│
├── src/
│   ├── main/                   # Main process (Node.js)
│   │   ├── index.ts           # Entry point
│   │   ├── ipc-handlers.ts    # IPC handlers
│   │   ├── session-manager.ts # Claude SDK session management
│   │   └── file-watcher.ts    # Chokidar file watching
│   │
│   ├── preload/               # Preload scripts
│   │   ├── index.ts          # contextBridge setup
│   │   └── index.d.ts        # Type declarations
│   │
│   ├── renderer/              # React application
│   │   ├── index.html
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   │   └── HiveLayout.tsx
│   │   │   ├── session/
│   │   │   │   ├── SessionPane.tsx
│   │   │   │   └── MessageList.tsx
│   │   │   ├── sidebar/
│   │   │   │   └── Sidebar.tsx
│   │   │   └── thoughts/
│   │   │       └── ThoughtsPane.tsx
│   │   ├── hooks/
│   │   │   └── useSession.ts
│   │   └── lib/
│   │       └── store.ts
│   │
│   └── shared/                # Shared types
│       └── ipc-types.ts
│
├── resources/                 # App icons
└── out/                       # Build output
```

#### electron.vite.config.ts

```typescript
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': path.resolve('src/shared'),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve('src/renderer'),
        '@shared': path.resolve('src/shared'),
      },
    },
  },
});
```

### 3. IPC Patterns

#### Type-Safe IPC with contextBridge

```typescript
// src/shared/ipc-types.ts
export interface Session {
  id: string;
  name: string;
  directory: string;
  status: 'idle' | 'running' | 'error';
}

export interface IpcChannels {
  'session:list': { params: void; result: Session[] };
  'session:create': { params: { name: string; directory: string }; result: Session };
  'session:send': { params: { sessionId: string; message: string }; result: void };
  'dialog:open-directory': { params: void; result: string | null };
}

export interface IpcEvents {
  'session:output': { sessionId: string; content: string };
  'session:status': { sessionId: string; status: Session['status'] };
}
```

```typescript
// src/preload/index.ts
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  invoke: <T>(channel: string, ...args: unknown[]): Promise<T> => {
    return ipcRenderer.invoke(channel, ...args);
  },
  on: (channel: string, callback: (...args: unknown[]) => void) => {
    const subscription = (_event: Electron.IpcRendererEvent, ...args: unknown[]) =>
      callback(...args);
    ipcRenderer.on(channel, subscription);
    return () => ipcRenderer.removeListener(channel, subscription);
  },
});
```

```typescript
// src/main/ipc-handlers.ts
import { ipcMain, dialog, BrowserWindow } from 'electron';
import { query } from '@anthropic-ai/claude-agent-sdk';

const sessions = new Map<string, { sessionId: string; projectPath: string }>();

export function registerIpcHandlers(mainWindow: BrowserWindow) {
  ipcMain.handle('session:create', async (event, { name, directory }) => {
    const response = query({
      prompt: "Initialize session",
      options: {
        workingDirectory: directory,
        model: "claude-sonnet-4-5"
      }
    });

    let sessionId: string | undefined;

    for await (const message of response) {
      if (message.type === 'system' && message.subtype === 'init') {
        sessionId = message.session_id;
      }
      // Forward messages to renderer
      mainWindow.webContents.send('session:output', {
        sessionId,
        content: JSON.stringify(message)
      });
    }

    if (sessionId) {
      sessions.set(sessionId, { sessionId, projectPath: directory });
    }

    return { id: sessionId, name, directory, status: 'idle' };
  });

  ipcMain.handle('dialog:open-directory', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory']
    });
    return result.canceled ? null : result.filePaths[0];
  });
}
```

### 4. Window Management

#### BrowserWindow Setup

```typescript
// src/main/index.ts
import { app, BrowserWindow } from 'electron';
import path from 'path';
import windowStateKeeper from 'electron-window-state';

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  const mainWindowState = windowStateKeeper({
    defaultWidth: 1400,
    defaultHeight: 900
  });

  mainWindow = new BrowserWindow({
    x: mainWindowState.x,
    y: mainWindowState.y,
    width: mainWindowState.width,
    height: mainWindowState.height,
    show: false,

    // macOS-specific
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 15, y: 10 },
    vibrancy: 'sidebar',

    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, '../preload/index.js'),
    },
  });

  mainWindowState.manage(mainWindow);

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Load app
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(createWindow);
```

#### Split Panes with react-resizable-panels

```bash
pnpm add react-resizable-panels
```

```tsx
// src/renderer/components/layout/HiveLayout.tsx
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';

export function HiveLayout() {
  return (
    <div className="h-screen w-screen bg-gray-900">
      <PanelGroup direction="horizontal" autoSaveId="hive-main">
        {/* Sidebar */}
        <Panel id="sidebar" order={1} defaultSize={20} minSize={15} maxSize={35}>
          <Sidebar />
        </Panel>

        <PanelResizeHandle className="w-1 bg-gray-700 hover:bg-blue-500 transition-colors" />

        {/* Main content */}
        <Panel id="content" order={2}>
          <PanelGroup direction="vertical" autoSaveId="hive-content">
            {/* Claude session */}
            <Panel id="session" order={1} defaultSize={70} minSize={30}>
              <SessionPane />
            </Panel>

            <PanelResizeHandle className="h-1 bg-gray-700 hover:bg-blue-500 transition-colors" />

            {/* Thoughts panel */}
            <Panel id="thoughts" order={2} defaultSize={30} minSize={15} collapsible>
              <ThoughtsPane />
            </Panel>
          </PanelGroup>
        </Panel>
      </PanelGroup>
    </div>
  );
}
```

### 5. File System Watching (chokidar)

```bash
pnpm add chokidar
```

```typescript
// src/main/file-watcher.ts
import chokidar from 'chokidar';
import { BrowserWindow } from 'electron';
import path from 'path';

let watcher: chokidar.FSWatcher | null = null;

export function watchThoughtsDirectory(dir: string, mainWindow: BrowserWindow) {
  if (watcher) {
    watcher.close();
  }

  const thoughtsPath = path.join(dir, 'thoughts');

  watcher = chokidar.watch(thoughtsPath, {
    ignored: /(^|[\/\\])\../,  // ignore dotfiles
    persistent: true,
    ignoreInitial: false,
    awaitWriteFinish: {
      stabilityThreshold: 300,
      pollInterval: 100
    }
  });

  watcher.on('all', (event, filePath) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('file-change', { event, path: filePath });
    }
  });

  return watcher;
}

export function closeWatcher() {
  watcher?.close();
}
```

### 6. State Persistence (electron-store)

```bash
pnpm add electron-store
```

```typescript
// src/main/store.ts
import Store from 'electron-store';

interface AppSchema {
  sessions: Array<{
    id: string;
    name: string;
    directory: string;
    createdAt: number;
  }>;
  recentDirectories: string[];
  layout: {
    sidebarWidth: number;
    showThoughts: boolean;
  };
  theme: 'light' | 'dark' | 'system';
}

export const store = new Store<AppSchema>({
  schema: {
    sessions: {
      type: 'array',
      default: []
    },
    recentDirectories: {
      type: 'array',
      default: [],
      maxItems: 10
    },
    layout: {
      type: 'object',
      default: { sidebarWidth: 250, showThoughts: true }
    },
    theme: {
      type: 'string',
      enum: ['light', 'dark', 'system'],
      default: 'system'
    }
  }
});
```

### 7. Native Notifications

```typescript
// src/main/notifications.ts
import { Notification, BrowserWindow } from 'electron';

export function notifyInputNeeded(sessionId: string, mainWindow: BrowserWindow) {
  if (!Notification.isSupported() || mainWindow.isFocused()) return;

  const notification = new Notification({
    title: 'Claude Awaiting Input',
    body: 'A session needs your attention',
    timeoutType: 'never'
  });

  notification.on('click', () => {
    mainWindow.show();
    mainWindow.focus();
    mainWindow.webContents.send('focus-session', sessionId);
  });

  notification.show();
}
```

### 8. Dialog/File Picker

```typescript
// src/main/ipc-handlers.ts
import { dialog } from 'electron';

ipcMain.handle('dialog:open-directory', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Select Project Directory',
    properties: ['openDirectory', 'createDirectory']
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('dialog:save-file', async (event, defaultName: string) => {
  const result = await dialog.showSaveDialog({
    title: 'Export Session',
    defaultPath: defaultName,
    filters: [
      { name: 'JSON', extensions: ['json'] },
      { name: 'Markdown', extensions: ['md'] }
    ]
  });
  return result.canceled ? null : result.filePath;
});
```

## Architecture Recommendation

```
hive/
├── src/
│   ├── main/                          # Main process (Node.js + Claude SDK)
│   │   ├── index.ts                   # App entry, window creation
│   │   ├── ipc-handlers.ts            # IPC handler registration
│   │   ├── session-manager.ts         # Claude SDK wrapper
│   │   ├── file-watcher.ts            # chokidar thoughts/ watcher
│   │   ├── notifications.ts           # Native notification service
│   │   └── store.ts                   # electron-store config
│   │
│   ├── preload/
│   │   ├── index.ts                   # contextBridge API exposure
│   │   └── index.d.ts                 # TypeScript declarations
│   │
│   ├── renderer/                      # React frontend
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   │   ├── HiveLayout.tsx     # Main split pane layout
│   │   │   │   └── PanelResizeHandle.tsx
│   │   │   ├── session/
│   │   │   │   ├── SessionPane.tsx    # Claude session UI
│   │   │   │   ├── MessageList.tsx    # Message display
│   │   │   │   └── MessageInput.tsx   # User input
│   │   │   ├── sidebar/
│   │   │   │   └── Sidebar.tsx        # Project/session list
│   │   │   └── thoughts/
│   │   │       ├── ThoughtsPane.tsx   # File browser + editor
│   │   │       ├── FileTree.tsx       # Directory tree
│   │   │       └── MarkdownViewer.tsx # Markdown preview
│   │   ├── hooks/
│   │   │   ├── useSession.ts          # Session state hook
│   │   │   └── useKeyboardNavigation.ts
│   │   └── lib/
│   │       ├── types.ts
│   │       └── store.ts               # Zustand state
│   │
│   └── shared/
│       └── ipc-types.ts               # Shared type definitions
│
├── electron.vite.config.ts
├── package.json
└── tsconfig.json
```

## Tech Stack

| Component | Technology |
|-----------|------------|
| **Framework** | Electron + electron-vite |
| **Frontend** | React 18 + TypeScript + Vite |
| **Styling** | Tailwind CSS |
| **State (Renderer)** | Zustand |
| **State (Persist)** | electron-store |
| **Claude Integration** | @anthropic-ai/claude-agent-sdk |
| **File Watching** | chokidar |
| **Window State** | electron-window-state |
| **Split Panes** | react-resizable-panels |

## Comparison: Electron vs Tauri

| Aspect | Electron | Tauri |
|--------|----------|-------|
| **Claude SDK** | Direct use in main process | Must spawn CLI (no Node.js in WebView) |
| **Bundle size** | ~100MB | ~600KB |
| **Memory** | Higher (~100MB base) | Lower (~50MB base) |
| **Node.js access** | Full (main process) | None (Rust backend only) |
| **Ecosystem** | Mature, many packages | Growing, fewer packages |
| **Build complexity** | Simpler | More complex (Rust toolchain) |

**Verdict**: Electron is the better choice for Hive because the Claude Agent SDK requires Node.js runtime, which Electron provides natively in its main process.

## Decisions Made

1. **Framework**: Electron with electron-vite (direct Claude SDK access)
2. **Claude Integration**: `@anthropic-ai/claude-agent-sdk` (not CLI spawning)
3. **Frontend Framework**: React 18 + TypeScript
4. **State Management**: Zustand (renderer) + electron-store (persistence)
5. **Split Panes**: react-resizable-panels (auto-save, accessible)
6. **Package Manager**: pnpm

## Open Questions (Deferred)

1. **State Sync**: Zubridge vs BroadcastChannel for multi-window state?

Now sure, use the best option later.

2. **Comment Syntax**: Keep `<!-- hive-comment(id): ... -->` format?

Yes

3. **Remote Access**: REST API vs WebSocket for future web/mobile clients?

Localtunnel, will do another research on this.

## Further Research Needed

### 1. macOS Native Notifications with Deep Linking
- Custom URL schemes (e.g., `hive://session/abc123`)
- Handling notification clicks when app is backgrounded
- Consider: electron-notification-state for badge counts

### 2. Electron Security Best Practices
- CSP configuration for renderer
- Sandboxing implications with Claude SDK
- Secure storage for API keys

### 3. Auto-Update Implementation
- electron-updater setup
- Code signing for macOS
- Update server options (GitHub releases, S3, etc.)

### 4. Plugin Auto-Installation
- Method to configure `.claude/settings.json` for projects
- Marketplace integration approach

## Related Research

The following documents complement this research:

- [Hive - Electron Forge + Vite + pnpm Setup](./2025-12-15-hive-electron-forge-setup.md) - Project setup, build configuration, and development workflow
- [Hive - Claude Agent SDK Integration Patterns](./2025-12-15-hive-claude-sdk-integration.md) - Session management, streaming, notifications, interrupts, and authentication
- [Hive - Storage Architecture and Remote Access](./2025-12-15-hive-storage-and-remote-access.md) - SQLite storage at `~/.hive/`, localtunnel for mobile/web access, PIN-based auth
- [Hive - UX/UI Design Specification](./2025-12-15-hive-ux-ui-design-spec.md) - Solarized theme, shadcn/ui components, view hierarchy, and component specs

## Related Research (Superseded)

The following documents are superseded by this research:
- `2025-12-14-hive-macos-app-research.md` - Original Tauri-based approach
- `2025-12-14-tauri-window-management-patterns.md` - Tauri-specific window management
- `2025-12-15-hive-claude-cli-integration.md` - CLI integration for Tauri (no longer applicable)

These documents remain in the repository for historical context on why the Tauri approach was abandoned (lack of Node.js runtime for Claude SDK).

## External Resources

**Official Documentation:**
- [Electron Documentation](https://www.electronjs.org/docs/latest/)
- [electron-vite](https://electron-vite.org/)
- [Claude Agent SDK TypeScript](https://platform.claude.com/docs/en/api/agent-sdk/typescript)

**npm Packages:**
- [@anthropic-ai/claude-agent-sdk](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk)
- [electron-store](https://www.npmjs.com/package/electron-store)
- [electron-window-state](https://www.npmjs.com/package/electron-window-state)
- [chokidar](https://www.npmjs.com/package/chokidar)
- [react-resizable-panels](https://github.com/bvaughn/react-resizable-panels)

**Reference Projects:**
- [claude-agent-desktop](https://github.com/pheuter/claude-agent-desktop) - Electron + Claude SDK example
- [electron-vite-react template](https://github.com/electron-vite/electron-vite-react)
