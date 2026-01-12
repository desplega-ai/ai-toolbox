# Agent-Swarm MCP Tools Reference

Complete reference for all agent-swarm MCP tools.

> **Official Documentation**: [github.com/desplega-ai/agent-swarm/blob/main/MCP.md](https://github.com/desplega-ai/agent-swarm/blob/main/MCP.md)

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
