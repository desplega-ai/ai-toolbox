---
date: 2025-12-29T16:00:00Z
researcher: Claude
git_commit: 17a7d06865c06c0cd788888ce0296ad43c604792
branch: main
repository: ai-toolbox
topic: "Hive - Agent Client Protocol (ACP) Integration Research"
tags: [research, hive, acp, agent-client-protocol, claude-sdk, zed]
status: complete
last_updated: 2025-12-29
last_updated_by: Claude
related: ["2025-12-15-hive-claude-sdk-integration.md"]
---

# Research: Hive - Agent Client Protocol (ACP) Integration

**Date**: 2025-12-29T16:00:00Z
**Researcher**: Claude
**Git Commit**: 17a7d06865c06c0cd788888ce0296ad43c604792
**Branch**: main
**Repository**: ai-toolbox

## Research Question

How can the Agent Client Protocol (ACP) and `@zed-industries/claude-code-acp` be used to modify the current Claude Agent SDK implementation in Hive?

## Summary

The Agent Client Protocol (ACP) is a standardized JSON-RPC protocol for communication between AI agents and code editors. The `claude-code-acp` adapter wraps the Claude Agent SDK to expose it via ACP. Hive currently uses the Claude Agent SDK directly in its Electron main process.

**Key Finding**: ACP is designed for **external editor integrations** (stdio subprocess communication). Adopting it for Hive would mean spawning `claude --acp` as a subprocess and communicating via JSON-RPC instead of directly importing the SDK.

**Recommended Approach**: Replace direct SDK usage with ACP client mode to:
1. Simplify permission handling (use ACP's built-in flow)
2. Enable future multi-agent support (any ACP-compatible agent)
3. Standardize on an open protocol

## Detailed Findings

### 1. Agent Client Protocol (ACP) Overview

**Source**: https://agentclientprotocol.com/overview/agents

ACP defines a standardized communication framework between AI agents and code editors:

- **Transport**: stdio (subprocess), newline-delimited JSON-RPC messages
- **Lifecycle**: Session creation → Prompt turns → Session updates → Completion
- **Messages**: Bidirectional with `session/prompt` requests and `session/update` notifications

#### ACP Message Flow
```
Client                           Agent
  |                                |
  |-- session/create ------------->|
  |<-- session/created ------------|
  |-- session/prompt ------------->|
  |<-- session/update (plan) ------|
  |<-- session/update (text) ------|
  |<-- session/update (tool_call) -|
  |<-- session/request_permission -|
  |-- session/grant_permission --->|
  |<-- session/update (completed) -|
  |<-- response (stop_reason) -----|
```

#### Key ACP Types
- **ContentBlock**: text, images, tool_use, tool_result
- **ToolCall**: id, name, input, status (pending/in_progress/completed)
- **StopReason**: end_turn, max_tokens, cancelled, refusal

#### Prompt Turn Lifecycle (from https://agentclientprotocol.com/protocol/prompt-turn)

1. **User Message**: Client sends `session/prompt` with user input
2. **Agent Processing**: Agent processes message through language model
3. **Agent Reports Output**: Agent sends `session/update` notifications with plan, text, tool calls
4. **Completion Check**: If no pending tools, Agent responds with `StopReason`
5. **Tool Invocation**: Agent may request permission via `session/request_permission`
6. **Conversation Continuation**: Results return to language model; cycle repeats

### 2. TypeScript ACP SDK

**Source**: https://agentclientprotocol.com/libraries/typescript

```bash
npm install @agentclientprotocol/sdk
```

**Core Components**:
- `AgentSideConnection`: Class for building agent servers
- `ClientSideConnection`: Class for building client implementations

**Usage**: The SDK provides both agent and client patterns. For Hive, we'd use `ClientSideConnection` to connect to the claude-code-acp subprocess.

### 3. claude-code-acp Adapter

**Repository**: https://github.com/zed-industries/claude-code-acp

The adapter bridges Claude Code SDK to ACP protocol:

#### Dependencies
```json
{
  "@agentclientprotocol/sdk": "0.12.0",
  "@anthropic-ai/claude-agent-sdk": "0.1.73",
  "@modelcontextprotocol/sdk": "1.25.1"
}
```

#### Architecture
1. Receives ACP `session/prompt` requests
2. Converts to Claude SDK user messages
3. Calls `query()` from Claude SDK
4. Converts SDK messages to ACP `session/update` notifications
5. Handles permission via `session/request_permission`

#### Supported Features
- Context mentions and image attachments
- Tool execution with permission requests
- Edit review and TODO list management
- Interactive and background terminal access
- Custom slash commands
- Client-side MCP server integration

#### Message Conversion (SDK → ACP)
```
SDKMessage (Claude SDK)     →     ACP Notification
───────────────────────────────────────────────────
SDKInitMessage              →     (internal setup)
SDKAssistantMessage         →     session/update (text/tool_call)
SDKUserMessage              →     (internal - tool results)
SDKResultMessage            →     response with StopReason
SDKStreamEvent              →     session/update (streaming text)
```

### 4. Current Hive Architecture

**File**: `src/main/session-manager.ts`

Hive currently uses the Claude Agent SDK directly:

```typescript
import { query, type Query, type PermissionResult, type CanUseTool } from '@anthropic-ai/claude-agent-sdk';

const response = query({
  prompt,
  options: {
    cwd,
    model: 'claude-opus-4-5',
    resume: existingClaudeSessionId,
    env: getAuthEnvironment(),
    abortController,
    includePartialMessages: true,
    systemPrompt: { type: 'preset', preset: 'claude_code' },
    tools: { type: 'preset', preset: 'claude_code' },
    permissionMode: effectivePermissionMode,
    canUseTool,  // Custom permission callback
    pathToClaudeCodeExecutable: claudeExecutable,
  },
});

for await (const message of response) {
  this.sendMessage(hiveSessionId, message);
}
```

#### Current Permission Flow
1. `canUseTool` callback intercepts tool requests
2. Check permission mode (bypass/acceptEdits/plan/default)
3. Hash-based pre-approval lookup in SQLite
4. If not approved: store pending, deny, send IPC to renderer
5. User approves via UI → session resumes with pre-approval

### 5. Integration Options Analysis

#### Option A: Full ACP Client Mode (Recommended)

**How it works**: Hive spawns `claude --acp` as a subprocess and communicates via stdio JSON-RPC.

**Pros**:
- Standard protocol, future-proof
- Can use any ACP-compatible agent (Gemini CLI, OpenHands, etc.)
- Isolates agent process from Electron
- Simpler permission handling (ACP's built-in flow)

**Cons**:
- Loss of direct SDK control (`canUseTool` callback)
- Additional process management complexity

**Changes Required**:
1. Add `@agentclientprotocol/sdk` dependency
2. Create `ACPSessionManager` in main process
3. Spawn claude subprocess with `--acp` flag
4. Convert IPC messages to/from ACP format
5. Simplify permission system to use ACP flow

#### Option B: Hybrid - Keep SDK, Add ACP Server Interface

**How it works**: Keep current SDK integration for desktop UI, expose ACP server for external clients.

**Pros**: Best of both worlds, external editors can connect
**Cons**: More code to maintain, two interfaces

#### Option C: Adopt ACP Message Format Internally

**How it works**: Keep Claude SDK but convert messages to ACP format internally.

**Pros**: Standardized message types
**Cons**: Conversion overhead, doesn't enable external integrations

### 6. Recommended Implementation Plan

Based on user requirements (replace SDK, simplify permissions), **Option A is recommended**.

#### Dependencies Changes

**Add:**
```json
"@agentclientprotocol/sdk": "^1.0.0"
```

**Remove:**
```json
"@anthropic-ai/claude-agent-sdk": "^0.1.69"
```

#### Architecture Change

**Current:**
```
Renderer → IPC → SessionManager → query() from SDK
               → canUseTool callback blocks
               → store pending in SQLite
               → user approves via UI → resume
```

**New:**
```
Renderer → IPC → ACPSessionManager
               → spawn 'claude --acp' subprocess
               → ClientSideConnection wraps stdio
               → connection.newSession() / prompt()
               → requestPermission callback → forward to renderer
               → return outcome to ACP
```

#### Key Implementation Code

**Spawn Claude with ACP Mode:**
```typescript
private spawnClaudeProcess(cwd: string): ChildProcess {
  const claudePath = this.findClaudeExecutable();
  return spawn(claudePath, ["--acp"], {
    cwd,
    stdio: ["pipe", "pipe", "inherit"],
    env: getAuthEnvironment(),
  });
}
```

**ACP Connection Setup:**
```typescript
const input = Writable.toWeb(agentProcess.stdin);
const output = Readable.toWeb(agentProcess.stdout);
const stream = acp.ndJsonStream(input, output);

const client = this.createClient(hiveSessionId);
const connection = new acp.ClientSideConnection((_agent) => client, stream);

await connection.initialize({
  protocolVersion: acp.PROTOCOL_VERSION,
  clientCapabilities: {
    fs: { readTextFile: true, writeTextFile: true },
    terminal: true,
  },
});
```

**Simplified Permission Flow:**
```typescript
async requestPermission(params: acp.RequestPermissionRequest) {
  // Forward to renderer
  this.mainWindow.webContents.send("session:permission-request", {
    id: params.toolCall.toolCallId,
    toolName: params.toolCall.title,
    input: params.toolCall.rawInput,
  });

  // Wait for user response
  return new Promise((resolve) => {
    this.pendingResolvers.set(params.toolCall.toolCallId, (outcome) => {
      resolve({ outcome: { outcome: "selected", optionId: outcome } });
    });
  });
}
```

**Message Mapping (ACP → SDK for UI compatibility):**
```
ACP Update                → SDK Message Type
───────────────────────────────────────────
agent_message_chunk       → SDKStreamEvent
tool_call                 → SDKAssistantMessage (tool_use)
tool_call_update          → SDKUserMessage (tool_result)
current_mode_update       → SDKInitMessage
```

#### Implementation Phases

**Phase 1: Add ACP Infrastructure**
1. Install `@agentclientprotocol/sdk`
2. Create `src/shared/acp-types.ts`
3. Create empty `src/main/acp-session-manager.ts`

**Phase 2: Implement ACPSessionManager**
1. `spawnClaudeProcess()` - spawn claude with `--acp` flag
2. Connection setup with `ClientSideConnection`
3. `HiveACPClient.sessionUpdate()` - convert to SDKMessage
4. `HiveACPClient.requestPermission()` - forward to renderer
5. `startSession()` with new/resume flow
6. `interruptSession()` using `connection.cancel()`

**Phase 3: Wire Up IPC**
1. Update `ipc-handlers.ts` to use `ACPSessionManager`
2. Update permission handlers to call `resolvePermission()`
3. Test basic prompt flow

**Phase 4: Edge Cases**
1. Handle subprocess crashes
2. Handle connection errors
3. Test session resume
4. Test permission modes

**Phase 5: Remove Old Code**
1. Delete `session-manager.ts`
2. Remove `@anthropic-ai/claude-agent-sdk`
3. Clean up unused imports

## Code References

| Component | Path | Lines |
|-----------|------|-------|
| Current SDK Integration | `src/main/session-manager.ts` | All (776) |
| Permission Callback | `src/main/session-manager.ts` | 150-236 |
| Message Types | `src/shared/sdk-types.ts` | All (142) |
| IPC Handlers | `src/main/ipc-handlers.ts` | - |
| Database Schema | `src/main/database.ts` | - |
| Permission UI | `src/renderer/components/views/SessionView.tsx` | - |
| Package Dependencies | `package.json` | 63 |

## External Resources

**ACP Documentation:**
- [ACP Overview](https://agentclientprotocol.com/overview/agents)
- [ACP Protocol - Prompt Turns](https://agentclientprotocol.com/protocol/prompt-turn)
- [ACP Protocol - Transports](https://agentclientprotocol.com/protocol/transports)
- [ACP TypeScript SDK](https://agentclientprotocol.com/libraries/typescript)

**GitHub Repositories:**
- [claude-code-acp](https://github.com/zed-industries/claude-code-acp) - Zed's ACP adapter
- [ACP TypeScript SDK](https://github.com/agentclientprotocol/typescript-sdk)

**npm Packages:**
- [@agentclientprotocol/sdk](https://www.npmjs.com/package/@agentclientprotocol/sdk)
- [@anthropic-ai/claude-agent-sdk](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk)

## Related Research

- [2025-12-15-hive-claude-sdk-integration.md](./2025-12-15-hive-claude-sdk-integration.md) - Current SDK integration patterns
