# Hive ACP Integration Implementation Plan

## Overview

Replace direct Claude Agent SDK usage with ACP (Agent Client Protocol) client mode. Hive will spawn `claude --acp` as a subprocess and communicate via JSON-RPC instead of importing the SDK directly.

## Current State Analysis

Hive currently uses `@anthropic-ai/claude-agent-sdk` directly in `src/main/session-manager.ts`:
- Calls `query()` function with `canUseTool` callback for permission handling
- Custom permission flow: deny immediately, store pending in SQLite, user approves via UI, session resumes
- SDK messages forwarded to renderer via IPC
- 4 permission modes: default, acceptEdits, plan, bypassPermissions

### Key Discoveries:
- Current session manager at `src/main/session-manager.ts` (776 lines)
- Permission UI at `src/renderer/components/session/ToolGroupBlock.tsx:407-425`
- Message grouping at `src/renderer/lib/message-grouping.ts:33-150`
- IPC handlers at `src/main/ipc-handlers.ts:147-219`
- Database schema supports pending approvals and approved tool calls

## Desired End State

After implementation:
1. `@anthropic-ai/claude-agent-sdk` dependency removed
2. `@agentclientprotocol/sdk` added
3. New `ACPSessionManager` spawns `claude --acp` subprocess
4. Communication via stdio JSON-RPC using `ClientSideConnection`
5. Permission modes simplified to: default, acceptEdits, bypassPermissions
6. UI unchanged - ACP messages converted to existing format

### Verification:
- Start a new session, send a prompt, see streaming response
- Tool requiring approval shows permission UI
- Approve tool, session continues
- "Accept Edits" mode auto-approves Write/Edit tools
- "Bypass All" with timer works and auto-reverts
- Session resume works after app restart
- Subprocess crash handled gracefully

## What We're NOT Doing

- No UI changes to message rendering (convert ACP→SDK format)
- No "plan" permission mode (was Claude-specific)
- No automated tests (manual testing)
- No multi-agent support yet (future enhancement)
- No MCP server integration in this phase

## Implementation Approach

The ACP SDK provides `ClientSideConnection` class that wraps stdio communication. We implement the `Client` interface to handle incoming requests from the agent (permission requests, session updates). The connection handles the JSON-RPC protocol.

Key insight: ACP's `requestPermission` callback is async - we can forward to renderer, wait for user decision, and return the result. This is simpler than the current deny-immediately-then-resume pattern.

---

## Phase 1: Add ACP Infrastructure

### Overview
Install ACP SDK and create type definitions. No functional changes yet.

### Changes Required:

#### 1. Package Dependencies
**File**: `package.json`
**Changes**: Add ACP SDK, remove Claude Agent SDK

```json
// In dependencies, REMOVE:
"@anthropic-ai/claude-agent-sdk": "^0.1.69",

// In dependencies, ADD:
"@agentclientprotocol/sdk": "^0.12.0",
```

Run: `pnpm install`

#### 2. Shared Types
**File**: `src/shared/types.ts`
**Changes**: Simplify permission modes (remove 'plan')

```typescript
// Replace PERMISSION_MODES array (around line 22-34)
export type PermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions';

export const PERMISSION_MODES: { value: PermissionMode; label: string; description: string; requiresConfirmation: boolean }[] = [
  { value: 'default', label: 'Default', description: 'Approval required for tools', requiresConfirmation: false },
  { value: 'acceptEdits', label: 'Accept Edits', description: 'Auto-approve file edits', requiresConfirmation: false },
  { value: 'bypassPermissions', label: 'Bypass All', description: 'No permission prompts', requiresConfirmation: true },
];

export const DEFAULT_PERMISSION_MODE: PermissionMode = 'default';
```

#### 3. ACP Types Bridge
**File**: `src/shared/acp-types.ts` (NEW)
**Changes**: Create type bridge between ACP and existing SDK types

```typescript
// Types to bridge ACP protocol to existing UI types
import type * as acp from '@agentclientprotocol/sdk';

// Re-export commonly used ACP types
export type {
  SessionUpdateNotification,
  RequestPermissionRequest,
  RequestPermissionResponse,
  ToolCall,
  StopReason,
} from '@agentclientprotocol/sdk';

// Permission outcome mapping
export type PermissionOutcome = 'allow' | 'deny' | 'cancelled';

// Tool status from ACP
export type ToolStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';
```

### Success Criteria:

#### Automated Verification:
- [x] `pnpm install` completes without errors
- [x] TypeScript compiles: `pnpm run lint`
- [x] App starts: `pnpm start`

#### Manual Verification:
- [x] Existing functionality still works (using old session-manager)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to the next phase.

---

## Phase 2: Implement ACPSessionManager Core

### Overview
Create the new session manager that spawns and communicates with `claude --acp`.

### Changes Required:

#### 1. ACP Session Manager
**File**: `src/main/acp-session-manager.ts` (NEW)
**Changes**: Full implementation

```typescript
import * as acp from '@agentclientprotocol/sdk';
import { spawn, type ChildProcess } from 'child_process';
import { Readable, Writable } from 'stream';
import { BrowserWindow, Notification, app } from 'electron';
import path from 'path';
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { getAuthEnvironment } from './auth-manager';
import { getPreferences } from './preferences';
import { database } from './database';
import type { Session, PermissionMode } from '../shared/types';
import { DEFAULT_PERMISSION_MODE } from '../shared/types';
import type { SDKMessage, SDKAssistantMessage, SDKUserMessage, SDKResultMessage, SDKInitMessage, PermissionRequest } from '../shared/sdk-types';

// Cache the Claude executable path
let cachedClaudePath: string | null = null;

function findClaudeExecutable(): string {
  if (cachedClaudePath) return cachedClaudePath;

  try {
    const result = execSync('which claude', { encoding: 'utf-8', timeout: 5000 }).trim();
    if (result && existsSync(result)) {
      cachedClaudePath = result;
      return result;
    }
  } catch {
    // Try common locations
  }

  const commonPaths = [
    '/usr/local/bin/claude',
    '/opt/homebrew/bin/claude',
    `${process.env.HOME}/.local/bin/claude`,
    `${process.env.HOME}/.npm-global/bin/claude`,
  ];

  for (const p of commonPaths) {
    if (existsSync(p)) {
      cachedClaudePath = p;
      return p;
    }
  }

  throw new Error('Claude Code CLI not found. Please install it with: npm install -g @anthropic-ai/claude-code');
}

interface ActiveSession {
  process: ChildProcess;
  connection: acp.ClientSideConnection;
  sessionId: string; // ACP session ID
  hiveSessionId: string;
  permissionMode: PermissionMode;
}

// Resolver for pending permission requests
type PermissionResolver = (outcome: acp.RequestPermissionResponse) => void;
const pendingResolvers = new Map<string, PermissionResolver>();

export function resolvePermission(toolCallId: string, outcome: 'allow' | 'deny'): boolean {
  const resolver = pendingResolvers.get(toolCallId);
  if (resolver) {
    resolver({
      outcome: {
        outcome: outcome === 'allow' ? 'selected' : 'rejected',
        optionId: outcome === 'allow' ? 'allow' : 'deny',
      },
    });
    pendingResolvers.delete(toolCallId);
    return true;
  }
  return false;
}

export class ACPSessionManager {
  private activeSessions = new Map<string, ActiveSession>();
  private mainWindow: BrowserWindow;

  constructor(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow;
  }

  private spawnClaudeProcess(cwd: string): ChildProcess {
    const claudePath = findClaudeExecutable();
    const env = getAuthEnvironment();

    return spawn(claudePath, ['--acp'], {
      cwd,
      stdio: ['pipe', 'pipe', 'inherit'],
      env: { ...process.env, ...env },
    });
  }

  private createClient(hiveSessionId: string, permissionMode: PermissionMode): acp.Client {
    const self = this;

    return {
      async requestPermission(params: acp.RequestPermissionRequest): Promise<acp.RequestPermissionResponse> {
        const toolCall = params.toolCall;
        const toolName = toolCall.title || 'Unknown Tool';
        const toolInput = toolCall.rawInput ? JSON.parse(toolCall.rawInput) : {};

        // Check permission mode
        if (permissionMode === 'bypassPermissions') {
          return { outcome: { outcome: 'selected', optionId: 'allow' } };
        }

        // Accept edits mode: auto-approve Write, Edit, NotebookEdit
        if (permissionMode === 'acceptEdits') {
          const editTools = ['Write', 'Edit', 'NotebookEdit'];
          if (editTools.includes(toolName)) {
            return { outcome: { outcome: 'selected', optionId: 'allow' } };
          }
        }

        // Default mode: require approval
        // Store pending and notify renderer
        const pending = database.pendingApprovals.create({
          sessionId: hiveSessionId,
          toolUseId: toolCall.toolCallId,
          toolName,
          toolInput,
          hash: `${toolName}:${toolCall.toolCallId}`,
        });

        database.sessions.updateStatus(hiveSessionId, 'waiting');
        self.sendStatusUpdate(hiveSessionId, 'waiting');

        // Send permission request to renderer
        const request: PermissionRequest = {
          id: pending.id,
          sessionId: hiveSessionId,
          toolUseId: toolCall.toolCallId,
          toolName,
          input: toolInput,
          timestamp: pending.createdAt,
          hash: pending.hash,
        };

        if (!self.mainWindow.isDestroyed()) {
          self.mainWindow.webContents.send('session:permission-request', request);
        }

        self.sendInputRequiredNotification(hiveSessionId, toolName, toolInput);

        // Wait for user decision
        return new Promise((resolve) => {
          pendingResolvers.set(toolCall.toolCallId, resolve);
        });
      },

      sessionUpdate(notification: acp.SessionUpdateNotification): void {
        // Convert ACP updates to SDK message format and forward to renderer
        self.handleSessionUpdate(hiveSessionId, notification);
      },

      // Optional: file system access (if we want to handle it ourselves)
      // For now, let claude --acp handle file operations directly
    };
  }

  private handleSessionUpdate(hiveSessionId: string, notification: acp.SessionUpdateNotification): void {
    const update = notification.update;

    // Convert ACP update types to SDK message format
    switch (update.type) {
      case 'agent_message_chunk': {
        // Streaming text - append to current message
        if (update.textChunk) {
          this.sendStreamEvent(hiveSessionId, update.textChunk);
        }
        break;
      }

      case 'tool_call': {
        // Tool use started - create assistant message with tool_use
        const toolCall = update.toolCall;
        const message: SDKAssistantMessage = {
          type: 'assistant',
          uuid: toolCall.toolCallId,
          session_id: notification.sessionId,
          message: {
            role: 'assistant',
            content: [{
              type: 'tool_use',
              id: toolCall.toolCallId,
              name: toolCall.title || 'unknown',
              input: toolCall.rawInput ? JSON.parse(toolCall.rawInput) : {},
            }],
          },
        };
        this.sendMessage(hiveSessionId, message);
        break;
      }

      case 'tool_call_update': {
        // Tool result - create user message with tool_result
        const toolCall = update.toolCall;
        if (toolCall.status === 'completed' && toolCall.content) {
          const message: SDKUserMessage = {
            type: 'user',
            session_id: notification.sessionId,
            message: {
              role: 'user',
              content: [{
                type: 'tool_result',
                tool_use_id: toolCall.toolCallId,
                content: toolCall.content,
                is_error: false,
              }],
            },
          };
          this.sendMessage(hiveSessionId, message);
        }
        break;
      }

      case 'agent_message': {
        // Complete assistant message
        const content = update.message?.content || [];
        const message: SDKAssistantMessage = {
          type: 'assistant',
          uuid: `msg_${Date.now()}`,
          session_id: notification.sessionId,
          message: {
            role: 'assistant',
            content: content.map((block: acp.ContentBlock) => {
              if (block.type === 'text') {
                return { type: 'text' as const, text: block.text };
              }
              if (block.type === 'tool_use') {
                return {
                  type: 'tool_use' as const,
                  id: block.id,
                  name: block.name,
                  input: block.input,
                };
              }
              return { type: 'text' as const, text: '' };
            }),
          },
        };
        this.sendMessage(hiveSessionId, message);
        break;
      }

      case 'current_mode_update': {
        // Mode change (e.g., plan mode) - we can ignore or log
        console.log(`[ACP] Mode update: ${update.mode}`);
        break;
      }
    }
  }

  async startSession(
    hiveSessionId: string,
    prompt: string,
    cwd: string,
    existingClaudeSessionId?: string,
    model?: string,
    permissionMode?: PermissionMode
  ): Promise<void> {
    database.sessions.updateStatus(hiveSessionId, 'running');
    this.sendStatusUpdate(hiveSessionId, 'running');

    const effectivePermissionMode = permissionMode || DEFAULT_PERMISSION_MODE;

    // Auto-update session name from first prompt
    if (!existingClaudeSessionId) {
      const session = database.sessions.getById(hiveSessionId);
      if (session && /^Session \d+$/.test(session.name)) {
        const trimmed = prompt.trim();
        if (trimmed.length > 0) {
          const newName = trimmed.length <= 50 ? trimmed : trimmed.slice(0, 50) + '...';
          database.sessions.updateName(hiveSessionId, newName);
          this.sendNameUpdate(hiveSessionId, newName);
        }
      }
    }

    // Spawn claude --acp subprocess
    const process = this.spawnClaudeProcess(cwd);

    process.on('error', (err) => {
      console.error('[ACP] Process error:', err);
      database.sessions.updateStatus(hiveSessionId, 'error');
      this.sendStatusUpdate(hiveSessionId, 'error');
    });

    process.on('exit', (code) => {
      console.log(`[ACP] Process exited with code ${code}`);
      this.activeSessions.delete(hiveSessionId);
    });

    // Create ACP connection
    const stdin = process.stdin!;
    const stdout = process.stdout!;

    const input = Writable.toWeb(stdin) as WritableStream<Uint8Array>;
    const output = Readable.toWeb(stdout) as ReadableStream<Uint8Array>;
    const stream = acp.ndJsonStream(input, output);

    const client = this.createClient(hiveSessionId, effectivePermissionMode);
    const connection = new acp.ClientSideConnection((_agent) => client, stream);

    // Initialize connection
    await connection.initialize({
      protocolVersion: acp.PROTOCOL_VERSION,
      clientInfo: {
        name: 'Hive',
        version: app.getVersion(),
      },
      clientCapabilities: {
        // Let claude handle file ops directly
      },
    });

    // Create or resume session
    let acpSessionId: string;

    if (existingClaudeSessionId) {
      // Resume existing session
      const loadResponse = await connection.loadSession({
        sessionId: existingClaudeSessionId,
      });
      acpSessionId = loadResponse.sessionId;
    } else {
      // Create new session
      const newSessionResponse = await connection.newSession({
        workingDirectory: cwd,
      });
      acpSessionId = newSessionResponse.sessionId;

      // Store the ACP session ID
      database.sessions.updateClaudeSessionId(hiveSessionId, acpSessionId);

      // Send init message to renderer
      const initMessage: SDKInitMessage = {
        type: 'system',
        subtype: 'init',
        session_id: acpSessionId,
        model: model || 'claude-sonnet-4-20250514',
        tools: [],
        apiKeySource: 'user',
      };
      this.sendMessage(hiveSessionId, initMessage);
    }

    const activeSession: ActiveSession = {
      process,
      connection,
      sessionId: acpSessionId,
      hiveSessionId,
      permissionMode: effectivePermissionMode,
    };
    this.activeSessions.set(hiveSessionId, activeSession);

    try {
      // Send the prompt
      const response = await connection.prompt({
        sessionId: acpSessionId,
        messages: [{
          role: 'user',
          content: [{ type: 'text', text: prompt }],
        }],
      });

      // Session completed
      const resultMessage: SDKResultMessage = {
        type: 'result',
        subtype: response.stopReason === 'end_turn' ? 'success' : 'error_during_execution',
        session_id: acpSessionId,
        result: response.stopReason === 'end_turn' ? 'Completed' : `Stopped: ${response.stopReason}`,
      };
      this.sendMessage(hiveSessionId, resultMessage);

      // Update status
      const pendingApprovals = database.pendingApprovals.listBySession(hiveSessionId);
      if (pendingApprovals.length > 0) {
        database.sessions.updateStatus(hiveSessionId, 'waiting');
        this.sendStatusUpdate(hiveSessionId, 'waiting');
      } else {
        database.sessions.updateStatus(hiveSessionId, 'idle');
        this.sendStatusUpdate(hiveSessionId, 'idle');
        this.sendCompletionNotification(hiveSessionId, response.stopReason === 'end_turn');
      }
    } catch (error) {
      console.error('[ACP] Prompt error:', error);
      database.sessions.updateStatus(hiveSessionId, 'error');
      this.sendStatusUpdate(hiveSessionId, 'error');
    }
  }

  async interruptSession(hiveSessionId: string): Promise<void> {
    const active = this.activeSessions.get(hiveSessionId);
    if (active) {
      // Send cancel notification
      await active.connection.cancel({ sessionId: active.sessionId });

      // Send interrupted result
      this.sendMessage(hiveSessionId, {
        type: 'result',
        subtype: 'interrupted',
        session_id: active.sessionId,
        result: 'Session interrupted by user',
      } as SDKMessage);

      database.sessions.updateStatus(hiveSessionId, 'idle');
      this.sendStatusUpdate(hiveSessionId, 'idle');
    }
  }

  async approveAndResume(hiveSessionId: string, pendingApprovalId: string): Promise<void> {
    const pending = database.pendingApprovals.listBySession(hiveSessionId)
      .find(p => p.id === pendingApprovalId);

    if (!pending) return;

    // Store approval for potential sub-agent reuse
    database.approvedToolCalls.create({
      sessionId: hiveSessionId,
      hash: pending.hash,
      toolName: pending.toolName,
    });

    database.pendingApprovals.delete(pendingApprovalId);

    // Resolve the permission promise
    const resolved = resolvePermission(pending.toolUseId, 'allow');

    if (resolved) {
      const remaining = database.pendingApprovals.listBySession(hiveSessionId);
      if (remaining.length === 0) {
        database.sessions.updateStatus(hiveSessionId, 'running');
        this.sendStatusUpdate(hiveSessionId, 'running');
      }
    }
  }

  async approveAllAndResume(hiveSessionId: string): Promise<void> {
    const pendingApprovals = database.pendingApprovals.listBySession(hiveSessionId);

    for (const pending of pendingApprovals) {
      database.approvedToolCalls.create({
        sessionId: hiveSessionId,
        hash: pending.hash,
        toolName: pending.toolName,
      });
      resolvePermission(pending.toolUseId, 'allow');
    }

    database.pendingApprovals.deleteBySession(hiveSessionId);
    database.sessions.updateStatus(hiveSessionId, 'running');
    this.sendStatusUpdate(hiveSessionId, 'running');
  }

  async denyAndResume(hiveSessionId: string, pendingApprovalId: string, reason?: string): Promise<void> {
    const pending = database.pendingApprovals.listBySession(hiveSessionId)
      .find(p => p.id === pendingApprovalId);

    if (!pending) return;

    // Resolve with deny
    resolvePermission(pending.toolUseId, 'deny');

    // Also deny all other pending
    const remaining = database.pendingApprovals.listBySession(hiveSessionId);
    for (const other of remaining) {
      resolvePermission(other.toolUseId, 'deny');
    }

    database.pendingApprovals.deleteBySession(hiveSessionId);
    database.sessions.updateStatus(hiveSessionId, 'running');
    this.sendStatusUpdate(hiveSessionId, 'running');
  }

  getPendingApprovals(hiveSessionId: string) {
    return database.pendingApprovals.listBySession(hiveSessionId);
  }

  clearPendingApprovals(hiveSessionId: string): void {
    database.pendingApprovals.deleteBySession(hiveSessionId);
    database.approvedToolCalls.deleteBySession(hiveSessionId);
  }

  // IPC message helpers
  private sendMessage(sessionId: string, message: SDKMessage): void {
    if (!this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('session:message', { sessionId, message });
    }
  }

  private sendStreamEvent(sessionId: string, text: string): void {
    if (!this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('session:stream', { sessionId, text });
    }
  }

  private sendStatusUpdate(sessionId: string, status: Session['status']): void {
    if (!this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('session:status', { sessionId, status });
    }
  }

  private sendNameUpdate(sessionId: string, name: string): void {
    if (!this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('session:name', { sessionId, name });
    }
  }

  // Notification helpers (same as current implementation)
  private getSessionContext(sessionId: string): { sessionName: string; projectName: string } | null {
    const session = database.sessions.getById(sessionId);
    if (!session) return null;
    const project = database.projects.list().find(p => p.id === session.projectId);
    return {
      sessionName: session.name,
      projectName: project?.name || 'Unknown Project'
    };
  }

  private getNotificationIcon(): string {
    const isDev = !app.isPackaged;
    if (isDev) {
      return path.join(process.cwd(), 'resources', 'icon.png');
    }
    return path.join(process.resourcesPath, 'icon.png');
  }

  private formatNotificationTitle(context: { sessionName: string; projectName: string } | null, fallback: string): string {
    if (!context) return fallback;
    const sessionTrimmed = context.sessionName.length > 20
      ? context.sessionName.slice(0, 20) + '...'
      : context.sessionName;
    const projectTrimmed = context.projectName.length > 15
      ? context.projectName.slice(0, 15) + '...'
      : context.projectName;
    return `${sessionTrimmed} (${projectTrimmed})`;
  }

  private sendInputRequiredNotification(sessionId: string, toolName: string, toolInput: Record<string, unknown>): void {
    const prefs = getPreferences();
    if (!prefs.notifications.inputRequired) return;

    const context = this.getSessionContext(sessionId);
    const title = this.formatNotificationTitle(context, 'Permission Required');
    const body = `Wants to use: ${toolName}`;

    if (this.mainWindow.isFocused()) {
      if (!this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('notification:show', {
          type: 'permission',
          sessionId,
          sessionName: context?.sessionName || 'Unknown Session',
          title,
          body,
        });
      }
    } else {
      const notification = new Notification({
        title,
        body,
        icon: this.getNotificationIcon(),
        timeoutType: 'never'
      });
      notification.on('click', () => {
        this.mainWindow.show();
        this.mainWindow.focus();
        this.mainWindow.webContents.send('session:focus', sessionId);
      });
      notification.show();
    }
  }

  private sendCompletionNotification(sessionId: string, success: boolean, resultText?: string): void {
    const prefs = getPreferences();
    if (!prefs.notifications.sessionComplete) return;

    const context = this.getSessionContext(sessionId);
    const title = this.formatNotificationTitle(context, success ? 'Task Complete' : 'Task Error');
    const body = success ? 'Finished successfully' : (resultText || 'Ended with an error');

    if (this.mainWindow.isFocused()) {
      if (!this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('notification:show', {
          type: success ? 'success' : 'error',
          sessionId,
          sessionName: context?.sessionName || 'Unknown Session',
          title,
          body,
        });
      }
    } else {
      const notification = new Notification({
        title,
        body,
        icon: this.getNotificationIcon(),
      });
      notification.on('click', () => {
        this.mainWindow.show();
        this.mainWindow.focus();
        this.mainWindow.webContents.send('session:focus', sessionId);
      });
      notification.show();
    }
  }
}
```

### Success Criteria:

#### Automated Verification:
- [x] TypeScript compiles: `pnpm run lint`
- [x] App starts: `pnpm start`

#### Manual Verification:
- [x] Can import ACPSessionManager without errors (test by adding import to ipc-handlers.ts temporarily)

**Implementation Note**: After completing this phase, pause for verification before proceeding.

---

## Phase 3: Wire Up IPC Handlers

### Overview
Replace SessionManager with ACPSessionManager in IPC handlers.

### Changes Required:

#### 1. Update IPC Handlers Import
**File**: `src/main/ipc-handlers.ts`
**Changes**: Replace SessionManager with ACPSessionManager

```typescript
// Line 9: Change import
// FROM:
import { SessionManager } from './session-manager';
// TO:
import { ACPSessionManager } from './acp-session-manager';

// Line 18: Change type
// FROM:
let sessionManager: SessionManager | null = null;
// TO:
let sessionManager: ACPSessionManager | null = null;

// Line 29: Change instantiation
// FROM:
sessionManager = new SessionManager(mainWindow);
// TO:
sessionManager = new ACPSessionManager(mainWindow);
```

#### 2. Remove setPermissionMode handler
**File**: `src/main/ipc-handlers.ts`
**Changes**: Remove dynamic permission mode (ACP handles it per-session)

```typescript
// Remove lines 164-167 (session:set-permission-mode handler)
// The ACP session manager handles permission mode internally
```

### Success Criteria:

#### Automated Verification:
- [x] TypeScript compiles: `pnpm run lint`
- [x] App starts: `pnpm start`

#### Manual Verification:
- [x] Start a new session
- [x] Send "hello" prompt
- [x] See streaming response
- [x] Session completes successfully

**Implementation Note**: This is the critical integration point. Test thoroughly before proceeding.

---

## Phase 4: Handle Streaming Text

### Overview
Add IPC listener for streaming text in the renderer.

### Changes Required:

#### 1. Add Stream Event Handler
**File**: `src/renderer/components/views/SessionView.tsx`
**Changes**: Add listener for stream events

```typescript
// Around line 380, add alongside other IPC listeners:
const unsubStream = window.electronAPI.on('session:stream', (data: unknown) => {
  const { sessionId, text } = data as { sessionId: string; text: string };
  if (sessionId === session.id) {
    appendStreamingText(sessionId, text);
  }
});

// In cleanup (around line 430), add:
unsubStream();
```

#### 2. Expose API in Preload
**File**: `src/preload/index.ts`
**Changes**: Ensure 'session:stream' is in the allowed channels (should already be there with 'session:*')

No changes needed if using wildcard pattern.

### Success Criteria:

#### Automated Verification:
- [x] TypeScript compiles: `pnpm run lint`

#### Manual Verification:
- [x] Send a prompt
- [x] See text streaming in real-time (not all at once)

---

## Phase 5: Remove Old Code and 'plan' Mode

### Overview
Clean up old session manager and remove plan mode from UI.

### Changes Required:

#### 1. Delete Old Session Manager
**File**: `src/main/session-manager.ts`
**Changes**: Delete entire file

#### 2. Remove 'plan' Mode from Types
**File**: `src/shared/types.ts`
**Changes**: Already done in Phase 1

#### 3. Handle 'plan' in Database Migration
**File**: `src/main/database.ts`
**Changes**: Add migration to convert 'plan' to 'default'

```typescript
// Add after existing migrations (around line 152):
// Migration: Convert 'plan' permission mode to 'default'
try {
  db.exec(`UPDATE sessions SET permission_mode = 'default' WHERE permission_mode = 'plan'`);
} catch {
  // Already migrated or no 'plan' sessions
}
```

#### 4. Remove Plan Mode Detection
**File**: `src/main/acp-session-manager.ts`
**Changes**: Remove action type detection for 'plan' (lines in startSession)

In the `startSession` method, remove the plan mode detection logic that checks for `/create-plan` commands. Keep only the research detection if desired.

### Success Criteria:

#### Automated Verification:
- [x] TypeScript compiles: `pnpm run lint`
- [x] App starts: `pnpm start`
- [x] No references to old session-manager.ts: `grep -r "session-manager" src/`

#### Manual Verification:
- [x] Permission mode selector shows only 3 options
- [x] Existing sessions with 'plan' mode show as 'default'

---

## Phase 6: Final Testing and Polish

### Overview
Comprehensive testing and edge case handling.

### Changes Required:

#### 1. Handle Process Crashes
**File**: `src/main/acp-session-manager.ts`
**Changes**: Improve error handling in spawnClaudeProcess

The current implementation already handles process errors. Verify error messages are user-friendly.

#### 2. Update Package.json
**File**: `package.json`
**Changes**: Remove old SDK dependency

```bash
pnpm remove @anthropic-ai/claude-agent-sdk
```

### Success Criteria:

#### Automated Verification:
- [x] `pnpm install` succeeds
- [x] TypeScript compiles: `pnpm run lint`
- [x] App packages: `pnpm run make`

#### Manual Verification:
- [ ] New session with prompt works
- [ ] Tool approval flow works (approve single, approve all, deny)
- [ ] "Accept Edits" mode auto-approves Write/Edit
- [ ] "Bypass All" with timer works
- [ ] Timer countdown displays correctly
- [ ] Timer expiration reverts to default mode
- [ ] Session resume after app restart works
- [ ] Kill claude process manually - app handles gracefully
- [ ] Notifications work (permission required, session complete)

---

## Testing Strategy

### Manual Testing Steps:

1. **Basic Flow**
   - Create new project
   - Create new session
   - Send "list files in current directory"
   - Approve the Bash tool
   - Verify output displays

2. **Permission Modes**
   - Set "Accept Edits" mode
   - Ask Claude to create a test file
   - Verify Write tool auto-approved
   - Set "Bypass All" for 15 minutes
   - Verify timer displays
   - Ask Claude to run a command
   - Verify Bash tool auto-approved
   - Wait for timer or manually revert
   - Verify reverts to default

3. **Edge Cases**
   - Deny a tool - verify session continues with denial message
   - Interrupt session mid-execution
   - Close and reopen app with pending approval
   - Resume session after restart

---

## Known Limitations & Future Work

### AskUserQuestion Tool Not Available in ACP Mode

**Issue**: Claude running via `claude-code-acp` does not have access to the `AskUserQuestion` tool, even though it's available in the regular Claude Code CLI.

**Root Cause**: The `claude-code-acp` package doesn't expose this tool via ACP. The tool requires bidirectional interactive communication that ACP doesn't natively support.

**Tracking**: https://github.com/zed-industries/claude-code-acp/issues/150

**Workaround**: Claude can still ask questions in text responses, just not with the structured multiple-choice UI.

**IMPLEMENTED**: AskUserQuestion support added via PR #227 in `desplega-ai/claude-code-acp` fork.

Implementation in Hive:
1. ✅ Using local fork: `"@zed-industries/claude-code-acp": "file:../../claude-code-acp"` in package.json
2. ✅ Enabled capability: `_meta: { askUserQuestion: true }` in clientCapabilities
3. ✅ Handler in `acp-session-manager.ts`: Detects `params._meta.askUserQuestion` in requestPermission
4. ✅ IPC handler: `session:answer-question` to receive answers from renderer
5. ✅ UI component: `QuestionDialog.tsx` displays questions with option selection
6. ✅ Renderer integration: IPC listener for `session:question-request` in SessionView

---

## References

- Research document: `thoughts/shared/research/2025-12-29-hive-acp-integration.md`
- ACP TypeScript SDK: https://agentclientprotocol.github.io/typescript-sdk
- ACP Protocol: https://agentclientprotocol.com/protocol/prompt-turn
- Current implementation: `src/main/session-manager.ts`
