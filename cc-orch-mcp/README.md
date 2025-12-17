# Agent Swarm MCP

> Agent orchestration layer MCP for Claude Code, Codex, Gemini CLI, and more!

## Overview

Agent Swarm MCP enables multi-agent coordination for AI coding assistants. It provides tools for agents to join a swarm, receive tasks, report progress, and coordinate with a lead agent.

## Quick Start

### Setup (Recommended)

Run the setup command in your project directory:

```bash
bunx @desplega.ai/agent-swarm@latest setup
```

This will:
- Create `.claude` directory and `settings.local.json` if needed
- Create `.mcp.json` if needed
- Add entries to `.gitignore`
- Configure permissions and hooks
- Prompt for your API token and Agent ID

Options:
- `--dry-run` - Preview changes without writing
- `--restore` - Restore files from `.bak` backups

### Manual Installation

Add to your `.mcp.json`:

```json
{
  "mcpServers": {
    "agent-swarm": {
      "type": "http",
      "url": "https://agent-swarm-mcp.desplega.sh/mcp",
      "headers": {
        "Authorization": "Bearer <your-token>",
        "X-Agent-ID": "<your-agent-id>"
      }
    }
  }
}
```

or for Claude Code, use:

```bash
claude mcp add --transport http agent-swarm https://agent-swarm-mcp.desplega.sh/mcp --header "Authorization: Bearer <your-token>" --header "X-Agent-ID: <your-agent-id>"
```

Note: By default it will be installed locally (in ~/.claude.json) so add a `--scope project` to install in the current project's `.mcp.json` (recommended for better control).

For other tools, you can check this [generator page with most of commands](https://v0-mcp-commands.vercel.app/?type=http&name=agent-swarm&url=https%3A%2F%2Fagent-swarm-mcp.desplega.sh%2Fmcp&headers=Authorization%3DBearer+%3Ctoken%3E%2CX-Agent-ID%3D%3Cagent_uuid%3E).

## CLI Commands

```bash
# Run setup wizard
bunx @desplega.ai/agent-swarm setup

# Preview setup changes
bunx @desplega.ai/agent-swarm setup --dry-run

# Restore from backups
bunx @desplega.ai/agent-swarm setup --restore

# Start MCP HTTP server (for self-hosting)
bunx @desplega.ai/agent-swarm mcp
bunx @desplega.ai/agent-swarm mcp --port 8080 --key my-api-key

# Run Claude CLI with swarm integration
bunx @desplega.ai/agent-swarm claude
bunx @desplega.ai/agent-swarm claude --headless -m "Hello"

# Hook handler (called by Claude Code hooks)
bunx @desplega.ai/agent-swarm hook

# Show help
bunx @desplega.ai/agent-swarm help
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `MCP_BASE_URL` | Base URL for the MCP server | `https://agent-swarm-mcp.desplega.sh` |
| `PORT` | Port for self-hosted MCP server | `3013` |
| `API_KEY` | API key for server authentication | - |

## Development

Install dependencies:

```bash
bun install
```

Run the STDIO server:

```bash
bun run start
```

Run the HTTP server:

```bash
bun run start:http
```

Run with hot reload:

```bash
bun run dev      # STDIO
bun run dev:http # HTTP
```

Run the MCP inspector:

```bash
bun run inspector      # STDIO
bun run inspector:http # HTTP
```

Run the CLI locally:

```bash
bun run cli setup
bun run cli setup --dry-run
bun run hook  # Hook handler
```

## MCP Tools

The server provides these tools for agent coordination:

- `join-swarm` - Register an agent in the swarm
- `poll-task` - Poll for assigned tasks (worker agents)
- `send-task` - Assign a task to an agent (lead agent)
- `get-swarm` - List all agents in the swarm
- `get-tasks` - List tasks filtered by status
- `get-task-details` - Get detailed info about a task
- `store-progress` - Update task progress or mark complete/failed
- `my-agent-info` - Get current agent's info

## License

MIT License, 2025-2026 (c) desplega.ai
