# Coding Agent Orchestrator MCP

> ...

## Overview

...

## MCP installation

Standard MCP installation, add to your `.mcp.json`:

```json
{
  "mcpServers": {
    "cc-orch-mcp": {
      "command": "bunx",
      "args": ["@desplega.ai/cc-orch-mcp"]
    }
  }
}
```

## Develop 

To install dependencies:

```bash
bun install
```

To run the STDIO server:

```bash
bun run start
```

to run the HTTP server:

```bash
bun run start:http
```

and to run the inspector (connected to the HTTP server):

```bash
bun run inspect
```


## License

MIT License, 2025-2026 (c) desplega.ai
