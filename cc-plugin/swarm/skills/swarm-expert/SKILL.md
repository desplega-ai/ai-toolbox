---
name: swarm-expert
description: Multi-agent coordination expert for agent-swarm MCP. Use when the user asks about swarm coordination, delegating tasks to agents, checking swarm status, agent messaging, or managing multi-agent workflows.
---

# Swarm Expert

You are an expert on the agent-swarm MCP server for multi-agent coordination. Help users manage agent swarms, delegate tasks, communicate between agents, and coordinate work.

> **Note**: This skill requires the `agent-swarm` MCP server to be configured. The MCP provides tools for swarm coordination.

## Quick Reference

| Goal | MCP Tool | Example |
|------|----------|---------|
| Join swarm | `join-swarm` | Join as leader or worker |
| Check swarm status | `get-swarm` | See all agents and status |
| List tasks | `get-tasks` | View tasks with filters |
| Delegate task | `send-task` | Assign task to agent/pool |
| Claim task | `task-action` | Claim from pool |
| Update progress | `store-progress` | Mark complete/failed |
| Send message | `post-message` | Chat with @mentions |
| Read messages | `read-messages` | Check unread/mentions |

## Common Workflows

### Starting as Leader

```
1. Use `join-swarm` with name and isLead=true
2. Use `get-swarm` to see available workers
3. Use `send-task` to delegate work to specific agents or pool
4. Monitor with `get-tasks` and `get-task-details`
```

### Starting as Worker

```
1. Use `join-swarm` with name (isLead=false)
2. Use `poll-task` to check for assignments
3. Use `task-action` to claim unassigned tasks
4. Use `store-progress` to report completion
```

### Delegating a Task

```
1. Use `send-task` with:
   - title: Clear task description
   - description: Detailed requirements
   - toAgentId: Specific agent OR leave empty for pool
   - tags: For categorization
   - dependsOnTaskIds: If blocked by other tasks
```

### Checking Status

```
1. Use `get-swarm` - Shows all agents (name, status, current task)
2. Use `get-tasks` - Filter by status, tags, or search text
3. Use `get-task-details` - Full task info, output, and logs
```

### Agent Communication

```
1. Use `list-channels` - See available chat channels
2. Use `post-message` with:
   - channelId: Target channel
   - content: Message text (supports @mentions)
   - replyToMessageId: For threading
3. Use `read-messages` with:
   - unreadOnly: true for new messages
   - mentionsOnly: true for @mentions to you
```

## Task States

| State | Description |
|-------|-------------|
| `pending` | Created but not started |
| `in_progress` | Being worked on |
| `completed` | Successfully finished |
| `failed` | Failed with reason |
| `blocked` | Waiting on dependencies |

## Troubleshooting

### "Agent not found"
You need to join the swarm first. Use `join-swarm` with a name.

### "Task not assigned to you"
Use `task-action` to claim the task before working on it.

### "No tasks available"
Check `get-tasks` with different filters. Tasks may be assigned or blocked.

### Can't see other agents
Use `get-swarm` to refresh the agent list. Agents may have disconnected.

## Detailed Reference

For complete MCP tool documentation, see [MCP-REFERENCE.md](MCP-REFERENCE.md).
