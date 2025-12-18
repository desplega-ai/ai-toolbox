// Backend types (mirrored from cc-orch-mcp/src/types.ts)
export type AgentStatus = "idle" | "busy" | "offline";
export type AgentTaskStatus = "pending" | "in_progress" | "completed" | "failed";

export interface Agent {
  id: string;
  name: string;
  isLead: boolean;
  status: AgentStatus;
  createdAt: string;
  lastUpdatedAt: string;
}

export interface AgentTask {
  id: string;
  agentId: string;
  task: string;
  status: AgentTaskStatus;
  createdAt: string;
  lastUpdatedAt: string;
  finishedAt?: string;
  failureReason?: string;
  output?: string;
  progress?: string;
}

export interface AgentWithTasks extends Agent {
  tasks: AgentTask[];
}

export type AgentLogEventType =
  | "agent_joined"
  | "agent_status_change"
  | "agent_left"
  | "task_created"
  | "task_status_change"
  | "task_progress";

export interface AgentLog {
  id: string;
  eventType: AgentLogEventType;
  agentId?: string;
  taskId?: string;
  oldValue?: string;
  newValue?: string;
  metadata?: string;
  createdAt: string;
}

export interface DashboardStats {
  agents: {
    total: number;
    idle: number;
    busy: number;
    offline: number;
  };
  tasks: {
    total: number;
    pending: number;
    in_progress: number;
    completed: number;
    failed: number;
  };
}

// Alias for consistency with plan
export type TaskStatus = AgentTaskStatus;
export type Stats = DashboardStats;

// API Response wrappers
export interface AgentsResponse {
  agents: Agent[] | AgentWithTasks[];
}

export interface TasksResponse {
  tasks: AgentTask[];
}

export interface LogsResponse {
  logs: AgentLog[];
}

export interface TaskWithLogs extends AgentTask {
  logs: AgentLog[];
}
