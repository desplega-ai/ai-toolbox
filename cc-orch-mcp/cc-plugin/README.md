# Agent Swarm Plugin for Claude Code

> A Claude Code plugin markteplace to enable multi-agent coordination for AI coding assistants (focused on Claude Code).

## Motivation

Because _why not_?

## How does it work?

### Installation

From inside Claude Code, run:

```bash
/plugin marketplace add desplega-ai/ai-toolbox
```

or from the terminal

```bash
claude plugin marketplace add desplega-ai/ai-toolbox
```

Then install the plugin inside it with:

```bash
/plugin install agent-swarm@desplega-ai-toolbox
```

### What's inside?

Inside you will find:

- [commands](./commands) - Leader and worker commands
- [hooks](./hooks) - Hooks to help swarm agents collaborate better
- [.mcp.json](./.mcp.json) - MCP server configuration for agent-swarm (placeholder, you need to provide your own server and credentials)

#### Commands

1. `setup-leader`
2. `start-worker`

## License

MIT
