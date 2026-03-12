#!/usr/bin/env python3
"""MCP stdio server for desplega teams plugin.

JSON-RPC 2.0 server providing session discovery and messaging tools.
All diagnostic output goes to stderr — stdout is reserved for MCP protocol.
"""

import io
import json
import os
import sys
from pathlib import Path

# Ensure line-buffered stdout for MCP protocol
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", line_buffering=True)
sys.stdin = io.TextIOWrapper(sys.stdin.buffer, encoding="utf-8")

# Import shared modules
SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

from db import get_db
from tmux import send_to_pane

SERVER_NAME = "teams"
SERVER_VERSION = "0.1.0"
PROTOCOL_VERSION = "2025-03-26"

TOOLS = [
    {
        "name": "whoami",
        "description": "Get the current session's identity (slug, session_id, directory)",
        "inputSchema": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
    {
        "name": "list-sessions",
        "description": "List all active Claude Code sessions with their slugs, directories, and heartbeat status",
        "inputSchema": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
    {
        "name": "send-message",
        "description": "Send a message to another Claude Code session by slug or session_id",
        "inputSchema": {
            "type": "object",
            "properties": {
                "recipient": {
                    "type": "string",
                    "description": "Recipient's slug (e.g., 'bold-eagle-1337') or session_id",
                },
                "type": {
                    "type": "string",
                    "enum": ["action", "info", "status"],
                    "description": "Message type: action (request), info (information), status (update)",
                    "default": "info",
                },
                "content": {
                    "type": "string",
                    "description": "Message content",
                },
            },
            "required": ["recipient", "content"],
        },
    },
    {
        "name": "read-messages",
        "description": "Read unread messages for the current session and mark them as read",
        "inputSchema": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
    {
        "name": "purge-sessions",
        "description": "Remove stale sessions (no heartbeat for 10+ minutes) and their orphaned messages",
        "inputSchema": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
]


def respond(id, result):
    """Send a JSON-RPC 2.0 success response."""
    msg = {"jsonrpc": "2.0", "id": id, "result": result}
    sys.stdout.write(json.dumps(msg) + "\n")


def respond_error(id, code, message):
    """Send a JSON-RPC 2.0 error response."""
    msg = {"jsonrpc": "2.0", "id": id, "error": {"code": code, "message": message}}
    sys.stdout.write(json.dumps(msg) + "\n")


def identify_self():
    """Identify the current session by TMUX_PANE or env var."""
    tmux_pane = os.environ.get("TMUX_PANE")
    session_id = os.environ.get("DESPLEGA_SESSION_ID")

    with get_db() as db:
        # Primary: look up by TMUX_PANE
        if tmux_pane:
            row = db.execute(
                "SELECT session_id, slug, directory FROM sessions WHERE tmux_pane = ?",
                (tmux_pane,),
            ).fetchone()
            if row:
                return dict(row)

        # Secondary: try DESPLEGA_SESSION_ID
        if session_id:
            row = db.execute(
                "SELECT session_id, slug, directory FROM sessions WHERE session_id = ?",
                (session_id,),
            ).fetchone()
            if row:
                return dict(row)

    return None


def handle_whoami(id, params):
    """Handle the whoami tool call."""
    me = identify_self()
    if me:
        respond(id, {"content": [{"type": "text", "text": json.dumps(me)}]})
    else:
        respond(id, {
            "content": [{"type": "text", "text": json.dumps({
                "error": "Cannot identify session — not in tmux or session not registered yet"
            })}],
            "isError": True,
        })


def handle_list_sessions(id, params):
    """Handle the list-sessions tool call."""
    with get_db() as db:
        rows = db.execute(
            """SELECT slug, session_id, directory, last_heartbeat,
                      CASE WHEN last_heartbeat < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-5 minutes')
                           THEN 1 ELSE 0 END AS is_stale
               FROM sessions
               ORDER BY started_at"""
        ).fetchall()

    sessions = []
    for r in rows:
        entry = {
            "slug": r["slug"],
            "session_id": r["session_id"],
            "directory": r["directory"],
            "last_heartbeat": r["last_heartbeat"],
        }
        if r["is_stale"]:
            entry["warning"] = "stale — no heartbeat for 5+ minutes"
        sessions.append(entry)

    respond(id, {"content": [{"type": "text", "text": json.dumps(sessions, indent=2)}]})


def handle_send_message(id, params):
    """Handle the send-message tool call."""
    recipient_ref = params.get("recipient", "")
    msg_type = params.get("type", "info")
    content = params.get("content", "")

    if msg_type not in ("action", "info", "status"):
        respond_error(id, -32602, f"Invalid message type: {msg_type}. Must be action, info, or status")
        return

    if not recipient_ref or not content:
        respond_error(id, -32602, "Missing required parameters: recipient, content")
        return

    # Find sender
    me = identify_self()
    if not me:
        respond(id, {
            "content": [{"type": "text", "text": json.dumps({
                "error": "Cannot identify sender session"
            })}],
            "isError": True,
        })
        return

    # Find recipient by slug or session_id
    with get_db() as db:
        recipient = db.execute(
            "SELECT session_id, slug, tmux_pane, vim_mode FROM sessions WHERE slug = ? OR session_id = ?",
            (recipient_ref, recipient_ref),
        ).fetchone()

        if not recipient:
            respond(id, {
                "content": [{"type": "text", "text": json.dumps({
                    "error": f"Recipient '{recipient_ref}' not found"
                })}],
                "isError": True,
            })
            return

        # Store message
        cursor = db.execute(
            """INSERT INTO messages (sender_id, recipient_id, type, content)
               VALUES (?, ?, ?, ?)""",
            (me["session_id"], recipient["session_id"], msg_type, content),
        )
        msg_id = cursor.lastrowid

        # Attempt tmux delivery
        delivered = False
        reason = None
        if recipient["tmux_pane"]:
            sender_slug = me.get("slug", "unknown")
            display_text = f"[{sender_slug}/{msg_type}] {content}"
            delivered = send_to_pane(
                recipient["tmux_pane"], display_text, bool(recipient["vim_mode"])
            )
            if delivered:
                db.execute(
                    "UPDATE messages SET delivered_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?",
                    (msg_id,),
                )
            else:
                reason = "tmux send-keys failed — pane may not exist"
        else:
            reason = "no tmux pane"

        db.commit()

    result = {"message_id": msg_id, "delivered": delivered}
    if reason:
        result["reason"] = reason

    respond(id, {"content": [{"type": "text", "text": json.dumps(result)}]})


def handle_read_messages(id, params):
    """Handle the read-messages tool call."""
    me = identify_self()
    if not me:
        respond(id, {
            "content": [{"type": "text", "text": json.dumps({
                "error": "Cannot identify session"
            })}],
            "isError": True,
        })
        return

    with get_db() as db:
        rows = db.execute(
            """SELECT m.id, m.type, m.content, m.created_at, s.slug AS sender_slug
               FROM messages m
               LEFT JOIN sessions s ON m.sender_id = s.session_id
               WHERE m.recipient_id = ? AND m.read_at IS NULL
               ORDER BY m.created_at""",
            (me["session_id"],),
        ).fetchall()

        messages = []
        msg_ids = []
        for r in rows:
            messages.append({
                "id": r["id"],
                "sender_slug": r["sender_slug"] or "unknown",
                "type": r["type"],
                "content": r["content"],
                "created_at": r["created_at"],
            })
            msg_ids.append(r["id"])

        # Mark as read
        if msg_ids:
            placeholders = ",".join("?" * len(msg_ids))
            db.execute(
                f"UPDATE messages SET read_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id IN ({placeholders})",
                msg_ids,
            )
            db.commit()

    respond(id, {"content": [{"type": "text", "text": json.dumps(messages, indent=2)}]})


def handle_purge_sessions(id, params):
    """Handle the purge-sessions tool call."""
    with get_db() as db:
        stale = db.execute(
            """SELECT slug, session_id FROM sessions
               WHERE last_heartbeat < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-10 minutes')"""
        ).fetchall()

        purged = [{"slug": r["slug"], "session_id": r["session_id"]} for r in stale]
        stale_ids = [r["session_id"] for r in stale]

        if stale_ids:
            placeholders = ",".join("?" * len(stale_ids))
            db.execute(
                f"DELETE FROM messages WHERE recipient_id IN ({placeholders}) AND read_at IS NULL",
                stale_ids,
            )
            db.execute(
                f"DELETE FROM sessions WHERE session_id IN ({placeholders})",
                stale_ids,
            )
            db.commit()

    respond(id, {"content": [{"type": "text", "text": json.dumps({"purged": purged})}]})


TOOL_HANDLERS = {
    "whoami": handle_whoami,
    "list-sessions": handle_list_sessions,
    "send-message": handle_send_message,
    "read-messages": handle_read_messages,
    "purge-sessions": handle_purge_sessions,
}


def handle_request(req):
    """Dispatch a JSON-RPC 2.0 request."""
    method = req.get("method", "")
    id = req.get("id")
    params = req.get("params", {})

    # Notifications (no id) — just acknowledge silently
    if id is None:
        return

    if method == "initialize":
        respond(id, {
            "protocolVersion": PROTOCOL_VERSION,
            "capabilities": {"tools": {}},
            "serverInfo": {"name": SERVER_NAME, "version": SERVER_VERSION},
        })
    elif method == "ping":
        respond(id, {})
    elif method == "tools/list":
        respond(id, {"tools": TOOLS})
    elif method == "tools/call":
        tool_name = params.get("name", "")
        arguments = params.get("arguments", {})
        handler = TOOL_HANDLERS.get(tool_name)
        if handler:
            try:
                handler(id, arguments)
            except Exception as e:
                print(f"ERROR: Tool '{tool_name}' failed: {e}", file=sys.stderr)
                respond(id, {
                    "content": [{"type": "text", "text": json.dumps({"error": str(e)})}],
                    "isError": True,
                })
        else:
            respond_error(id, -32601, f"Unknown tool: {tool_name}")
    else:
        respond_error(id, -32601, f"Unknown method: {method}")


def main():
    """Main loop — read JSON-RPC messages from stdin, dispatch."""
    print(f"teams MCP server v{SERVER_VERSION} starting", file=sys.stderr)

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
            handle_request(req)
        except json.JSONDecodeError as e:
            print(f"ERROR: Invalid JSON: {e}", file=sys.stderr)
        except Exception as e:
            print(f"ERROR: Unhandled exception: {e}", file=sys.stderr)


if __name__ == "__main__":
    main()
