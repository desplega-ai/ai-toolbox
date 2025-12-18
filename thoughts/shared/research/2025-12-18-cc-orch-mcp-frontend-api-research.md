---
date: 2025-12-18T10:30:00Z
researcher: Claude
git_commit: 61decfeae340a6679426eab4d6ef0be883e2688b
branch: main
repository: ai-toolbox
topic: "cc-orch-mcp API Research for Frontend Development"
tags: [research, api, frontend, cc-orch-mcp, agent-swarm, react]
status: complete
last_updated: 2025-12-18
last_updated_by: Claude
---

# Research: cc-orch-mcp API for Frontend Development

**Date**: 2025-12-18T10:30:00Z
**Researcher**: Claude
**Git Commit**: 61decfeae340a6679426eab4d6ef0be883e2688b
**Branch**: main
**Repository**: ai-toolbox

## Research Question

What is the API structure of cc-orch-mcp, and what data models and endpoints are available for building a React SPA frontend to visualize agents and tasks?

## Summary

The cc-orch-mcp project is an "Agent Swarm MCP" server that enables multi-agent coordination for AI coding assistants. It provides:
- A SQLite-based backend storing agents, tasks, and logs
- An MCP (Model Context Protocol) interface for tool calls
- Limited REST endpoints for health checks and agent management
- CORS enabled for cross-origin requests

**Key Finding**: The current API exposes most functionality through the MCP protocol (JSON-RPC), with only basic REST endpoints available. For a simple frontend, adding REST endpoints that wrap database queries would simplify implementation significantly.

## Detailed Findings

### API Base URL

| Environment | URL |
|-------------|-----|
| Production | `https://agent-swarm-mcp.desplega.sh` |
| Local Development | `http://localhost:3013` |

### Authentication

The API uses two headers for authentication:

```
Authorization: Bearer <api-key>
X-Agent-ID: <uuid>  (optional, for agent-specific operations)
```

- The API key is validated if `API_KEY` environment variable is set on the server
- X-Agent-ID is required for `/me`, `/ping`, and `/close` endpoints

### REST Endpoints

Located in `cc-orch-mcp/src/http.ts`:

| Endpoint | Method | Auth Required | Description |
|----------|--------|---------------|-------------|
| `/health` | GET | Yes | Health check, returns `{ status: "ok", version: string }` |
| `/me` | GET | Yes + X-Agent-ID | Get current agent info |
| `/ping` | POST | Yes + X-Agent-ID | Agent heartbeat, updates lastUpdatedAt |
| `/close` | POST | Yes + X-Agent-ID | Mark agent as offline |
| `/mcp` | POST/GET/DELETE | Yes | MCP protocol endpoint |

### MCP Tools

Available via `/mcp` endpoint using JSON-RPC protocol. Located in `cc-orch-mcp/src/tools/`:

| Tool | Description | File |
|------|-------------|------|
| `get-swarm` | List all agents in the swarm | `get-swarm.ts` |
| `get-tasks` | List tasks filtered by status | `get-tasks.ts` |
| `get-task-details` | Get task details with log history | `get-task-details.ts` |
| `join-swarm` | Register an agent | `join-swarm.ts` |
| `send-task` | Assign a task to an agent | `send-task.ts` |
| `store-progress` | Update task progress or complete/fail | `store-progress.ts` |
| `poll-task` | Poll for pending tasks (worker agents) | `poll-task.ts` |
| `my-agent-info` | Get current agent's info | `my-agent-info.ts` |

### Data Models

Located in `cc-orch-mcp/src/types.ts`:

#### Agent

```typescript
type AgentStatus = "idle" | "busy" | "offline";

type Agent = {
  id: string;           // UUID
  name: string;
  isLead: boolean;
  status: AgentStatus;
  createdAt: string;    // ISO datetime
  lastUpdatedAt: string; // ISO datetime
}

type AgentWithTasks = Agent & {
  tasks: AgentTask[];
}
```

#### AgentTask

```typescript
type AgentTaskStatus = "pending" | "in_progress" | "completed" | "failed";

type AgentTask = {
  id: string;           // UUID
  agentId: string;      // UUID - foreign key to Agent
  task: string;         // Task description
  status: AgentTaskStatus;
  createdAt: string;    // ISO datetime
  lastUpdatedAt: string; // ISO datetime
  finishedAt?: string;  // ISO datetime, set on complete/fail
  failureReason?: string; // Set on failure
  output?: string;      // Result output
  progress?: string;    // Progress updates
}
```

#### AgentLog

```typescript
type AgentLogEventType =
  | "agent_joined"
  | "agent_status_change"
  | "agent_left"
  | "task_created"
  | "task_status_change"
  | "task_progress";

type AgentLog = {
  id: string;           // UUID
  eventType: AgentLogEventType;
  agentId?: string;
  taskId?: string;
  oldValue?: string;
  newValue?: string;
  metadata?: string;    // JSON string
  createdAt: string;    // ISO datetime
}
```

### Database Queries

Located in `cc-orch-mcp/src/be/db.ts`. Key functions available:

#### Agent Queries
- `getAllAgents()` - Returns all agents
- `getAgentById(id)` - Get single agent
- `createAgent(agent)` - Create new agent
- `updateAgentStatus(id, status)` - Update agent status
- `deleteAgent(id)` - Delete agent

#### Task Queries
- `getAllTasks(status?)` - Get all tasks, optionally filtered by status
- `getTaskById(id)` - Get single task
- `getTasksByAgentId(agentId)` - Get tasks for an agent
- `getTasksByStatus(status)` - Get tasks by status
- `createTask(agentId, task)` - Create new task
- `startTask(taskId)` - Mark task as in_progress
- `completeTask(id, output?)` - Mark task as completed
- `failTask(id, reason)` - Mark task as failed
- `updateTaskProgress(id, progress)` - Update progress field

#### Combined Queries
- `getAgentWithTasks(id)` - Get agent with all their tasks
- `getAllAgentsWithTasks()` - Get all agents with all their tasks

#### Log Queries
- `getAllLogs(limit?)` - Get all logs
- `getLogsByAgentId(agentId)` - Get logs for an agent
- `getLogsByTaskId(taskId)` - Get logs for a task

### CORS Configuration

CORS is enabled globally in `http.ts:32-37`:
```typescript
res.setHeader("Access-Control-Allow-Origin", "*");
res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
res.setHeader("Access-Control-Allow-Headers", "*");
res.setHeader("Access-Control-Expose-Headers", "*");
```

This means the API can be called from any origin.

## Code References

- `cc-orch-mcp/src/http.ts:39-233` - HTTP server implementation
- `cc-orch-mcp/src/types.ts:1-67` - Type definitions with Zod schemas
- `cc-orch-mcp/src/be/db.ts:1-515` - Database layer with all queries
- `cc-orch-mcp/src/tools/get-swarm.ts:1-37` - Get swarm MCP tool
- `cc-orch-mcp/src/tools/get-tasks.ts:1-79` - Get tasks MCP tool
- `cc-orch-mcp/src/tools/get-task-details.ts:1-52` - Get task details MCP tool

## Architecture Documentation

### Current Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────┐
│   MCP Clients   │────▶│   HTTP Server    │────▶│   SQLite    │
│ (Claude, etc.)  │     │   (Bun.serve)    │     │   Database  │
└─────────────────┘     └──────────────────┘     └─────────────┘
                               │
                               ▼
                        ┌──────────────────┐
                        │   MCP Transport  │
                        │ (StreamableHTTP) │
                        └──────────────────┘
```

### Server Stack
- **Runtime**: Bun
- **HTTP**: Node.js `http` module
- **MCP**: `@modelcontextprotocol/sdk`
- **Database**: SQLite via `bun:sqlite`
- **Validation**: Zod

### Frontend Integration Options

**Option 1: MCP JSON-RPC Protocol (Complex)**

Call tools via POST to `/mcp` with JSON-RPC:
```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "get-swarm",
    "arguments": {}
  },
  "id": 1
}
```

Requires session initialization first via `initialize` request.

**Option 2: Add REST Endpoints (Recommended)**

Add simple REST wrappers to `http.ts`:
- `GET /api/agents` → `getAllAgents()`
- `GET /api/agents/:id` → `getAgentWithTasks(id)`
- `GET /api/tasks?status=...` → `getAllTasks(status)`
- `GET /api/tasks/:id` → `getTaskById(id)`
- `GET /api/logs?limit=...` → `getAllLogs(limit)`

## Frontend Requirements (from user)

Based on user requirements:
- **Framework**: React SPA (deploy to Vercel)
- **UI Library**: Joy UI (MUI)
- **Data Fetching**: React Query (`useQuery`) for live updates
- **Auth Storage**: LocalStorage for API key
- **Default API URL**: `https://desplega.sh` (configurable)

### Recommended Tech Stack

```json
{
  "dependencies": {
    "react": "^18.x",
    "react-dom": "^18.x",
    "@mui/joy": "^5.x",
    "@tanstack/react-query": "^5.x"
  }
}
```

### Suggested Features

1. **Config Panel**: API URL input + Auth token input (saved to localStorage)
2. **Agents View**: List agents with status indicators (idle/busy/offline)
3. **Tasks View**: List tasks with status filters and progress
4. **Task Detail**: Show task details including output and logs
5. **Auto-refresh**: useQuery with refetchInterval for live updates

## Open Questions

1. **REST vs MCP**: Should REST endpoints be added to the server for simpler frontend consumption?
2. **Polling Interval**: What refresh rate is appropriate for live updates? (5s? 10s?)
3. **Auth Flow**: Should the frontend block all content until auth is configured, or show a setup wizard?
4. **Task Actions**: Should the frontend allow sending tasks or just viewing?
