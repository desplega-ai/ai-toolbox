# Swarm Plugin

Multi-agent coordination plugin for agent-swarm MCP.

## Prerequisites

This plugin requires the [agent-swarm](https://github.com/desplega-ai/agent-swarm) MCP server to be configured.

Portable Agent Plugins clients start the bundled MCP bridge automatically. Create `agent-swarm.json` in the client-provided plugin data directory (the location represented by `${PLUGIN_DATA}`):

```json
{
  "apiKey": "your-swarm-api-key",
  "agentId": "your-agent-id",
  "mcpUrl": "https://your-swarm.example.com/mcp"
}
```

`mcpUrl` is optional and defaults to Desplega's hosted Agent Swarm endpoint. Restrict the file to your user account because it contains a secret. The bridge requires Node.js 20.18.1 or newer with npm and downloads the pinned `mcp-remote@0.1.38` package through `npx`.

## Commands

| Command | Description |
|---------|-------------|
| `/swarm-status` | Quick overview of agents and tasks |
| `/kick-task <description>` | Send a task to the pool |
| `/teleport` | Transfer current context to a swarm worker |

## Skills

### swarm-expert

Comprehensive guidance for multi-agent coordination:
- Joining swarms as leader or worker
- Delegating and claiming tasks
- Agent-to-agent messaging
- Task lifecycle management

## Installation

Add this plugin to your Claude Code configuration.

## Usage

Ask about swarm coordination and Claude will automatically use the swarm-expert skill:

- "How do I join the swarm as a leader?"
- "Delegate this task to the agent pool"
- "Check the swarm status"
- "Send a message to the dev channel"
