---
date: 2025-12-14T21:27:39Z
researcher: Claude
git_commit: 51d3d876ba8db6861e119de29c3ed1964f588292
branch: main
repository: ai-toolbox
topic: "Tauri Window Management Patterns for Hive"
tags: [research, tauri, window-management, split-panes, keyboard-shortcuts, hive]
status: superseded
superseded_by: "2025-12-15-hive-electron-app-research.md"
superseded_reason: "Hive is now using Electron instead of Tauri. Window management patterns differ."
last_updated: 2025-12-15
last_updated_by: Claude
last_updated_note: "Marked as superseded - switching to Electron approach"
---

> **SUPERSEDED**: This research has been superseded by [Hive Electron App Research](./2025-12-15-hive-electron-app-research.md).
>
> **Reason**: Hive is now being built with Electron instead of Tauri. Electron window management uses `BrowserWindow` API and `electron-window-state` instead of Tauri plugins. The split pane recommendation (`react-resizable-panels`) remains valid for the Electron approach.
>
> This document is preserved for historical context.

# Research: Tauri Window Management Patterns for Hive

**Date**: 2025-12-14T21:27:39Z
**Researcher**: Claude
**Git Commit**: 51d3d876ba8db6861e119de29c3ed1964f588292
**Branch**: main
**Repository**: ai-toolbox

## Research Question

What are the best practices for tmux-like window management in Tauri 2.0? Specifically:
- Single window with frontend-managed panes vs multiple Tauri windows
- Saving and restoring layout state
- Keyboard shortcuts for pane navigation
- Performance implications of many WebView instances

## Summary

**Recommendation**: Use a **single Tauri window with frontend-managed panes** using `react-resizable-panels` or `react-mosaic`. This approach offers better performance, simpler state management, and cross-platform consistency. Use `tauri-plugin-window-state` for native window state and `tauri-plugin-store` for custom layout persistence. Implement keyboard shortcuts with `tauri-plugin-global-shortcut` for system-wide hotkeys and a React library like `react-hotkeys-hook` for in-app navigation.

## Detailed Findings

### 1. Single Window vs Multiple Windows

| Aspect | Single Window + Frontend Panes | Multiple Tauri Windows |
|--------|-------------------------------|------------------------|
| **Performance** | Better - single WebView process | Each window spawns a WebView process |
| **State Management** | Simpler - all state in one React tree | Complex - need IPC for cross-window state |
| **Cross-platform** | Consistent behavior | Platform-specific quirks |
| **User Experience** | App feels unified | Native multi-window (macOS spaces, etc.) |
| **Implementation** | React libraries handle complexity | More Rust/IPC code needed |

**Verdict**: Single window with frontend panes is recommended for Hive's tmux-like interface. Multiple windows can be added later for "pop-out" functionality.

### 2. Tauri Window Management APIs

**Creating Multiple Windows (Rust)**:
```rust
tauri::Builder::default()
    .setup(|app| {
        let webview_url = tauri::WebviewUrl::App("index.html".into());
        // Create windows programmatically
        tauri::WebviewWindowBuilder::new(app, "main", webview_url.clone())
            .title("Hive")
            .build()?;
        tauri::WebviewWindowBuilder::new(app, "thoughts", webview_url)
            .title("Thoughts Editor")
            .build()?;
        Ok(())
    })
    .run(context)?;
```

**Declarative Windows (tauri.conf.json)**:
```json
{
  "app": {
    "windows": [
      {
        "label": "main",
        "title": "Hive",
        "width": 1200,
        "height": 800
      }
    ]
  }
}
```

**Window Communication (JavaScript)**:
```typescript
import { getCurrentWebviewWindow, getAllWebviewWindows } from '@tauri-apps/api/webviewWindow';

// Get current window
const currentWindow = getCurrentWebviewWindow();

// Get all windows
const allWindows = await getAllWebviewWindows();

// Focus a window
await currentWindow.setFocus();

// Reparent webview to another window
import { getCurrentWebview } from '@tauri-apps/api/webview';
await getCurrentWebview().reparent('other-window');
```

**Multiwebview (Unstable)**:
Tauri 2.0 supports multiple webviews in a single window (behind `unstable` feature flag). This could be useful for native-feeling split views but is not production-ready.

### 3. Frontend Split Pane Libraries

#### react-resizable-panels (Recommended)

**Why**: Most actively maintained, accessible (WAI-ARIA compliant), built-in localStorage persistence, 5k+ GitHub stars.

**Installation**:
```bash
pnpm add react-resizable-panels
```

**Basic Usage**:
```tsx
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';

function HiveLayout() {
  return (
    <PanelGroup direction="horizontal" autoSaveId="hive-layout">
      {/* Sidebar */}
      <Panel id="sidebar" order={1} defaultSize={20} minSize={15} maxSize={30}>
        <ProjectList />
      </Panel>

      <PanelResizeHandle className="w-1 bg-gray-700 hover:bg-blue-500" />

      {/* Main content with nested vertical split */}
      <Panel id="main" order={2} defaultSize={80}>
        <PanelGroup direction="vertical" autoSaveId="hive-main">
          <Panel id="session" order={1} defaultSize={70}>
            <ClaudeSession />
          </Panel>

          <PanelResizeHandle className="h-1 bg-gray-700 hover:bg-blue-500" />

          <Panel id="thoughts" order={2} defaultSize={30}>
            <ThoughtsPanel />
          </Panel>
        </PanelGroup>
      </Panel>
    </PanelGroup>
  );
}
```

**Key Features**:
- `autoSaveId` - automatic localStorage persistence
- `onLayout` callback for custom persistence
- Percentage-based sizing (not pixels)
- Conditional rendering with `id` and `order` props

#### react-mosaic (Alternative for Complex Layouts)

**Why**: IDE-like tiling window manager, drag-and-drop rearrangement, 4.7k GitHub stars.

**Best for**: Applications needing user-customizable layouts like VS Code's panel system.

**Architecture**: Binary tree data structure where leaves are panes. Users can drag tiles to split, rearrange, or close.

```tsx
import { Mosaic, MosaicWindow } from 'react-mosaic-component';

function TilingLayout() {
  return (
    <Mosaic<string>
      renderTile={(id, path) => (
        <MosaicWindow path={path} title={id}>
          {renderPane(id)}
        </MosaicWindow>
      )}
      initialValue={{
        direction: 'row',
        first: 'sidebar',
        second: {
          direction: 'column',
          first: 'session',
          second: 'thoughts',
        },
        splitPercentage: 20,
      }}
    />
  );
}
```

### 4. Layout State Persistence

#### Native Window State (tauri-plugin-window-state)

Persists window position, size, maximized/minimized state automatically.

**Installation**:
```bash
pnpm add @tauri-apps/plugin-window-state
```

```toml
# Cargo.toml
[dependencies]
tauri-plugin-window-state = "2.0.0"
```

**Rust Setup**:
```rust
fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

**JavaScript API**:
```typescript
import { saveWindowState, restoreStateCurrent, StateFlags } from '@tauri-apps/plugin-window-state';

// Save all window states
await saveWindowState(StateFlags.ALL);

// Restore current window state
await restoreStateCurrent(StateFlags.ALL);
```

#### Custom Layout State (tauri-plugin-store)

For persisting panel sizes, active tabs, workspace configurations.

**Installation**:
```bash
pnpm add @tauri-apps/plugin-store
```

**Usage**:
```typescript
import { Store } from '@tauri-apps/plugin-store';

// Create/load store
const layoutStore = await Store.load('hive-layout.json', {
  defaults: {
    sidebarWidth: 20,
    thoughtsPanelHeight: 30,
    activeWorkspace: 'default',
  },
  autoSave: true, // 100ms debounce
});

// Save layout
await layoutStore.set('panelSizes', {
  sidebar: 25,
  session: 50,
  thoughts: 25,
});

// Restore layout
const panelSizes = await layoutStore.get('panelSizes');

// Listen for changes (sync across windows if needed)
const unlisten = await layoutStore.onKeyChange('activeWorkspace', (value) => {
  console.log('Workspace changed:', value);
});
```

#### Combined Persistence Strategy

```typescript
// layouts/persistence.ts
import { Store } from '@tauri-apps/plugin-store';

interface HiveLayout {
  panelSizes: Record<string, number>;
  activeProject: string | null;
  openSessions: string[];
  thoughtsCollapsed: boolean;
}

class LayoutPersistence {
  private store: Store | null = null;

  async init() {
    this.store = await Store.load('hive-workspace.json', {
      autoSave: true,
    });
  }

  async saveLayout(layout: HiveLayout) {
    await this.store?.set('layout', layout);
  }

  async loadLayout(): Promise<HiveLayout | null> {
    return await this.store?.get('layout');
  }

  // For react-resizable-panels onLayout callback
  async savePanelSizes(groupId: string, sizes: number[]) {
    const current = await this.store?.get('panelSizes') || {};
    await this.store?.set('panelSizes', { ...current, [groupId]: sizes });
  }
}
```

### 5. Keyboard Shortcuts

#### Global Shortcuts (tauri-plugin-global-shortcut)

For system-wide hotkeys that work even when app is not focused.

**Installation**:
```bash
pnpm add @tauri-apps/plugin-global-shortcut
```

**JavaScript**:
```typescript
import { register, unregister } from '@tauri-apps/plugin-global-shortcut';

// Register global shortcut to show/hide Hive
await register('CommandOrControl+Shift+H', (event) => {
  if (event.state === 'Pressed') {
    toggleHiveVisibility();
  }
});

// Multiple shortcuts at once
await register(['CommandOrControl+Shift+1', 'CommandOrControl+Shift+2'], (event) => {
  console.log(`Shortcut ${event.shortcut} triggered`);
});
```

**Rust (with custom handler)**:
```rust
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

app.handle().plugin(
    tauri_plugin_global_shortcut::Builder::new()
        .with_shortcuts(["ctrl+shift+h", "alt+space"])?
        .with_handler(|app, shortcut, event| {
            if event.state == ShortcutState::Pressed {
                if shortcut.matches(Modifiers::CONTROL | Modifiers::SHIFT, Code::KeyH) {
                    app.emit("toggle-visibility", ()).ok();
                }
            }
        })
        .build(),
)?;
```

**Permissions (capabilities JSON)**:
```json
{
  "permissions": [
    "global-shortcut:allow-is-registered",
    "global-shortcut:allow-register",
    "global-shortcut:allow-unregister"
  ]
}
```

#### In-App Shortcuts (React)

Use `react-hotkeys-hook` or native event handlers for shortcuts within the app.

```typescript
// Using native React
function HiveLayout() {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // tmux-style prefix (Ctrl+B)
      if (e.ctrlKey && e.key === 'b') {
        setPrefixMode(true);
        return;
      }

      if (prefixMode) {
        switch (e.key) {
          case 'h': focusPane('left'); break;
          case 'l': focusPane('right'); break;
          case 'j': focusPane('down'); break;
          case 'k': focusPane('up'); break;
          case '%': splitVertical(); break;
          case '"': splitHorizontal(); break;
          case 'x': closePane(); break;
        }
        setPrefixMode(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [prefixMode]);
}
```

#### Command Palette Pattern

For VS Code-like command palette:

```typescript
// Simple command palette implementation
interface Command {
  id: string;
  label: string;
  shortcut?: string;
  action: () => void;
}

const commands: Command[] = [
  { id: 'new-session', label: 'New Claude Session', shortcut: 'Ctrl+N', action: createSession },
  { id: 'toggle-thoughts', label: 'Toggle Thoughts Panel', shortcut: 'Ctrl+T', action: toggleThoughts },
  { id: 'focus-sidebar', label: 'Focus Sidebar', shortcut: 'Ctrl+1', action: () => focusPane('sidebar') },
];

// Register Ctrl+Shift+P to open palette
await register('CommandOrControl+Shift+P', () => setCommandPaletteOpen(true));
```

### 6. WebView Performance

#### Architecture Overview

Tauri uses a **multi-process architecture**:
- **Core Process**: Rust, full OS access, manages windows and IPC
- **WebView Process(es)**: Platform-specific (WKWebView on macOS, WebView2 on Windows, webkitgtk on Linux)

**Key Performance Characteristics**:
- WebView libraries are **dynamically linked**, not bundled (smaller binary)
- Each window spawns its own WebView process
- Multi-core CPUs are leveraged effectively
- Process isolation prevents crashes from cascading

#### Performance Implications

| Approach | Memory | CPU | Startup |
|----------|--------|-----|---------|
| Single window, React panes | ~50-100MB base | Low | Fast |
| Multiple windows (2-3) | +30-50MB per window | Moderate | Slower |
| Many windows (5+) | Significant overhead | Higher | Noticeable delay |

**Recommendations**:
1. **Default to single window** with frontend panes for main interface
2. **Lazy-load secondary windows** only when user requests pop-out
3. **Centralize state in Core** for multi-window scenarios
4. **Use IPC sparingly** between windows (batch updates)

#### Optimization Strategies

```typescript
// Lazy window creation
async function createPopoutWindow(paneId: string) {
  const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');

  const popout = new WebviewWindow(`popout-${paneId}`, {
    url: `index.html#/popout/${paneId}`,
    title: `Hive - ${paneId}`,
    width: 800,
    height: 600,
  });

  popout.once('tauri://created', () => {
    console.log('Popout window created');
  });
}
```

### 7. Recommended Architecture for Hive

```
src/
├── components/
│   ├── layout/
│   │   ├── HiveLayout.tsx        # Main PanelGroup container
│   │   ├── ResizablePane.tsx     # Wrapper for Panel with common styling
│   │   └── PaneHeader.tsx        # Tab bar / pane controls
│   ├── sidebar/
│   │   └── ProjectList.tsx
│   ├── session/
│   │   └── ClaudeSession.tsx
│   └── thoughts/
│       └── ThoughtsPanel.tsx
├── hooks/
│   ├── useKeyboardShortcuts.ts   # Centralized shortcut handling
│   ├── useLayoutPersistence.ts   # Save/restore layout state
│   └── usePaneNavigation.ts      # Focus management between panes
├── stores/
│   └── layoutStore.ts            # Zustand/Jotai for layout state
└── lib/
    └── shortcuts.ts              # Shortcut definitions and registry
```

**Key Implementation**:

```tsx
// components/layout/HiveLayout.tsx
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { useLayoutPersistence } from '@/hooks/useLayoutPersistence';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';

export function HiveLayout() {
  const { savePanelSizes } = useLayoutPersistence();
  useKeyboardShortcuts(); // Register all shortcuts

  return (
    <div className="h-screen w-screen bg-gray-900">
      <PanelGroup
        direction="horizontal"
        autoSaveId="hive-main"
        onLayout={(sizes) => savePanelSizes('main', sizes)}
      >
        <Panel id="sidebar" order={1} defaultSize={20} minSize={10} maxSize={40}>
          <Sidebar />
        </Panel>

        <PanelResizeHandle className="w-1 bg-gray-700 hover:bg-blue-500 transition-colors" />

        <Panel id="content" order={2}>
          <PanelGroup direction="vertical" autoSaveId="hive-content">
            <Panel id="session" order={1} defaultSize={70} minSize={30}>
              <SessionPane />
            </Panel>

            <PanelResizeHandle className="h-1 bg-gray-700 hover:bg-blue-500 transition-colors" />

            <Panel id="thoughts" order={2} defaultSize={30} minSize={15}>
              <ThoughtsPane />
            </Panel>
          </PanelGroup>
        </Panel>
      </PanelGroup>
    </div>
  );
}
```

## Decisions Made

1. **Primary Approach**: Single window with `react-resizable-panels` for pane management
2. **Layout Persistence**: `tauri-plugin-store` for custom layout + `tauri-plugin-window-state` for native window state
3. **Global Shortcuts**: `tauri-plugin-global-shortcut` for show/hide app
4. **In-App Shortcuts**: Native React handlers with tmux-style prefix support
5. **Performance Strategy**: Start with single window, add pop-out windows on demand

## Open Questions

1. **Command Palette Library**: Build custom or use existing (cmdk, kbar)?
2. **Pane Focus Indicators**: Visual feedback when switching panes via keyboard?
3. **Named Workspaces**: How to persist and switch between named layout configurations?

## Related Research

- [Hive macOS App Research](./2025-12-14-hive-macos-app-research.md) - Main Hive research document
- [Claude Agent SDK Session Lifecycle](./2025-12-14-claude-agent-sdk-session-lifecycle.md) - Session management details

## External Resources

**Tauri Documentation**:
- [Tauri 2.0 Process Model](https://v2.tauri.app/concept/process-model/)
- [Window State Plugin](https://v2.tauri.app/plugin/window-state/)
- [Global Shortcut Plugin](https://v2.tauri.app/plugin/global-shortcut/)
- [Store Plugin](https://v2.tauri.app/plugin/store/)

**React Libraries**:
- [react-resizable-panels](https://github.com/bvaughn/react-resizable-panels) - Recommended split pane library
- [react-mosaic](https://github.com/nomcopter/react-mosaic) - IDE-like tiling window manager

**Reference Implementations**:
- [Opcode (Claudia)](https://github.com/getAsterisk/claudia) - Tauri + React Claude Code wrapper
