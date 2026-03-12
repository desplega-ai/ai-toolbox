---
date: 2026-03-11T18:00:00Z
author: claude
topic: "Inter-Session Communication — Teams Plugin"
tags: [plan, mcp, hooks, sqlite, tmux, inter-session, claude-code, plugin]
status: ready
autonomy: autopilot
source_research: thoughts/taras/research/2026-03-11-inter-session-communication-unified.md
source_brainstorm: thoughts/taras/brainstorms/2026-03-11-inter-session-communication.md
---

# Inter-Session Communication — Teams Plugin Implementation Plan

## Overview

Build a new `cc-plugin/teams/` plugin that enables Claude Code sessions to discover each other, exchange messages, and coordinate work. Sessions register themselves via hooks into a shared SQLite database, and communicate through an MCP stdio server that provides tools for listing sessions, sending messages, and reading incoming messages. Message delivery to tmux panes provides real-time notification.

## Current State Analysis

- **6 plugins exist** in `cc-plugin/`: base, swarm, wts, brain, file-review, remarkable
- **Only base has hooks** — Python scripts registered in plugin.json (`cc-plugin/base/.claude-plugin/plugin.json:13-25`)
- **No plugin has an MCP server** — this will be the first MCP registration in a plugin manifest
- **Hook pattern established**: Python scripts read JSON from stdin, exit 0 (pass) or 2 (block), use `${CLAUDE_PLUGIN_ROOT}` for paths
- **Plugin manifest format** is well-established: name, description, version, author, hooks, etc.
- **Slug generation, SQLite WAL, tmux send-keys** patterns are fully researched (see source research doc)

### Key Discoveries:
- Inline `mcpServers` in plugin.json is **broken** (GitHub #16143) — must use separate `.mcp.json` at plugin root instead
- Hooks receive `session_id`, `cwd`, `hook_event_name` via stdin JSON — sufficient for session registry
- `CLAUDE_ENV_FILE` has a known bug (#15840) — fallback to TMUX_PANE-based SQLite lookup is planned
- Vim mode is in `~/.claude.json` → `editorMode === "vim"` — verified on Taras's machine
- `PostToolUse` fires on every tool call — must throttle heartbeat to avoid SQLite write storms

## Desired End State

A working `teams` plugin where:
1. Every Claude Code session automatically registers itself with a human-readable slug (e.g., `bold-eagle-1337`)
2. Sessions can discover each other via `list-sessions` MCP tool
3. Sessions can send typed messages (action/info/status) to other sessions
4. Messages are delivered to recipient's tmux pane via `send-keys`
5. Stale sessions are automatically cleaned up after 10 minutes of inactivity
6. The plugin installs via `/plugin install teams@desplega-ai-toolbox`

**Verification**: Start 2+ Claude sessions in tmux, confirm each gets a slug, send a message between them, verify delivery.

## Quick Verification Reference

Common commands to verify the implementation:
- `python3 -c "import cc-plugin.teams..."` — won't work (not a package), use direct script invocation
- `echo '{}' | python3 cc-plugin/teams/hooks/session-registry.py` — test hook with mock input
- `echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' | python3 cc-plugin/teams/mcp/server.py` — test MCP handshake
- `sqlite3 ~/.desplega/desplega.db ".tables"` — verify DB schema creation
- `sqlite3 ~/.desplega/desplega.db "SELECT * FROM sessions"` — inspect session registry

Key files to check:
- `cc-plugin/teams/.claude-plugin/plugin.json` — plugin manifest (hooks only)
- `cc-plugin/teams/.mcp.json` — MCP server registration
- `cc-plugin/teams/hooks/session-registry.py` — session lifecycle hook
- `cc-plugin/teams/mcp/server.py` — MCP stdio server entry point
- `cc-plugin/teams/mcp/db.py` — SQLite database module
- `cc-plugin/teams/mcp/slugs.py` — slug generation
- `cc-plugin/teams/mcp/tmux.py` — tmux send-keys helper

## What We're NOT Doing

- **qmd / thoughts tracking** — orthogonal feature, not part of teams
- **Network messaging** — all sessions assumed on the same machine
- **Non-tmux environments** — requires tmux; no bare terminal support
- **Background message polling thread** — deferred to a later iteration; initial version uses on-demand `read-messages`. **Implication**: tmux send-keys on `send-message` is the only push mechanism. If the recipient is mid-execution and the terminal buffer scrolls, the text may be lost. Recipient must proactively call `read-messages` to see stored messages.
- **Auto-allow permissions** — plugin can't auto-allow MCP tools; users approve on first use or pre-configure

## Implementation Approach

Four phases, each independently testable:

1. **Scaffold + Core Modules** — directory structure, plugin.json, SQLite database module, slug generation
2. **Session Registry Hook** — the Python hook that handles SessionStart/PostToolUse/Stop events
3. **MCP Stdio Server** — JSON-RPC 2.0 server with all 5 tools + tmux delivery
4. **Integration & Documentation** — README, E2E testing, permissions guidance

Each phase builds on the previous one's modules. The hook and MCP server share `db.py` and `slugs.py` but are otherwise independent processes.

---

## Phase 1: Scaffold & Core Modules

### Overview

Create the `cc-plugin/teams/` directory structure, write the plugin manifest, and implement the shared Python modules (database, slugs) that both the hook and MCP server depend on.

### Changes Required:

#### 1. Directory Structure
**Action**: Create the following directories
```
cc-plugin/teams/
├── .claude-plugin/
├── .mcp.json
├── hooks/
└── mcp/
```

#### 2. Plugin Manifest
**File**: `cc-plugin/teams/.claude-plugin/plugin.json`
**Changes**: New file. Register three hook events (SessionStart, PostToolUse, Stop) pointing to `session-registry.py`. **Note:** MCP server is registered separately in `.mcp.json` (see item 2b below) — inline `mcpServers` in plugin.json is buggy (GitHub #16143).

```json
{
    "name": "teams",
    "description": "Inter-session communication for Claude Code — session registry, messaging, and coordination",
    "version": "0.1.0",
    "author": {
        "name": "desplega.ai",
        "email": "contact@desplega.ai"
    },
    "repository": "https://github.com/desplega-ai/ai-toolbox",
    "keywords": ["teams", "sessions", "communication", "mcp"],
    "license": "MIT",
    "hooks": {
        "SessionStart": [
            {
                "matcher": "*",
                "hooks": [{
                    "type": "command",
                    "command": "${CLAUDE_PLUGIN_ROOT}/hooks/session-registry.py"
                }]
            }
        ],
        "PostToolUse": [
            {
                "matcher": "*",
                "hooks": [{
                    "type": "command",
                    "command": "${CLAUDE_PLUGIN_ROOT}/hooks/session-registry.py"
                }]
            }
        ],
        "Stop": [
            {
                "hooks": [{
                    "type": "command",
                    "command": "${CLAUDE_PLUGIN_ROOT}/hooks/session-registry.py"
                }]
            }
        ]
    }
}
```

#### 2b. MCP Server Registration
**File**: `cc-plugin/teams/.mcp.json`
**Changes**: New file at plugin root (sibling to `.claude-plugin/`). This is the proven working approach — inline `mcpServers` in plugin.json is broken per GitHub #16143 (field stripped during manifest parsing).

```json
{
    "mcpServers": {
        "desplega-comms": {
            "command": "python3",
            "args": ["${CLAUDE_PLUGIN_ROOT}/mcp/server.py"]
        }
    }
}
```

#### 3. SQLite Database Module
**File**: `cc-plugin/teams/mcp/db.py`
**Changes**: New file. Implements:
- `DB_PATH = ~/.desplega/desplega.db`
- `SCHEMA_VERSION = 1` with migration support
- `get_db()` context manager — WAL mode, 30s busy timeout, row factory
- `_ensure_schema()` — creates `_meta`, `sessions`, `messages` tables with indexes
- Schema exactly as defined in research doc Section 3

#### 4. Slug Generation Module
**File**: `cc-plugin/teams/mcp/slugs.py`
**Changes**: New file. Implements:
- `ADJECTIVES` (50 words), `NOUNS` (50 words), `FUNNY_NUMBERS` (50 values)
- `generate_slug()` → `"adjective-noun-number"` format
- `generate_unique_slug(existing: set[str])` with retry loop + fallback


### Success Criteria:

#### Automated Verification:
- [ ] Directory structure exists: `ls -la cc-plugin/teams/.claude-plugin/ cc-plugin/teams/hooks/ cc-plugin/teams/mcp/`
- [ ] Plugin manifest is valid JSON: `python3 -c "import json; json.load(open('cc-plugin/teams/.claude-plugin/plugin.json'))"`
- [ ] MCP config is valid JSON: `python3 -c "import json; d=json.load(open('cc-plugin/teams/.mcp.json')); assert 'mcpServers' in d; assert 'desplega-comms' in d['mcpServers']; print('OK')"`
- [ ] DB module creates database: `python3 -c "import sys; sys.path.insert(0, 'cc-plugin/teams/mcp'); from db import get_db; db = get_db().__enter__(); print(db.execute('SELECT name FROM sqlite_master WHERE type=\"table\"').fetchall())"`
- [ ] Slug generation works: `python3 -c "import sys; sys.path.insert(0, 'cc-plugin/teams/mcp'); from slugs import generate_slug, generate_unique_slug; s = generate_slug(); print(s); assert len(s.split('-')) == 3; u = generate_unique_slug({s}); print(u); assert u != s"`
- [ ] Schema has correct tables: `sqlite3 ~/.desplega/desplega.db ".tables"` shows `_meta messages sessions`

#### Manual Verification:
- [ ] Inspect `~/.desplega/desplega.db` schema matches research doc
- [ ] Verify WAL mode is active: `sqlite3 ~/.desplega/desplega.db "PRAGMA journal_mode"` returns `wal`
- [ ] Review plugin.json structure matches existing plugin conventions (compare with base plugin.json)

**Implementation Note**: After completing this phase, pause for manual confirmation before proceeding.

---

## Phase 2: Session Registry Hook

### Overview

Implement the single hook script that handles all three lifecycle events (SessionStart, PostToolUse, Stop). On SessionStart, it registers or updates the session in SQLite with a unique slug. On PostToolUse, it sends a throttled heartbeat. On Stop, it removes the session.

### Changes Required:

#### 1. Session Registry Hook
**File**: `cc-plugin/teams/hooks/session-registry.py`
**Changes**: New file. Must include `#!/usr/bin/env python3` shebang on line 1 and be made executable (`chmod +x`). Single script, dispatches on `hook_event_name` from stdin JSON.

**SessionStart handler:**
- Read `session_id`, `cwd`, `source` from stdin
- Detect `TMUX_PANE` from environment — if unset, log warning to stderr and store `tmux_pane = NULL` (session still registers but messaging won't work)
- Detect vim mode from `~/.claude.json`
- Check if session already exists (resume case) — preserve existing slug
- If new: generate unique slug, INSERT into sessions table
- If existing: UPDATE directory, tmux_pane, vim_mode, last_heartbeat
- Write `DESPLEGA_SESSION_ID` and `DESPLEGA_SLUG` to `CLAUDE_ENV_FILE` (if available)
- Output JSON with `hookSpecificOutput.additionalContext` containing the slug assignment message

**PostToolUse handler:**
- Read `session_id` from stdin
- Check throttle file (`/tmp/desplega-heartbeat-{session_id}`)
- If throttled (< 60s since last): exit immediately
- If not throttled: UPDATE last_heartbeat, opportunistically purge stale sessions (> 10 min)

**Stop handler:**
- Read `session_id` from stdin
- DELETE session from sessions table
- Clean up undelivered messages to this session
- Remove throttle temp file

**Shared logic:**
- `sys.path.insert(0, mcp_dir)` to import `db` and `slugs` modules
- Read JSON from stdin
- Vim mode detection: read `~/.claude.json` → check `editorMode === "vim"`

### Success Criteria:

#### Automated Verification:
- [ ] SessionStart registration works: `echo '{"session_id":"test-001","cwd":"/tmp","hook_event_name":"SessionStart","source":"startup","model":"opus"}' | python3 cc-plugin/teams/hooks/session-registry.py && sqlite3 ~/.desplega/desplega.db "SELECT slug, session_id, directory FROM sessions WHERE session_id='test-001'"`
- [ ] Resume preserves slug: `echo '{"session_id":"test-001","cwd":"/tmp/new","hook_event_name":"SessionStart","source":"resume","model":"opus"}' | python3 cc-plugin/teams/hooks/session-registry.py && sqlite3 ~/.desplega/desplega.db "SELECT slug, directory FROM sessions WHERE session_id='test-001'"` — slug unchanged, directory updated
- [ ] Heartbeat throttle works: Run PostToolUse twice in quick succession, second should not update DB: `echo '{"session_id":"test-001","hook_event_name":"PostToolUse","tool_name":"Read"}' | python3 cc-plugin/teams/hooks/session-registry.py`
- [ ] Stop cleanup works: `echo '{"session_id":"test-001","hook_event_name":"Stop"}' | python3 cc-plugin/teams/hooks/session-registry.py && sqlite3 ~/.desplega/desplega.db "SELECT count(*) FROM sessions WHERE session_id='test-001'"` — returns 0
- [ ] Hook exits 0 on success: `echo '{"session_id":"test-002","cwd":"/tmp","hook_event_name":"SessionStart","source":"startup"}' | python3 cc-plugin/teams/hooks/session-registry.py; echo "exit: $?"`
- [ ] Script has shebang and is executable: `head -1 cc-plugin/teams/hooks/session-registry.py | grep -q 'python3' && test -x cc-plugin/teams/hooks/session-registry.py && echo "OK"`

#### Manual Verification:
- [ ] Start a real Claude Code session with the plugin installed, check DB has a session row with a valid slug
- [ ] Resume the session (`/clear`), verify the slug is preserved
- [ ] End the session, verify the session row is removed from DB

**Implementation Note**: After completing this phase, clean up test data: `sqlite3 ~/.desplega/desplega.db "DELETE FROM sessions WHERE session_id LIKE 'test-%'"`. Pause for manual confirmation.

---

## Phase 3: MCP Stdio Server

### Overview

Implement the pure Python MCP stdio server that provides 5 tools: `whoami`, `list-sessions`, `send-message`, `read-messages`, `purge-sessions`. The server reads JSON-RPC 2.0 messages from stdin and writes responses to stdout. Message delivery uses tmux send-keys.

### Changes Required:

#### 1. tmux Helper Module
**File**: `cc-plugin/teams/mcp/tmux.py`
**Changes**: New file. Implements:
- `send_to_pane(target: str, text: str, vim_mode: bool)` — sends text to tmux pane
- Uses list-form `subprocess.run` (never `shell=True`)
- `-l` flag for literal text, separate `Enter` send
- Vim mode handling: Escape → i before sending text
- Returns bool indicating success (pane exists)
- Truncates messages > 500 chars with a note to use `read-messages`

#### 2. MCP Server
**File**: `cc-plugin/teams/mcp/server.py`
**Changes**: New file. Implements the full JSON-RPC 2.0 dispatch loop.

**Startup:**
- Set `sys.stdout` to line-buffered TextIOWrapper (critical for MCP)
- Set `sys.stdin` to UTF-8 TextIOWrapper

**Protocol handling:**
- `initialize` → respond with server capabilities (tools)
- `notifications/initialized` → ignore (no id)
- `ping` → respond with empty result
- `tools/list` → respond with tool definitions
- `tools/call` → dispatch to tool handlers

**Tool implementations:**

`whoami`:
- **Primary**: look up current session by `TMUX_PANE` env var in sessions table (always available to MCP subprocess)
- **Secondary**: try `DESPLEGA_SESSION_ID` env var if available (may not be — `CLAUDE_ENV_FILE` injects into Bash commands only, not MCP subprocess env)
- If neither resolves: return clear error `{"error": "Cannot identify session — not in tmux or session not registered yet"}`
- Return slug, session_id, directory

`list-sessions`:
- Query all sessions from DB
- Return list with slug, session_id, directory, last_heartbeat
- Mark stale sessions (heartbeat > 5 min ago) with a warning

`send-message`:
- Params: recipient (slug or session_id), type (action/info/status), content
- Look up recipient in sessions table
- INSERT message into messages table
- If recipient has `tmux_pane`: attempt delivery via send-keys, format as `[slug/type] content`, mark `delivered_at` on success
- If recipient has no `tmux_pane`: message stored but not delivered — return `delivered: false, reason: "no tmux pane"`
- Return message id and delivery status

`read-messages`:
- Query unread messages (WHERE `read_at IS NULL`) for current session
- Mark them as read (SET `read_at = CURRENT_TIMESTAMP`)
- Return list of messages with sender_slug, type, content, created_at

`purge-sessions`:
- DELETE sessions with last_heartbeat > 10 minutes ago
- Clean up orphaned unread messages
- Return list of purged slugs

**Tool registration:**
- All 5 tools with proper inputSchema as defined in research doc Section 2

#### 3. Stderr Logging
**Pattern**: All debug/diagnostic output goes to `sys.stderr` — never stdout. The MCP protocol owns stdout exclusively.

### Success Criteria:

#### Automated Verification:
- [ ] MCP initialize handshake: `echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"test"}}}' | python3 cc-plugin/teams/mcp/server.py 2>/dev/null | python3 -c "import sys,json; r=json.loads(sys.stdin.readline()); assert r['result']['serverInfo']['name']=='desplega-comms'; print('OK')"`
- [ ] Tools list returns 5 tools: `printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"test"}}}\n{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}\n' | python3 cc-plugin/teams/mcp/server.py 2>/dev/null | tail -1 | python3 -c "import sys,json; r=json.loads(sys.stdin.readline()); assert len(r['result']['tools'])==5; print('OK: 5 tools')"`
- [ ] tmux module loads: `python3 -c "import sys; sys.path.insert(0, 'cc-plugin/teams/mcp'); from tmux import send_to_pane; print('OK')"`
- [ ] Purge tool works via JSON-RPC: Insert a stale test session, call purge via stdin, verify cleaned up

#### Manual Verification:
- [ ] Start a Claude Code session with the plugin, run `whoami` tool — returns correct slug
- [ ] Open two sessions, run `list-sessions` — both visible
- [ ] Send a message from session A to session B via `send-message` — message appears in B's tmux pane
- [ ] In session B, run `read-messages` — message is returned and marked as read
- [ ] Run `purge-sessions` — no active sessions are purged, only stale ones

**Implementation Note**: For automated verification, the MCP protocol requires sending multiple JSON lines (initialize + tool call). Use `printf` with `\n` separators. After completing this phase, pause for manual confirmation.

---

## Phase 4: Integration & Documentation

### Overview

Write the README, verify end-to-end plugin installation, add permissions guidance, and perform full integration testing across multiple real Claude Code sessions.

### Changes Required:

#### 1. README
**File**: `cc-plugin/teams/README.md`
**Changes**: New file covering:
- What the plugin does (1-2 sentences)
- Installation: `/plugin install teams@desplega-ai-toolbox`
- Available MCP tools with descriptions
- Permissions setup (pre-allow in settings.json)
- Requirements: Python 3.9+, tmux, macOS
- Architecture overview (hooks → SQLite ← MCP server)

#### 2. Permissions Guidance
**In README**: Document the settings.json permissions block users can add to auto-allow MCP tools:
```json
"permissions": {
    "allow": [
        "mcp__desplega-comms__whoami",
        "mcp__desplega-comms__list-sessions",
        "mcp__desplega-comms__send-message",
        "mcp__desplega-comms__read-messages",
        "mcp__desplega-comms__purge-sessions"
    ]
}
```

#### 3. Update Repository CLAUDE.md
**File**: `CLAUDE.md`
**Changes**: Add `teams/` to the cc-plugin table entry description.

### Success Criteria:

#### Automated Verification:
- [ ] All expected files exist: `ls cc-plugin/teams/.claude-plugin/plugin.json cc-plugin/teams/.mcp.json cc-plugin/teams/hooks/session-registry.py cc-plugin/teams/mcp/server.py cc-plugin/teams/mcp/db.py cc-plugin/teams/mcp/slugs.py cc-plugin/teams/mcp/tmux.py cc-plugin/teams/README.md`
- [ ] Plugin JSON is valid: `python3 -c "import json; d=json.load(open('cc-plugin/teams/.claude-plugin/plugin.json')); assert 'hooks' in d; print('OK')"`
- [ ] MCP config is valid: `python3 -c "import json; d=json.load(open('cc-plugin/teams/.mcp.json')); assert 'desplega-comms' in d['mcpServers']; print('OK')"`
- [ ] All Python files have no syntax errors: `python3 -m py_compile cc-plugin/teams/hooks/session-registry.py && python3 -m py_compile cc-plugin/teams/mcp/server.py && python3 -m py_compile cc-plugin/teams/mcp/db.py && python3 -m py_compile cc-plugin/teams/mcp/slugs.py && python3 -m py_compile cc-plugin/teams/mcp/tmux.py && echo "All OK"`

#### Manual Verification:
- [ ] Install plugin: `/plugin install teams@desplega-ai-toolbox` succeeds
- [ ] Start session A in tmux pane 1 — gets slug (e.g., `bold-eagle-1337`)
- [ ] Start session B in tmux pane 2 — gets different slug
- [ ] From session A: `list-sessions` shows both sessions
- [ ] From session A: `send-message` to session B — text appears in pane 2
- [ ] From session B: `read-messages` returns the message, marks as read
- [ ] From session B: `read-messages` again — no unread messages
- [ ] Close session A, wait 1 min, from session B: `list-sessions` still shows A (within heartbeat window)
- [ ] Wait 10+ min or run `purge-sessions` — session A is cleaned up
- [ ] `/clear` in session B — slug is preserved after resume

**Implementation Note**: This phase requires the plugin to be installed. If testing locally before marketplace publish, symlink or copy the plugin directory to the plugin cache. Pause for manual confirmation after E2E tests pass.

---

## Manual E2E Verification

After all phases are complete, run through this end-to-end scenario:

```bash
# 1. Install the plugin (verify it's available in both claude and cw)
# Option A: marketplace
#   /plugin install teams@desplega-ai-toolbox
# Option B: local symlink for development
#   ln -s $(pwd)/cc-plugin/teams ~/.claude/plugins/teams
#   ln -s $(pwd)/cc-plugin/teams ~/.ccs/plugins/teams
# Verify: both `claude` and `cw` should show the teams MCP server on startup

# 2. Open tmux with two panes
tmux new-session -d -s teams-test
tmux split-window -h -t teams-test

# 3. Start Claude in pane 0 (using `claude`)
tmux send-keys -t teams-test:0.0 "claude" Enter

# 4. Start Claude in pane 1 (using `cw` / ccs)
tmux send-keys -t teams-test:0.1 "cw" Enter

# 5. In pane 0 (session A): Check identity
# → Use whoami tool → should return slug like "bold-eagle-1337"

# 6. In pane 0 (session A): List sessions
# → Use list-sessions tool → should show 2 sessions

# 7. In pane 0 (session A): Send message to session B
# → Use send-message with recipient=<session-B-slug>, type="info", content="Hello from A!"
# → Check pane 1 — message should appear

# 8. In pane 1 (session B): Read messages
# → Use read-messages tool → should return the message from A

# 9. In pane 0: /clear → slug should be preserved
# → Use whoami → same slug as before

# 10. Close pane 1 (Ctrl-D to exit cw, then exit shell)
# → Wait or run purge-sessions from pane 0
# → list-sessions should show only session A

# 11. Cleanup
tmux kill-session -t teams-test
sqlite3 ~/.desplega/desplega.db "DELETE FROM sessions; DELETE FROM messages;"
```

## Testing Strategy

- **Unit testing**: Not formal unit tests — the modules are small enough to verify via direct Python invocations in automated verification steps
- **Integration testing**: Each phase's automated verification tests the component in isolation
- **E2E testing**: Manual E2E section above covers the full flow
- **Regression**: Future changes should re-run the E2E flow

## References

- Research: `thoughts/taras/research/2026-03-11-inter-session-communication-unified.md`
- Brainstorm: `thoughts/taras/brainstorms/2026-03-11-inter-session-communication.md`
- Sub-research: Claude Code hooks, MCP stdio server, SQLite WAL + tmux + slugs
- Existing plugin pattern: `cc-plugin/base/.claude-plugin/plugin.json`

---

## Review Errata

_Reviewed: 2026-03-11 by Claude — all items addressed_

### Critical

- [x] **Hook command format mismatch** — Fixed: plugin.json now uses `"${CLAUDE_PLUGIN_ROOT}/hooks/session-registry.py"` (no `python3` prefix), matching the base plugin pattern. Added shebang + `chmod +x` requirements to Phase 2.

### Important

- [x] **MCP session identification order was backwards** — Fixed: `whoami` now uses TMUX_PANE as primary, DESPLEGA_SESSION_ID as secondary, with clear error if neither resolves.
- [x] **Missing shebang and executable bit requirements** — Fixed: Phase 2 now requires `#!/usr/bin/env python3` shebang and `chmod +x`, with automated verification.
- [x] **Non-tmux graceful degradation** — Fixed: Phase 2 hook logs warning and stores `tmux_pane = NULL`. Phase 3 `whoami` returns clear error. `send-message` returns `delivered: false` with reason.
- [x] **Background polling omission UX implication** — Fixed: "What We're NOT Doing" now documents the implication that tmux send-keys is the only push mechanism.

### Resolved (Minor)

- [x] **Key Discoveries placement** — acceptable as-is under Current State Analysis.
- [x] **`__init__.py` removed** — replaced with mcpServers verification step in Phase 1.
- [x] **Frontmatter uses `author` instead of `planner`** — acceptable as-is.

### Resolved (from file-review)

- [x] **`mcpServers` in plugin.json is buggy** (GitHub #16143) — Fixed: moved MCP server registration to separate `.mcp.json` file at plugin root, which is the proven working approach. Updated directory structure, Phase 1 changes, and all verification steps.
