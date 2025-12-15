---
date: 2025-12-15T14:30:00Z
researcher: Claude
git_commit: 9e21b0505afee30a99059894d8956b2bc374d1c2
branch: main
repository: ai-toolbox
topic: "Hive - Claude Agent SDK Integration Patterns"
tags: [research, hive, claude-agent-sdk, electron, sessions, streaming, authentication]
status: complete
last_updated: 2025-12-15
last_updated_by: Claude
related: ["2025-12-15-hive-electron-app-research.md"]
---

# Research: Hive - Claude Agent SDK Integration Patterns

**Date**: 2025-12-15T14:30:00Z
**Researcher**: Claude
**Git Commit**: 9e21b0505afee30a99059894d8956b2bc374d1c2
**Branch**: main
**Repository**: ai-toolbox

## Research Question

How to integrate the Claude Agent SDK into the Hive Electron app with support for:
1. Creating new sessions
2. Listing and resuming past sessions
3. Streaming support
4. Notifications on human input required or task completion
5. User interaction (interrupt, reply to elicitation)
6. Credential configuration (Claude CLI creds, API keys, OAuth token)

## Summary

The Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) provides comprehensive support for all Hive requirements. The SDK offers two interfaces:

- **V1 (Stable)**: `query()` function returning an AsyncGenerator with full control
- **V2 (Preview)**: Simplified `send()`/`receive()` pattern for multi-turn conversations

**Key Architecture Decision**: Use **V1 SDK** for Hive because it provides:
- `interrupt()` method for stopping running queries
- `forkSession` option (not in V2)
- Full streaming control with partial messages
- Comprehensive hooks system for notifications

**Authentication**: The SDK inherits Claude CLI credentials by default. For programmatic use, `ANTHROPIC_API_KEY` is the primary method. OAuth tokens are CLI-only and cannot be used with third-party SDK applications.

## Detailed Findings

### 1. Session Management

#### Creating New Sessions

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

interface HiveSession {
  id: string;
  name: string;
  directory: string;
  createdAt: number;
  lastMessageAt?: number;
}

async function createSession(name: string, directory: string): Promise<HiveSession> {
  const response = query({
    prompt: "Session initialized. Ready to help.",
    options: {
      cwd: directory,
      model: "claude-sonnet-4-5-20250929",
      systemPrompt: {
        type: 'preset',
        preset: 'claude_code'
      },
      settingSources: ['project'],  // Load CLAUDE.md from project
      tools: { type: 'preset', preset: 'claude_code' }
    }
  });

  let sessionId: string | undefined;

  for await (const message of response) {
    if (message.type === 'system' && message.subtype === 'init') {
      sessionId = message.session_id;
      break;
    }
  }

  if (!sessionId) {
    throw new Error('Failed to create session');
  }

  return {
    id: sessionId,
    name,
    directory,
    createdAt: Date.now()
  };
}
```

#### Resuming Sessions

```typescript
async function resumeSession(
  sessionId: string,
  directory: string,
  newPrompt?: string
): Promise<Query> {
  return query({
    prompt: newPrompt || "Continue from where we left off.",
    options: {
      resume: sessionId,  // Resume existing session
      cwd: directory,
      model: "claude-sonnet-4-5-20250929"
    }
  });
}
```

#### Forking Sessions (Explore Alternative Without Modifying Original)

```typescript
async function forkSession(
  sessionId: string,
  directory: string,
  newPrompt: string
): Promise<{ query: Query; newSessionId: string }> {
  const response = query({
    prompt: newPrompt,
    options: {
      resume: sessionId,
      forkSession: true,  // Creates new session from existing history
      cwd: directory,
      model: "claude-sonnet-4-5-20250929"
    }
  });

  let newSessionId: string | undefined;

  for await (const message of response) {
    if (message.type === 'system' && message.subtype === 'init') {
      newSessionId = message.session_id;
    }
    // Forward message to UI...
  }

  return { query: response, newSessionId: newSessionId! };
}
```

#### Continue Most Recent Conversation

```typescript
async function continueRecentSession(directory: string, prompt: string): Promise<Query> {
  return query({
    prompt,
    options: {
      continue: true,  // Continue most recent conversation in this directory
      cwd: directory,
      model: "claude-sonnet-4-5-20250929"
    }
  });
}
```

#### Listing Past Sessions

The SDK does not provide a built-in session listing API. Sessions must be tracked externally:

```typescript
// src/main/session-store.ts
import Store from 'electron-store';

interface SessionRecord {
  id: string;
  name: string;
  directory: string;
  createdAt: number;
  lastMessageAt: number;
  messageCount: number;
  status: 'idle' | 'running' | 'error';
}

const store = new Store<{ sessions: SessionRecord[] }>({
  defaults: { sessions: [] }
});

export function saveSession(session: SessionRecord) {
  const sessions = store.get('sessions');
  const index = sessions.findIndex(s => s.id === session.id);
  if (index >= 0) {
    sessions[index] = session;
  } else {
    sessions.push(session);
  }
  store.set('sessions', sessions);
}

export function listSessions(): SessionRecord[] {
  return store.get('sessions').sort((a, b) => b.lastMessageAt - a.lastMessageAt);
}

export function getSessionsByDirectory(directory: string): SessionRecord[] {
  return store.get('sessions').filter(s => s.directory === directory);
}
```

### 2. Streaming Support

#### Basic Streaming (Message-by-Message)

```typescript
async function streamQuery(sessionId: string | undefined, prompt: string, cwd: string) {
  const response = query({
    prompt,
    options: {
      resume: sessionId,
      cwd,
      model: "claude-sonnet-4-5-20250929"
    }
  });

  for await (const message of response) {
    switch (message.type) {
      case 'system':
        if (message.subtype === 'init') {
          emit('session:init', {
            sessionId: message.session_id,
            model: message.model,
            tools: message.tools
          });
        }
        break;

      case 'assistant':
        emit('message:assistant', {
          uuid: message.uuid,
          content: message.message.content  // Array of text/tool_use blocks
        });
        break;

      case 'result':
        emit('session:result', {
          success: message.subtype === 'success',
          result: message.result,
          totalCost: message.total_cost_usd,
          duration: message.duration_ms
        });
        break;
    }
  }
}
```

#### Real-Time Character Streaming (Partial Messages)

For real-time text streaming as Claude types:

```typescript
async function streamWithPartialMessages(prompt: string, cwd: string) {
  const response = query({
    prompt,
    options: {
      cwd,
      model: "claude-sonnet-4-5-20250929",
      includePartialMessages: true  // Enable character-level streaming
    }
  });

  for await (const message of response) {
    if (message.type === 'stream_event') {
      // Raw Anthropic SDK streaming event
      const event = message.event;

      if (event.type === 'content_block_delta') {
        if (event.delta.type === 'text_delta') {
          emit('stream:text', { text: event.delta.text });
        }
      } else if (event.type === 'content_block_start') {
        emit('stream:block_start', { blockType: event.content_block.type });
      } else if (event.type === 'content_block_stop') {
        emit('stream:block_stop', {});
      }
    } else if (message.type === 'assistant') {
      // Complete assistant message (final version)
      emit('message:complete', { content: message.message.content });
    }
  }
}
```

#### SDKPartialAssistantMessage Type

```typescript
type SDKPartialAssistantMessage = {
  type: 'stream_event';
  event: RawMessageStreamEvent;  // From @anthropic-ai/sdk
  parent_tool_use_id: string | null;
  uuid: string;
  session_id: string;
}
```

### 3. Notifications and Event Handling

#### Using Hooks for Notifications

```typescript
import { query, type HookInput, type HookJSONOutput } from "@anthropic-ai/claude-agent-sdk";

async function queryWithNotifications(prompt: string, cwd: string) {
  return query({
    prompt,
    options: {
      cwd,
      model: "claude-sonnet-4-5-20250929",
      hooks: {
        Notification: [{
          hooks: [notificationHandler]
        }],
        PermissionRequest: [{
          hooks: [permissionRequestHandler]
        }],
        SessionEnd: [{
          hooks: [sessionEndHandler]
        }],
        Stop: [{
          hooks: [stopHandler]
        }]
      }
    }
  });
}

// Handle system notifications (Claude wants to notify user)
async function notificationHandler(
  input: HookInput,
  toolUseId: string | undefined,
  options: { signal: AbortSignal }
): Promise<HookJSONOutput> {
  if (input.hook_event_name === 'Notification') {
    // Send native macOS notification
    sendNotification({
      title: input.title || 'Claude Code',
      message: input.message,
      sessionId: input.session_id
    });
  }
  return { continue: true };
}

// Handle permission requests (human input needed)
async function permissionRequestHandler(
  input: HookInput,
  toolUseId: string | undefined,
  options: { signal: AbortSignal }
): Promise<HookJSONOutput> {
  if (input.hook_event_name === 'PermissionRequest') {
    // Notify user that input is needed
    sendNotification({
      title: 'Permission Required',
      message: `Claude wants to use: ${input.tool_name}`,
      sessionId: input.session_id,
      requiresAction: true
    });

    // Wait for user decision (implement via IPC)
    const decision = await waitForUserPermissionDecision(input.session_id, toolUseId);

    return {
      hookSpecificOutput: {
        hookEventName: 'PermissionRequest',
        decision
      }
    };
  }
  return { continue: true };
}

// Handle session completion
async function sessionEndHandler(input: HookInput): Promise<HookJSONOutput> {
  if (input.hook_event_name === 'SessionEnd') {
    sendNotification({
      title: 'Task Complete',
      message: `Session ended: ${input.reason}`,
      sessionId: input.session_id
    });
  }
  return { continue: true };
}
```

#### Detecting Task Completion via Result Message

```typescript
for await (const message of response) {
  if (message.type === 'result') {
    const isSuccess = message.subtype === 'success';
    const isError = message.subtype.startsWith('error_');

    sendNotification({
      title: isSuccess ? 'Task Complete' : 'Task Error',
      message: isSuccess
        ? message.result
        : `Error: ${message.subtype.replace('error_', '')}`,
      sessionId: message.session_id
    });

    // Result subtypes:
    // - 'success': Normal completion
    // - 'error_max_turns': Hit turn limit
    // - 'error_during_execution': Runtime error
    // - 'error_max_budget_usd': Budget exceeded
    // - 'error_max_structured_output_retries': Output parsing failed
  }
}
```

#### Detecting When Human Input Is Needed

Human input is typically needed when:
1. Permission request (via PermissionRequest hook)
2. Tool requires confirmation (via canUseTool callback)
3. AskUserQuestion tool is used by Claude

```typescript
// Custom permission handler for detecting human input needs
const response = query({
  prompt,
  options: {
    cwd,
    model: "claude-sonnet-4-5-20250929",
    canUseTool: async (toolName, input, { signal, suggestions }) => {
      // Check if this is the AskUserQuestion tool
      if (toolName === 'AskUserQuestion') {
        sendNotification({
          title: 'Question from Claude',
          message: 'Claude has a question for you',
          sessionId: currentSessionId,
          requiresAction: true
        });

        // Return response after user answers
        const userAnswer = await waitForUserAnswer(currentSessionId);
        return {
          behavior: 'allow',
          updatedInput: { ...input, answers: userAnswer }
        };
      }

      // Default: allow tool use
      return { behavior: 'allow', updatedInput: input };
    }
  }
});
```

### 4. User Interaction

#### Interrupting a Running Query

```typescript
class SessionManager {
  private activeQueries = new Map<string, Query>();

  async startQuery(sessionId: string, prompt: string, cwd: string) {
    const response = query({
      prompt,
      options: {
        resume: sessionId,
        cwd,
        model: "claude-sonnet-4-5-20250929"
      }
    });

    this.activeQueries.set(sessionId, response);

    try {
      for await (const message of response) {
        // Process messages...
      }
    } finally {
      this.activeQueries.delete(sessionId);
    }
  }

  async interruptQuery(sessionId: string) {
    const activeQuery = this.activeQueries.get(sessionId);
    if (activeQuery) {
      await activeQuery.interrupt();  // Stops the query gracefully
    }
  }
}
```

#### Using AbortController for Cancellation

```typescript
class SessionManager {
  private abortControllers = new Map<string, AbortController>();

  async startQuery(sessionId: string, prompt: string, cwd: string) {
    const abortController = new AbortController();
    this.abortControllers.set(sessionId, abortController);

    const response = query({
      prompt,
      options: {
        resume: sessionId,
        cwd,
        model: "claude-sonnet-4-5-20250929",
        abortController  // Pass abort controller
      }
    });

    try {
      for await (const message of response) {
        // Process messages...
      }
    } finally {
      this.abortControllers.delete(sessionId);
    }
  }

  cancelQuery(sessionId: string) {
    const controller = this.abortControllers.get(sessionId);
    if (controller) {
      controller.abort();
    }
  }
}
```

#### Multi-Turn Conversations (Streaming Input Mode)

For true interactive sessions where user can respond mid-conversation:

```typescript
import { query, type SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";

class InteractiveSession {
  private inputQueue: SDKUserMessage[] = [];
  private resolveNextInput: ((msg: SDKUserMessage) => void) | null = null;

  async* createInputStream(): AsyncIterable<SDKUserMessage> {
    while (true) {
      const message = await this.getNextInput();
      yield message;
    }
  }

  private getNextInput(): Promise<SDKUserMessage> {
    if (this.inputQueue.length > 0) {
      return Promise.resolve(this.inputQueue.shift()!);
    }
    return new Promise(resolve => {
      this.resolveNextInput = resolve;
    });
  }

  sendUserMessage(text: string) {
    const message: SDKUserMessage = {
      type: 'user',
      session_id: '',  // Will be filled by SDK
      message: {
        role: 'user',
        content: [{ type: 'text', text }]
      },
      parent_tool_use_id: null
    };

    if (this.resolveNextInput) {
      this.resolveNextInput(message);
      this.resolveNextInput = null;
    } else {
      this.inputQueue.push(message);
    }
  }

  async start(cwd: string) {
    const response = query({
      prompt: this.createInputStream(),  // Streaming input mode
      options: {
        cwd,
        model: "claude-sonnet-4-5-20250929"
      }
    });

    for await (const message of response) {
      // Handle messages and notify UI
      this.emit('message', message);
    }
  }
}
```

#### Replying to Elicitation (Permission Decisions)

```typescript
// Using canUseTool for custom permission handling
const response = query({
  prompt,
  options: {
    cwd,
    model: "claude-sonnet-4-5-20250929",
    permissionMode: 'default',  // Requires approval for certain tools
    canUseTool: async (toolName, input, { signal, suggestions }) => {
      // Show permission dialog to user
      const userDecision = await showPermissionDialog({
        tool: toolName,
        input,
        suggestions  // SDK-suggested permission updates
      });

      if (userDecision.approved) {
        return {
          behavior: 'allow',
          updatedInput: userDecision.modifiedInput || input,
          updatedPermissions: userDecision.rememberChoice
            ? [{ type: 'addRules', rules: [...], behavior: 'allow', destination: 'session' }]
            : undefined
        };
      } else {
        return {
          behavior: 'deny',
          message: userDecision.reason || 'User denied permission',
          interrupt: userDecision.stopSession || false
        };
      }
    }
  }
});
```

### 5. Credential Configuration

#### Authentication Hierarchy

| Priority | Source | Environment Variable | Use Case |
|----------|--------|---------------------|----------|
| 1 | Anthropic API Key | `ANTHROPIC_API_KEY` | Primary/Recommended |
| 2 | Claude CLI Auth | (auto-inherited) | When `claude` CLI is authenticated |
| 3 | Amazon Bedrock | `CLAUDE_CODE_USE_BEDROCK=1` | Enterprise/AWS |
| 4 | Google Vertex AI | `CLAUDE_CODE_USE_VERTEX=1` | Enterprise/GCP |
| 5 | Azure AI Foundry | `CLAUDE_CODE_USE_FOUNDRY=1` | Enterprise/Azure |

#### Default: Use Claude CLI Credentials

The SDK automatically uses credentials from the Claude CLI if authenticated:

```typescript
// No explicit auth configuration needed
// SDK will use credentials from `claude` CLI authentication
const response = query({
  prompt: "Hello",
  options: {
    model: "claude-sonnet-4-5-20250929"
  }
});

// Check auth source in init message
for await (const message of response) {
  if (message.type === 'system' && message.subtype === 'init') {
    console.log('Auth source:', message.apiKeySource);
    // Possible values: 'user' | 'project' | 'org' | 'temporary'
  }
}
```

#### Option: Use Anthropic API Key

```typescript
// Set via environment variable before running
process.env.ANTHROPIC_API_KEY = 'sk-ant-...';

// Or pass environment to query
const response = query({
  prompt: "Hello",
  options: {
    model: "claude-sonnet-4-5-20250929",
    env: {
      ...process.env,
      ANTHROPIC_API_KEY: apiKey
    }
  }
});
```

#### Option: Use OAuth Token (CLI Only - NOT for SDK third-party apps)

**Important**: `CLAUDE_CODE_OAUTH_TOKEN` is designed for the Claude CLI tool and **cannot be used with the SDK for third-party applications** without prior Anthropic approval.

From Anthropic documentation:
> "Unless previously approved, we do not allow third party developers to offer Claude.ai login or rate limits for their products, including agents built on the Claude Agent SDK."

```typescript
// NOT RECOMMENDED for SDK third-party apps
// This is shown for reference only
process.env.CLAUDE_CODE_OAUTH_TOKEN = 'oauth-token-...';
```

#### Hive Credential Configuration Implementation

```typescript
// src/main/auth-manager.ts
import { app } from 'electron';
import Store from 'electron-store';

type AuthMethod = 'claude-cli' | 'api-key' | 'bedrock' | 'vertex';

interface AuthConfig {
  method: AuthMethod;
  apiKey?: string;  // For 'api-key' method
  bedrockConfig?: {
    region: string;
    accessKeyId?: string;
    secretAccessKey?: string;
  };
}

const store = new Store<{ auth: AuthConfig }>({
  defaults: {
    auth: { method: 'claude-cli' }  // Default to CLI credentials
  }
});

export function getAuthEnvironment(): Record<string, string> {
  const config = store.get('auth');
  const env: Record<string, string> = { ...process.env };

  switch (config.method) {
    case 'claude-cli':
      // No additional config needed - SDK inherits from CLI
      break;

    case 'api-key':
      if (config.apiKey) {
        env.ANTHROPIC_API_KEY = config.apiKey;
      }
      break;

    case 'bedrock':
      env.CLAUDE_CODE_USE_BEDROCK = '1';
      if (config.bedrockConfig) {
        env.AWS_REGION = config.bedrockConfig.region;
        if (config.bedrockConfig.accessKeyId) {
          env.AWS_ACCESS_KEY_ID = config.bedrockConfig.accessKeyId;
        }
        if (config.bedrockConfig.secretAccessKey) {
          env.AWS_SECRET_ACCESS_KEY = config.bedrockConfig.secretAccessKey;
        }
      }
      break;

    case 'vertex':
      env.CLAUDE_CODE_USE_VERTEX = '1';
      break;
  }

  return env;
}

export function setAuthMethod(config: AuthConfig) {
  store.set('auth', config);
}

export function getAuthMethod(): AuthConfig {
  return store.get('auth');
}

// Usage in session manager
export function createAuthenticatedQuery(prompt: string, cwd: string) {
  return query({
    prompt,
    options: {
      cwd,
      model: "claude-sonnet-4-5-20250929",
      env: getAuthEnvironment()
    }
  });
}
```

#### Checking Authentication Status

```typescript
async function checkAuthStatus(): Promise<{
  authenticated: boolean;
  source: string;
  email?: string;
}> {
  const response = query({
    prompt: "ping",  // Minimal prompt to get init message
    options: {
      model: "claude-sonnet-4-5-20250929",
      maxTurns: 1
    }
  });

  for await (const message of response) {
    if (message.type === 'system' && message.subtype === 'init') {
      const accountInfo = await response.accountInfo();
      return {
        authenticated: true,
        source: message.apiKeySource,
        email: accountInfo.email
      };
    }
  }

  return { authenticated: false, source: 'none' };
}
```

### 6. V2 SDK Interface (Preview)

For simpler multi-turn conversations, consider the V2 preview interface:

```typescript
import {
  unstable_v2_createSession,
  unstable_v2_resumeSession,
  type SDKMessage
} from '@anthropic-ai/claude-agent-sdk';

// Create new session
await using session = unstable_v2_createSession({
  model: 'claude-sonnet-4-5-20250929',
  cwd: '/path/to/project'
});

// Send message
await session.send('What files are in this directory?');

// Receive response
for await (const msg of session.receive()) {
  if (msg.type === 'assistant') {
    console.log(getTextFromMessage(msg));
  }
}

// Continue conversation
await session.send('Show me the package.json');
for await (const msg of session.receive()) {
  // Handle response...
}

// Resume later
await using resumed = unstable_v2_resumeSession(sessionId, {
  model: 'claude-sonnet-4-5-20250929'
});
```

**V2 Limitations**:
- No `forkSession` support
- No `interrupt()` method
- Some streaming patterns not available
- API marked as unstable/preview

**Recommendation**: Use V1 for Hive to get full feature set.

### 7. Complete Hive Session Manager Implementation

```typescript
// src/main/session-manager.ts
import { query, type Query, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { BrowserWindow, Notification } from 'electron';
import Store from 'electron-store';
import { getAuthEnvironment } from './auth-manager';

interface SessionRecord {
  id: string;
  name: string;
  directory: string;
  createdAt: number;
  lastMessageAt: number;
  status: 'idle' | 'running' | 'awaiting_input' | 'error';
}

class HiveSessionManager {
  private store = new Store<{ sessions: SessionRecord[] }>();
  private activeQueries = new Map<string, Query>();
  private mainWindow: BrowserWindow;

  constructor(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow;
  }

  async createSession(name: string, directory: string): Promise<SessionRecord> {
    const response = query({
      prompt: "Session initialized.",
      options: {
        cwd: directory,
        model: "claude-sonnet-4-5-20250929",
        env: getAuthEnvironment(),
        systemPrompt: { type: 'preset', preset: 'claude_code' },
        settingSources: ['project'],
        tools: { type: 'preset', preset: 'claude_code' },
        hooks: this.createHooks()
      }
    });

    let sessionId: string | undefined;

    for await (const message of response) {
      sessionId = message.session_id;
      if (message.type === 'system' && message.subtype === 'init') {
        break;
      }
    }

    const session: SessionRecord = {
      id: sessionId!,
      name,
      directory,
      createdAt: Date.now(),
      lastMessageAt: Date.now(),
      status: 'idle'
    };

    this.saveSession(session);
    return session;
  }

  async sendMessage(sessionId: string, prompt: string, directory: string) {
    const session = this.getSession(sessionId);
    if (!session) throw new Error('Session not found');

    this.updateSession(sessionId, { status: 'running' });

    const response = query({
      prompt,
      options: {
        resume: sessionId,
        cwd: directory,
        model: "claude-sonnet-4-5-20250929",
        env: getAuthEnvironment(),
        includePartialMessages: true,
        hooks: this.createHooks(),
        canUseTool: this.createPermissionHandler(sessionId)
      }
    });

    this.activeQueries.set(sessionId, response);

    try {
      for await (const message of response) {
        this.forwardToRenderer(sessionId, message);

        if (message.type === 'result') {
          this.updateSession(sessionId, {
            status: 'idle',
            lastMessageAt: Date.now()
          });
          this.sendCompletionNotification(sessionId, message);
        }
      }
    } catch (error) {
      this.updateSession(sessionId, { status: 'error' });
      throw error;
    } finally {
      this.activeQueries.delete(sessionId);
    }
  }

  async interruptSession(sessionId: string) {
    const query = this.activeQueries.get(sessionId);
    if (query) {
      await query.interrupt();
      this.updateSession(sessionId, { status: 'idle' });
    }
  }

  private createHooks() {
    return {
      Notification: [{
        hooks: [async (input) => {
          if (input.hook_event_name === 'Notification') {
            this.sendNativeNotification(input.title, input.message, input.session_id);
          }
          return { continue: true };
        }]
      }],
      PermissionRequest: [{
        hooks: [async (input) => {
          if (input.hook_event_name === 'PermissionRequest') {
            this.updateSession(input.session_id, { status: 'awaiting_input' });
            this.sendInputRequiredNotification(input.session_id, input.tool_name);
          }
          return { continue: true };
        }]
      }]
    };
  }

  private createPermissionHandler(sessionId: string) {
    return async (toolName: string, input: unknown) => {
      // Forward to renderer for UI decision
      return new Promise((resolve) => {
        this.mainWindow.webContents.send('permission:request', {
          sessionId,
          toolName,
          input
        });

        // Wait for response from renderer
        // Implementation depends on IPC setup
      });
    };
  }

  private forwardToRenderer(sessionId: string, message: SDKMessage) {
    if (!this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('session:message', { sessionId, message });
    }
  }

  private sendNativeNotification(title: string | undefined, message: string, sessionId: string) {
    if (this.mainWindow.isFocused()) return;

    const notification = new Notification({
      title: title || 'Claude Code',
      body: message
    });

    notification.on('click', () => {
      this.mainWindow.show();
      this.mainWindow.focus();
      this.mainWindow.webContents.send('focus-session', sessionId);
    });

    notification.show();
  }

  private sendInputRequiredNotification(sessionId: string, toolName: string) {
    if (this.mainWindow.isFocused()) return;

    const notification = new Notification({
      title: 'Input Required',
      body: `Claude needs permission for: ${toolName}`,
      timeoutType: 'never'
    });

    notification.on('click', () => {
      this.mainWindow.show();
      this.mainWindow.focus();
      this.mainWindow.webContents.send('focus-session', sessionId);
    });

    notification.show();
  }

  private sendCompletionNotification(sessionId: string, result: SDKMessage) {
    if (this.mainWindow.isFocused()) return;

    const notification = new Notification({
      title: 'Task Complete',
      body: result.subtype === 'success' ? 'Claude finished the task' : 'Task ended with error'
    });

    notification.on('click', () => {
      this.mainWindow.show();
      this.mainWindow.focus();
      this.mainWindow.webContents.send('focus-session', sessionId);
    });

    notification.show();
  }

  // Storage methods
  private saveSession(session: SessionRecord) {
    const sessions = this.store.get('sessions', []);
    sessions.push(session);
    this.store.set('sessions', sessions);
  }

  private updateSession(id: string, updates: Partial<SessionRecord>) {
    const sessions = this.store.get('sessions', []);
    const index = sessions.findIndex(s => s.id === id);
    if (index >= 0) {
      sessions[index] = { ...sessions[index], ...updates };
      this.store.set('sessions', sessions);
    }
  }

  private getSession(id: string): SessionRecord | undefined {
    return this.store.get('sessions', []).find(s => s.id === id);
  }

  listSessions(): SessionRecord[] {
    return this.store.get('sessions', []).sort((a, b) => b.lastMessageAt - a.lastMessageAt);
  }
}

export { HiveSessionManager };
```

## SDK Message Types Reference

| Type | Subtype | Description | When Fired |
|------|---------|-------------|------------|
| `system` | `init` | Session initialized | Start of query |
| `system` | `compact_boundary` | Conversation compacted | After auto-compaction |
| `assistant` | - | Claude's response | After each turn |
| `stream_event` | - | Partial streaming | When `includePartialMessages: true` |
| `user` | - | User input | In streaming input mode |
| `result` | `success` | Task completed | End of query |
| `result` | `error_max_turns` | Turn limit reached | End of query |
| `result` | `error_during_execution` | Runtime error | End of query |
| `result` | `error_max_budget_usd` | Budget exceeded | End of query |

## Hook Events Reference

| Hook Event | Purpose | Hive Use Case |
|------------|---------|---------------|
| `Notification` | System notifications | Show macOS notification |
| `PermissionRequest` | Tool permission needed | Show permission dialog |
| `SessionStart` | Session begins | Log session start |
| `SessionEnd` | Session ends | Show completion notification |
| `PreToolUse` | Before tool executes | Log/audit tool usage |
| `PostToolUse` | After tool completes | Update UI with results |
| `Stop` | Query interrupted | Handle cancellation |

## External Resources

**Official Documentation:**
- [Claude Agent SDK TypeScript Reference](https://platform.claude.com/docs/en/agent-sdk/typescript)
- [Claude Agent SDK V2 Preview](https://platform.claude.com/docs/en/agent-sdk/typescript-v2-preview)
- [Claude Agent SDK Overview](https://platform.claude.com/docs/en/agent-sdk/overview)
- [Identity and Access Management](https://code.claude.com/docs/en/iam)

**npm Package:**
- [@anthropic-ai/claude-agent-sdk](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk)

**GitHub:**
- [Claude Agent SDK TypeScript](https://github.com/anthropics/claude-agent-sdk-typescript)
- [Claude Agent SDK Demos](https://github.com/anthropics/claude-agent-sdk-demos)

## Related Research

- [2025-12-15-hive-electron-app-research.md](./2025-12-15-hive-electron-app-research.md) - Electron architecture for Hive
