---
date: 2026-03-11T16:30:00Z
author: taras
topic: "Inter-Session Communication System for Claude Code"
tags: [brainstorm, mcp, hooks, inter-session, claude-code, desplega-plugin]
status: complete
exploration_type: idea
last_updated: 2026-03-11
last_updated_by: claude
---

# Inter-Session Communication System for Claude Code — Brainstorm

## Context

Building on the prior brainstorm ([discovering-claude-session-info-from-tmux](./2026-03-11-discovering-claude-session-info-from-tmux.md)), which explored how to programmatically identify Claude Code sessions from tmux panes, this brainstorm explores creating an **MCP server + hooks system** in the base desplega plugin that enables:

1. **Session registry** — On session start, create a lock file at `~/.desplega/locks/[ts]-[sessionId].json` containing directory, session ID, last update timestamp, tmux pane info, and a random name (slug). Heartbeat updates on stops.

2. **Thoughts tracking** — If `qmd` is installed and a thoughts directory exists, start tracking them.

3. **Inter-session messaging** — A `~/.desplega/messages.json` with `messages.lock` to store messages between sessions. A Python daemon watches for changes and forwards messages via tmux `send-keys`. Sessions can also read messages sent to them that aren't actions.

### Prior Art / Related Work

- The `2026-03-11-discovering-claude-session-info-from-tmux.md` brainstorm established:
  - `ccs` stores sessions in `~/.ccs/instances/work/projects/`
  - No direct PID-to-session mapping exists
  - tmux pane titles + child process inspection can identify Claude panes
  - Session JSONL files aren't kept open (no `lsof` approach)
  - Correlation is possible via modification time heuristics

- The base plugin already has a hooks system (`cc-plugin/base/`)

## Exploration

### Q: What's the primary use case driving this?
All of the above — session delegation, human orchestration, and collaborative sessions. The goal is to build primitives that support all these patterns.

**Insights:** This means we need a general-purpose messaging primitive, not something tailored to a single pattern. The session registry becomes critical because all three use cases need to discover and address sessions. The messaging format needs to be flexible enough to carry instructions (delegation), status updates (orchestration), and context/findings (collaboration).

### Q: Delivery mechanism — tmux send-keys has timing and escaping concerns. What about alternatives?
tmux send-keys is fine for v1. We'll handle timing and escaping — it's the simplest approach.

**Insights:** Accepting tmux send-keys means: (1) we're coupled to tmux as the session host (fine for now since that's the target environment), (2) we need to handle the case where Claude is mid-execution (queue and wait for prompt? or just inject and let it buffer?), (3) escaping will need care for special characters in messages. The simplicity trade-off is worth it for a v1.

### Q: Session addressing — what are slugs for, and how should sessions be targeted?
Slug and session ID are both valid addressing modes. Slugs must be unique across all active sessions.

**Insights:** Two addressing modes: (1) slug for human-friendly targeting (e.g., "send to blue-tiger"), (2) session ID for programmatic/exact targeting. Uniqueness constraint on slugs means the lock file creation process needs to check existing slugs before assigning one. Since sessions come and go, we only need uniqueness among currently active sessions. A simple two-word adjective-noun pattern (like Docker container names) would work well and have low collision probability.

### Q: Why Python for the daemon? The plugin is currently shell + YAML.
Python is the preferred language, but it must work with plain Python (stdlib only, no pip dependencies).

**Insights:** This is a good constraint. Python's stdlib has everything we need: `json` for message parsing, `os`/`pathlib` for file watching (via polling since `inotify` isn't stdlib-cross-platform), `subprocess` for tmux send-keys, `signal` for graceful shutdown. On macOS, we can use `kqueue` via `select.kqueue` for efficient file watching without polling, but a simple poll loop with `os.stat` mtime checking is simpler and cross-platform. The daemon could be a single `.py` file shipped with the plugin.

### Q: Message storage format — flat log, per-session inboxes, or structured protocol?
Not sure — wants the cleanest and most scalable option (should handle thousands of messages).

**Insights:** A single `messages.json` file is the worst option for scale — every write requires reading+parsing the entire file, and JSON doesn't support true append-only. Three better approaches:

1. **Per-session JSONL files** (`~/.desplega/messages/[slug].jsonl`) — each session gets its own append-only file. One JSON object per line. True append (just `open('a')`). Sessions only read their own inbox. Daemon watches the directory for mtime changes. **Recommended approach.**

2. **Per-message files** (`~/.desplega/messages/[ts]-[sender]-[recipient].json`) — one file per message. Easy to add, easy to clean up old ones. But lots of tiny files = directory listing overhead at scale.

3. **SQLite** — the "real" database approach. But adds complexity and the stdlib `sqlite3` module is fine, this might be overkill for v1.

The per-session JSONL approach is the sweet spot: simple, scalable, no parse-the-world problem, and cleanup is easy (delete the file when a session ends).

**Decision: SQLite.** Taras chose SQLite over JSONL — forward-looking for embeddings support later. Python's `sqlite3` is stdlib, so no deps. A single `messages` table (maybe a `sessions` table too) keeps it simple. Schema could be:
- `messages(id, sender_slug, recipient_slug, type, content, created_at, read_at)`
- `sessions(slug, session_id, directory, tmux_pane, started_at, last_heartbeat)` — this could also replace the lock files entirely

### Q: Consolidate into single SQLite DB or keep lock files separate?
Single SQLite DB — `~/.desplega/desplega.db` with `sessions` + `messages` tables.

**Insights:** This simplifies the architecture significantly. Instead of lock files + messages file + messages lock, we have one `desplega.db`. Benefits: (1) atomic operations via SQLite transactions, (2) easy to query ("show all sessions on project X"), (3) no file locking gymnastics — SQLite handles concurrency, (4) the daemon can poll with a simple `SELECT ... WHERE read_at IS NULL` query. The hook just needs to do an INSERT into sessions on start and an UPDATE on heartbeat.

### Q: What MCP tools should be exposed to Claude sessions?
Four tools for v1: `list-sessions`, `send-message`, `read-messages`, `whoami`.

**Insights:** This is a clean, minimal API surface. `whoami` is important because a session needs to know its own slug to tell others how to reply. `list-sessions` enables discovery. `send-message` and `read-messages` cover the core communication loop. Broadcast and status checking can be added later if needed — the SQLite schema supports them already (query all sessions, check `last_heartbeat`).

### Q: Daemon lifecycle — who starts it, who stops it, could the MCP server be the daemon?
Wants it running while at least one session is active. Suggested MCP-as-daemon, asked if HTTP transport is needed.

**Insights:** stdio MCP actually works here — and is simpler. Here's why:

Each Claude session spawns its own MCP process (stdio). That MCP process can:
1. Register the session in SQLite on startup
2. Run a background thread that polls SQLite for new messages addressed to this session
3. When a message arrives → use `tmux send-keys` to inject it into the pane
4. Deregister on shutdown (or let heartbeat timeout handle it)

No shared daemon needed. Each MCP process is its own session's "agent." They coordinate through SQLite (which handles concurrent access fine with WAL mode). When session A sends to session B: A's MCP inserts a row → B's MCP background thread picks it up → B's MCP uses tmux send-keys to notify B.

**HTTP MCP would only be needed if** we wanted a single process managing all sessions. But with SQLite as the shared state, multiple stdio processes work perfectly and are simpler to deploy (no port management, no service lifecycle).

### Q: What does "thoughts tracking" via qmd mean?
qmd handles this natively — it's a document indexing/search tool with collections, FTS, vector search, and its own MCP server. If qmd is installed, it can index the thoughts directory and make it searchable across sessions.

**Insights:** This is actually a separate concern from the inter-session messaging system. qmd already has `qmd collection add`, `qmd search`, `qmd mcp` etc. The desplega MCP could optionally check for qmd and suggest/automate setting up a thoughts collection, but the actual search functionality is qmd's domain. This keeps our MCP focused on session registry + messaging. We might just add a setup step: "if qmd is installed and thoughts/ exists, run `qmd collection add thoughts/ --name thoughts`" — or leave it entirely to the user.

### Q: Should message types be schema-level or just content conventions?
Schema-level distinction. Messages have a `type` field that the MCP and daemon use for routing and display.

**Insights:** This means the `messages` table needs a `type` column. Possible types for v1:
- `action` — the recipient should do something (gets injected via tmux send-keys)
- `info` — FYI, no action needed (stored for read-messages retrieval, maybe no send-keys)
- `status` — status update from a session (e.g., "finished task X")

The daemon's behavior changes based on type: `action` messages get injected via send-keys immediately, `info` and `status` might just queue silently until the session calls `read-messages`. This prevents info-only messages from interrupting a session mid-work.

### Q: Stale session cleanup?
Both — auto-cleanup on heartbeat timeout AND a manual purge command.

**Insights:** Each MCP process can check for stale sessions as part of its own poll loop (e.g., `DELETE FROM sessions WHERE last_heartbeat < datetime('now', '-10 minutes')`). A `purge-sessions` MCP tool or CLI command provides manual control. Stale messages to dead sessions could be marked as undeliverable.

### Q: How does the MCP process know which session it belongs to?
Session ID comes from hook events (researching exact mechanism). Slug is auto-generated and stored as a session_id ↔ slug mapping in SQLite.

**Insights:** Confirmed: hooks receive `session_id` via JSON stdin (e.g., `data.get("session_id")` — see `plan_checkbox_reminder.py`). Both `PreToolUse`/`PostToolUse` and `Stop` events include it. `SessionStart` events should too.

The flow: (1) `SessionStart` hook fires, receives `session_id` + `cwd` from Claude, (2) hook generates a unique slug (checking existing active slugs in SQLite), (3) hook INSERTs into `sessions` table with session_id, slug, cwd, tmux pane info (from `$TMUX_PANE`), vim_mode (from Claude config), (4) hook sets env vars `DESPLEGA_SESSION_ID` and `DESPLEGA_SLUG` so the MCP process can read them on startup.

**Open question:** Can `SessionStart` hooks set environment variables that persist for the session? If not, the MCP could look up its session by querying SQLite with the `session_id` it gets from its own hook events — or the session-start hook could write to a temp file that the MCP reads.

### Q: tmux send-keys format and vim keybinding handling?
Use `Escape+i` for vim mode, wrapped format `[msg from slug]: content`. But only send Escape+i when vim mode is actually enabled — detect it from Claude's config.

**Insights:** We can't blindly send `Escape+i` — if vim mode is OFF, `i` would be typed as a literal character before the message. Detection approaches:
1. **Read Claude's settings** — check `~/.claude/settings.json` or `~/.claude/keybindings.json` for vim mode config at MCP startup
2. **Store in sessions table** — add a `vim_mode` boolean column, populated by the session-start hook reading the config
3. **Env var** — the hook checks the config and sets `DESPLEGA_VIM_MODE=1`

Option 2 is cleanest: the hook checks Claude's config once at session start and writes `vim_mode` to the sessions table. The MCP's message delivery code then checks the recipient's `vim_mode` before deciding the send-keys sequence:
- vim OFF: `tmux send-keys -l "[msg from blue-tiger]: hello" && tmux send-keys Enter`
- vim ON: `tmux send-keys Escape && tmux send-keys i && tmux send-keys -l "[msg from blue-tiger]: hello" && tmux send-keys Enter`

The `-l` flag on send-keys treats the text as literal (no special key interpretation), which handles most escaping concerns. Special characters like `"`, `$`, `` ` `` still need shell-level escaping in the subprocess call.

## Synthesis

### Key Decisions

1. **Single SQLite database** — `~/.desplega/desplega.db` with `sessions` + `messages` tables. Replaces the original lock files + messages.json idea. Forward-looking for embeddings.
2. **stdio MCP per session (no shared daemon)** — Each Claude session spawns its own MCP process. Background thread polls SQLite for messages. No HTTP transport, no separate daemon process needed.
3. **tmux send-keys for delivery** — Action messages injected via `tmux send-keys -l`. Vim mode detected from Claude config and stored in sessions table; Esc+i prefix only when needed.
4. **Schema-level message types** — `action` (injected immediately), `info` (queued for read), `status` (queued for read). Prevents info messages from interrupting active sessions.
5. **Slug + session ID addressing** — Sessions addressable by human-friendly slug (unique among active sessions) or by session_id. Slugs auto-generated (adjective-noun pattern).
6. **Python stdlib only** — Daemon/MCP in pure Python, no pip dependencies. `sqlite3`, `json`, `subprocess`, `os` cover all needs.
7. **qmd is separate** — Thoughts tracking via qmd is an orthogonal feature. This system focuses on session registry + messaging.

### Open Questions (Answered)

1. **Can SessionStart hooks set env vars for the session?** **YES.** Hooks have access to `CLAUDE_ENV_FILE` — append `export VAR=value` statements to this file and they persist for all subsequent Bash commands in the session. This is the identity bootstrapping mechanism: the SessionStart hook writes `export DESPLEGA_SESSION_ID=...` and `export DESPLEGA_SLUG=...` to `$CLAUDE_ENV_FILE`.

2. **MCP process identity bootstrapping** — Exact ordering (MCP start vs SessionStart hook) is undocumented. **Mitigation:** The MCP can lazy-initialize — on first tool call, read `DESPLEGA_SLUG` from env (set by the hook). If not yet available, query SQLite by `$TMUX_PANE` or generate a new registration.

3. **Message delivery when Claude is mid-execution** — **Text buffers.** tmux send-keys injects characters into the pane's input queue. If a tool is running, the text waits and gets processed when the prompt becomes active. This is safe — no interference with running tools.

4. **Heartbeat mechanism** — Use `PostToolUse` hooks. They fire frequently (every tool call) and already receive `session_id`. A simple `UPDATE sessions SET last_heartbeat = CURRENT_TIMESTAMP WHERE session_id = ?` is lightweight enough to run on every tool use.

5. **Vim mode detection** — Vim keybindings are configured in `~/.claude/keybindings.json` (created via `/keybindings` command). Check for vim-style bindings in the `bindings` array. Changes are auto-detected without restart.

6. **Message size limits** — No hard limit on `tmux send-keys -l`, but performance degrades with long text (character-by-character processing). **Strategy:** For messages > 500 chars, inject a short notification `[msg from {slug}]: You have a long message. Use read-messages to view it.` and leave the full content for `read-messages`.

### Constraints Identified

1. **Python stdlib only** — No external dependencies
2. **tmux required** — System assumes tmux as the session host (no iTerm/bare terminal support)
3. **SQLite WAL mode** — Needed for concurrent read/write from multiple MCP processes
4. **Single machine** — All sessions on the same machine (no network messaging)
5. **Claude Code hook lifecycle** — Hooks are subprocess invocations, not persistent. Session registration must happen in hook → SQLite, not in-memory.
6. **Works with both `claude` and `ccs`** — Both share the same hook system (`~/.claude/settings.json`), same `session_id` in hook JSON stdin, same `CLAUDE_ENV_FILE` mechanism. No special handling needed.

### High-Level Pseudocode

#### `session_hook.py` (SessionStart + PostToolUse + Stop hook)
```python
#!/usr/bin/env python3
"""Unified hook for session registration, heartbeat, and cleanup."""
import json, sys, os, sqlite3, random, subprocess

DB_PATH = os.path.expanduser("~/.desplega/desplega.db")
ADJECTIVES = ["blue", "red", "swift", "calm", "bold", ...]
NOUNS = ["tiger", "hawk", "river", "storm", "peak", ...]

def get_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    db = sqlite3.connect(DB_PATH)
    db.execute("PRAGMA journal_mode=WAL")
    db.execute("""CREATE TABLE IF NOT EXISTS sessions (...)""")
    db.execute("""CREATE TABLE IF NOT EXISTS messages (...)""")
    return db

def generate_unique_slug(db):
    existing = {r[0] for r in db.execute("SELECT slug FROM sessions")}
    for _ in range(100):
        slug = f"{random.choice(ADJECTIVES)}-{random.choice(NOUNS)}"
        if slug not in existing:
            return slug
    return f"session-{random.randint(1000, 9999)}"

def detect_vim_mode():
    kb_path = os.path.expanduser("~/.claude/keybindings.json")
    if os.path.exists(kb_path):
        with open(kb_path) as f:
            data = json.load(f)
            # Check for vim-style bindings (heuristic)
            return any("vim" in str(b).lower() for b in data.get("bindings", []))
    return False

def on_session_start(data):
    db = get_db()
    session_id = data["session_id"]
    slug = generate_unique_slug(db)
    tmux_pane = os.environ.get("TMUX_PANE", "")
    vim_mode = detect_vim_mode()

    db.execute(
        "INSERT OR REPLACE INTO sessions VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
        (slug, session_id, data.get("cwd", ""), tmux_pane, vim_mode)
    )
    db.commit()

    # Persist identity via CLAUDE_ENV_FILE
    env_file = os.environ.get("CLAUDE_ENV_FILE")
    if env_file:
        with open(env_file, "a") as f:
            f.write(f'export DESPLEGA_SESSION_ID="{session_id}"\n')
            f.write(f'export DESPLEGA_SLUG="{slug}"\n')

def on_heartbeat(data):
    db = get_db()
    db.execute(
        "UPDATE sessions SET last_heartbeat = CURRENT_TIMESTAMP WHERE session_id = ?",
        (data.get("session_id"),)
    )
    # Auto-cleanup stale sessions (> 10 min no heartbeat)
    db.execute("DELETE FROM sessions WHERE last_heartbeat < datetime('now', '-10 minutes')")
    db.commit()

def on_stop(data):
    on_heartbeat(data)  # Update heartbeat on stop too

def main():
    data = json.load(sys.stdin)
    hook_type = os.environ.get("CLAUDE_HOOK_EVENT", "")

    if hook_type == "SessionStart":
        on_session_start(data)
    elif hook_type in ("PostToolUse", "Stop"):
        on_heartbeat(data)

if __name__ == "__main__":
    main()
```

#### `mcp_server.py` (MCP stdio server with background message polling)
```python
#!/usr/bin/env python3
"""Desplega MCP server — session registry + inter-session messaging."""
import json, sys, os, sqlite3, threading, subprocess, time

DB_PATH = os.path.expanduser("~/.desplega/desplega.db")
MY_SLUG = None  # Set on first tool call from env

def get_db():
    db = sqlite3.connect(DB_PATH)
    db.execute("PRAGMA journal_mode=WAL")
    db.row_factory = sqlite3.Row
    return db

def get_my_slug():
    global MY_SLUG
    if MY_SLUG is None:
        MY_SLUG = os.environ.get("DESPLEGA_SLUG")
        if not MY_SLUG:
            # Fallback: lookup by TMUX_PANE
            db = get_db()
            row = db.execute("SELECT slug FROM sessions WHERE tmux_pane = ?",
                             (os.environ.get("TMUX_PANE", ""),)).fetchone()
            MY_SLUG = row["slug"] if row else "unknown"
    return MY_SLUG

# --- MCP Tool Handlers ---

def handle_whoami():
    db = get_db()
    row = db.execute("SELECT * FROM sessions WHERE slug = ?", (get_my_slug(),)).fetchone()
    return dict(row) if row else {"error": "session not found"}

def handle_list_sessions():
    db = get_db()
    rows = db.execute(
        "SELECT slug, directory, last_heartbeat FROM sessions WHERE last_heartbeat > datetime('now', '-10 minutes')"
    ).fetchall()
    return [dict(r) for r in rows]

def handle_send_message(recipient, msg_type, content):
    db = get_db()
    db.execute(
        "INSERT INTO messages (sender_slug, recipient_slug, type, content) VALUES (?, ?, ?, ?)",
        (get_my_slug(), recipient, msg_type, content)
    )
    db.commit()
    return {"sent": True}

def handle_read_messages():
    db = get_db()
    rows = db.execute(
        "SELECT * FROM messages WHERE recipient_slug = ? AND read_at IS NULL ORDER BY created_at",
        (get_my_slug(),)
    ).fetchall()
    messages = [dict(r) for r in rows]
    db.execute(
        "UPDATE messages SET read_at = CURRENT_TIMESTAMP WHERE recipient_slug = ? AND read_at IS NULL",
        (get_my_slug(),)
    )
    db.commit()
    return messages

# --- Background Message Delivery Thread ---

def deliver_via_tmux(pane, vim_mode, sender_slug, content):
    if len(content) > 500:
        text = f"[msg from {sender_slug}]: Long message received. Use read-messages to view."
    else:
        text = f"[msg from {sender_slug}]: {content}"

    cmds = []
    if vim_mode:
        cmds += [["tmux", "send-keys", "-t", pane, "Escape", ""],
                 ["tmux", "send-keys", "-t", pane, "i", ""]]
    cmds.append(["tmux", "send-keys", "-t", pane, "-l", text])
    cmds.append(["tmux", "send-keys", "-t", pane, "Enter", ""])

    for cmd in cmds:
        subprocess.run([c for c in cmd if c], check=False)

def message_poll_loop():
    """Background thread: poll for action messages and deliver via tmux."""
    while True:
        time.sleep(3)  # Poll every 3 seconds
        try:
            db = get_db()
            slug = get_my_slug()
            rows = db.execute(
                "SELECT m.*, s.tmux_pane, s.vim_mode FROM messages m "
                "JOIN sessions s ON s.slug = m.recipient_slug "
                "WHERE m.recipient_slug = ? AND m.type = 'action' "
                "AND m.delivered_at IS NULL",
                (slug,)
            ).fetchall()
            for row in rows:
                deliver_via_tmux(row["tmux_pane"], row["vim_mode"],
                                 row["sender_slug"], row["content"])
                db.execute("UPDATE messages SET delivered_at = CURRENT_TIMESTAMP WHERE id = ?",
                           (row["id"],))
            db.commit()
        except Exception:
            pass  # Silently continue on errors

# --- MCP stdio main loop ---

def main():
    # Start background delivery thread
    t = threading.Thread(target=message_poll_loop, daemon=True)
    t.start()

    # Standard MCP stdio protocol loop
    # (read JSON-RPC from stdin, dispatch to handlers, write response to stdout)
    ...

if __name__ == "__main__":
    main()
```

### Core Requirements

1. **Session Registry**
   - `SessionStart` hook registers session in SQLite (session_id, slug, cwd, tmux_pane, vim_mode, started_at)
   - `Stop` / `PostToolUse` hooks update `last_heartbeat`
   - Auto-cleanup: sessions with no heartbeat in 10 minutes marked as dead
   - Manual `purge-sessions` MCP tool for explicit cleanup

2. **MCP Server (Python, stdio)**
   - `whoami` — returns this session's slug, session_id, directory
   - `list-sessions` — returns all active sessions (slug, directory, last_heartbeat)
   - `send-message` — inserts message into SQLite (params: recipient slug/id, type, content)
   - `read-messages` — returns unread messages for this session, marks them as read

3. **Message Delivery (background thread in MCP process)**
   - Polls SQLite every N seconds for unread `action` type messages addressed to this session
   - Delivers via `tmux send-keys` with vim mode handling
   - Message format: `[msg from {sender_slug}]: {content}`
   - `info` and `status` messages are NOT injected — only available via `read-messages`

4. **Schema**
   ```sql
   CREATE TABLE sessions (
     slug TEXT PRIMARY KEY,
     session_id TEXT UNIQUE NOT NULL,
     directory TEXT NOT NULL,
     tmux_pane TEXT,
     vim_mode BOOLEAN DEFAULT 0,
     started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
     last_heartbeat DATETIME DEFAULT CURRENT_TIMESTAMP
   );

   CREATE TABLE messages (
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
   ```

### Architecture Diagram

```
┌─────────────────────────────────────────────────────┐
│                   ~/.desplega/                       │
│                   desplega.db                        │
│              (sessions + messages)                   │
└──────────┬────────────────────┬──────────────────────┘
           │                    │
    ┌──────┴──────┐      ┌─────┴───────┐
    │ Session A   │      │ Session B   │
    │ (blue-tiger)│      │ (red-hawk)  │
    ├─────────────┤      ├─────────────┤
    │ Claude Code │      │ Claude Code │
    │     ↕       │      │     ↕       │
    │ MCP (stdio) │      │ MCP (stdio) │
    │  ↕      ↕   │      │  ↕      ↕   │
    │ tools  bg   │      │ tools  bg   │
    │       thread│      │       thread│
    └─────────────┘      └─────────────┘

    Hook flow:
    SessionStart → INSERT sessions
    Stop/PostToolUse → UPDATE last_heartbeat

    Message flow:
    A calls send-message("red-hawk", "action", "check tests")
    → INSERT into messages
    → B's bg thread polls, finds unread action
    → B's bg thread: tmux send-keys to B's pane
    → "[msg from blue-tiger]: check tests" appears in B's prompt
```

### Compatibility: `claude` vs `ccs`

Both `claude` and `ccs` share the same hook infrastructure:
- **Same config:** Both use `~/.claude/settings.json` for hooks
- **Same hook events:** `SessionStart`, `PreToolUse`, `PostToolUse`, `Stop` all work identically
- **Same `session_id`:** Both pass it via JSON stdin to hooks
- **Same `CLAUDE_ENV_FILE`:** Both support env var persistence
- **`ccs` is a wrapper:** It delegates to Claude Code's hook system, not a separate one
- **Session storage differs:** `claude` uses `~/.claude/projects/`, `ccs` uses `~/.ccs/instances/work/projects/` — but this doesn't affect our system since we use `~/.desplega/desplega.db` as our own registry

**No special handling needed.** The system works identically with both `claude` and `ccs`.

## Next Steps

- **Next:** `/desplega:research` on implementation details — MCP stdio protocol in Python, CLAUDE_ENV_FILE behavior, hook registration in plugin.json, slug generation strategies
- This brainstorm feeds into the research phase as context
