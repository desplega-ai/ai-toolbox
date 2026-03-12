---
title: Claude Code Hooks System - Deep Research
date: 2026-03-11
author: taras
status: complete
tags: [claude-code, hooks, plugins, CLAUDE_ENV_FILE]
---

# Claude Code Hooks System - Deep Research

## 1. CLAUDE_ENV_FILE

### How it works
- `CLAUDE_ENV_FILE` is an **environment variable** provided to hook scripts. It contains a **file path** where you write `export` statements.
- Any variables written to this file become available in **all subsequent Bash commands** Claude Code executes during the session.
- Format: standard shell `export` statements, one per line. Use append (`>>`) to preserve variables set by other hooks.

```bash
#!/bin/bash
if [ -n "$CLAUDE_ENV_FILE" ]; then
  echo 'export NODE_ENV=production' >> "$CLAUDE_ENV_FILE"
  echo 'export DEBUG_LOG=true' >> "$CLAUDE_ENV_FILE"
  echo 'export PATH="$PATH:./node_modules/.bin"' >> "$CLAUDE_ENV_FILE"
fi
exit 0
```

### Availability
- **SessionStart hooks ONLY.** The official docs explicitly state: _"CLAUDE_ENV_FILE is available for SessionStart hooks. Other hook types do not have access to this variable."_
- Only `type: "command"` hooks are supported for SessionStart.

### Known Bug (as of Dec 2025)
- GitHub issue [#15840](https://github.com/anthropics/claude-code/issues/15840): `CLAUDE_ENV_FILE` was reported as empty string in v2.0.76. The issue is labeled `bug` + `has repro`. Status: **open** (as of last check). This may have been fixed in later versions — worth testing.

### Timing relative to MCP server startup
- The official docs do NOT explicitly document the timing relationship between `CLAUDE_ENV_FILE` sourcing and MCP server startup.
- Based on the lifecycle order (SessionStart fires first, before any tool use), it's reasonable to assume env vars are sourced before Bash tool calls but the docs don't guarantee they're available to MCP servers. **This is uncertain — test empirically.**

### Advanced pattern: capture all env changes
```bash
#!/bin/bash
ENV_BEFORE=$(export -p | sort)
source ~/.nvm/nvm.sh
nvm use 20
if [ -n "$CLAUDE_ENV_FILE" ]; then
  ENV_AFTER=$(export -p | sort)
  comm -13 <(echo "$ENV_BEFORE") <(echo "$ENV_AFTER") >> "$CLAUDE_ENV_FILE"
fi
exit 0
```

---

## 2. Hook Event Type Detection

### How a hook script knows which event triggered it
Every hook receives JSON on **stdin** with a `hook_event_name` field. This is part of the **common input fields** present in ALL events.

**Common input fields (all events):**

| Field | Description |
|-------|-------------|
| `session_id` | Unique session identifier |
| `transcript_path` | Path to the session transcript JSONL file |
| `cwd` | Current working directory |
| `permission_mode` | Current permission mode (e.g., `"default"`) |
| `hook_event_name` | **The event that triggered this hook** (e.g., `"SessionStart"`, `"PostToolUse"`, `"Stop"`) |

So you do NOT need separate scripts per event. A single script can read `hook_event_name` from stdin JSON and branch accordingly.

Example (Python):
```python
import json, sys
data = json.load(sys.stdin)
event = data["hook_event_name"]  # "SessionStart", "PostToolUse", "Stop", etc.
```

Example (Bash):
```bash
EVENT=$(cat | jq -r '.hook_event_name')
```

### There is NO `CLAUDE_HOOK_EVENT` environment variable
Event detection is done purely through the stdin JSON payload, not environment variables.

---

## 3. Hook Registration in plugin.json

### Plugin hook location
Plugin hooks go in `hooks/hooks.json` inside the plugin directory (NOT in `plugin.json` itself). The `plugin.json` CAN contain hooks directly under a `"hooks"` key — both patterns work.

**Your existing base plugin uses hooks directly in plugin.json:**
```json
{
    "name": "desplega",
    "hooks": {
        "PreToolUse": [
            {
                "matcher": "Write|Edit",
                "hooks": [
                    {
                        "type": "command",
                        "command": "${CLAUDE_PLUGIN_ROOT}/hooks/validate-thoughts.py"
                    }
                ]
            }
        ]
    }
}
```

### Registration format for each event type

**SessionStart** — matcher filters by how session started:
```json
{
    "hooks": {
        "SessionStart": [
            {
                "matcher": "startup",
                "hooks": [
                    {
                        "type": "command",
                        "command": "${CLAUDE_PLUGIN_ROOT}/hooks/session-start.sh"
                    }
                ]
            }
        ]
    }
}
```
Valid matchers: `"startup"`, `"resume"`, `"clear"`, `"compact"`, `"*"` (all).

**PostToolUse** — matcher filters by tool name:
```json
{
    "hooks": {
        "PostToolUse": [
            {
                "matcher": "Write|Edit",
                "hooks": [
                    {
                        "type": "command",
                        "command": "${CLAUDE_PLUGIN_ROOT}/hooks/post-tool.py"
                    }
                ]
            }
        ]
    }
}
```
Valid matchers: tool names as regex — `"Bash"`, `"Edit|Write"`, `"mcp__.*"`, `"*"`.

**Stop** — **NO matcher support.** Always fires on every occurrence:
```json
{
    "hooks": {
        "Stop": [
            {
                "hooks": [
                    {
                        "type": "command",
                        "command": "${CLAUDE_PLUGIN_ROOT}/hooks/on-stop.py"
                    }
                ]
            }
        ]
    }
}
```

### Events with NO matcher support
These always fire: `UserPromptSubmit`, `Stop`, `TeammateIdle`, `TaskCompleted`, `WorktreeCreate`, `WorktreeRemove`, `InstructionsLoaded`.

### Events WITH matcher support
| Event | What matcher filters | Example values |
|-------|---------------------|----------------|
| `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `PermissionRequest` | tool name | `Bash`, `Edit\|Write`, `mcp__.*` |
| `SessionStart` | how session started | `startup`, `resume`, `clear`, `compact` |
| `SessionEnd` | why session ended | `clear`, `logout`, `prompt_input_exit`, `other` |
| `Notification` | notification type | `permission_prompt`, `idle_prompt`, `auth_success`, `elicitation_dialog` |
| `SubagentStart`, `SubagentStop` | agent type | `Bash`, `Explore`, `Plan`, custom names |
| `PreCompact` | what triggered | `manual`, `auto` |
| `ConfigChange` | config source | `user_settings`, `project_settings`, `local_settings`, `policy_settings`, `skills` |

---

## 4. Hook Stdin Payload by Event Type

### SessionStart
```json
{
  "session_id": "abc123",
  "transcript_path": "/Users/.../.claude/projects/.../uuid.jsonl",
  "cwd": "/Users/...",
  "permission_mode": "default",
  "hook_event_name": "SessionStart",
  "source": "startup",
  "model": "claude-sonnet-4-20250514",
  "agent_type": "agent-name"  // only present for subagents via `claude -a <name>`
}
```
- `source`: `"startup"`, `"resume"`, `"clear"`, or `"compact"`
- `model`: model identifier string
- `agent_type`: optional, only when session was started as a named agent
- Does NOT include tmux info in the payload.

### PreToolUse / PostToolUse
```json
{
  "session_id": "abc123",
  "transcript_path": "...",
  "cwd": "/Users/...",
  "permission_mode": "default",
  "hook_event_name": "PreToolUse",
  "tool_name": "Edit",
  "tool_input": {
    "file_path": "/path/to/file.ts",
    "old_string": "...",
    "new_string": "..."
  },
  "tool_use_id": "toolu_01ABC123..."
}
```
- PostToolUse additionally includes `tool_output` (the result of the tool execution).

### Stop
```json
{
  "session_id": "abc123",
  "transcript_path": "...",
  "cwd": "/Users/...",
  "permission_mode": "default",
  "hook_event_name": "Stop",
  "stop_hook_active": false,
  "last_assistant_message": "Here's what I did..."
}
```
- `stop_hook_active`: boolean — true if this Stop was triggered by another Stop hook (prevents infinite loops).
- `last_assistant_message`: the last message Claude produced before stopping.
- Stop hooks can return `{"decision": "block", "reason": "..."}` to prevent Claude from stopping.

### PostToolUseFailure
```json
{
  "session_id": "abc123",
  "hook_event_name": "PostToolUseFailure",
  "tool_name": "Bash",
  "tool_input": { "command": "npm test" },
  "tool_use_id": "toolu_01ABC123...",
  "error": "Command exited with non-zero status code 1",
  "is_interrupt": false
}
```

---

## 5. Hook Output Format

### Exit codes
- **0**: Success, allow operation to proceed
- **1**: Error (logged but operation continues)
- **2**: Block operation (stderr is fed back to Claude for correction)

### JSON stdout output
```json
{
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "additionalContext": "String added to Claude's context"
  }
}
```

### Decision control (for Stop hooks)
```json
{
  "decision": "block",
  "reason": "Cannot stop yet — unchecked verification items remain."
}
```

---

## 6. Key Environment Variables Available to Hooks

| Variable | Description | Available in |
|----------|-------------|-------------|
| `CLAUDE_ENV_FILE` | File path to write export statements | SessionStart only |
| `CLAUDE_PROJECT_DIR` | Project root directory | All hooks |
| `CLAUDE_PLUGIN_ROOT` | Plugin's root directory | Plugin hooks only |
| `CLAUDE_CODE_REMOTE` | `"true"` in remote/web environments | All hooks |
| `CLAUDE_SESSION_ID` | Current session ID (v2.1.9+) | Can be used in hook command strings via `${CLAUDE_SESSION_ID}` |

---

## 7. Local Codebase Reference

### Existing hook registrations
- **`cc-plugin/base/.claude-plugin/plugin.json`**: Registers `PreToolUse` hook with `"Write|Edit"` matcher running `validate-thoughts.py`
- **`~/.claude/settings.json`**: Registers hooks for `PreToolUse`, `PostToolUse`, `UserPromptSubmit`, `SessionStart`, `Stop` (all running `claude-code-wakatime`), and `Notification` (running `mac-notify.py` for `permission_prompt`, `idle_prompt`, `elicitation_dialog`)

### Existing hook scripts reading stdin JSON
- **`validate-thoughts.py`** (PreToolUse): `data = json.load(sys.stdin)`, reads `tool_name`, `tool_input`
- **`plan_checkbox_reminder.py`** (PostToolUse): reads `session_id`, `cwd`, `tool_input`
- **`plan_checkbox_stop.py`** (Stop): reads `session_id`, `cwd`, `stop_hook_active`

---

## Sources
- [Hooks reference - Claude Code Docs](https://code.claude.com/docs/en/hooks)
- [Claude Code power user customization: How to configure hooks](https://claude.com/blog/how-to-configure-hooks)
- [GitHub Issue #15840 - CLAUDE_ENV_FILE not provided to SessionStart hooks](https://github.com/anthropics/claude-code/issues/15840)
- [Claude Code Hooks: Complete Guide to All 12 Lifecycle Events](https://claudefa.st/blog/tools/hooks/hooks-guide)
