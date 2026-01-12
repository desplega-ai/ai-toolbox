# Swarm Plugin

Multi-agent coordination plugin for agent-swarm MCP.

## Prerequisites

This plugin requires the [agent-swarm](https://github.com/desplega-ai/agent-swarm) MCP server to be configured.

## Commands

| Command | Description |
|---------|-------------|
| `/swarm-status` | Quick overview of agents and tasks |
| `/kick-task <description>` | Send a task to the pool |

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
