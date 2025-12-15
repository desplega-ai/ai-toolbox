---
date: 2025-12-15T00:30:00Z
researcher: Claude
git_commit: 51d3d876ba8db6861e119de29c3ed1964f588292
branch: main
repository: ai-toolbox
topic: "Hive Claude CLI Integration (Supersedes SDK Approach)"
tags: [research, hive, claude-cli, tauri, shell-plugin, streaming]
status: superseded
superseded_by: "2025-12-15-hive-electron-app-research.md"
superseded_reason: "Hive is now using Electron instead of Tauri. CLI integration approach differs."
last_updated: 2025-12-15
last_updated_by: Claude
last_updated_note: "Marked as superseded - switching to Electron approach"
supersedes: thoughts/shared/research/2025-12-14-claude-agent-sdk-session-lifecycle.md
---

> **SUPERSEDED**: This research has been superseded by [Hive Electron App Research](./2025-12-15-hive-electron-app-research.md).
>
> **Reason**: Hive is now being built with Electron instead of Tauri. The CLI integration approach (using Tauri's shell plugin) is no longer applicable. Electron uses Node.js child processes directly.
>
> This document is preserved for historical context.

# Research: Hive Claude CLI Integration

**Date**: 2025-12-15T00:30:00Z
**Researcher**: Claude
**Git Commit**: 51d3d876ba8db6861e119de29c3ed1964f588292
**Branch**: main
**Repository**: ai-toolbox

## Research Question

How does Hive integrate with Claude Code now that we're using the CLI directly instead of the Claude Agent SDK?

## Summary

The Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) requires a Node.js runtime which is not available in Tauri's WebView environment. Instead, Hive spawns the `claude` CLI as a child process using Tauri's shell plugin. This approach provides the same streaming capabilities through the `--output-format stream-json` flag.

**Key Change**: The SDK research document (`2025-12-14-claude-agent-sdk-session-lifecycle.md`) is no longer applicable to Hive's implementation. The programmatic SDK APIs (`query()`, `createSession()`, etc.) cannot be used in a browser/WebView context.

---

## Why Not the SDK?

### The Problem

When attempting to use the Claude Agent SDK in Hive's React frontend:

```typescript
import { query } from '@anthropic-ai/claude-agent-sdk'
// ERROR: TypeError: (0, import_crypto.randomUUID) is not a function
```

**Root Cause**: The SDK uses Node.js APIs like `crypto.randomUUID()` that don't exist in browser environments. Tauri's frontend runs in a WebView (essentially a browser), not Node.js.

### The Solution

Spawn the `claude` CLI as a child process from Tauri's Rust backend, streaming JSON output back to the frontend.

---

## Current Implementation
<!-- hive-comment(uQ_FLewPVV): wtf -->

<!-- hive-comment(uQ_FLewPVV) -->
### Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Hive (Tauri App)                      │
├─────────────────────────────────────────────────────────┤
│  Frontend (React in WebView)                             │
│  ┌─────────────────────────────────────────────────────┐│
│  │ claude-session.ts                                    ││
│  │ - Command.create('claude', [...args])               ││
│  │ - Parses stream-json stdout                         ││
│  │ - Provides callbacks for messages                   ││
│  └─────────────────────────────────────────────────────┘│
│                          │                               │
│                          ▼                               │
│  ┌─────────────────────────────────────────────────────┐│
│  │ Tauri Shell Plugin (Rust)                           ││
│  │ - Spawns child process                              ││
│  │ - Streams stdout/stderr to frontend                 ││
│  │ - Handles process lifecycle                         ││
│  └─────────────────────────────────────────────────────┘│
│                          │                               │
└──────────────────────────│──────────────────────────────┘
                           ▼
                    ┌─────────────┐
                    │ claude CLI  │
                    │ (system)    │
                    └─────────────┘
```

### File Location

`hive/src/lib/claude-session.ts`

---

## CLI Options Used

### Starting a New Session

```typescript
const command = Command.create('claude', [
  '--output-format', 'stream-json',  // JSON output per line
  '--print', 'all',                   // Print all message types
  '-p', prompt                        // The user's prompt
], { cwd: projectPath })              // Working directory
```

### Resuming an Existing Session

```typescript
const command = Command.create('claude', [
  '--output-format', 'stream-json',
  '--print', 'all',
  '--resume', sessionId,              // Resume by session ID
  '-p', prompt
])
```

### CLI Option Reference

| Option | Description |
|--------|-------------|
| `--output-format stream-json` | Outputs JSON objects, one per line, as events occur |
| `--print` / `-p` | Non-interactive mode - prints response and exits |
| `--print all` | Include all message types in output |
| `--resume <session_id>` | Resume a previous session by ID |
| `--continue` / `-c` | Continue the most recent conversation |
| `--model <model>` | Specify model (e.g., 'sonnet', 'opus') |
| `--permission-mode <mode>` | Set permission mode (default, acceptEdits, bypassPermissions, plan) |
| `--max-budget-usd <amount>` | Maximum dollar amount to spend |
| `--allowed-tools <tools>` | Comma-separated list of allowed tools |

---

## Message Format (stream-json)

Each line of stdout is a JSON object. The key message types:

### System Init Message

```json
{
  "type": "system",
  "subtype": "init",
  "session_id": "abc123-def456-...",
  "cwd": "/path/to/project",
  "model": "claude-sonnet-4-5-20250514",
  "tools": ["Read", "Write", "Edit", "Bash", ...],
  "permissionMode": "default"
}
```

### User Message

```json
{
  "type": "user",
  "message": {
    "role": "user",
    "content": "Help me build a feature"
  }
}
```

### Assistant Message

```json
{
  "type": "assistant",
  "message": {
    "role": "assistant",
    "content": [
      { "type": "text", "text": "I'll help you with that..." },
      { "type": "tool_use", "name": "Read", "input": { "file_path": "..." } }
    ]
  }
}
```

### Result Message

```json
{
  "type": "result",
  "subtype": "success",
  "duration_ms": 15000,
  "total_cost_usd": 0.0234,
  "num_turns": 3
}
```

---

## Hive's Message Type

The implementation normalizes CLI output to a simpler format:

```typescript
export interface ClaudeMessage {
  type: 'system' | 'user' | 'assistant' | 'result'
  subtype?: string
  session_id?: string
  content?: string
  tool_name?: string
  duration_ms?: number
  total_cost_usd?: number
}
```

---

## Session Management

### Session IDs

- Captured from the `system` message with `subtype: 'init'`
- Stored in React state for session resume
- Format: UUID string (e.g., `"2036c0a3-afe8-4053-b24b-5ceac4aae26f"`)

### Session Persistence

Sessions are still stored by the CLI in:
```
~/.claude/projects/[encoded-directory-path]/*.jsonl
```

Hive doesn't need to manage this - the CLI handles persistence automatically.

### Resume Flow

1. User sends a message in an existing session
2. Hive checks if `sessionId` exists in state
3. If yes, spawns CLI with `--resume <sessionId>`
4. CLI loads session history and continues conversation

---

## Tauri Configuration

### Cargo.toml Dependencies

```toml
[dependencies]
tauri-plugin-shell = "2"
```

### lib.rs Plugin Registration

```rust
tauri::Builder::default()
    .plugin(tauri_plugin_shell::init())
    // ... other plugins
```

### Capabilities (default.json)

```json
{
  "permissions": [
    "shell:default",
    {
      "identifier": "shell:allow-spawn",
      "allow": [
        {
          "name": "claude",
          "cmd": "claude",
          "args": true
        }
      ]
    },
    "shell:allow-stdin-write",
    "shell:allow-kill"
  ]
}
```

---

## Event Handling

### Stdout Processing

```typescript
command.stdout.on('data', (line: string) => {
  if (!line.trim()) return

  try {
    const parsed = JSON.parse(line)

    // Capture session ID
    if (parsed.type === 'system' && parsed.subtype === 'init') {
      callbacks.onSessionId(parsed.session_id)
    }

    // Forward parsed message
    const message = parseClaudeMessage(parsed)
    if (message) {
      callbacks.onMessage(message)
    }
  } catch {
    // Non-JSON output (rare)
    console.log('Non-JSON output:', line)
  }
})
```

### Process Lifecycle

```typescript
command.on('close', (data) => {
  if (data.code !== 0 && data.code !== null) {
    callbacks.onError(new Error(`Claude exited with code ${data.code}`))
  } else {
    callbacks.onComplete()
  }
})

command.on('error', (error: string) => {
  callbacks.onError(new Error(error))
})
```

---

## Comparison: SDK vs CLI

| Aspect | SDK Approach | CLI Approach (Current) |
|--------|--------------|------------------------|
| **Runtime** | Requires Node.js | Works in any environment |
| **Integration** | Direct TypeScript API | Spawn child process |
| **Streaming** | AsyncGenerator | stdout line-by-line |
| **Session resume** | `options.resume` | `--resume` flag |
| **Session forking** | `options.forkSession` | `--fork-session` flag |
| **Permissions** | Programmatic callbacks | CLI handles interactively |
| **Tauri compatible** | No (needs Node.js) | Yes |

---

## Limitations

1. **Permission prompts**: The CLI handles permissions interactively. In `-p` (print) mode, it skips the workspace trust dialog. For tool permissions, we may need to use `--permission-mode` options.

2. **No programmatic permission callbacks**: Unlike the SDK's `canUseTool` callback, we can't intercept permission requests programmatically.

3. **Process management**: Each message spawns a new process. For long conversations, this is fine since `--resume` maintains context.

---

## Future Considerations

### Interactive Mode

For real-time permission handling, consider:
- Using `--input-format stream-json` for bidirectional communication
- Implementing a custom permission proxy

### Session Forking

The CLI supports `--fork-session` flag for creating branches:
```bash
claude --resume <id> --fork-session -p "Try a different approach"
```

This creates a new session ID while preserving the original.

---

## Code References

- `hive/src/lib/claude-session.ts` - Main session management
- `hive/src/hooks/useSession.ts` - React hook for session state
- `hive/src-tauri/capabilities/default.json` - Shell permissions
- `hive/src-tauri/src/lib.rs` - Plugin registration

## Related Research

- [Hive macOS App Research](./2025-12-14-hive-macos-app-research.md) - Original architecture (references SDK - now outdated for integration approach)
- [Tauri Window Management](./2025-12-14-tauri-window-management-patterns.md) - Still applicable

## Superseded Research

- [Claude Agent SDK Session Lifecycle](./2025-12-14-claude-agent-sdk-session-lifecycle.md) - **Not applicable to Hive** due to Node.js runtime requirement. The session concepts (resume, forking, persistence) still apply, but via CLI flags instead of SDK APIs.
