# Agent-Swarm Plugin Implementation Plan

## Overview

Create a new `swarm` plugin in `cc-plugin/swarm/` that provides skill-based assistance for interacting with the agent-swarm MCP server. Following the pattern established by the `wts` plugin, this will use a single comprehensive skill rather than many individual commands.

## Current State Analysis

### Existing Plugin Structure
- `cc-plugin/base/` - Core plugin with 6 commands and 5 agents
- `cc-plugin/wts/` - Skill-based plugin with `wts-expert` skill

### Key Discoveries
- Plugin manifest: `.claude-plugin/plugin.json` with name, description, version, author fields (`cc-plugin/base/.claude-plugin/plugin.json:1-13`)
- Skills use YAML frontmatter with `name` and `description` fields (`cc-plugin/wts/skills/wts-expert/SKILL.md:1-4`)
- Skills follow progressive disclosure pattern - main SKILL.md + reference files as needed
- The wts-expert skill includes quick reference tables, workflows, troubleshooting, and references to detailed docs

### Agent-Swarm MCP Tools Available
From the research document (`thoughts/shared/research/2026-01-12-agent-swarm-mcp-plugin-commands.md`):
- **Core**: `join-swarm`, `poll-task`, `get-swarm`, `get-tasks`, `send-task`, `get-task-details`, `store-progress`, `my-agent-info`
- **Task Pool**: `task-action`
- **Messaging**: `list-channels`, `create-channel`, `post-message`, `read-messages`
- **Profiles**: `update-profile`
- **Services**: `register-service`, `unregister-service`, `list-services`, `update-service-status`

## Desired End State

A `swarm` plugin that:
1. Provides a `swarm-expert` skill for comprehensive agent-swarm assistance
2. Includes quick reference for common MCP tool usage
3. Guides workflows for leader/worker patterns
4. References detailed MCP documentation as needed

### Verification
- [x] Plugin directory structure matches convention
- [x] `plugin.json` validates with required fields
- [x] `SKILL.md` has valid frontmatter with name and description
- [x] Skill content covers main use cases: join, delegate, status, tasks, chat

## What We're NOT Doing

- Not creating individual commands for each operation (skill-based approach instead)
- Not implementing MCP error handling in the skill (MCP layer handles that)
- Not creating agents (the skill will guide using existing MCP tools directly)
- Not duplicating the full agent-swarm documentation (reference external docs)

## Implementation Approach

Follow the wts plugin pattern: single comprehensive skill with quick reference tables, workflows, and troubleshooting sections.

---

## Phase 1: Plugin Foundation

### Overview
Create the directory structure and plugin manifest.

### Changes Required

#### 1. Create directory structure
```
cc-plugin/swarm/
├── .claude-plugin/
│   └── plugin.json
├── skills/
│   └── swarm-expert/
│       ├── SKILL.md
│       └── MCP-REFERENCE.md
└── README.md
```

#### 2. Plugin Manifest
**File**: `cc-plugin/swarm/.claude-plugin/plugin.json`

```json
{
    "name": "swarm",
    "description": "Multi-agent coordination with agent-swarm MCP",
    "version": "1.0.0",
    "author": {
        "name": "desplega.ai",
        "email": "contact@desplega.ai"
    },
    "homepage": "https://desplega.ai",
    "repository": "https://github.com/desplega-ai/ai-toolbox",
    "keywords": ["ai", "agent", "swarm", "multi-agent", "mcp"],
    "license": "MIT"
}
```

### Success Criteria

#### Automated Verification
- [x] Directory structure exists: `ls cc-plugin/swarm/.claude-plugin/plugin.json`
- [x] JSON is valid: `cat cc-plugin/swarm/.claude-plugin/plugin.json | jq .`

#### Manual Verification
- [x] Plugin can be discovered by Claude Code

---

## Phase 2: Swarm Expert Skill

### Overview
Create the main `swarm-expert` skill with comprehensive guidance for agent-swarm operations.

### Changes Required

#### 1. Main Skill File
**File**: `cc-plugin/swarm/skills/swarm-expert/SKILL.md`

```markdown
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
```

#### 2. MCP Reference File
**File**: `cc-plugin/swarm/skills/swarm-expert/MCP-REFERENCE.md`

```markdown
# Agent-Swarm MCP Tools Reference

Complete reference for all agent-swarm MCP tools.

## Core Tools

### join-swarm
Join the agent swarm.
- `name` (string, required): Your agent name
- `isLead` (boolean, optional): Join as leader agent

### poll-task
Poll for new task assignments. Returns assigned tasks for this agent.

### get-swarm
List all agents and their current status.
- Returns: Array of agents with id, name, status, currentTaskId

### get-tasks
List tasks with optional filters.
- `status` (string, optional): Filter by status (pending, in_progress, completed, failed, blocked)
- `tags` (array, optional): Filter by tags
- `search` (string, optional): Search in title/description
- `assignedToMe` (boolean, optional): Only my tasks

### send-task
Send/assign a task.
- `title` (string, required): Task title
- `description` (string, optional): Detailed description
- `toAgentId` (string, optional): Specific agent (omit for pool)
- `tags` (array, optional): Task tags
- `dependsOnTaskIds` (array, optional): Blocking task IDs
- `type` (string, optional): bug, feature, research

### get-task-details
Get full task information.
- `taskId` (string, required): Task ID
- Returns: Task with title, description, status, output, logs

### store-progress
Update task progress.
- `taskId` (string, required): Task ID
- `status` (string, optional): New status
- `output` (string, optional): Task output/result
- `failureReason` (string, optional): If marking failed
- `progress` (number, optional): 0-100 percentage

### my-agent-info
Get your agent ID and details.

## Task Pool Tools

### task-action
Manage tasks in the pool.
- `action` (string, required): create, claim, release, accept, reject
- `taskId` (string, optional): For claim/release/accept/reject
- `title` (string, optional): For create
- `description` (string, optional): For create

## Messaging Tools

### list-channels
List available chat channels.

### create-channel
Create a new channel.
- `name` (string, required): Channel name
- `description` (string, optional): Channel description

### post-message
Post a message.
- `channelId` (string, required): Target channel
- `content` (string, required): Message content
- `replyToMessageId` (string, optional): For threading

### read-messages
Read messages.
- `channelId` (string, optional): Specific channel
- `unreadOnly` (boolean, optional): Only unread
- `mentionsOnly` (boolean, optional): Only @mentions
- `since` (string, optional): ISO timestamp

## Profile Tools

### update-profile
Update your agent profile.
- `description` (string, optional): Agent description
- `role` (string, optional): Agent role
- `capabilities` (array, optional): List of capabilities

## Service Tools

### register-service
Register a background service.
- `name` (string, required): Service name
- `type` (string, required): Service type
- `endpoint` (string, optional): Service endpoint

### unregister-service
Remove a service.
- `serviceId` (string, required): Service ID

### list-services
Query registered services.
- `type` (string, optional): Filter by type

### update-service-status
Update service health.
- `serviceId` (string, required): Service ID
- `status` (string, required): healthy, degraded, offline
```

#### 3. README
**File**: `cc-plugin/swarm/README.md`

```markdown
# Swarm Plugin

Multi-agent coordination plugin for agent-swarm MCP.

## Prerequisites

This plugin requires the [agent-swarm](https://github.com/desplega-ai/agent-swarm) MCP server to be configured.

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
```

### Success Criteria

#### Automated Verification
- [x] SKILL.md exists: `ls cc-plugin/swarm/skills/swarm-expert/SKILL.md`
- [x] SKILL.md has valid frontmatter with name and description
- [x] MCP-REFERENCE.md exists: `ls cc-plugin/swarm/skills/swarm-expert/MCP-REFERENCE.md`
- [x] README.md exists: `ls cc-plugin/swarm/README.md`

#### Manual Verification
- [x] Skill is discovered when asking about swarm coordination
- [x] Quick reference table is useful for common operations
- [x] Workflows guide makes sense for leader/worker patterns
- [x] MCP reference provides accurate tool documentation

---

## Testing Strategy

### Unit Tests
N/A - This is a documentation/instruction plugin without executable code.

### Manual Testing Steps
1. Install the plugin in Claude Code
2. Ask "How do I join an agent swarm?" - should trigger swarm-expert skill
3. Ask "What's the swarm status?" - should reference `get-swarm` tool
4. Ask "Delegate a task to the pool" - should guide using `send-task`
5. Ask "Send a message to @worker-1" - should guide using `post-message`

## References

- Research document: `thoughts/shared/research/2026-01-12-agent-swarm-mcp-plugin-commands.md`
- Agent-swarm repo: https://github.com/desplega-ai/agent-swarm
- WTS plugin pattern: `cc-plugin/wts/skills/wts-expert/SKILL.md`
- Claude Skills docs: https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview
