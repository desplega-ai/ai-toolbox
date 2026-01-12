---
date: 2026-01-12T12:00:00-08:00
researcher: Claude
git_commit: fb14bc2c538235330b0cc453e0a46531ed402cb6
branch: main
repository: ai-toolbox
topic: "Agent-Swarm MCP Plugin Commands for cc-plugin"
tags: [research, agent-swarm, mcp, plugin, multi-agent, swarm]
status: complete
last_updated: 2026-01-12
last_updated_by: Claude
---

# Research: Agent-Swarm MCP Plugin Commands

**Date**: 2026-01-12
**Researcher**: Claude
**Git Commit**: fb14bc2c538235330b0cc453e0a46531ed402cb6
**Branch**: main
**Repository**: ai-toolbox

## Research Question

Identify interesting commands that could be added to cc-plugin as a new plugin when the agent-swarm MCP is configured.

---

## Summary

The [agent-swarm](https://github.com/desplega-ai/agent-swarm) package provides an MCP server that enables multi-agent coordination for AI coding assistants. It offers **19 MCP tools** across 5 categories: Core, Task Pool, Messaging, Profiles, and Services. The package already includes a `plugin/` directory with commands designed for Claude Code integration.

---

## Agent-Swarm MCP Tools Reference

### Core Tools (Always Available)
| Tool | Description |
|------|-------------|
| `join-swarm` | Join the agent swarm with name and optional lead flag |
| `poll-task` | Poll for new task assignments |
| `get-swarm` | List all agents and their status |
| `get-tasks` | List tasks with filters (status, tags, search) |
| `send-task` | Send/assign task to specific agent or pool |
| `get-task-details` | Get detailed task info, output, and logs |
| `store-progress` | Update task progress, mark complete/failed |
| `my-agent-info` | Get your agent ID and details |

### Task Pool Tools
| Tool | Description |
|------|-------------|
| `task-action` | Create unassigned tasks, claim/release from pool, accept/reject offered tasks |

### Messaging Tools
| Tool | Description |
|------|-------------|
| `list-channels` | List available chat channels |
| `create-channel` | Create new channel for agent communication |
| `post-message` | Post message to channel with threading and @mentions |
| `read-messages` | Read messages with filters (unread, mentions, time range) |

### Profiles Tools
| Tool | Description |
|------|-------------|
| `update-profile` | Update agent description, role, capabilities |

### Services Tools
| Tool | Description |
|------|-------------|
| `register-service` | Register background service for discovery |
| `unregister-service` | Remove service from registry |
| `list-services` | Query registered services |
| `update-service-status` | Update service health status |

---

## Existing Plugin Commands (from agent-swarm repo)

The agent-swarm package already has a `plugin/` directory with these commands:

| Command | Description | Swarm-Specific |
|---------|-------------|----------------|
| `/start-leader` | Initialize as swarm leader agent | Yes |
| `/start-worker` | Initialize as swarm worker agent | Yes |
| `/swarm-chat` | Internal Slack-like communication | Yes |
| `/work-on-task` | Work on assigned task | Yes |
| `/review-offered-task` | Accept/reject offered tasks | Yes |
| `/todos` | Manage personal todos.md file | Yes |
| `/create-plan` | Create implementation plan | Adapted |
| `/implement-plan` | Execute implementation plan | Adapted |
| `/research` | Perform codebase research | Adapted |

---

## Proposed New Plugin: `agent-swarm`

Based on the research, here are the recommended commands for a new `agent-swarm` plugin in cc-plugin:

### High-Value Commands (Recommended)

#### 1. `/swarm:delegate-task`
**Purpose**: Quickly delegate a task to the swarm from the current context.
```
/swarm:delegate-task "Implement the login form validation"
```
- Uses `send-task` MCP tool
- Optionally specify target agent or leave unassigned
- Can include dependencies with `--depends-on <taskId>`
- Can specify task type with `--type bug|feature|research`

#### 2. `/swarm:status`
**Purpose**: Quick overview of swarm state.
```
/swarm:status
```
- Shows: online agents, tasks in progress, pending tasks
- Uses `get-swarm` and `get-tasks` tools
- Color-coded output for agent status (idle/busy/offline)

#### 3. `/swarm:chat`
**Purpose**: Quick messaging within the swarm.
```
/swarm:chat "Need help with the API integration" --channel general
/swarm:chat @worker-1 "Check the shared folder for specs"
```
- Uses `post-message` and `read-messages` tools
- Supports @mentions and channel targeting
- Auto-marks messages as read

#### 4. `/swarm:join`
**Purpose**: Simplified swarm registration.
```
/swarm:join --as leader
/swarm:join --as worker --name "CodeNinja"
```
- Uses `join-swarm` tool
- Auto-generates creative name if not provided
- Sets up agent profile

#### 5. `/swarm:tasks`
**Purpose**: Task management dashboard.
```
/swarm:tasks                    # List all tasks
/swarm:tasks --mine             # My tasks only
/swarm:tasks --unassigned       # Pool tasks
/swarm:tasks --search "auth"    # Search tasks
```
- Uses `get-tasks` with various filters
- Shows task status, priority, dependencies

#### 6. `/swarm:work`
**Purpose**: Start/resume working on a task.
```
/swarm:work <taskId>
/swarm:work --next              # Claim next available
```
- Uses `task-action` to claim if needed
- Uses `store-progress` to mark in-progress
- Calls existing `/create-plan` or `/implement-plan` based on task type

### Medium-Value Commands

#### 7. `/swarm:inbox`
**Purpose**: Check unread messages and @mentions.
```
/swarm:inbox
/swarm:inbox --mentions-only
```
- Uses `read-messages` with unreadOnly filter
- Highlights @mentions to current agent

#### 8. `/swarm:complete`
**Purpose**: Mark current task as done.
```
/swarm:complete "Implemented login validation with tests"
/swarm:complete --failed "Blocked by missing API docs"
```
- Uses `store-progress` with output or failureReason
- Notifies swarm via chat

#### 9. `/swarm:agents`
**Purpose**: List all agents and their capabilities.
```
/swarm:agents
/swarm:agents --idle            # Only idle agents
```
- Uses `get-swarm` tool
- Shows agent names, status, current task

### Lower Priority Commands

#### 10. `/swarm:services`
**Purpose**: Service discovery and management.
```
/swarm:services                 # List all services
/swarm:services --register      # Register new service
```
- Uses services MCP tools
- Useful for background process management

#### 11. `/swarm:channel`
**Purpose**: Channel management.
```
/swarm:channel create dev-team "Development discussions"
/swarm:channel list
```
- Uses `create-channel` and `list-channels` tools

---

## Plugin Structure Recommendation

```
cc-plugin/agent-swarm/
├── .claude-plugin/
│   └── plugin.json
├── README.md
├── commands/
│   ├── delegate-task.md    # /swarm:delegate-task
│   ├── status.md           # /swarm:status
│   ├── chat.md             # /swarm:chat
│   ├── join.md             # /swarm:join
│   ├── tasks.md            # /swarm:tasks
│   ├── work.md             # /swarm:work
│   ├── inbox.md            # /swarm:inbox
│   ├── complete.md         # /swarm:complete
│   └── agents.md           # /swarm:agents
├── agents/
│   └── .gitkeep
└── skills/
    └── .gitkeep
```

---

## Key Design Considerations

1. **MCP Dependency Check**: All commands should check if `agent-swarm` MCP is configured and provide a helpful error if not.

2. **Naming Convention**: Use `swarm:` prefix to namespace commands and avoid conflicts with base plugin.

3. **Integration with Base Plugin**: Commands like `/swarm:work` should leverage existing `/create-plan` and `/implement-plan` from base plugin.

4. **Minimal Context**: Commands should be lightweight and focus on MCP tool orchestration rather than heavy logic.

5. **Error Handling**: Graceful handling of swarm disconnection, task not found, etc.

---

## Code References

- MCP Tools Documentation: https://github.com/desplega-ai/agent-swarm/blob/main/MCP.md
- Existing Plugin: https://github.com/desplega-ai/agent-swarm/tree/main/plugin
- README: https://github.com/desplega-ai/agent-swarm/blob/main/README.md
- Local cc-plugin structure: `cc-plugin/base/`
- Local plugin.json: `cc-plugin/base/.claude-plugin/plugin.json`

---

## Architecture Documentation

The agent-swarm package uses a lead/worker pattern:
- **Lead Agent**: Coordinates work, breaks down tasks, monitors progress, interfaces with user
- **Worker Agents**: Poll for tasks, execute work, report progress, can run in Docker containers
- **Task Pool**: Unassigned tasks that workers can claim
- **Channels**: Slack-like messaging for agent communication
- **Services**: Background processes agents can register for discovery

The existing plugin in agent-swarm repo follows the same structure as cc-plugin/base with:
- `commands/` - User-facing entry points
- `agents/` - Specialized workers (mostly adapted from base)
- `skills/` - Empty placeholder
- `.claude-plugin/plugin.json` - Plugin metadata

---

## Related Research

- N/A (first research on this topic)

---

## Open Questions

1. Should the new plugin commands work standalone or require the existing agent-swarm plugin from the repo?
2. How should authentication/API keys be handled for the MCP connection?
3. Should there be a setup wizard command like `/swarm:setup` to configure the MCP?
