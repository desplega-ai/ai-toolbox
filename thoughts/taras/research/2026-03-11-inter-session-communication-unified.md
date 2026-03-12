---
date: 2026-03-11T17:30:00Z
author: claude
topic: "Inter-Session Communication System — Unified Research"
tags: [research, mcp, hooks, sqlite, tmux, inter-session, claude-code]
status: complete
source_brainstorm: thoughts/taras/brainstorms/2026-03-11-inter-session-communication.md
sub_research:
  - thoughts/taras/research/2026-03-11-claude-code-hooks-system.md
  - thoughts/taras/research/2026-03-11-mcp-stdio-server-pure-python.md
  - thoughts/taras/research/2026-03-11-sqlite-wal-tmux-sendkeys-slug-generation.md
---

# Inter-Session Communication System — Unified Research

This document synthesizes findings from three parallel research efforts into a single implementation-ready reference for building the desplega inter-session communication system.

## 1. Hook System

### Event Registration in plugin.json

The teams plugin needs three hook events. Each uses a different matcher pattern. The `mcpServers` block registers the MCP stdio server.

```json
{
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
  },
  "mcpServers": {
    "desplega-comms": {
      "command": "python3",
      "args": ["${CLAUDE_PLUGIN_ROOT}/mcp/server.py"]
    }
  }
}
```

**Note:** This is a combined plugin.json — both hooks and MCP server are registered in the same manifest file for the `teams` plugin.

**Key details:**
- `SessionStart` matcher values: `"startup"`, `"resume"`, `"clear"`, `"compact"`, `"*"` (all). Use `"*"` to register on every session start type.
- `PostToolUse` matcher is tool name regex: `"*"` fires on every tool.
- `Stop` has **no matcher support** — always fires.
- A single script (`session-registry.py`) handles all three events by reading `hook_event_name` from stdin JSON.

**Session resume handling:** When a session resumes (`source: "resume"`), the `session_id` is the same as the original session. The hook must check if a session with this `session_id` already exists in SQLite and **preserve the existing slug** rather than generating a new one. Use `INSERT OR IGNORE` + `UPDATE` pattern (not `INSERT OR REPLACE`, which would delete and re-insert, losing the slug).

### Stdin Payload (Common Fields)

All hook events receive these fields via JSON stdin:

| Field | Type | Description |
|-------|------|-------------|
| `session_id` | string | Unique session identifier |
| `transcript_path` | string | Path to session transcript JSONL |
| `cwd` | string | Current working directory |
| `permission_mode` | string | e.g., `"default"` |
| `hook_event_name` | string | `"SessionStart"`, `"PostToolUse"`, `"Stop"` |

**SessionStart extras:** `source` (startup/resume/clear/compact), `model`, optionally `agent_type`
**PostToolUse extras:** `tool_name`, `tool_input`, `tool_output`, `tool_use_id`
**Stop extras:** `stop_hook_active` (boolean), `last_assistant_message`

### CLAUDE_ENV_FILE

- Available in **SessionStart hooks only**
- Format: append `export VAR=value` statements to the file path
- Variables persist for all subsequent Bash commands in the session
- **Known bug (GitHub #15840, Dec 2025):** Empty string in v2.0.76 — may be fixed in current versions
- **Timing vs MCP:** Undocumented. Env vars are sourced for Bash commands but not guaranteed to be available to MCP server processes. **Must test empirically.**
- **Fallback:** If env vars aren't available to MCP, the MCP can query SQLite by `$TMUX_PANE` (which IS available as a regular env var to all processes in a tmux pane)

```python
# In SessionStart hook:
env_file = os.environ.get("CLAUDE_ENV_FILE")
if env_file:
    with open(env_file, "a") as f:
        f.write(f'export DESPLEGA_SESSION_ID="{session_id}"\n')
        f.write(f'export DESPLEGA_SLUG="{slug}"\n')
```

**Session resume flow:**
```python
# Check if session already exists (e.g., on resume/clear/compact)
existing = db.execute("SELECT slug FROM sessions WHERE session_id = ?", (session_id,)).fetchone()
if existing:
    slug = existing["slug"]
    db.execute("""UPDATE sessions SET directory = ?, tmux_pane = ?, vim_mode = ?,
                  last_heartbeat = CURRENT_TIMESTAMP WHERE session_id = ?""",
               (cwd, tmux_pane, vim_mode, session_id))
else:
    slug = generate_unique_slug(existing_slugs)
    db.execute("INSERT INTO sessions VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
               (slug, session_id, cwd, tmux_pane, vim_mode))
```

### Hook Output Format

- **Exit 0:** Success, optional JSON on stdout
- **Exit 2:** Blocks the action (PreToolUse only) — JSON with `{"decision": "block", "reason": "..."}`
- **Exit non-zero (not 2):** Hook failure, Claude continues
- **Stop hooks** can return `{"decision": "block", "reason": "..."}` to prevent Claude from stopping

### ccs vs claude Compatibility

Both share the **same hook system** — hooks, matchers, stdin payloads, `session_id`, and `CLAUDE_ENV_FILE` all work identically. `ccs` delegates to Claude Code’s native hook system.

**Key difference: directory structure.** `ccs` uses `~/.ccs/` for its own state:
- `~/.ccs/instances/work/projects/` — session JSONL files (vs `~/.claude/projects/` for plain `claude`)
- `~/.ccs/shared/settings.json` — ccs-specific settings
- `~/.ccs/cliproxy/` — proxy session management
- `~/.ccs/.hook-migrated`, `~/.ccs/.session-secret` — internal state

**For our system:** This doesn’t affect us since we use `~/.desplega/desplega.db` as our own registry, independent of both `~/.claude/` and `~/.ccs/`. The hook system is shared, so one hook registration works for both.

## 2. MCP Stdio Server (Pure Python)

### Protocol

- **Transport:** Newline-delimited JSON-RPC 2.0 over stdin/stdout
- **No length prefix** (unlike LSP) — one JSON object per line, terminated by `\n`
- **Spec version:** `2025-03-26`

### Lifecycle

```
Client → Server: initialize (with protocolVersion + capabilities)
Server → Client: response (with server capabilities)
Client → Server: notifications/initialized
--- operational phase ---
Client → Server: tools/list
Client → Server: tools/call
Client → Server: ping
```

### Critical: stdout Buffering

**This is the #1 gotcha.** Python buffers stdout when running as a subprocess. Without explicit flushing, the client hangs.

```python
import io, sys

# Set once at startup — line_buffering=True flushes on every \n
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", line_buffering=True)
sys.stdin = io.TextIOWrapper(sys.stdin.buffer, encoding="utf-8")
```

### Tool Registration

```python
TOOLS = [
    {
        "name": "whoami",
        "description": "Returns this session's slug, session_id, and directory",
        "inputSchema": {"type": "object", "properties": {}, "required": []}
    },
    {
        "name": "list-sessions",
        "description": "Lists all active Claude sessions with their slugs and directories",
        "inputSchema": {"type": "object", "properties": {}, "required": []}
    },
    {
        "name": "send-message",
        "description": "Send a message to another session",
        "inputSchema": {
            "type": "object",
            "properties": {
                "recipient": {"type": "string", "description": "Target session slug or session_id"},
                "type": {"type": "string", "enum": ["action", "info", "status"], "description": "Message type"},
                "content": {"type": "string", "description": "Message content"}
            },
            "required": ["recipient", "type", "content"]
        }
    },
    {
        "name": "read-messages",
        "description": "Read unread messages sent to this session",
        "inputSchema": {"type": "object", "properties": {}, "required": []}
    },
    {
        "name": "purge-sessions",
        "description": "Remove stale sessions (no heartbeat in last 10 minutes)",
        "inputSchema": {"type": "object", "properties": {}, "required": []}
    }
]
```

### MCP Registration in Plugin

Already shown in the combined `plugin.json` in Section 1 (hooks + mcpServers in one manifest).

### JSON-RPC Helpers

```python
def send_response(id, result):
    msg = {"jsonrpc": "2.0", "id": id, "result": result}
    sys.stdout.write(json.dumps(msg) + "\n")

def send_error(id, code, message):
    msg = {"jsonrpc": "2.0", "id": id, "error": {"code": code, "message": message}}
    sys.stdout.write(json.dumps(msg) + "\n")

def log(text):
    """Log to stderr (never stdout)."""
    print(text, file=sys.stderr, flush=True)
```

### MCP Main Loop (Complete Example)

This is the missing piece — the actual JSON-RPC dispatch loop that ties everything together:

```python
def handle_request(msg):
    method = msg.get("method", "")
    id = msg.get("id")
    params = msg.get("params", {})

    # Notifications (no id) — don't respond
    if id is None:
        return

    if method == "initialize":
        send_response(id, {
            "protocolVersion": "2025-03-26",
            "capabilities": {"tools": {}},
            "serverInfo": {"name": "desplega-comms", "version": "0.1.0"}
        })
    elif method == "ping":
        send_response(id, {})
    elif method == "tools/list":
        send_response(id, {"tools": TOOLS})
    elif method == "tools/call":
        tool_name = params.get("name", "")
        args = params.get("arguments", {})
        try:
            if tool_name == "whoami":
                result = handle_whoami()
            elif tool_name == "list-sessions":
                result = handle_list_sessions()
            elif tool_name == "send-message":
                result = handle_send_message(args["recipient"], args["type"], args["content"])
            elif tool_name == "read-messages":
                result = handle_read_messages()
            elif tool_name == "purge-sessions":
                result = handle_purge_sessions()
            else:
                send_error(id, -32601, f"Unknown tool: {tool_name}")
                return
            send_response(id, {"content": [{"type": "text", "text": json.dumps(result)}]})
        except Exception as e:
            send_response(id, {"content": [{"type": "text", "text": f"Error: {e}"}], "isError": True})
    else:
        send_error(id, -32601, f"Method not found: {method}")

def main():
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", line_buffering=True)
    sys.stdin = io.TextIOWrapper(sys.stdin.buffer, encoding="utf-8")

    # Start background delivery thread
    t = threading.Thread(target=message_poll_loop, daemon=True)
    t.start()

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
            handle_request(msg)
        except json.JSONDecodeError:
            log(f"Invalid JSON: {line}")
```

**Key points:**
- `tools/call` responses use the MCP content format: `{"content": [{"type": "text", "text": "..."}]}`
- Errors from tool execution use `isError: true` in the content response (NOT a JSON-RPC error)
- JSON-RPC errors (`send_error`) are only for protocol-level issues (unknown method, etc.)

### Key Gotchas

| Gotcha | Solution |
|--------|----------|
| stdout buffering | `line_buffering=True` on TextIOWrapper |
| Debug prints to stdout | Always use `sys.stderr` |
| Notifications (no `id`) | Don't respond to messages without `id` |
| `params` may be missing | Default to `{}` |
| EOF on stdin | Exit cleanly (for-loop handles this) |
| `tools/call` error format | Use `isError: true` in content, NOT JSON-RPC error |

## 3. SQLite WAL Mode

### Setup

```python
import sqlite3
from contextlib import contextmanager

DB_PATH = os.path.expanduser("~/.desplega/desplega.db")
SCHEMA_VERSION = 1  # Bump when schema changes

@contextmanager
def get_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=30.0)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=30000")
    conn.row_factory = sqlite3.Row
    _ensure_schema(conn)
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

def _ensure_schema(conn):
    """Create tables if missing, run migrations if schema version changed."""
    conn.execute("CREATE TABLE IF NOT EXISTS _meta (key TEXT PRIMARY KEY, value TEXT)")
    row = conn.execute("SELECT value FROM _meta WHERE key = 'schema_version'").fetchone()
    current = int(row["value"]) if row else 0

    if current < 1:
        conn.execute("""CREATE TABLE IF NOT EXISTS sessions (
            slug TEXT PRIMARY KEY,
            session_id TEXT UNIQUE NOT NULL,
            directory TEXT NOT NULL,
            tmux_pane TEXT,
            vim_mode BOOLEAN DEFAULT 0,
            started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_heartbeat DATETIME DEFAULT CURRENT_TIMESTAMP
        )""")
        conn.execute("""CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sender_slug TEXT NOT NULL,
            recipient_slug TEXT NOT NULL,
            type TEXT NOT NULL CHECK(type IN ('action', 'info', 'status')),
            content TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            read_at DATETIME,
            delivered_at DATETIME,
            FOREIGN KEY (sender_slug) REFERENCES sessions(slug),
            FOREIGN KEY (recipient_slug) REFERENCES sessions(slug)
        )""")
        conn.execute("""CREATE INDEX IF NOT EXISTS idx_messages_recipient_unread
            ON messages(recipient_slug, delivered_at) WHERE delivered_at IS NULL""")
        conn.execute("""CREATE INDEX IF NOT EXISTS idx_messages_recipient_unread_read
            ON messages(recipient_slug, read_at) WHERE read_at IS NULL""")

    # Future migrations go here:
    # if current < 2:
    #     conn.execute("ALTER TABLE sessions ADD COLUMN new_col TEXT")

    conn.execute("INSERT OR REPLACE INTO _meta (key, value) VALUES ('schema_version', ?)",
                 (str(SCHEMA_VERSION),))
    conn.commit()
```

This ensures schema creation on first run and supports forward migrations by bumping `SCHEMA_VERSION` and adding `if current < N:` blocks.

### Concurrency Model

- **Readers never block writers** — multiple simultaneous readers are fine
- **Only one writer at a time** — second writer waits up to `timeout`, then raises `OperationalError`
- **30s timeout is generous** for 10-20 concurrent sessions (SkyPilot uses 60s for 1000+)
- **Short-lived connections** minimize lock contention
- **WAL is persistent** — set once at DB creation, stays across connections

### Schema

```sql
CREATE TABLE IF NOT EXISTS sessions (
    slug TEXT PRIMARY KEY,
    session_id TEXT UNIQUE NOT NULL,
    directory TEXT NOT NULL,
    tmux_pane TEXT,
    vim_mode BOOLEAN DEFAULT 0,
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_heartbeat DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_slug TEXT NOT NULL,
    recipient_slug TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('action', 'info', 'status')),
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    read_at DATETIME,
    delivered_at DATETIME,
    FOREIGN KEY (sender_slug) REFERENCES sessions(slug),
    FOREIGN KEY (recipient_slug) REFERENCES sessions(slug)
);

CREATE INDEX IF NOT EXISTS idx_messages_recipient_unread
ON messages(recipient_slug, delivered_at) WHERE delivered_at IS NULL;

-- Index for read-messages queries (WHERE read_at IS NULL)
CREATE INDEX IF NOT EXISTS idx_messages_recipient_unread_read
ON messages(recipient_slug, read_at) WHERE read_at IS NULL;
```

### macOS Notes

- WAL works fine on local filesystem (APFS/HFS+)
- **Never use over network FS** (NFS, SMB) — no shared memory support
- `-wal` and `-shm` auxiliary files are created; don't delete while DB is in use
- No additional kernel/FS tuning needed on macOS

## 4. tmux send-keys

### Sending Literal Text

```python
import subprocess

def send_to_pane(target: str, text: str, vim_mode: bool = False):
    """Send text to a tmux pane, handling vim mode if needed.

    Uses check=False throughout for robustness — if the pane has been
    destroyed (session ended), we don't want to crash the delivery thread.
    The caller should handle delivery failure (e.g., mark message as undeliverable).
    """
    if vim_mode:
        # Ensure insert mode: Escape (force normal) → i (enter insert)
        subprocess.run(["tmux", "send-keys", "-t", target, "Escape"], check=False)
        subprocess.run(["tmux", "send-keys", "-t", target, "i"], check=False)

    # Send literal text (no key name interpretation)
    result = subprocess.run(["tmux", "send-keys", "-t", target, "-l", text], check=False)

    # Send Enter as a separate non-literal call
    subprocess.run(["tmux", "send-keys", "-t", target, "Enter"], check=False)

    return result.returncode == 0  # False if pane doesn't exist
```

### Key Rules

1. **Always use list-form `subprocess.run`** — never `shell=True`. This bypasses shell expansion of `$`, backticks, etc.
2. **Always use `-l` for text content** — without it, spaces get stripped and words like `Enter`/`Space` are interpreted as keypresses.
3. **Send Enter as a separate non-literal call** — this is the most reliable pattern.
4. **Semicolons are a gotcha** — tmux parses them as command separators before `-l` takes effect. List-form subprocess avoids this.

### Large Messages

- For text >100KB, use `tmux load-buffer` + `paste-buffer` instead
- For our use case: truncate at 500 chars and tell Claude to use `read-messages` for the full content

### When Claude Is Mid-Execution

- Text sent via send-keys **buffers in the terminal's input queue**
- When the prompt becomes active, the buffered text appears
- This is safe — no interference with running tools

## 5. Slug Generation

### Word Lists (50 adjectives + 50 nouns = 2,500 combinations)

```python
import random

ADJECTIVES = [
    "bold", "brave", "bright", "calm", "clever", "cool", "crisp", "daring",
    "eager", "epic", "fair", "fast", "fierce", "fleet", "gentle", "glad",
    "grand", "happy", "hardy", "keen", "kind", "lively", "lucid", "merry",
    "mighty", "modest", "noble", "peaceful", "proud", "quick", "quiet",
    "rapid", "ready", "sharp", "sleek", "smart", "solid", "steady", "still",
    "strong", "sturdy", "subtle", "sure", "sweet", "swift", "tender", "true",
    "vivid", "warm", "wise",
]

NOUNS = [
    "aurora", "breeze", "cliff", "coral", "crane", "creek", "dawn", "delta",
    "dune", "eagle", "ember", "falcon", "fjord", "flame", "forge", "frost",
    "grove", "harbor", "hawk", "heron", "lake", "lark", "maple", "marsh",
    "mesa", "moon", "oak", "osprey", "peak", "pine", "plover", "pond",
    "prairie", "quail", "rain", "raven", "reef", "ridge", "river", "sage",
    "shore", "sparrow", "spruce", "storm", "summit", "tide", "trail", "vale",
    "willow", "wren",
]

FUNNY_NUMBERS = [
    "7", "13", "42", "69", "80", "99", "100", "101", "108", "187",
    "200", "247", "256", "300", "314", "360", "404", "420", "451", "500",
    "512", "666", "707", "747", "777", "808", "818", "888", "911", "999",
    "1024", "1099", "1234", "1312", "1337", "1738", "2024", "2048", "2600", "3000",
    "3030", "3141", "4004", "4040", "4200", "5000", "6502", "8008", "8080", "9000",
]

def generate_slug() -> str:
    return f"{random.choice(ADJECTIVES)}-{random.choice(NOUNS)}-{random.choice(FUNNY_NUMBERS)}"

def generate_unique_slug(existing: set[str], max_retries: int = 10) -> str:
    for _ in range(max_retries):
        slug = generate_slug()
        if slug not in existing:
            return slug
    # Fallback: append extra random digit
    return f"{generate_slug()}-{random.randint(0, 99)}"
```

With the funny number suffix: 50 x 50 x 50 = **125,000 combinations**. Collision probability for 20 sessions drops to ~0.16% even without retries.

### Uniqueness Math

- 50 adjectives x 50 nouns x 50 numbers = **125,000 combinations**
- For 20 concurrent sessions: ~0.16% collision probability without retries
- With retry loop: effectively zero
- Slugs are only unique among **active** sessions; recycled when sessions end
- Example slugs: `bold-eagle-1337`, `swift-creek-42`, `calm-harbor-420`

## 6. Vim Mode Detection

Editor mode is stored in `~/.claude.json`:

```python
import json, os

def detect_vim_mode() -> bool:
    """Check if Claude Code is in vim editor mode.

    The setting is stored in ~/.claude.json as {"editorMode": "vim"}.
    This is the global Claude Code config file (distinct from ~/.claude/settings.json).
    """
    config_path = os.path.expanduser("~/.claude.json")
    if not os.path.exists(config_path):
        return False
    try:
        with open(config_path) as f:
            data = json.load(f)
        return data.get("editorMode") == "vim"
    except (json.JSONDecodeError, IOError):
        return False
```

**Verified:** On Taras’s machine, `~/.claude.json` contains `"editorMode": "vim"`. This is the authoritative location — not `keybindings.json` (which is for custom key mappings, not editor mode).

**Note:** Changes to editor mode are applied without restart. The MCP checks this at startup; if the user toggles vim mode mid-session, the `vim_mode` column would be stale until next session start. This is an acceptable trade-off for v1.

## 7. Heartbeat Throttling

`PostToolUse` fires on every tool call, which could mean dozens of SQLite writes per minute. Throttle to once per 60 seconds:

```python
import time

# Module-level state (persists across hook invocations within same process)
# Note: hooks are subprocess invocations, so this won't persist.
# Use a temp file instead.

HEARTBEAT_FILE = "/tmp/desplega-heartbeat-{session_id}"

def should_heartbeat(session_id: str, interval: int = 60) -> bool:
    """Check if enough time has passed since last heartbeat."""
    path = HEARTBEAT_FILE.format(session_id=session_id)
    try:
        mtime = os.path.getmtime(path)
        if time.time() - mtime < interval:
            return False
    except OSError:
        pass  # File doesn't exist yet
    # Touch the file
    with open(path, "w") as f:
        f.write(str(time.time()))
    return True

def on_heartbeat(data):
    session_id = data.get("session_id")
    if not should_heartbeat(session_id):
        return  # Skip — too soon since last heartbeat
    with get_db() as db:
        db.execute(
            "UPDATE sessions SET last_heartbeat = CURRENT_TIMESTAMP WHERE session_id = ?",
            (session_id,)
        )
```

**Why a temp file?** Hooks are subprocess invocations — each call is a fresh Python process. Module-level variables don't persist. A temp file is the simplest way to track last-heartbeat time across invocations. The file is keyed by session_id so multiple sessions don't interfere.

## 8. MCP Tool Permissions

**Hooks and MCP server have full OS-level file access** — they run as regular subprocesses, not sandboxed. Reading/writing `~/.desplega/desplega.db` is unrestricted.

**MCP tool calls require user approval.** Plugins cannot auto-allow their own tools in `plugin.json` — there's no `permissions` field in the plugin manifest. Users must approve MCP tools through one of:

1. **One-time prompt** — Claude asks on first use, user approves
2. **Pre-allow in settings.json:**
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

**Recommendation for the plugin:** Include a post-install setup instruction (or script) that adds the permissions to `~/.claude/settings.json`. Alternatively, accept the one-time approval UX — it's not a blocker.

## 9. Stale Session Cleanup

Three cleanup mechanisms, layered for robustness:

1. **Auto-cleanup in heartbeat hook** — When any session's `PostToolUse` hook fires, it cleans up stale sessions older than 10 minutes. This is opportunistic — it piggybacks on existing hook activity.

2. **Auto-cleanup in MCP poll loop** — The background message delivery thread can also clean up stale sessions as part of its poll cycle.

3. **Manual `purge-sessions` tool** — Explicit cleanup for when a user notices stale sessions.

```python
def handle_purge_sessions():
    with get_db() as db:
        cursor = db.execute(
            "DELETE FROM sessions WHERE last_heartbeat < datetime('now', '-10 minutes') RETURNING slug"
        )
        purged = [row["slug"] for row in cursor.fetchall()]
        # Also clean up messages to/from purged sessions
        if purged:
            placeholders = ",".join("?" * len(purged))
            db.execute(f"DELETE FROM messages WHERE recipient_slug IN ({placeholders}) AND read_at IS NULL",
                       purged)
    return {"purged": purged, "count": len(purged)}
```

**Note:** `RETURNING` clause requires SQLite 3.35+ (macOS 12+ ships with 3.37+, so this is safe).

## 10. Open Risks

1. **CLAUDE_ENV_FILE bug** — GitHub #15840 reported it as empty string in v2.0.76. If still broken, fall back to TMUX_PANE-based lookup in SQLite.
2. **MCP vs SessionStart timing** — Undocumented. If MCP starts before the hook runs, `DESPLEGA_SLUG` won't be in env yet. Mitigation: lazy-init on first tool call.
3. **PostToolUse frequency** — **Mitigated.** Throttle heartbeat updates to once per 60 seconds using a timestamp file check (see Section 7: Heartbeat Throttling).
4. **Vim detection** — Now resolved: `~/.claude.json` → `editorMode === "vim"`. Reliable, no heuristic needed.
5. **MCP process crash** — If Claude Code crashes, the MCP process dies but the session row stays in SQLite. The 10-minute heartbeat timeout handles this automatically. Messages sent to a dead session will sit undelivered until the session is cleaned up — `purge-sessions` or auto-cleanup in heartbeat handles this.
6. **Session resume slug preservation** — When `SessionStart` fires with `source: "resume"`, the hook must check for an existing session_id and preserve the slug (see Section 1 resume flow). Using `INSERT OR REPLACE` would delete and re-insert, losing the original slug and breaking in-flight messages.

## 11. File Layout (Proposed)

**Decision:** Separate `teams` plugin (not part of `base`). This keeps base focused on single-session agentic patterns, and teams is an opt-in capability for multi-session coordination.

```
cc-plugin/teams/
├── .claude-plugin/
│   └── plugin.json          # hooks + mcpServers registration
├── hooks/
│   └── session-registry.py  # SessionStart/PostToolUse/Stop handler
├── mcp/
│   ├── server.py            # MCP stdio server (main entry point)
│   ├── db.py                # SQLite connection, schema, migrations
│   ├── slugs.py             # Slug generation (adjective-noun-number)
│   └── tmux.py              # tmux send-keys helper
└── README.md
```

**Marketplace install:** Users would install via:
```bash
/plugin install teams@desplega-ai-toolbox
```

This means `cc-plugin/` would have: `base/`, `swarm/`, `wts/`, and now `teams/`.

## 12. Out of Scope (Intentional)

- **qmd / thoughts tracking** — Per brainstorm decision, this is an orthogonal feature handled by qmd's own MCP server and collection system. Not part of the teams plugin.
- **Network messaging** — All sessions assumed to be on the same machine. Cross-machine communication is a future concern.
- **Non-tmux environments** — System requires tmux. No support for bare terminal, iTerm split panes, etc.
