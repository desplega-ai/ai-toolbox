---
date: 2025-12-15T21:30:00Z
researcher: Claude
git_commit: 9e21b0505afee30a99059894d8956b2bc374d1c2
branch: main
repository: ai-toolbox
topic: "Hive - Vim-style Keybindings Implementation"
tags: [research, hive, vim, keybindings, react, electron, monaco]
status: complete
last_updated: 2025-12-15
last_updated_by: Claude
related: ["2025-12-15-hive-ux-ui-design-spec.md", "2025-12-15-hive-electron-app-research.md"]
---

# Research: Hive - Vim-style Keybindings Implementation

**Date**: 2025-12-15T21:30:00Z
**Researcher**: Claude
**Git Commit**: 9e21b0505afee30a99059894d8956b2bc374d1c2
**Branch**: main
**Repository**: ai-toolbox

## Research Question

How to implement vim-like keybindings in Hive, covering:
- Modal navigation (hjkl, modes) throughout the app UI
- Vim keybindings in Monaco Editor for code/text editing
- Integration with Electron

## Summary

Hive can implement vim keybindings at two levels:

1. **App-wide vim navigation**: Use `react-hotkeys-hook` with scopes for modal editing (normal/insert/visual modes), and `tinykeys` for vim-style key sequences (gg, dd)
2. **Monaco Editor vim mode**: Use `monaco-vim` package with `@monaco-editor/react`

The current codebase has only basic keyboard handling; no vim implementations exist.

## Recommended Libraries

### For App-Wide Vim Navigation

| Library | npm Package | Use Case | Size |
|---------|-------------|----------|------|
| react-hotkeys-hook | `react-hotkeys-hook` | Modal editing with scopes | ~3kb |
| tinykeys | `tinykeys` | Key sequences (gg, dd) | ~650B |

### For Monaco Editor

| Library | npm Package | Use Case |
|---------|-------------|----------|
| monaco-vim | `monaco-vim` | Full vim keybindings in editor |

## Implementation Architecture

### 1. Vim Mode Context Provider

```typescript
// src/renderer/contexts/VimContext.tsx
import { createContext, useContext, useState, useCallback } from 'react';
import { HotkeysProvider, useHotkeysContext } from 'react-hotkeys-hook';

type VimMode = 'normal' | 'insert' | 'visual' | 'command';

interface VimContextType {
  mode: VimMode;
  setMode: (mode: VimMode) => void;
  enableVim: boolean;
  toggleVim: () => void;
}

const VimContext = createContext<VimContextType | null>(null);

export function VimProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<VimMode>('normal');
  const [enableVim, setEnableVim] = useState(true);

  const toggleVim = useCallback(() => {
    setEnableVim(prev => !prev);
    setMode('normal');
  }, []);

  return (
    <HotkeysProvider initiallyActiveScopes={['normal']}>
      <VimContext.Provider value={{ mode, setMode, enableVim, toggleVim }}>
        {children}
      </VimContext.Provider>
    </HotkeysProvider>
  );
}

export const useVim = () => {
  const ctx = useContext(VimContext);
  if (!ctx) throw new Error('useVim must be used within VimProvider');
  return ctx;
};
```

### 2. Vim Keybindings Hook

```typescript
// src/renderer/hooks/useVimNavigation.ts
import { useHotkeys, useHotkeysContext } from 'react-hotkeys-hook';
import { useVim } from '../contexts/VimContext';

interface UseVimNavigationOptions {
  onNavigateDown?: () => void;
  onNavigateUp?: () => void;
  onNavigateLeft?: () => void;
  onNavigateRight?: () => void;
  onEnter?: () => void;
  onEscape?: () => void;
  onGoToTop?: () => void;
  onGoToBottom?: () => void;
  onDelete?: () => void;
  onYank?: () => void;
}

export function useVimNavigation(options: UseVimNavigationOptions) {
  const { mode, setMode, enableVim } = useVim();
  const { enableScope, disableScope } = useHotkeysContext();

  // Mode switching
  useHotkeys('i', () => {
    disableScope('normal');
    enableScope('insert');
    setMode('insert');
  }, { scopes: ['normal'], enabled: enableVim });

  useHotkeys('v', () => {
    disableScope('normal');
    enableScope('visual');
    setMode('visual');
  }, { scopes: ['normal'], enabled: enableVim });

  useHotkeys(':', () => {
    disableScope('normal');
    enableScope('command');
    setMode('command');
  }, { scopes: ['normal'], enabled: enableVim });

  useHotkeys('escape', () => {
    disableScope('insert');
    disableScope('visual');
    disableScope('command');
    enableScope('normal');
    setMode('normal');
    options.onEscape?.();
  }, { scopes: ['insert', 'visual', 'command'], enabled: enableVim });

  // Normal mode navigation (hjkl)
  useHotkeys('j', () => options.onNavigateDown?.(),
    { scopes: ['normal'], enabled: enableVim });
  useHotkeys('k', () => options.onNavigateUp?.(),
    { scopes: ['normal'], enabled: enableVim });
  useHotkeys('h', () => options.onNavigateLeft?.(),
    { scopes: ['normal'], enabled: enableVim });
  useHotkeys('l', () => options.onNavigateRight?.(),
    { scopes: ['normal'], enabled: enableVim });

  // Enter to select/confirm
  useHotkeys('enter', () => options.onEnter?.(),
    { scopes: ['normal'], enabled: enableVim });

  // Visual mode navigation (extends selection)
  useHotkeys('j', () => options.onNavigateDown?.(),
    { scopes: ['visual'], enabled: enableVim });
  useHotkeys('k', () => options.onNavigateUp?.(),
    { scopes: ['visual'], enabled: enableVim });

  return { mode };
}
```

### 3. Key Sequences with tinykeys

```typescript
// src/renderer/hooks/useVimSequences.ts
import { useEffect } from 'react';
import { tinykeys } from 'tinykeys';
import { useVim } from '../contexts/VimContext';

interface UseVimSequencesOptions {
  onGoToTop?: () => void;      // gg
  onGoToBottom?: () => void;   // G
  onDeleteLine?: () => void;   // dd
  onYankLine?: () => void;     // yy
  onPaste?: () => void;        // p
  onUndo?: () => void;         // u
  onRedo?: () => void;         // ctrl+r
}

export function useVimSequences(options: UseVimSequencesOptions) {
  const { enableVim, mode } = useVim();

  useEffect(() => {
    if (!enableVim || mode !== 'normal') return;

    const unsubscribe = tinykeys(window, {
      'g g': () => options.onGoToTop?.(),
      'G': () => options.onGoToBottom?.(),
      'd d': () => options.onDeleteLine?.(),
      'y y': () => options.onYankLine?.(),
      'p': () => options.onPaste?.(),
      'u': () => options.onUndo?.(),
      'Control+r': () => options.onRedo?.(),
    });

    return () => unsubscribe();
  }, [enableVim, mode, options]);
}
```

### 4. Monaco Editor Vim Integration

```typescript
// src/renderer/components/VimEditor.tsx
import { useRef, useEffect, useState } from 'react';
import Editor, { OnMount } from '@monaco-editor/react';
import { initVimMode, VimMode } from 'monaco-vim';
import type { editor } from 'monaco-editor';
import { useVim } from '../contexts/VimContext';

interface VimEditorProps {
  value?: string;
  language?: string;
  onChange?: (value: string | undefined) => void;
  onSave?: (value: string) => void;
  height?: string;
}

export function VimEditor({
  value,
  language = 'markdown',
  onChange,
  onSave,
  height = '100%',
}: VimEditorProps) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const statusBarRef = useRef<HTMLDivElement | null>(null);
  const vimModeRef = useRef<ReturnType<typeof initVimMode> | null>(null);
  const { enableVim } = useVim();

  const handleMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;

    // Bypass vim for Ctrl+S
    editor.onKeyDown((e) => {
      if ((e.ctrlKey || e.metaKey) && e.keyCode === monaco.KeyCode.KeyS) {
        e.preventDefault();
        onSave?.(editor.getValue());
      }
    });

    // Initialize vim mode
    if (enableVim && statusBarRef.current) {
      vimModeRef.current = initVimMode(editor, statusBarRef.current);
      setupVimCommands(editor);
    }
  };

  const setupVimCommands = (editor: editor.IStandaloneCodeEditor) => {
    // :w - save
    VimMode.Vim.defineEx('write', 'w', () => {
      onSave?.(editor.getValue());
    });

    // :q - quit/close (could trigger panel close)
    VimMode.Vim.defineEx('quit', 'q', () => {
      console.log('Quit requested');
    });

    // :wq - save and quit
    VimMode.Vim.defineEx('wq', 'wq', () => {
      onSave?.(editor.getValue());
      console.log('Save and quit requested');
    });
  };

  // Toggle vim mode when setting changes
  useEffect(() => {
    if (!editorRef.current || !statusBarRef.current) return;

    vimModeRef.current?.dispose();
    vimModeRef.current = null;

    if (enableVim) {
      vimModeRef.current = initVimMode(editorRef.current, statusBarRef.current);
      setupVimCommands(editorRef.current);
    }
  }, [enableVim]);

  // Cleanup
  useEffect(() => {
    return () => {
      vimModeRef.current?.dispose();
    };
  }, []);

  return (
    <div className="flex flex-col h-full">
      <Editor
        height={height}
        language={language}
        value={value}
        onChange={onChange}
        theme="solarized-dark"
        onMount={handleMount}
        options={{
          fontFamily: 'Hack, monospace',
          fontSize: 14,
          cursorStyle: enableVim ? 'block' : 'line',
          minimap: { enabled: false },
        }}
      />
      {/* Vim status bar */}
      <div
        ref={statusBarRef}
        className={`
          px-3 py-1 font-mono text-xs
          bg-sol-base02 text-sol-base0
          border-t border-sol-base01
          ${enableVim ? 'block' : 'hidden'}
        `}
      />
    </div>
  );
}
```

### 5. Vim-navigable Session List

```typescript
// src/renderer/components/VimSessionList.tsx
import { useState } from 'react';
import { useVimNavigation } from '../hooks/useVimNavigation';
import { useVimSequences } from '../hooks/useVimSequences';
import { cn } from '@/lib/utils';

interface Session {
  id: string;
  name: string;
  status: 'running' | 'completed' | 'awaiting_input';
}

interface VimSessionListProps {
  sessions: Session[];
  onSelectSession: (session: Session) => void;
  onDeleteSession?: (session: Session) => void;
}

export function VimSessionList({
  sessions,
  onSelectSession,
  onDeleteSession,
}: VimSessionListProps) {
  const [cursor, setCursor] = useState(0);

  useVimNavigation({
    onNavigateDown: () => setCursor(c => Math.min(c + 1, sessions.length - 1)),
    onNavigateUp: () => setCursor(c => Math.max(c - 1, 0)),
    onEnter: () => onSelectSession(sessions[cursor]),
  });

  useVimSequences({
    onGoToTop: () => setCursor(0),
    onGoToBottom: () => setCursor(sessions.length - 1),
    onDeleteLine: () => onDeleteSession?.(sessions[cursor]),
  });

  return (
    <ul className="space-y-1">
      {sessions.map((session, i) => (
        <li
          key={session.id}
          className={cn(
            'px-3 py-2 rounded cursor-pointer',
            i === cursor && 'bg-sol-base2 dark:bg-sol-base02 ring-2 ring-sol-blue',
          )}
          onClick={() => {
            setCursor(i);
            onSelectSession(session);
          }}
        >
          <span className="font-medium">{session.name}</span>
          <span className="ml-2 text-xs text-sol-base1">{session.status}</span>
        </li>
      ))}
    </ul>
  );
}
```

## Vim Keybindings Reference for Hive

### App-wide Navigation (Normal Mode)

| Key | Action |
|-----|--------|
| `j` | Move cursor down |
| `k` | Move cursor up |
| `h` | Move left / collapse |
| `l` | Move right / expand |
| `gg` | Go to top |
| `G` | Go to bottom |
| `Enter` | Select / confirm |
| `dd` | Delete current item |
| `yy` | Copy current item |
| `p` | Paste |
| `/` | Search |

### Mode Switching

| Key | Action |
|-----|--------|
| `i` | Enter insert mode (focus input) |
| `v` | Enter visual mode (selection) |
| `:` | Enter command mode |
| `Escape` | Return to normal mode |

### Monaco Editor (vim mode enabled)

Full vim keybindings including:
- All motions (w, b, e, 0, $, gg, G, etc.)
- Operators (d, y, c, etc.)
- Visual mode (v, V, Ctrl+v)
- Ex commands (:w, :q, :wq, etc.)

### Custom Ex Commands

| Command | Action |
|---------|--------|
| `:w` | Save file |
| `:q` | Close panel |
| `:wq` | Save and close |

## Installation

```bash
# Core dependencies
pnpm add react-hotkeys-hook tinykeys

# Monaco vim mode
pnpm add monaco-vim
```

## Integration with UX Design Spec

The vim keybindings complement the existing keyboard shortcuts in the UX spec:

| Existing (UX Spec) | Vim Addition |
|--------------------|--------------|
| `Cmd+T` - New tab | `t` in normal mode (optional) |
| `Cmd+W` - Close tab | `:q` in command mode |
| `Cmd+1-9` - Switch tabs | `gt` / `gT` for next/prev tab |
| `Cmd+\` - Toggle sidebar | `Ctrl+w h/l` for focus |
| `Cmd+Enter` - Send message | Stays same (not vim-ified) |

## Settings Integration

Add vim toggle to Settings page:

```typescript
// In Settings page
<div className="flex items-center justify-between">
  <div>
    <h4>Vim Keybindings</h4>
    <p className="text-sm text-sol-base1">
      Enable vim-style navigation throughout the app
    </p>
  </div>
  <Switch
    checked={settings.enableVim}
    onCheckedChange={(checked) => updateSetting('enableVim', checked)}
  />
</div>
```

## Related Research

- [2025-12-15-hive-ux-ui-design-spec.md](./2025-12-15-hive-ux-ui-design-spec.md) - Keyboard shortcuts section
- [2025-12-15-hive-electron-app-research.md](./2025-12-15-hive-electron-app-research.md) - Electron architecture

## External Sources

- [react-hotkeys-hook - GitHub](https://github.com/JohannesKlauss/react-hotkeys-hook)
- [tinykeys - GitHub](https://github.com/jamiebuilds/tinykeys)
- [monaco-vim - GitHub](https://github.com/brijeshb42/monaco-vim)
- [monaco-vim - npm](https://www.npmjs.com/package/monaco-vim)
- [@monaco-editor/react - GitHub](https://github.com/suren-atoyan/monaco-react)
