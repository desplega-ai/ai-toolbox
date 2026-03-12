# teams

Inter-session communication plugin for Claude Code. Sessions discover each other, exchange messages, and coordinate work through a shared SQLite database and MCP tools.

## Requirements

- Python 3.9+
- tmux (sessions must run inside tmux panes)
- macOS

## Installation

```bash
/plugin install teams@desplega-ai-toolbox
```

## MCP Tools

The plugin registers a `teams` MCP server with 5 tools:

| Tool | Description |
|------|-------------|
| `whoami` | Get current session identity (slug, session_id, directory) |
| `list-sessions` | List all active Claude Code sessions |
| `send-message` | Send a message to another session by slug |
| `read-messages` | Read unread messages and mark them as read |
| `purge-sessions` | Remove stale sessions (10+ min inactive) |

## How It Works

1. **Session registry** — A hook fires on `SessionStart`, `PostToolUse`, and `Stop` to register/heartbeat/deregister sessions in `~/.desplega/desplega.db`
2. **Slug assignment** — Each session gets a unique human-readable slug (e.g., `bold-eagle-1337`)
3. **Messaging** — Sessions send messages via `send-message`, which stores in SQLite and delivers to the recipient's tmux pane via `send-keys`
4. **Discovery** — `list-sessions` shows all active sessions with their slugs and directories

## Architecture

```
┌─────────────────┐     ┌─────────────────┐
│  Claude Session  │     │  Claude Session  │
│   (tmux pane)    │     │   (tmux pane)    │
└────────┬─────────┘     └────────┬─────────┘
         │                        │
    Hook │ MCP                Hook │ MCP
         │                        │
         ▼                        ▼
┌──────────────────────────────────────────┐
│          ~/.desplega/desplega.db         │
│  ┌──────────┐  ┌──────────────────────┐  │
│  │ sessions │  │      messages        │  │
│  └──────────┘  └──────────────────────┘  │
└──────────────────────────────────────────┘
```

## Permissions

To auto-allow MCP tools, add to your project or global `settings.json`:

```json
{
    "permissions": {
        "allow": [
            "mcp__teams__whoami",
            "mcp__teams__list-sessions",
            "mcp__teams__send-message",
            "mcp__teams__read-messages",
            "mcp__teams__purge-sessions"
        ]
    }
}
```

## Limitations

- **tmux required** — Sessions must run inside tmux panes for messaging to work
- **Same machine only** — All sessions must share the same SQLite database
- **No background polling** — Recipients see messages via tmux push or on-demand `read-messages`
