---
date: 2026-03-11T12:00:00Z
topic: "MCP Stdio Server in Pure Python (stdlib only)"
---

# MCP Stdio Server in Pure Python (stdlib only)

**Sources:** MCP Specification 2025-03-26 (modelcontextprotocol.io), MCP Python SDK (github.com/modelcontextprotocol/python-sdk)

---

## 1. Protocol Overview

MCP uses **JSON-RPC 2.0** over **newline-delimited** messages on stdin/stdout. Each message is a single line of JSON terminated by `\n`. Messages MUST be UTF-8 encoded.

### Transport Rules (stdio)
- Client launches the server as a **subprocess**
- Server reads JSON-RPC messages from **stdin** (one per line)
- Server writes JSON-RPC messages to **stdout** (one per line)
- **stderr** is available for logging (not protocol messages)
- Server MUST NOT write non-protocol data to stdout
- Messages are newline-delimited (`\n`), NOT length-prefixed (unlike LSP)

---

## 2. JSON-RPC 2.0 Message Format

### Request (client -> server)
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "method/name",
  "params": { ... }
}
```

### Response (server -> client)
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": { ... }
}
```

### Error Response
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32602,
    "message": "Unknown tool: invalid_tool_name"
  }
}
```

### Notification (no `id`, no response expected)
```json
{
  "jsonrpc": "2.0",
  "method": "notifications/initialized"
}
```

---

## 3. Lifecycle: The Initialize Handshake

### Step 1: Client sends `initialize` request
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2025-03-26",
    "capabilities": {
      "roots": { "listChanged": true }
    },
    "clientInfo": {
      "name": "claude-code",
      "version": "1.0.0"
    }
  }
}
```

### Step 2: Server responds with capabilities
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "protocolVersion": "2025-03-26",
    "capabilities": {
      "tools": {
        "listChanged": true
      }
    },
    "serverInfo": {
      "name": "my-server",
      "version": "0.1.0"
    }
  }
}
```

**Key:** Server MUST echo back the same `protocolVersion` if supported, or respond with a version it supports.

For a tools-only server, `capabilities` only needs `{"tools": {}}`. The `listChanged` sub-key is optional (signals the server may send `notifications/tools/list_changed`).

### Step 3: Client sends `initialized` notification
```json
{
  "jsonrpc": "2.0",
  "method": "notifications/initialized"
}
```

After this, the server enters **Operation** phase and can handle `tools/list` and `tools/call`.

---

## 4. Tool Registration: `tools/list`

### Request
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/list",
  "params": {}
}
```

### Response
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "tools": [
      {
        "name": "get_weather",
        "description": "Get current weather for a location",
        "inputSchema": {
          "type": "object",
          "properties": {
            "location": {
              "type": "string",
              "description": "City name or zip code"
            }
          },
          "required": ["location"]
        }
      }
    ]
  }
}
```

**`inputSchema`** is a standard JSON Schema object. It defines the parameters the tool accepts.

---

## 5. Tool Execution: `tools/call`

### Request
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "get_weather",
    "arguments": {
      "location": "New York"
    }
  }
}
```

### Success Response
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Temperature: 72F, Partly cloudy"
      }
    ],
    "isError": false
  }
}
```

### Tool Execution Error (tool ran but failed)
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "API rate limit exceeded"
      }
    ],
    "isError": true
  }
}
```

### Protocol Error (unknown tool, invalid args)
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "error": {
    "code": -32602,
    "message": "Unknown tool: bad_tool"
  }
}
```

**Content types:** `text` (most common), `image` (base64 + mimeType), `resource` (embedded URI).

---

## 6. Python stdin/stdout Buffering Gotchas

This is the **most critical** implementation detail:

1. **stdout MUST be flushed after every message.** Python buffers stdout by default when not connected to a terminal (i.e., when used as a subprocess). Without explicit flushing, the client will hang waiting for responses.

2. **Use `sys.stdout.buffer` (binary mode) for reliable UTF-8.** Python's text-mode stdout encoding is platform-dependent (especially problematic on Windows). The official MCP Python SDK wraps `sys.stdout.buffer` with `TextIOWrapper(sys.stdout.buffer, encoding="utf-8")`.

3. **Read stdin line-by-line.** Each JSON-RPC message is one line. Use `sys.stdin.readline()` or iterate `for line in sys.stdin`.

4. **Never print debug output to stdout.** Use `sys.stderr` for all logging/debug output.

5. **Handle EOF on stdin.** When the client disconnects, stdin will reach EOF. The server should exit cleanly.

### Flush strategies:
```python
# Option A: Flush after each write
sys.stdout.write(json_str + "\n")
sys.stdout.flush()

# Option B: Use unbuffered binary writes
import os
os.write(1, (json_str + "\n").encode("utf-8"))

# Option C: Wrap stdout at startup
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", line_buffering=True)
# line_buffering=True flushes on every \n
```

**Recommendation:** Option C (line_buffering=True) is the cleanest for a pure-Python approach. Set it once at startup and then just use `print()` or `sys.stdout.write()`.

---

## 7. Complete Minimal Implementation (stdlib only)

```python
#!/usr/bin/env python3
"""Minimal MCP stdio server - pure Python, no dependencies."""
import json
import sys
import io

# Force UTF-8 and line-buffered stdout (flush on every \n)
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", line_buffering=True)
sys.stdin = io.TextIOWrapper(sys.stdin.buffer, encoding="utf-8")

PROTOCOL_VERSION = "2025-03-26"
SERVER_NAME = "my-mcp-server"
SERVER_VERSION = "0.1.0"

# --- Tool Registry ---

TOOLS = [
    {
        "name": "echo",
        "description": "Echoes back the input text",
        "inputSchema": {
            "type": "object",
            "properties": {
                "text": {
                    "type": "string",
                    "description": "Text to echo back"
                }
            },
            "required": ["text"]
        }
    },
]

def handle_tool_call(name: str, arguments: dict) -> dict:
    """Dispatch tool calls. Returns {"content": [...], "isError": bool}."""
    if name == "echo":
        return {
            "content": [{"type": "text", "text": arguments.get("text", "")}],
            "isError": False,
        }
    return {
        "content": [{"type": "text", "text": f"Unknown tool: {name}"}],
        "isError": True,
    }

# --- JSON-RPC helpers ---

def send_response(id, result):
    msg = {"jsonrpc": "2.0", "id": id, "result": result}
    sys.stdout.write(json.dumps(msg) + "\n")

def send_error(id, code, message):
    msg = {"jsonrpc": "2.0", "id": id, "error": {"code": code, "message": message}}
    sys.stdout.write(json.dumps(msg) + "\n")

def log(text):
    """Log to stderr (never stdout)."""
    print(text, file=sys.stderr, flush=True)

# --- Request handlers ---

def handle_initialize(id, params):
    send_response(id, {
        "protocolVersion": PROTOCOL_VERSION,
        "capabilities": {
            "tools": {}
        },
        "serverInfo": {
            "name": SERVER_NAME,
            "version": SERVER_VERSION,
        },
    })

def handle_tools_list(id, params):
    send_response(id, {"tools": TOOLS})

def handle_tools_call(id, params):
    name = params.get("name", "")
    arguments = params.get("arguments", {})
    result = handle_tool_call(name, arguments)
    send_response(id, result)

def handle_ping(id, params):
    send_response(id, {})

# --- Main loop ---

HANDLERS = {
    "initialize": handle_initialize,
    "tools/list": handle_tools_list,
    "tools/call": handle_tools_call,
    "ping": handle_ping,
}

def main():
    log(f"{SERVER_NAME} v{SERVER_VERSION} starting...")

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue

        try:
            msg = json.loads(line)
        except json.JSONDecodeError as e:
            log(f"Invalid JSON: {e}")
            continue

        # Notifications (no id) - just acknowledge silently
        if "id" not in msg:
            method = msg.get("method", "")
            log(f"Notification: {method}")
            continue

        id = msg["id"]
        method = msg.get("method", "")
        params = msg.get("params", {})

        handler = HANDLERS.get(method)
        if handler:
            try:
                handler(id, params)
            except Exception as e:
                log(f"Error handling {method}: {e}")
                send_error(id, -32603, f"Internal error: {str(e)}")
        else:
            log(f"Unknown method: {method}")
            send_error(id, -32601, f"Method not found: {method}")

if __name__ == "__main__":
    main()
```

---

## 8. How to Register with Claude Code

```bash
# Add as a stdio MCP server
claude mcp add --transport stdio my-server -- python3 /path/to/mcp_server.py
```

Or in `.mcp.json`:
```json
{
  "mcpServers": {
    "my-server": {
      "command": "python3",
      "args": ["/path/to/mcp_server.py"],
      "type": "stdio"
    }
  }
}
```

---

## 9. Codebase Findings

- **No existing MCP server implementations** in this repo. The `cc-plugin/` directory contains Claude Code plugins (hooks, skills, agents as Markdown/YAML/Python) but no MCP servers.
- The only MCP-related code found was in `node_modules/convex/` (third-party) and `.mcp.json` config references.
- Python files in the repo (`cc-plugin/base/hooks/*.py`, `hn-sql/`, `invoice-cli/`, `ai-tracker/`) are all non-MCP.

---

## 10. Key Gotchas Summary

| Gotcha | Solution |
|--------|----------|
| stdout buffering kills the server | Use `line_buffering=True` on TextIOWrapper or explicit `flush()` |
| Platform encoding (Windows CP1252) | Wrap `sys.stdout.buffer` / `sys.stdin.buffer` with explicit UTF-8 TextIOWrapper |
| Debug prints to stdout | Always use `sys.stderr` for logging |
| Client sends notifications (no id) | Don't try to respond to messages without `id` |
| `params` may be missing | Default to `{}` - e.g., `tools/list` may omit params entirely |
| Protocol version mismatch | Echo back client's version if you support it; otherwise send yours |
| EOF on stdin | Exit cleanly when stdin is exhausted (for-loop naturally handles this) |
| JSON-RPC batching | Spec allows arrays of messages; minimal servers can ignore this initially |

---

## 11. Standard JSON-RPC Error Codes

| Code | Meaning |
|------|---------|
| -32700 | Parse error (invalid JSON) |
| -32600 | Invalid request |
| -32601 | Method not found |
| -32602 | Invalid params |
| -32603 | Internal error |

---

## 12. Extending the Skeleton

To add a new tool:

1. Add tool definition to `TOOLS` list (name, description, inputSchema)
2. Add handler logic in `handle_tool_call()` function
3. That's it. No registration ceremony needed.

For more complex servers, consider:
- **Async:** Replace the sync for-loop with `asyncio` if tools do I/O
- **Resources/Prompts:** Add `resources` or `prompts` to capabilities and implement `resources/list`, `prompts/list` etc.
- **Progress notifications:** Server can send `notifications/progress` during long tool calls
