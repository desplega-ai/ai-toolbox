#!/usr/bin/env python3
"""Session registry hook for desplega teams plugin.

Handles SessionStart, PostToolUse, and Stop lifecycle events.
Registers sessions with unique slugs, sends heartbeats, and cleans up on exit.
"""

import json
import os
import sys
import time
from pathlib import Path

# Import shared modules from mcp/ directory
SCRIPT_DIR = Path(__file__).resolve().parent
MCP_DIR = SCRIPT_DIR.parent / "mcp"
sys.path.insert(0, str(MCP_DIR))

from db import get_db
from slugs import generate_unique_slug

HEARTBEAT_INTERVAL = 60  # seconds
STALE_THRESHOLD = 600  # 10 minutes


def detect_vim_mode():
    """Check if user has vim mode enabled in ~/.claude.json."""
    try:
        claude_json = Path.home() / ".claude.json"
        if claude_json.exists():
            data = json.loads(claude_json.read_text())
            return data.get("editorMode") == "vim"
    except Exception:
        pass
    return False


def get_throttle_path(session_id):
    """Get path to heartbeat throttle file."""
    return Path(f"/tmp/desplega-heartbeat-{session_id}")


def handle_session_start(data):
    """Register or update a session on SessionStart."""
    session_id = data.get("session_id", "")
    cwd = data.get("cwd", os.getcwd())
    tmux_pane = os.environ.get("TMUX_PANE")
    vim_mode = detect_vim_mode()
    model = data.get("model", "")

    if not tmux_pane:
        print(
            "WARNING: TMUX_PANE not set — session registered but messaging won't work",
            file=sys.stderr,
        )

    with get_db() as db:
        existing = db.execute(
            "SELECT slug FROM sessions WHERE session_id = ?", (session_id,)
        ).fetchone()

        if existing:
            # Resume — preserve slug, update metadata
            slug = existing["slug"]
            db.execute(
                """UPDATE sessions
                   SET directory = ?, tmux_pane = ?, vim_mode = ?,
                       model = ?, last_heartbeat = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
                   WHERE session_id = ?""",
                (cwd, tmux_pane, int(vim_mode), model, session_id),
            )
        else:
            # New session — generate unique slug
            used = {
                r["slug"]
                for r in db.execute("SELECT slug FROM sessions").fetchall()
            }
            slug = generate_unique_slug(used)
            db.execute(
                """INSERT INTO sessions (session_id, slug, directory, tmux_pane, vim_mode, model)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (session_id, slug, cwd, tmux_pane, int(vim_mode), model),
            )

        db.commit()

    # Write to CLAUDE_ENV_FILE if available
    env_file = os.environ.get("CLAUDE_ENV_FILE")
    if env_file:
        try:
            with open(env_file, "a") as f:
                f.write(f"DESPLEGA_SESSION_ID={session_id}\n")
                f.write(f"DESPLEGA_SLUG={slug}\n")
        except Exception as e:
            print(f"WARNING: Could not write to CLAUDE_ENV_FILE: {e}", file=sys.stderr)

    # Return context to Claude about the session slug
    result = {
        "hookSpecificOutput": {
            "hookEventName": "SessionStart",
            "additionalContext": f"You are session '{slug}'. Use the teams MCP tools to communicate with other sessions."
        }
    }
    print(json.dumps(result))


def handle_post_tool_use(data):
    """Send throttled heartbeat on PostToolUse."""
    session_id = data.get("session_id", "")
    if not session_id:
        return

    throttle_path = get_throttle_path(session_id)

    # Check throttle
    try:
        if throttle_path.exists():
            mtime = throttle_path.stat().st_mtime
            if time.time() - mtime < HEARTBEAT_INTERVAL:
                return
    except Exception as e:
        print(f"WARNING: Throttle check failed: {e}", file=sys.stderr)

    # Update heartbeat
    with get_db() as db:
        db.execute(
            """UPDATE sessions
               SET last_heartbeat = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
               WHERE session_id = ?""",
            (session_id,),
        )

        # Opportunistically purge stale sessions
        db.execute(
            """DELETE FROM sessions
               WHERE last_heartbeat < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-10 minutes')""",
        )
        db.commit()

    # Update throttle file
    try:
        throttle_path.touch()
    except Exception as e:
        print(f"WARNING: Throttle touch failed: {e}", file=sys.stderr)


def handle_stop(data):
    """Clean up session on Stop."""
    session_id = data.get("session_id", "")
    if not session_id:
        return

    with get_db() as db:
        # Remove session
        db.execute("DELETE FROM sessions WHERE session_id = ?", (session_id,))
        # Clean up undelivered messages to this session
        db.execute(
            "DELETE FROM messages WHERE recipient_id = ? AND read_at IS NULL",
            (session_id,),
        )
        db.commit()

    # Remove throttle file
    throttle_path = get_throttle_path(session_id)
    try:
        throttle_path.unlink(missing_ok=True)
    except Exception:
        pass


def main():
    try:
        raw = sys.stdin.read()
        data = json.loads(raw) if raw.strip() else {}
    except (json.JSONDecodeError, Exception) as e:
        print(f"ERROR: Failed to parse stdin: {e}", file=sys.stderr)
        sys.exit(0)  # Don't block Claude on parse errors

    event = data.get("hook_event_name", "")

    if event == "SessionStart":
        handle_session_start(data)
    elif event == "PostToolUse":
        handle_post_tool_use(data)
    elif event == "Stop":
        handle_stop(data)
    else:
        # Unknown event — pass through silently
        pass


if __name__ == "__main__":
    main()
