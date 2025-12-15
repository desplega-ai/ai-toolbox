---
date: 2025-12-15T18:30:00Z
researcher: Claude
git_commit: 9e21b0505afee30a99059894d8956b2bc374d1c2
branch: main
repository: ai-toolbox
topic: "Hive - UX/UI Design Specification"
tags: [research, hive, ux, ui, design, shadcn, solarized, electron]
status: complete
last_updated: 2025-12-15
last_updated_by: Claude
related: ["2025-12-15-hive-electron-app-research.md", "2025-12-15-hive-claude-sdk-integration.md"]
---

# Research: Hive - UX/UI Design Specification

**Date**: 2025-12-15T18:30:00Z
**Researcher**: Claude
**Git Commit**: 9e21b0505afee30a99059894d8956b2bc374d1c2
**Branch**: main
**Repository**: ai-toolbox

## Research Question

Document the complete UX/UI design specification for Hive, including:
- Navigation flow and view hierarchy
- Component specifications for each view
- Styling system (Solarized theme with shadcn/ui)
- Typography and iconography
- System tray integration

## Summary

This document defines the complete UX/UI specification for Hive, a macOS desktop app for managing Claude Code sessions. The design follows a **retro-clean aesthetic** using the **Solarized color scheme** with **shadcn/ui components**. The app uses a terminal-inspired top bar with browser-like tabs, allowing multiple project workspaces simultaneously.

## Application Architecture

### View Hierarchy

```
Hive App
├── Top Bar (Terminal-style with tabs)
│   ├── Tab 1 → Start View / Project View
│   ├── Tab 2 → Start View / Project View
│   └── [+] New Tab
│
├── Main Content (per tab)
│   ├── Start View (default)
│   │   ├── Projects List
│   │   ├── Add Project Button
│   │   └── Sessions Overview
│   │
│   └── Project View
│       ├── Sessions Sidebar (left, collapsible)
│       │   ├── Awaiting Action (prioritized)
│       │   ├── Running Sessions
│       │   └── Completed Sessions
│       │
│       └── Main Panel (right)
│           ├── Empty State → "New Session" button
│           │
│           └── Session View (browser-like sub-tabs)
│               ├── Agent Tab (Claude I/O)
│               ├── Diff Tab (code changes)
│               ├── Analytics Tab (session stats)
│               └── Thoughts Tab (file tree + editor)
│
├── Settings Page (modal/route)
│   ├── Storage Location
│   ├── Theme Toggle
│   ├── Credentials
│   └── Danger Zone
│
├── Analytics Page (modal/route)
│   └── Usage graphs (ccusage-inspired)
│
└── System Tray
    ├── Open App
    ├── Running Sessions
    └── Notifications
```

## View Specifications

### 1. Start View

The landing view when opening a new tab or starting the app.

#### Layout

```
┌─────────────────────────────────────────────────────────────┐
│  [Tab 1] [Tab 2] [+]                              [⚙] [📊]  │  ← Top Bar
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  📁 Your Projects                      [+ Add Project]│   │
│  ├─────────────────────────────────────────────────────┤   │
│  │                                                       │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐│   │
│  │  │ ai-toolbox   │  │ my-webapp    │  │ rust-cli     ││   │
│  │  │ ~/code/ai-tb │  │ ~/code/web   │  │ ~/code/rust  ││   │
│  │  │ 3 sessions   │  │ 1 session    │  │ 0 sessions   ││   │
│  │  │ ● 1 running  │  │              │  │              ││   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘│   │
│  │                                                       │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  🔄 All Sessions                    [Running Only ▼]│   │
│  ├─────────────────────────────────────────────────────┤   │
│  │  ● ai-toolbox/research-hive     Running   2m ago    │   │
│  │  ○ my-webapp/implement-auth     Completed 1h ago    │   │
│  │  ○ ai-toolbox/plan-feature      Completed 3h ago    │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### Components

| Element | shadcn/ui Component | Notes |
|---------|---------------------|-------|
| Projects grid | `Card` | Grid layout, 3 columns |
| Add Project | `Button` + `Dialog` | Opens native directory picker |
| Sessions list | `Table` or custom list | Filterable by status |
| Filter dropdown | `Select` | "Running Only" / "All" |
| Project card | `Card` with `Badge` | Show running indicator |

#### Interactions

- **Click project card** → Navigate to Project View
- **Click "Add Project"** → Open native directory picker dialog
- **Click session row** → Navigate to Project View with session selected
- **Filter dropdown** → Toggle between running/all sessions

---

### 2. Project View

Main workspace for a single project.

#### Layout

```
┌─────────────────────────────────────────────────────────────┐
│  [Tab 1: ai-toolbox] [Tab 2] [+]                  [⚙] [📊]  │
├────────────────┬────────────────────────────────────────────┤
│ Sessions       │                                            │
│ ─────────────  │                                            │
│ ⚠ NEEDS ACTION │                                            │
│ ├─ research-x  │        Click "New Session" to start        │
│                │                                            │
│ ● RUNNING      │              [+ New Session]               │
│ ├─ impl-auth   │                                            │
│                │                                            │
│ ○ COMPLETED    │                                            │
│ ├─ plan-api    │                                            │
│ └─ research-db │                                            │
│                │                                            │
│ [« Collapse]   │                                            │
├────────────────┴────────────────────────────────────────────┤
│  ← Back to Projects                                         │
└─────────────────────────────────────────────────────────────┘
```

#### Sidebar Components

| Element | shadcn/ui Component | Notes |
|---------|---------------------|-------|
| Sidebar container | `Sidebar` | Collapsible, variant="sidebar" |
| Section headers | `SidebarGroupLabel` | "NEEDS ACTION", "RUNNING", "COMPLETED" |
| Session items | `SidebarMenuButton` | With status icon |
| Collapse button | `SidebarTrigger` | At bottom of sidebar |

#### Session Status Icons

| Status | Icon | Color (Solarized) |
|--------|------|-------------------|
| Needs Action | `AlertCircle` | Orange `#cb4b16` |
| Running | `Circle` (filled) | Green `#859900` |
| Completed | `Circle` (outline) | Base01 `#586e75` |
| Error | `XCircle` | Red `#dc322f` |

---

### 3. New Session Modal

Modal dialog for creating a new session.

#### Layout

```
┌─────────────────────────────────────────────────────────────┐
│  New Session                                           [×]  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Session Type                                               │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌──────────┐ │
│  │ 🔍Research │ │ 📋 Plan    │ │ 🔨Implement│ │ 💬Normal │ │
│  └────────────┘ └────────────┘ └────────────┘ └──────────┘ │
│                                                             │
│  Model                                                      │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Claude Opus 4                                    ▼  │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Prompt                                                     │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Research the best approach for implementing...      │   │
│  │                                                     │   │
│  │ @thoughts/shared/research/2025-12-15-hive.md       │   │
│  │                                                     │   │
│  └─────────────────────────────────────────────────────┘   │
│  Supports @file and @agent references                       │
│                                                             │
│                                        [Cancel] [▶ Start]   │
└─────────────────────────────────────────────────────────────┘
```

#### Components

| Element | shadcn/ui Component | Notes |
|---------|---------------------|-------|
| Modal | `Dialog` | Centered, backdrop blur |
| Type selector | `ToggleGroup` | Single select, 4 options |
| Model dropdown | `Select` | Default: Opus |
| Prompt input | `Textarea` | Auto-resize, syntax highlighting for @ |
| Buttons | `Button` | Cancel (ghost), Start (primary) |

#### Session Types

| Type | Icon | System Prompt Modifier |
|------|------|------------------------|
| Research | `Search` | Focus on exploration, no code changes |
| Plan | `ClipboardList` | Create implementation plans |
| Implement | `Hammer` | Execute code changes |
| Normal | `MessageSquare` | Default Claude Code behavior |

#### Model Options

```typescript
const models = [
  { value: 'claude-opus-4-5', label: 'Claude Opus 4.5', default: true },
  { value: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
  { value: 'claude-haiku-3-5', label: 'Claude Haiku 3.5' },
];
```

---

### 4. Session View (Selected Session)

Browser-like tab interface for an active session.

#### Layout

```
┌─────────────────────────────────────────────────────────────┐
│  [Tab 1: ai-toolbox] [Tab 2] [+]                  [⚙] [📊]  │
├────────────────┬────────────────────────────────────────────┤
│ Sessions       │ [Agent] [Diff] [Analytics] [Thoughts]      │
│ ─────────────  ├────────────────────────────────────────────┤
│ ⚠ NEEDS ACTION │ research-hive (Research) ● Running         │
│ ├─ research-x  │────────────────────────────────────────────│
│                │                                            │
│ ● RUNNING      │ Claude: I'll help you research the best    │
│ ├─●impl-auth   │ approach for implementing authentication.  │
│                │                                            │
│ ○ COMPLETED    │ Let me start by exploring the codebase...  │
│ ├─ plan-api    │                                            │
│                │ [Reading] src/lib/auth.ts                  │
│                │                                            │
│                │────────────────────────────────────────────│
│                │ ┌────────────────────────────────────────┐ │
│                │ │ Type a message... @file @agent      ▶│ │
│ [« Collapse]   │ └────────────────────────────────────────┘ │
└────────────────┴────────────────────────────────────────────┘
```

#### Sub-Tab Specifications

##### Agent Tab (Claude I/O)

| Element | Component | Notes |
|---------|-----------|-------|
| Header | Custom | Session name, type badge, status indicator |
| Message list | Custom scroll area | Auto-scroll, syntax highlighting |
| Tool calls | `Collapsible` | Expandable tool execution details |
| Input | `Textarea` + `Button` | @ autocomplete, send button |
| Interrupt | `Button` (destructive) | Only visible when running |

##### Diff Tab

| Element | Component | Notes |
|---------|-----------|-------|
| File list | `Sidebar` (mini) | Changed files tree |
| Diff viewer | Monaco Editor | Side-by-side diff mode |
| Actions | `Button` group | Revert, Accept, Stage |

##### Analytics Tab

| Element | Component | Notes |
|---------|-----------|-------|
| Token usage | `Card` | Input/output/cache breakdown |
| Cost | `Card` | USD cost for session |
| Timeline | Chart | Token usage over time |
| Model breakdown | `Table` | If multiple models used |

##### Thoughts Tab

| Element | Component | Notes |
|---------|-----------|-------|
| File tree | Custom tree | thoughts/ directory |
| Editor | Monaco Editor | Markdown editing |
| Preview | Markdown renderer | Optional split view |

---

### 5. Settings Page

Full-page modal for app configuration.

#### Layout

```
┌─────────────────────────────────────────────────────────────┐
│  Settings                                              [×]  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  General                                                    │
│  ─────────────────────────────────────────────────────────  │
│  Storage Location                                           │
│  ~/.hive/                                      [Change...]  │
│                                                             │
│  Theme                                                      │
│  ○ Light   ● Dark   ○ System                               │
│                                                             │
│  Credentials                                                │
│  ─────────────────────────────────────────────────────────  │
│  Authentication Method                                      │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Claude CLI (inherited)                           ▼  │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  API Key (optional override)                                │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ sk-ant-••••••••••••••••                         👁  │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Remote Access (Future)                                     │
│  ─────────────────────────────────────────────────────────  │
│  Link other devices                              [Setup...] │
│  Status: Not configured                                     │
│                                                             │
│  Danger Zone                                                │
│  ─────────────────────────────────────────────────────────  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ ⚠ Unlink All Devices                                │   │
│  │ Generate new subdomain and auth for localtunnel     │   │
│  │                                           [Unlink]  │   │
│  ├─────────────────────────────────────────────────────┤   │
│  │ ⚠ Delete All Data                                   │   │
│  │ Remove all sessions, projects, and settings         │   │
│  │                                            [Reset]  │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### Components

| Element | shadcn/ui Component | Notes |
|---------|---------------------|-------|
| Theme toggle | `RadioGroup` | 3 options |
| Auth method | `Select` | CLI, API Key, Bedrock, Vertex |
| API key input | `Input` type="password" | With visibility toggle |
| Storage path | `Input` + `Button` | Directory picker |
| Danger buttons | `Button` variant="destructive" | With confirmation dialog |

---

### 6. Analytics Page

Dashboard view of usage statistics (inspired by [ccusage](https://github.com/ryoppippi/ccusage)).

#### Layout

```
┌─────────────────────────────────────────────────────────────┐
│  Analytics                                             [×]  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Total Cost   │  │ Total Tokens │  │ Sessions     │      │
│  │   $42.50     │  │   2.4M       │  │   47         │      │
│  │   this month │  │   this month │  │   this month │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                             │
│  Usage Over Time                                            │
│  ┌─────────────────────────────────────────────────────┐   │
│  │     ████                                            │   │
│  │    █████                                            │   │
│  │   ██████  ███                                       │   │
│  │  ███████ █████ ████                                 │   │
│  │ ████████████████████ ████                           │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  By Project                          By Model               │
│  ┌────────────────────────┐         ┌────────────────────┐ │
│  │ ai-toolbox    $28.00   │         │ Opus 4.5   $35.00  │ │
│  │ my-webapp     $10.50   │         │ Sonnet 4.5  $7.50  │ │
│  │ rust-cli       $4.00   │         │ Haiku 3.5   $0.00  │ │
│  └────────────────────────────────┘ └────────────────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### Data Source

Analytics data sourced from local JSONL files in `~/.claude/projects/` (same as ccusage):

```typescript
interface UsageData {
  date: string;
  tokens: {
    input: number;
    output: number;
    cacheCreation: number;
    cacheRead: number;
  };
  cost: number;
  model: string;
  projectPath: string;
  sessionId: string;
}
```

---

### 7. System Tray

Native macOS menu bar integration.

#### Menu Structure

```
┌─────────────────────────────┐
│ 🐝 Hive                     │
├─────────────────────────────┤
│ Open Hive              ⌘O   │
├─────────────────────────────┤
│ Running Sessions            │
│   ├─ ai-toolbox/research    │
│   └─ my-webapp/impl-auth    │
├─────────────────────────────┤
│ Notifications          (2)  │
│   ├─ ⚠ Input needed: auth   │
│   └─ ✓ Task complete: api   │
├─────────────────────────────┤
│ Quit Hive              ⌘Q   │
└─────────────────────────────┘
```

#### Behavior

- **Close window** → Minimize to tray (not quit)
- **Click tray icon** → Open main window
- **Click session** → Open window, navigate to session
- **Click notification** → Open window, focus session, clear notification

---

## Styling Specification

### Solarized Color Scheme

#### Base Colors (CSS Custom Properties)

```css
:root {
  /* Solarized Base (Light Mode) */
  --sol-base03: #002b36;  /* Darkest - not used in light */
  --sol-base02: #073642;  /* Dark background accent */
  --sol-base01: #586e75;  /* Secondary content */
  --sol-base00: #657b83;  /* Primary content */
  --sol-base0: #839496;   /* Body text */
  --sol-base1: #93a1a1;   /* Comments, secondary */
  --sol-base2: #eee8d5;   /* Background highlights */
  --sol-base3: #fdf6e3;   /* Background */

  /* Solarized Accent Colors */
  --sol-yellow: #b58900;
  --sol-orange: #cb4b16;
  --sol-red: #dc322f;
  --sol-magenta: #d33682;
  --sol-violet: #6c71c4;
  --sol-blue: #268bd2;
  --sol-cyan: #2aa198;
  --sol-green: #859900;
}

.dark {
  /* Solarized Dark Mode - Swap base colors */
  --sol-background: var(--sol-base03);
  --sol-background-highlight: var(--sol-base02);
  --sol-text-primary: var(--sol-base0);
  --sol-text-secondary: var(--sol-base01);
}
```

#### Semantic Color Mapping

```css
:root {
  /* Light Mode (default) */
  --background: var(--sol-base3);           /* #fdf6e3 */
  --background-secondary: var(--sol-base2); /* #eee8d5 */
  --foreground: var(--sol-base00);          /* #657b83 */
  --foreground-muted: var(--sol-base1);     /* #93a1a1 */

  --primary: var(--sol-blue);               /* #268bd2 */
  --primary-foreground: var(--sol-base3);   /* #fdf6e3 */

  --secondary: var(--sol-base2);            /* #eee8d5 */
  --secondary-foreground: var(--sol-base01); /* #586e75 */

  --accent: var(--sol-cyan);                /* #2aa198 */
  --accent-foreground: var(--sol-base3);    /* #fdf6e3 */

  --destructive: var(--sol-red);            /* #dc322f */
  --destructive-foreground: var(--sol-base3);

  --warning: var(--sol-orange);             /* #cb4b16 */
  --success: var(--sol-green);              /* #859900 */

  --border: var(--sol-base2);               /* #eee8d5 */
  --ring: var(--sol-blue);                  /* #268bd2 */

  /* Sidebar specific */
  --sidebar: var(--sol-base2);              /* #eee8d5 */
  --sidebar-foreground: var(--sol-base00);  /* #657b83 */
  --sidebar-accent: var(--sol-base3);       /* #fdf6e3 */

  /* Chart colors */
  --chart-1: var(--sol-blue);
  --chart-2: var(--sol-cyan);
  --chart-3: var(--sol-green);
  --chart-4: var(--sol-yellow);
  --chart-5: var(--sol-orange);
}

.dark {
  --background: var(--sol-base03);          /* #002b36 */
  --background-secondary: var(--sol-base02); /* #073642 */
  --foreground: var(--sol-base0);           /* #839496 */
  --foreground-muted: var(--sol-base01);    /* #586e75 */

  --primary: var(--sol-blue);               /* #268bd2 */
  --primary-foreground: var(--sol-base03);  /* #002b36 */

  --secondary: var(--sol-base02);           /* #073642 */
  --secondary-foreground: var(--sol-base1); /* #93a1a1 */

  --border: var(--sol-base02);              /* #073642 */

  --sidebar: var(--sol-base02);             /* #073642 */
  --sidebar-foreground: var(--sol-base0);   /* #839496 */
  --sidebar-accent: var(--sol-base03);      /* #002b36 */
}
```

### Typography

#### Font Stack

```css
:root {
  /* System font for UI */
  --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
               "Helvetica Neue", Arial, sans-serif;

  /* Hack font for code */
  --font-mono: "Hack", "Fira Code", "SF Mono", Monaco,
               "Cascadia Code", Consolas, monospace;
}
```

#### Font Sizes

```css
:root {
  --text-xs: 0.75rem;    /* 12px */
  --text-sm: 0.875rem;   /* 14px */
  --text-base: 1rem;     /* 16px */
  --text-lg: 1.125rem;   /* 18px */
  --text-xl: 1.25rem;    /* 20px */
  --text-2xl: 1.5rem;    /* 24px */
}
```

#### Usage

| Element | Font | Size | Weight |
|---------|------|------|--------|
| Body text | System | base | 400 |
| Headings | System | lg-2xl | 600 |
| Code inline | Hack | sm | 400 |
| Code blocks | Hack | sm | 400 |
| UI labels | System | sm | 500 |
| Badges | System | xs | 500 |

### Font Installation

Include Hack font via npm:

```bash
pnpm add @fontsource/hack
```

```typescript
// src/renderer/main.tsx
import '@fontsource/hack/400.css';
import '@fontsource/hack/700.css';
```

---

## Monaco Editor Configuration

### Theme Definition

```typescript
// src/renderer/lib/monaco-solarized.ts
import * as monaco from 'monaco-editor';

export const solarizedLight: monaco.editor.IStandaloneThemeData = {
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
  ],
  colors: {
    'editor.background': '#fdf6e3',
    'editor.foreground': '#657b83',
    'editor.lineHighlightBackground': '#eee8d5',
    'editor.selectionBackground': '#eee8d5',
    'editorCursor.foreground': '#657b83',
    'editorLineNumber.foreground': '#93a1a1',
  }
};

export const solarizedDark: monaco.editor.IStandaloneThemeData = {
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
  ],
  colors: {
    'editor.background': '#002b36',
    'editor.foreground': '#839496',
    'editor.lineHighlightBackground': '#073642',
    'editor.selectionBackground': '#073642',
    'editorCursor.foreground': '#839496',
    'editorLineNumber.foreground': '#586e75',
  }
};
```

### Editor Setup

```typescript
// src/renderer/components/Editor.tsx
import Editor from '@monaco-editor/react';
import { useTheme } from '../hooks/useTheme';
import { solarizedLight, solarizedDark } from '../lib/monaco-solarized';

export function CodeEditor({ value, language, onChange }) {
  const { theme } = useTheme();

  const handleEditorMount = (editor, monaco) => {
    monaco.editor.defineTheme('solarized-light', solarizedLight);
    monaco.editor.defineTheme('solarized-dark', solarizedDark);
  };

  return (
    <Editor
      height="100%"
      language={language}
      value={value}
      onChange={onChange}
      theme={theme === 'dark' ? 'solarized-dark' : 'solarized-light'}
      onMount={handleEditorMount}
      options={{
        fontFamily: 'Hack, monospace',
        fontSize: 14,
        lineHeight: 1.6,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        wordWrap: 'on',
      }}
    />
  );
}
```

---

## shadcn/ui Component Mapping

### Required Components

```bash
# Install shadcn/ui components
pnpm dlx shadcn@latest add button card dialog input select
pnpm dlx shadcn@latest add textarea tabs toggle-group badge
pnpm dlx shadcn@latest add sidebar table scroll-area collapsible
pnpm dlx shadcn@latest add radio-group separator alert
pnpm dlx shadcn@latest add dropdown-menu tooltip
```

### Component Customization

Override default shadcn/ui styles in `globals.css`:

```css
/* Override shadcn defaults with Solarized */
@layer base {
  :root {
    --radius: 0.375rem; /* Slightly less rounded for retro feel */
  }
}

/* Retro-clean button style */
.button {
  font-weight: 500;
  letter-spacing: 0.025em;
}

/* Terminal-style tabs */
[data-slot="tabs-list"] {
  background: var(--background-secondary);
  border-radius: 0;
  border-bottom: 1px solid var(--border);
}
```

---

## Top Bar Specification

Terminal-inspired top bar with browser tabs.

### Layout

```
┌─────────────────────────────────────────────────────────────┐
│ 🐝 │ [Tab 1 ×] [Tab 2 ×] [+] │              │ [⚙] [📊] │ │
│    │                         │              │          │ │
│    │         Tabs            │   Spacer     │  Actions │ │
│    │                         │              │          │ │
│ ●●●│                         │              │          │ │
└─────────────────────────────────────────────────────────────┘
  ↑                                                       ↑
Traffic lights                                      Window controls
(macOS native)                                     (Settings, Analytics)
```

### Implementation

```tsx
// src/renderer/components/layout/TopBar.tsx
import { Plus, Settings, BarChart3, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Tab {
  id: string;
  title: string;
  projectPath?: string;
}

export function TopBar({ tabs, activeTab, onTabChange, onNewTab, onCloseTab }) {
  return (
    <div className="h-12 flex items-center bg-sidebar border-b border-border draggable">
      {/* Spacer for traffic lights on macOS */}
      <div className="w-20 flex-shrink-0" />

      {/* Tabs */}
      <div className="flex-1 flex items-center gap-1 no-drag overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 text-sm rounded-t",
              "border border-b-0 transition-colors",
              activeTab === tab.id
                ? "bg-background text-foreground border-border"
                : "bg-transparent text-foreground-muted hover:bg-background/50"
            )}
          >
            <span className="truncate max-w-32">{tab.title}</span>
            <button
              onClick={(e) => { e.stopPropagation(); onCloseTab(tab.id); }}
              className="hover:bg-destructive/20 rounded p-0.5"
            >
              <X className="h-3 w-3" />
            </button>
          </button>
        ))}

        <Button variant="ghost" size="icon" onClick={onNewTab} className="h-7 w-7">
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 px-2 no-drag">
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <BarChart3 className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <Settings className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
```

### CSS for Draggable Region

```css
/* Allow window dragging on top bar */
.draggable {
  -webkit-app-region: drag;
}

/* Prevent dragging on interactive elements */
.no-drag {
  -webkit-app-region: no-drag;
}
```

---

## Responsive Behavior

### Sidebar Collapse

| Viewport | Sidebar State | Behavior |
|----------|---------------|----------|
| ≥ 1024px | Expanded default | User can collapse |
| < 1024px | Collapsed default | Slides over content |
| < 640px | Hidden | Opens as sheet/drawer |

### Panel Persistence

Use `react-resizable-panels` with `autoSaveId` for layout persistence:

```tsx
<PanelGroup direction="horizontal" autoSaveId="hive-main-layout">
  <Panel id="sidebar" defaultSize={20} minSize={15} collapsible>
    <Sidebar />
  </Panel>
  <PanelResizeHandle />
  <Panel id="content">
    <MainContent />
  </Panel>
</PanelGroup>
```

---

## Accessibility

### Keyboard Navigation

| Shortcut | Action |
|----------|--------|
| `⌘T` | New tab |
| `⌘W` | Close tab |
| `⌘1-9` | Switch to tab 1-9 |
| `⌘[` | Previous tab |
| `⌘]` | Next tab |
| `⌘\` | Toggle sidebar |
| `⌘,` | Open settings |
| `⌘Enter` | Send message |
| `Escape` | Cancel/close modal |

### Focus Management

- Trap focus within modals
- Return focus on modal close
- Visible focus indicators (ring)
- Skip links for main content areas

### Screen Reader Support

- ARIA labels on all interactive elements
- Live regions for session status updates
- Semantic heading hierarchy

---

## Data Storage

### Location

Default: `~/.hive/`

```
~/.hive/
├── config.json          # App settings
├── sessions.json        # Session metadata
├── layout.json          # Window/panel state
└── projects/            # Project-specific data
    └── [project-hash]/
        └── analytics.json
```

### Session Metadata (electron-store)

```typescript
interface HiveStore {
  sessions: Array<{
    id: string;
    name: string;
    directory: string;
    type: 'research' | 'plan' | 'implement' | 'normal';
    model: string;
    createdAt: number;
    lastMessageAt: number;
    status: 'idle' | 'running' | 'awaiting_input' | 'error';
    messageCount: number;
    totalCost: number;
  }>;
  projects: Array<{
    path: string;
    name: string;
    addedAt: number;
  }>;
  settings: {
    theme: 'light' | 'dark' | 'system';
    storagePath: string;
    authMethod: 'claude-cli' | 'api-key' | 'bedrock' | 'vertex';
    apiKey?: string;
  };
  layout: {
    sidebarWidth: number;
    sidebarCollapsed: boolean;
    windowBounds: { x: number; y: number; width: number; height: number };
  };
}
```

---

## External Resources

**Design References:**
- [Solarized Color Scheme](https://ethanschoonover.com/solarized/) - Official color values
- [shadcn/ui Documentation](https://ui.shadcn.com/) - Component library
- [ccusage](https://github.com/ryoppippi/ccusage) - Analytics inspiration

**Fonts:**
- [Hack Font](https://sourcefoundry.org/hack/) - Monospace font for code
- [@fontsource/hack](https://www.npmjs.com/package/@fontsource/hack) - npm package

**Libraries:**
- [Monaco Editor](https://microsoft.github.io/monaco-editor/) - Code editor
- [@monaco-editor/react](https://www.npmjs.com/package/@monaco-editor/react) - React wrapper
- [react-resizable-panels](https://github.com/bvaughn/react-resizable-panels) - Split panes
- [lucide-react](https://lucide.dev/) - Icons

---

## Implementation Notes

### Decisions Made

1. **Default theme**: Light mode (Solarized Light)
2. **Tab behavior**: Browser-style (close button on each tab)
3. **Sidebar position**: Left (standard convention)
4. **Session sub-tabs**: Horizontal tabs within main panel
5. **Tray behavior**: Close minimizes to tray, quit requires menu

### Deferred Features

1. **Google Docs-like commenting** in Thoughts view - documented in earlier research, implement later
2. **Remote access / device linking** - requires further research on localtunnel integration
3. **Session forking UI** - SDK supports it, UI design needed

## Related Research

- [2025-12-15-hive-electron-app-research.md](./2025-12-15-hive-electron-app-research.md) - Electron architecture
- [2025-12-15-hive-claude-sdk-integration.md](./2025-12-15-hive-claude-sdk-integration.md) - Claude SDK patterns
- [2025-12-14-hive-macos-app-research.md](./2025-12-14-hive-macos-app-research.md) - Original Tauri research (superseded)
