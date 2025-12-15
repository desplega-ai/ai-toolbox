# Hive Initial Setup Implementation Plan

## Overview

Set up the foundational Hive macOS desktop application using Tauri 2.0 with React, and implement the first core features: project dashboard, single Claude session view, and basic thoughts panel.

## Current State Analysis

- No existing Tauri/desktop projects in the ai-toolbox repository
- Comprehensive research completed covering:
  - Claude Agent SDK capabilities and session lifecycle
  - Tauri 2.0 window management patterns
  - Markdown comment parsing strategies
- Reference implementation available: Opcode (Claudia) at https://github.com/getAsterisk/claudia
- Repository uses a "folder-per-project" structure with each project self-contained

### Key Discoveries:
- `willitfront.page/` demonstrates the React + TypeScript + Tailwind pattern used in this repo
- Claude Agent SDK V1 `query()` is preferred over V2 for session forking support
- Single window with `react-resizable-panels` is recommended over multiple Tauri windows
- Sessions stored as JSONL files in `~/.claude/projects/[encoded-path]/`

## Desired End State

A functional Hive desktop application that can:
1. Start via `pnpm tauri dev` from the `hive/` directory
2. Display a dashboard of Claude Code projects from `~/.claude/projects/`
3. Start a new Claude session in a selected project
4. Show Claude's streaming output in real-time
5. Display a side panel for viewing thoughts/ directory files
6. Persist window state and layout between sessions

### Verification:
- Application window opens on macOS
- Project list populates from `~/.claude/projects/`
- Clicking a project shows session view
- Claude session can be started and streams output
- Thoughts panel shows markdown files from project's `thoughts/` directory
- Closing and reopening preserves window size/position and panel layout

## What We're NOT Doing

- Multiple windows / pop-out functionality (future enhancement)
- Hive comment system (Phase 2+ feature)
- Notification hooks (Phase 2+ feature)
- Plugin auto-installation (Phase 2+ feature)
- Remote access / web UI (future consideration)
- Session forking UI (future enhancement)
- Named workspaces / layout presets

## Implementation Approach

Progressive enhancement with each phase building on the previous:
1. Scaffold Tauri + React project with essential plugins
2. Build project dashboard with mock data
3. Integrate Claude Agent SDK for real sessions
4. Add thoughts panel with file watching
5. Implement layout persistence

---

## Phase 1: Project Scaffolding

### Overview
Create the Tauri 2.0 project structure with React, TypeScript, Tailwind CSS, and essential Tauri plugins.

### Changes Required:

#### 1. Initialize Tauri Project
**Directory**: `hive/`
**Commands**:
```bash
cd /Users/taras/Documents/code/ai-toolbox
pnpm create tauri-app hive --template react-ts --manager pnpm
cd hive
```

#### 2. Install Core Dependencies
**File**: `hive/package.json`
**Commands**:
```bash
cd /Users/taras/Documents/code/ai-toolbox/hive
pnpm add react-resizable-panels @tauri-apps/plugin-fs @tauri-apps/plugin-store
pnpm add -D tailwindcss postcss autoprefixer
pnpm exec tailwindcss init -p
```

#### 3. Configure Tailwind
**File**: `hive/tailwind.config.js`
```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
```

**File**: `hive/src/index.css`
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

#### 4. Add Tauri Rust Plugins
**File**: `hive/src-tauri/Cargo.toml`
Add to `[dependencies]`:
```toml
tauri-plugin-fs = "2"
tauri-plugin-store = "2"
tauri-plugin-window-state = "2"
```

**File**: `hive/src-tauri/src/lib.rs`
```rust
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

#### 5. Configure Tauri Capabilities
**File**: `hive/src-tauri/capabilities/default.json`
```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Capability for the main window",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "fs:default",
    "fs:allow-read-dir",
    "fs:allow-read-file",
    "fs:allow-exists",
    "store:default",
    "window-state:default"
  ]
}
```

#### 6. Create README
**File**: `hive/README.md`
```markdown
# Hive

macOS desktop app for managing Claude Code sessions across projects.

## Development

```bash
pnpm install
pnpm tauri dev
```

## Build

```bash
pnpm tauri build
```

## Tech Stack

- Tauri 2.0 (Rust backend)
- React 18 + TypeScript
- Tailwind CSS
- react-resizable-panels
```

### Success Criteria:

#### Automated Verification:
- [x] `cd hive && pnpm install` completes without errors
- [x] `cd hive && pnpm tauri dev` launches the application window
- [x] No TypeScript errors: `cd hive && pnpm tsc --noEmit`
- [x] Tailwind compiles: styles visible in dev mode

#### Manual Verification:
- [x] Application window opens on macOS
- [x] Window shows default React content
- [x] Window state persists across restarts (position, size)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Project Dashboard UI

### Overview
Build the main layout with sidebar project list, session area, and thoughts panel using react-resizable-panels.

### Changes Required:

#### 1. Project Directory Structure
Create the following structure in `hive/src/`:
```
src/
├── components/
│   ├── layout/
│   │   ├── HiveLayout.tsx
│   │   └── PanelResizeHandle.tsx
│   ├── sidebar/
│   │   ├── Sidebar.tsx
│   │   └── ProjectList.tsx
│   ├── session/
│   │   └── SessionPane.tsx
│   └── thoughts/
│       └── ThoughtsPane.tsx
├── hooks/
│   └── useProjects.ts
├── lib/
│   ├── claude-projects.ts
│   └── types.ts
├── App.tsx
├── main.tsx
└── index.css
```

#### 2. Type Definitions
**File**: `hive/src/lib/types.ts`
```typescript
export interface ClaudeProject {
  path: string
  name: string
  encodedPath: string
  lastAccessed?: Date
  sessionCount: number
}

export interface ClaudeSession {
  id: string
  projectPath: string
  createdAt: Date
  lastMessage?: string
}
```

#### 3. Project Discovery Service
**File**: `hive/src/lib/claude-projects.ts`
```typescript
import { readDir, exists, BaseDirectory } from '@tauri-apps/plugin-fs'
import { homeDir } from '@tauri-apps/api/path'
import type { ClaudeProject } from './types'

export async function discoverProjects(): Promise<ClaudeProject[]> {
  const home = await homeDir()
  const claudeProjectsPath = `${home}.claude/projects`

  const pathExists = await exists(claudeProjectsPath)
  if (!pathExists) {
    return []
  }

  const entries = await readDir(claudeProjectsPath)
  const projects: ClaudeProject[] = []

  for (const entry of entries) {
    if (entry.isDirectory && entry.name) {
      // Decode the path (replace - with /)
      const decodedPath = entry.name.replace(/^-/, '/').replace(/-/g, '/')

      // Count session files
      const projectDir = `${claudeProjectsPath}/${entry.name}`
      const files = await readDir(projectDir)
      const sessionCount = files.filter(f => f.name?.endsWith('.jsonl')).length

      projects.push({
        path: decodedPath,
        name: decodedPath.split('/').pop() || entry.name,
        encodedPath: entry.name,
        sessionCount
      })
    }
  }

  return projects.sort((a, b) => a.name.localeCompare(b.name))
}
```

#### 4. Main Layout Component
**File**: `hive/src/components/layout/HiveLayout.tsx`
```typescript
import { Panel, PanelGroup } from 'react-resizable-panels'
import { PanelResizeHandle } from './PanelResizeHandle'
import { Sidebar } from '../sidebar/Sidebar'
import { SessionPane } from '../session/SessionPane'
import { ThoughtsPane } from '../thoughts/ThoughtsPane'
import { useState } from 'react'
import type { ClaudeProject } from '../../lib/types'

export function HiveLayout() {
  const [selectedProject, setSelectedProject] = useState<ClaudeProject | null>(null)

  return (
    <div className="h-screen w-screen bg-gray-900 text-gray-100">
      <PanelGroup direction="horizontal" autoSaveId="hive-main">
        <Panel id="sidebar" order={1} defaultSize={20} minSize={15} maxSize={35}>
          <Sidebar
            selectedProject={selectedProject}
            onSelectProject={setSelectedProject}
          />
        </Panel>

        <PanelResizeHandle />

        <Panel id="content" order={2}>
          <PanelGroup direction="vertical" autoSaveId="hive-content">
            <Panel id="session" order={1} defaultSize={70} minSize={30}>
              <SessionPane project={selectedProject} />
            </Panel>

            <PanelResizeHandle horizontal />

            <Panel id="thoughts" order={2} defaultSize={30} minSize={15}>
              <ThoughtsPane project={selectedProject} />
            </Panel>
          </PanelGroup>
        </Panel>
      </PanelGroup>
    </div>
  )
}
```

#### 5. Panel Resize Handle
**File**: `hive/src/components/layout/PanelResizeHandle.tsx`
```typescript
import { PanelResizeHandle as ResizeHandle } from 'react-resizable-panels'

interface Props {
  horizontal?: boolean
}

export function PanelResizeHandle({ horizontal }: Props) {
  return (
    <ResizeHandle
      className={`
        ${horizontal ? 'h-1' : 'w-1'}
        bg-gray-700 hover:bg-blue-500
        transition-colors duration-150
        flex items-center justify-center
      `}
    >
      <div
        className={`
          ${horizontal ? 'w-8 h-0.5' : 'h-8 w-0.5'}
          bg-gray-500 rounded-full
        `}
      />
    </ResizeHandle>
  )
}
```

#### 6. Sidebar Component
**File**: `hive/src/components/sidebar/Sidebar.tsx`
```typescript
import { ProjectList } from './ProjectList'
import type { ClaudeProject } from '../../lib/types'

interface Props {
  selectedProject: ClaudeProject | null
  onSelectProject: (project: ClaudeProject) => void
}

export function Sidebar({ selectedProject, onSelectProject }: Props) {
  return (
    <div className="h-full flex flex-col bg-gray-800">
      <div className="p-4 border-b border-gray-700">
        <h1 className="text-lg font-semibold">Hive</h1>
      </div>
      <ProjectList
        selectedProject={selectedProject}
        onSelectProject={onSelectProject}
      />
    </div>
  )
}
```

#### 7. Project List Component
**File**: `hive/src/components/sidebar/ProjectList.tsx`
```typescript
import { useEffect, useState } from 'react'
import { discoverProjects } from '../../lib/claude-projects'
import type { ClaudeProject } from '../../lib/types'

interface Props {
  selectedProject: ClaudeProject | null
  onSelectProject: (project: ClaudeProject) => void
}

export function ProjectList({ selectedProject, onSelectProject }: Props) {
  const [projects, setProjects] = useState<ClaudeProject[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    discoverProjects()
      .then(setProjects)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="p-4 text-gray-400">
        Loading projects...
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 text-red-400">
        Error: {error}
      </div>
    )
  }

  if (projects.length === 0) {
    return (
      <div className="p-4 text-gray-400">
        No Claude projects found.
        <p className="text-sm mt-2">
          Run Claude Code in a project directory to create one.
        </p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {projects.map(project => (
        <button
          key={project.encodedPath}
          onClick={() => onSelectProject(project)}
          className={`
            w-full text-left p-3 border-b border-gray-700
            hover:bg-gray-700 transition-colors
            ${selectedProject?.encodedPath === project.encodedPath ? 'bg-gray-700' : ''}
          `}
        >
          <div className="font-medium truncate">{project.name}</div>
          <div className="text-sm text-gray-400 truncate">{project.path}</div>
          <div className="text-xs text-gray-500 mt-1">
            {project.sessionCount} session{project.sessionCount !== 1 ? 's' : ''}
          </div>
        </button>
      ))}
    </div>
  )
}
```

#### 8. Session Pane (Placeholder)
**File**: `hive/src/components/session/SessionPane.tsx`
```typescript
import type { ClaudeProject } from '../../lib/types'

interface Props {
  project: ClaudeProject | null
}

export function SessionPane({ project }: Props) {
  if (!project) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-900 text-gray-400">
        Select a project to start a session
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-gray-900">
      <div className="p-4 border-b border-gray-700">
        <h2 className="font-semibold">{project.name}</h2>
        <p className="text-sm text-gray-400">{project.path}</p>
      </div>
      <div className="flex-1 p-4">
        <p className="text-gray-400">Session view coming in Phase 3...</p>
      </div>
    </div>
  )
}
```

#### 9. Thoughts Pane (Placeholder)
**File**: `hive/src/components/thoughts/ThoughtsPane.tsx`
```typescript
import type { ClaudeProject } from '../../lib/types'

interface Props {
  project: ClaudeProject | null
}

export function ThoughtsPane({ project }: Props) {
  if (!project) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-850 text-gray-400 text-sm">
        Thoughts panel
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-gray-850">
      <div className="p-3 border-b border-gray-700 text-sm font-medium">
        Thoughts
      </div>
      <div className="flex-1 p-3 text-sm text-gray-400">
        File browser coming in Phase 4...
      </div>
    </div>
  )
}
```

#### 10. Update App.tsx
**File**: `hive/src/App.tsx`
```typescript
import { HiveLayout } from './components/layout/HiveLayout'

function App() {
  return <HiveLayout />
}

export default App
```

### Success Criteria:

#### Automated Verification:
- [x] `cd hive && pnpm tsc --noEmit` - no TypeScript errors
- [x] `cd hive && pnpm tauri dev` - application launches

#### Manual Verification:
- [x] Sidebar shows list of Claude projects from `~/.claude/projects/`
- [ ] Clicking a project highlights it and updates the session pane header (skipped - no projects available)
- [x] Panel resize handles work (drag to resize)
- [x] Panel sizes persist when restarting the app
- [x] Empty state shows when no projects exist

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Claude Agent SDK Integration

### Overview
Integrate the Claude Agent SDK to start real Claude sessions and stream output.

### Changes Required:

#### 1. Install Claude Agent SDK
**Commands**:
```bash
cd /Users/taras/Documents/code/ai-toolbox/hive
pnpm add @anthropic-ai/claude-agent-sdk
```

#### 2. Claude Session Service
**File**: `hive/src/lib/claude-session.ts`
```typescript
import { query } from '@anthropic-ai/claude-agent-sdk'
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk'

export interface SessionState {
  sessionId: string | null
  messages: SDKMessage[]
  isRunning: boolean
  error: string | null
}

export interface StreamCallbacks {
  onMessage: (message: SDKMessage) => void
  onSessionId: (id: string) => void
  onError: (error: Error) => void
  onComplete: () => void
}

export async function startSession(
  projectPath: string,
  prompt: string,
  callbacks: StreamCallbacks
): Promise<void> {
  try {
    const response = query({
      prompt,
      options: {
        cwd: projectPath,
        model: 'claude-sonnet-4-5-20250514',
        permissionMode: 'default'
      }
    })

    for await (const message of response) {
      // Capture session ID from init message
      if (message.type === 'system' && message.subtype === 'init') {
        callbacks.onSessionId(message.session_id)
      }

      callbacks.onMessage(message)
    }

    callbacks.onComplete()
  } catch (error) {
    callbacks.onError(error instanceof Error ? error : new Error(String(error)))
  }
}

export async function resumeSession(
  sessionId: string,
  prompt: string,
  callbacks: StreamCallbacks
): Promise<void> {
  try {
    const response = query({
      prompt,
      options: {
        resume: sessionId,
        model: 'claude-sonnet-4-5-20250514',
        permissionMode: 'default'
      }
    })

    for await (const message of response) {
      if (message.type === 'system' && message.subtype === 'init') {
        callbacks.onSessionId(message.session_id)
      }

      callbacks.onMessage(message)
    }

    callbacks.onComplete()
  } catch (error) {
    callbacks.onError(error instanceof Error ? error : new Error(String(error)))
  }
}
```

#### 3. Session Hook
**File**: `hive/src/hooks/useSession.ts`
```typescript
import { useState, useCallback } from 'react'
import { startSession, resumeSession, type SessionState } from '../lib/claude-session'
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk'

export function useSession(projectPath: string | null) {
  const [state, setState] = useState<SessionState>({
    sessionId: null,
    messages: [],
    isRunning: false,
    error: null
  })

  const sendMessage = useCallback(async (prompt: string) => {
    if (!projectPath) return

    setState(prev => ({
      ...prev,
      isRunning: true,
      error: null
    }))

    const callbacks = {
      onMessage: (message: SDKMessage) => {
        setState(prev => ({
          ...prev,
          messages: [...prev.messages, message]
        }))
      },
      onSessionId: (id: string) => {
        setState(prev => ({
          ...prev,
          sessionId: id
        }))
      },
      onError: (error: Error) => {
        setState(prev => ({
          ...prev,
          isRunning: false,
          error: error.message
        }))
      },
      onComplete: () => {
        setState(prev => ({
          ...prev,
          isRunning: false
        }))
      }
    }

    if (state.sessionId) {
      await resumeSession(state.sessionId, prompt, callbacks)
    } else {
      await startSession(projectPath, prompt, callbacks)
    }
  }, [projectPath, state.sessionId])

  const clearSession = useCallback(() => {
    setState({
      sessionId: null,
      messages: [],
      isRunning: false,
      error: null
    })
  }, [])

  return {
    ...state,
    sendMessage,
    clearSession
  }
}
```

#### 4. Message Display Component
**File**: `hive/src/components/session/MessageList.tsx`
```typescript
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk'

interface Props {
  messages: SDKMessage[]
}

export function MessageList({ messages }: Props) {
  return (
    <div className="space-y-4">
      {messages.map((message, index) => (
        <MessageItem key={index} message={message} />
      ))}
    </div>
  )
}

function MessageItem({ message }: { message: SDKMessage }) {
  if (message.type === 'system') {
    return (
      <div className="text-xs text-gray-500 py-1">
        {message.subtype === 'init' ? `Session started: ${message.session_id}` : message.subtype}
      </div>
    )
  }

  if (message.type === 'user') {
    return (
      <div className="bg-blue-900/30 rounded-lg p-3">
        <div className="text-xs text-blue-400 mb-1">You</div>
        <div className="text-gray-100">
          {typeof message.message.content === 'string'
            ? message.message.content
            : JSON.stringify(message.message.content)}
        </div>
      </div>
    )
  }

  if (message.type === 'assistant') {
    const textContent = message.message.content
      .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
      .map(block => block.text)
      .join('\n')

    const toolUses = message.message.content.filter(block => block.type === 'tool_use')

    return (
      <div className="bg-gray-800 rounded-lg p-3">
        <div className="text-xs text-green-400 mb-1">Claude</div>
        {textContent && (
          <div className="text-gray-100 whitespace-pre-wrap">{textContent}</div>
        )}
        {toolUses.length > 0 && (
          <div className="mt-2 text-xs text-gray-400">
            Tools: {toolUses.map((t: any) => t.name).join(', ')}
          </div>
        )}
      </div>
    )
  }

  if (message.type === 'result') {
    return (
      <div className="text-xs text-gray-500 py-1 border-t border-gray-700 mt-2 pt-2">
        Completed in {(message.duration_ms / 1000).toFixed(1)}s
        {message.total_cost_usd > 0 && ` • $${message.total_cost_usd.toFixed(4)}`}
      </div>
    )
  }

  return null
}
```

#### 5. Input Component
**File**: `hive/src/components/session/MessageInput.tsx`
```typescript
import { useState, useCallback, KeyboardEvent } from 'react'

interface Props {
  onSend: (message: string) => void
  disabled?: boolean
  placeholder?: string
}

export function MessageInput({ onSend, disabled, placeholder }: Props) {
  const [value, setValue] = useState('')

  const handleSend = useCallback(() => {
    const trimmed = value.trim()
    if (trimmed && !disabled) {
      onSend(trimmed)
      setValue('')
    }
  }, [value, disabled, onSend])

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  return (
    <div className="flex gap-2">
      <textarea
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder={placeholder || 'Send a message...'}
        className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 placeholder-gray-500 resize-none focus:outline-none focus:border-blue-500"
        rows={2}
      />
      <button
        onClick={handleSend}
        disabled={disabled || !value.trim()}
        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Send
      </button>
    </div>
  )
}
```

#### 6. Update Session Pane
**File**: `hive/src/components/session/SessionPane.tsx`
```typescript
import { useEffect, useRef } from 'react'
import { useSession } from '../../hooks/useSession'
import { MessageList } from './MessageList'
import { MessageInput } from './MessageInput'
import type { ClaudeProject } from '../../lib/types'

interface Props {
  project: ClaudeProject | null
}

export function SessionPane({ project }: Props) {
  const { sessionId, messages, isRunning, error, sendMessage, clearSession } = useSession(project?.path || null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Clear session when project changes
  useEffect(() => {
    clearSession()
  }, [project?.path, clearSession])

  if (!project) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-900 text-gray-400">
        Select a project to start a session
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-gray-900">
      <div className="p-4 border-b border-gray-700 flex items-center justify-between">
        <div>
          <h2 className="font-semibold">{project.name}</h2>
          <p className="text-sm text-gray-400">{project.path}</p>
        </div>
        {sessionId && (
          <div className="text-xs text-gray-500">
            Session: {sessionId.slice(0, 8)}...
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <div className="text-gray-400 text-center mt-8">
            Start a conversation with Claude
          </div>
        ) : (
          <>
            <MessageList messages={messages} />
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {error && (
        <div className="px-4 py-2 bg-red-900/30 text-red-400 text-sm">
          Error: {error}
        </div>
      )}

      <div className="p-4 border-t border-gray-700">
        <MessageInput
          onSend={sendMessage}
          disabled={isRunning}
          placeholder={isRunning ? 'Claude is thinking...' : 'Send a message...'}
        />
      </div>
    </div>
  )
}
```

### Success Criteria:

#### Automated Verification:
- [x] `cd hive && pnpm tsc --noEmit` - no TypeScript errors
- [x] `cd hive && pnpm tauri dev` - application launches

#### Manual Verification:
- [ ] Can type a message and send it
- [ ] Claude's response streams in real-time
- [ ] Session ID is captured and displayed
- [ ] Conversation continues with context (session resume works)
- [ ] Error states display properly (e.g., if API key missing)
- [ ] Messages auto-scroll to bottom

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Thoughts Panel Implementation

### Overview
Implement the thoughts panel with file browser and markdown viewer for the project's `thoughts/` directory.

### Changes Required:

#### 1. Thoughts File Service
**File**: `hive/src/lib/thoughts-files.ts`
```typescript
import { readDir, readTextFile, watchImmediate } from '@tauri-apps/plugin-fs'
import { join } from '@tauri-apps/api/path'

export interface ThoughtsFile {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: ThoughtsFile[]
}

export async function listThoughtsFiles(projectPath: string): Promise<ThoughtsFile[]> {
  const thoughtsPath = await join(projectPath, 'thoughts', 'shared')

  try {
    return await listDirectory(thoughtsPath)
  } catch {
    // thoughts/shared doesn't exist
    return []
  }
}

async function listDirectory(path: string): Promise<ThoughtsFile[]> {
  const entries = await readDir(path)
  const files: ThoughtsFile[] = []

  for (const entry of entries) {
    if (!entry.name || entry.name.startsWith('.')) continue

    const entryPath = await join(path, entry.name)

    if (entry.isDirectory) {
      const children = await listDirectory(entryPath)
      files.push({
        name: entry.name,
        path: entryPath,
        type: 'directory',
        children
      })
    } else if (entry.name.endsWith('.md')) {
      files.push({
        name: entry.name,
        path: entryPath,
        type: 'file'
      })
    }
  }

  return files.sort((a, b) => {
    // Directories first, then alphabetical
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}

export async function readThoughtsFile(path: string): Promise<string> {
  return await readTextFile(path)
}

export async function watchThoughtsDirectory(
  projectPath: string,
  callback: () => void
): Promise<() => void> {
  const thoughtsPath = await join(projectPath, 'thoughts')

  try {
    return await watchImmediate(thoughtsPath, callback, { recursive: true })
  } catch {
    // Directory doesn't exist, return no-op
    return () => {}
  }
}
```

#### 2. File Tree Component
**File**: `hive/src/components/thoughts/FileTree.tsx`
```typescript
import { useState } from 'react'
import type { ThoughtsFile } from '../../lib/thoughts-files'

interface Props {
  files: ThoughtsFile[]
  selectedPath: string | null
  onSelect: (file: ThoughtsFile) => void
}

export function FileTree({ files, selectedPath, onSelect }: Props) {
  return (
    <div className="text-sm">
      {files.map(file => (
        <FileTreeItem
          key={file.path}
          file={file}
          selectedPath={selectedPath}
          onSelect={onSelect}
          depth={0}
        />
      ))}
    </div>
  )
}

interface ItemProps {
  file: ThoughtsFile
  selectedPath: string | null
  onSelect: (file: ThoughtsFile) => void
  depth: number
}

function FileTreeItem({ file, selectedPath, onSelect, depth }: ItemProps) {
  const [expanded, setExpanded] = useState(true)

  if (file.type === 'directory') {
    return (
      <div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full text-left px-2 py-1 hover:bg-gray-700 flex items-center gap-1"
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          <span className="text-gray-500">{expanded ? '▼' : '▶'}</span>
          <span className="text-gray-300">{file.name}</span>
        </button>
        {expanded && file.children && (
          <div>
            {file.children.map(child => (
              <FileTreeItem
                key={child.path}
                file={child}
                selectedPath={selectedPath}
                onSelect={onSelect}
                depth={depth + 1}
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <button
      onClick={() => onSelect(file)}
      className={`
        w-full text-left px-2 py-1 hover:bg-gray-700
        ${selectedPath === file.path ? 'bg-gray-700 text-blue-400' : 'text-gray-300'}
      `}
      style={{ paddingLeft: `${depth * 12 + 20}px` }}
    >
      {file.name}
    </button>
  )
}
```

#### 3. Markdown Viewer Component
**File**: `hive/src/components/thoughts/MarkdownViewer.tsx`
```typescript
interface Props {
  content: string
  fileName: string
}

export function MarkdownViewer({ content, fileName }: Props) {
  // Simple markdown rendering - can enhance with a library later
  return (
    <div className="h-full flex flex-col">
      <div className="px-3 py-2 border-b border-gray-700 text-sm font-medium text-gray-300">
        {fileName}
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        <pre className="text-sm text-gray-300 whitespace-pre-wrap font-mono">
          {content}
        </pre>
      </div>
    </div>
  )
}
```

#### 4. Update Thoughts Pane
**File**: `hive/src/components/thoughts/ThoughtsPane.tsx`
```typescript
import { useEffect, useState, useCallback } from 'react'
import { listThoughtsFiles, readThoughtsFile, watchThoughtsDirectory, type ThoughtsFile } from '../../lib/thoughts-files'
import { FileTree } from './FileTree'
import { MarkdownViewer } from './MarkdownViewer'
import type { ClaudeProject } from '../../lib/types'

interface Props {
  project: ClaudeProject | null
}

export function ThoughtsPane({ project }: Props) {
  const [files, setFiles] = useState<ThoughtsFile[]>([])
  const [selectedFile, setSelectedFile] = useState<ThoughtsFile | null>(null)
  const [content, setContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Load file tree
  const loadFiles = useCallback(async () => {
    if (!project) {
      setFiles([])
      return
    }

    try {
      const thoughtsFiles = await listThoughtsFiles(project.path)
      setFiles(thoughtsFiles)
    } catch (err) {
      console.error('Failed to load thoughts files:', err)
      setFiles([])
    }
  }, [project])

  // Load files on project change
  useEffect(() => {
    setSelectedFile(null)
    setContent(null)
    loadFiles()
  }, [project, loadFiles])

  // Watch for file changes
  useEffect(() => {
    if (!project) return

    let cleanup: (() => void) | undefined

    watchThoughtsDirectory(project.path, loadFiles)
      .then(unwatch => { cleanup = unwatch })

    return () => cleanup?.()
  }, [project, loadFiles])

  // Load selected file content
  useEffect(() => {
    if (!selectedFile || selectedFile.type !== 'file') {
      setContent(null)
      return
    }

    setLoading(true)
    readThoughtsFile(selectedFile.path)
      .then(setContent)
      .catch(err => {
        console.error('Failed to read file:', err)
        setContent(null)
      })
      .finally(() => setLoading(false))
  }, [selectedFile])

  if (!project) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-850 text-gray-500 text-sm">
        Select a project to view thoughts
      </div>
    )
  }

  if (files.length === 0) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-850 text-gray-500 text-sm">
        No thoughts/ directory found
      </div>
    )
  }

  return (
    <div className="h-full flex bg-gray-850">
      <div className="w-48 border-r border-gray-700 overflow-y-auto">
        <div className="px-3 py-2 border-b border-gray-700 text-sm font-medium text-gray-400">
          Thoughts
        </div>
        <FileTree
          files={files}
          selectedPath={selectedFile?.path || null}
          onSelect={setSelectedFile}
        />
      </div>

      <div className="flex-1">
        {loading ? (
          <div className="h-full flex items-center justify-center text-gray-500">
            Loading...
          </div>
        ) : content ? (
          <MarkdownViewer
            content={content}
            fileName={selectedFile?.name || ''}
          />
        ) : (
          <div className="h-full flex items-center justify-center text-gray-500 text-sm">
            Select a file to view
          </div>
        )}
      </div>
    </div>
  )
}
```

### Success Criteria:

#### Automated Verification:
- [x] `cd hive && pnpm tsc --noEmit` - no TypeScript errors
- [x] `cd hive && pnpm tauri dev` - application launches

#### Manual Verification:
- [x] Thoughts panel shows file tree for projects with `thoughts/shared/` directory
- [x] Clicking a file displays its content
- [x] File tree expands/collapses directories
- [x] Empty state shows when no thoughts directory exists
- [ ] File changes detected and tree refreshes automatically

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 5: Polish and Persistence

### Overview
Add finishing touches: custom Tailwind colors, keyboard shortcuts for panel navigation, and ensure all state persists correctly.

### Changes Required:

#### 1. Extended Tailwind Configuration
**File**: `hive/tailwind.config.js`
```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        gray: {
          850: '#1a1d23',
          950: '#0d0f12',
        }
      }
    },
  },
  plugins: [],
}
```

#### 2. Keyboard Navigation Hook
**File**: `hive/src/hooks/useKeyboardNavigation.ts`
```typescript
import { useEffect, useCallback, useState } from 'react'

type Pane = 'sidebar' | 'session' | 'thoughts'

export function useKeyboardNavigation() {
  const [focusedPane, setFocusedPane] = useState<Pane>('session')

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Ctrl+1/2/3 to focus panes
    if (e.ctrlKey || e.metaKey) {
      switch (e.key) {
        case '1':
          e.preventDefault()
          setFocusedPane('sidebar')
          break
        case '2':
          e.preventDefault()
          setFocusedPane('session')
          break
        case '3':
          e.preventDefault()
          setFocusedPane('thoughts')
          break
      }
    }
  }, [])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  return { focusedPane, setFocusedPane }
}
```

#### 3. Update Layout with Focus Indicators
**File**: `hive/src/components/layout/HiveLayout.tsx`
Update to include focus indicators:
```typescript
import { Panel, PanelGroup } from 'react-resizable-panels'
import { PanelResizeHandle } from './PanelResizeHandle'
import { Sidebar } from '../sidebar/Sidebar'
import { SessionPane } from '../session/SessionPane'
import { ThoughtsPane } from '../thoughts/ThoughtsPane'
import { useState } from 'react'
import { useKeyboardNavigation } from '../../hooks/useKeyboardNavigation'
import type { ClaudeProject } from '../../lib/types'

export function HiveLayout() {
  const [selectedProject, setSelectedProject] = useState<ClaudeProject | null>(null)
  const { focusedPane } = useKeyboardNavigation()

  const focusRing = (pane: string) =>
    focusedPane === pane ? 'ring-1 ring-blue-500 ring-inset' : ''

  return (
    <div className="h-screen w-screen bg-gray-950 text-gray-100">
      <PanelGroup direction="horizontal" autoSaveId="hive-main">
        <Panel id="sidebar" order={1} defaultSize={20} minSize={15} maxSize={35}>
          <div className={`h-full ${focusRing('sidebar')}`}>
            <Sidebar
              selectedProject={selectedProject}
              onSelectProject={setSelectedProject}
            />
          </div>
        </Panel>

        <PanelResizeHandle />

        <Panel id="content" order={2}>
          <PanelGroup direction="vertical" autoSaveId="hive-content">
            <Panel id="session" order={1} defaultSize={70} minSize={30}>
              <div className={`h-full ${focusRing('session')}`}>
                <SessionPane project={selectedProject} />
              </div>
            </Panel>

            <PanelResizeHandle horizontal />

            <Panel id="thoughts" order={2} defaultSize={30} minSize={15}>
              <div className={`h-full ${focusRing('thoughts')}`}>
                <ThoughtsPane project={selectedProject} />
              </div>
            </Panel>
          </PanelGroup>
        </Panel>
      </PanelGroup>
    </div>
  )
}
```

#### 4. Layout Store with Tauri Plugin
**File**: `hive/src/lib/layout-store.ts`
```typescript
import { Store } from '@tauri-apps/plugin-store'

interface LayoutState {
  lastProjectPath: string | null
}

let store: Store | null = null

async function getStore(): Promise<Store> {
  if (!store) {
    store = await Store.load('hive-state.json', { autoSave: true })
  }
  return store
}

export async function saveLastProject(path: string | null): Promise<void> {
  const s = await getStore()
  await s.set('lastProjectPath', path)
}

export async function loadLastProject(): Promise<string | null> {
  const s = await getStore()
  return await s.get<string>('lastProjectPath') || null
}
```

#### 5. Restore Last Project on Launch
**File**: `hive/src/App.tsx`
```typescript
import { useEffect, useState } from 'react'
import { HiveLayout } from './components/layout/HiveLayout'
import { loadLastProject } from './lib/layout-store'

function App() {
  const [ready, setReady] = useState(false)
  const [initialProject, setInitialProject] = useState<string | null>(null)

  useEffect(() => {
    loadLastProject()
      .then(setInitialProject)
      .finally(() => setReady(true))
  }, [])

  if (!ready) {
    return (
      <div className="h-screen w-screen bg-gray-950 flex items-center justify-center text-gray-400">
        Loading...
      </div>
    )
  }

  return <HiveLayout initialProjectPath={initialProject} />
}

export default App
```

Update HiveLayout to accept and use initialProjectPath.

### Success Criteria:

#### Automated Verification:
- [x] `cd hive && pnpm tsc --noEmit` - no TypeScript errors
- [x] `cd hive && pnpm tauri dev` - application launches

#### Manual Verification:
- [ ] Cmd+[ and Cmd+] cycles focus between panes (visible ring indicator) - skipped
- [x] Last selected project is restored on app restart
- [x] Panel sizes persist between restarts
- [x] Window position and size persist between restarts
- [x] App feels polished with smooth transitions

**Implementation Note**: After completing this phase and all automated verification passes, the initial Hive setup is complete.

---

## Testing Strategy

### Unit Tests:
- Project discovery service: mock fs operations
- Session hook: mock Claude SDK
- File tree component: snapshot tests

### Integration Tests:
- Full flow: select project → start session → receive response
- Thoughts panel: navigate files → view content

### Manual Testing Steps:
1. Launch app with no Claude projects → verify empty state
2. Launch app with projects → verify list populates
3. Select project → start conversation → verify streaming works
4. Open thoughts panel → navigate files → verify content displays
5. Resize panels → restart app → verify sizes persist
6. Close app → reopen → verify last project selected

## Performance Considerations

- Lazy load project list (don't scan sessions until project selected)
- Virtualize message list for long conversations
- Debounce file watcher callbacks
- Use Web Worker for JSONL parsing if needed

## Migration Notes

N/A - this is a new project with no existing data to migrate.

## References

- Main research: `thoughts/shared/research/2025-12-14-hive-macos-app-research.md`
- Session lifecycle: `thoughts/shared/research/2025-12-14-claude-agent-sdk-session-lifecycle.md`
- Window management: `thoughts/shared/research/2025-12-14-tauri-window-management-patterns.md`
- Comment parsing: `thoughts/shared/research/2025-12-14-markdown-comment-parsing-persistence.md`
