import { Database } from "bun:sqlite";
import type { Agent, AgentLog, AgentLogEventType, AgentStatus, AgentTask, AgentTaskStatus, AgentWithTasks } from "../types";

let db: Database | null = null;

export function initDb(dbPath = "./agent-swarm-db.sqlite"): Database {
  if (db) {
    return db;
  }

  db = new Database(dbPath, { create: true });
  db.run("PRAGMA journal_mode = WAL;");
  db.run("PRAGMA foreign_keys = ON;");

  db.run(`
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      isLead INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL CHECK(status IN ('idle', 'busy', 'offline')),
      createdAt TEXT NOT NULL,
      lastUpdatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS agent_tasks (
      id TEXT PRIMARY KEY,
      agentId TEXT NOT NULL,
      task TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('pending', 'in_progress', 'completed', 'failed')),
      createdAt TEXT NOT NULL,
      lastUpdatedAt TEXT NOT NULL,
      finishedAt TEXT,
      failureReason TEXT,
      output TEXT,
      progress TEXT,
      FOREIGN KEY (agentId) REFERENCES agents(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_agent_tasks_agentId ON agent_tasks(agentId);
    CREATE INDEX IF NOT EXISTS idx_agent_tasks_status ON agent_tasks(status);

    CREATE TABLE IF NOT EXISTS agent_log (
      id TEXT PRIMARY KEY,
      eventType TEXT NOT NULL,
      agentId TEXT,
      taskId TEXT,
      oldValue TEXT,
      newValue TEXT,
      metadata TEXT,
      createdAt TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_agent_log_agentId ON agent_log(agentId);
    CREATE INDEX IF NOT EXISTS idx_agent_log_taskId ON agent_log(taskId);
    CREATE INDEX IF NOT EXISTS idx_agent_log_eventType ON agent_log(eventType);
    CREATE INDEX IF NOT EXISTS idx_agent_log_createdAt ON agent_log(createdAt);
  `);

  return db;
}

export function getDb(): Database {
  if (!db) {
    return initDb();
  }
  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

// ============================================================================
// Agent Queries
// ============================================================================

type AgentRow = {
  id: string;
  name: string;
  isLead: number;
  status: AgentStatus;
  createdAt: string;
  lastUpdatedAt: string;
};

function rowToAgent(row: AgentRow): Agent {
  return {
    id: row.id,
    name: row.name,
    isLead: row.isLead === 1,
    status: row.status,
    createdAt: row.createdAt,
    lastUpdatedAt: row.lastUpdatedAt,
  };
}

export const agentQueries = {
  insert: () =>
    getDb().prepare<AgentRow, [string, string, number, AgentStatus]>(
      "INSERT INTO agents (id, name, isLead, status, createdAt, lastUpdatedAt) VALUES (?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) RETURNING *",
    ),

  getById: () => getDb().prepare<AgentRow, [string]>("SELECT * FROM agents WHERE id = ?"),

  getAll: () => getDb().prepare<AgentRow, []>("SELECT * FROM agents ORDER BY name"),

  updateStatus: () =>
    getDb().prepare<AgentRow, [AgentStatus, string]>(
      "UPDATE agents SET status = ?, lastUpdatedAt = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? RETURNING *",
    ),

  delete: () => getDb().prepare<null, [string]>("DELETE FROM agents WHERE id = ?"),
};

export function createAgent(
  agent: Omit<Agent, "id" | "createdAt" | "lastUpdatedAt"> & { id?: string },
): Agent {
  const id = agent.id ?? crypto.randomUUID();
  const row = agentQueries.insert().get(id, agent.name, agent.isLead ? 1 : 0, agent.status);
  if (!row) throw new Error("Failed to create agent");
  try {
    createLogEntry({ eventType: "agent_joined", agentId: id, newValue: agent.status });
  } catch {}
  return rowToAgent(row);
}

export function getAgentById(id: string): Agent | null {
  const row = agentQueries.getById().get(id);
  return row ? rowToAgent(row) : null;
}

export function getAllAgents(): Agent[] {
  return agentQueries.getAll().all().map(rowToAgent);
}

export function updateAgentStatus(id: string, status: AgentStatus): Agent | null {
  const oldAgent = getAgentById(id);
  const row = agentQueries.updateStatus().get(status, id);
  if (row && oldAgent) {
    try {
      createLogEntry({ eventType: "agent_status_change", agentId: id, oldValue: oldAgent.status, newValue: status });
    } catch {}
  }
  return row ? rowToAgent(row) : null;
}

export function deleteAgent(id: string): boolean {
  const agent = getAgentById(id);
  if (agent) {
    try {
      createLogEntry({ eventType: "agent_left", agentId: id, oldValue: agent.status });
    } catch {}
  }
  const result = getDb().run("DELETE FROM agents WHERE id = ?", [id]);
  return result.changes > 0;
}

// ============================================================================
// AgentTask Queries
// ============================================================================

type AgentTaskRow = {
  id: string;
  agentId: string;
  task: string;
  status: AgentTaskStatus;
  createdAt: string;
  lastUpdatedAt: string;
  finishedAt: string | null;
  failureReason: string | null;
  output: string | null;
  progress: string | null;
};

function rowToAgentTask(row: AgentTaskRow): AgentTask {
  return {
    id: row.id,
    agentId: row.agentId,
    task: row.task,
    status: row.status,
    createdAt: row.createdAt,
    lastUpdatedAt: row.lastUpdatedAt,
    finishedAt: row.finishedAt ?? undefined,
    failureReason: row.failureReason ?? undefined,
    output: row.output ?? undefined,
    progress: row.progress ?? undefined,
  };
}

export const taskQueries = {
  insert: () =>
    getDb().prepare<AgentTaskRow, [string, string, string, AgentTaskStatus]>(
      `INSERT INTO agent_tasks (id, agentId, task, status, createdAt, lastUpdatedAt)
       VALUES (?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) RETURNING *`,
    ),

  getById: () => getDb().prepare<AgentTaskRow, [string]>("SELECT * FROM agent_tasks WHERE id = ?"),

  getByAgentId: () =>
    getDb().prepare<AgentTaskRow, [string]>(
      "SELECT * FROM agent_tasks WHERE agentId = ? ORDER BY createdAt DESC",
    ),

  getByStatus: () =>
    getDb().prepare<AgentTaskRow, [AgentTaskStatus]>(
      "SELECT * FROM agent_tasks WHERE status = ? ORDER BY createdAt DESC",
    ),

  updateStatus: () =>
    getDb().prepare<AgentTaskRow, [AgentTaskStatus, string | null, string]>(
      `UPDATE agent_tasks SET status = ?, finishedAt = ?, lastUpdatedAt = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? RETURNING *`,
    ),

  setOutput: () =>
    getDb().prepare<AgentTaskRow, [string, string]>(
      "UPDATE agent_tasks SET output = ?, lastUpdatedAt = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? RETURNING *",
    ),

  setFailure: () =>
    getDb().prepare<AgentTaskRow, [string, string, string]>(
      `UPDATE agent_tasks SET status = 'failed', failureReason = ?, finishedAt = ?, lastUpdatedAt = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE id = ? RETURNING *`,
    ),

  setProgress: () =>
    getDb().prepare<AgentTaskRow, [string, string]>(
      "UPDATE agent_tasks SET progress = ?, lastUpdatedAt = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? RETURNING *",
    ),

  delete: () => getDb().prepare<null, [string]>("DELETE FROM agent_tasks WHERE id = ?"),
};

export function createTask(agentId: string, task: string): AgentTask {
  const id = crypto.randomUUID();
  const row = taskQueries.insert().get(id, agentId, task, "pending");
  if (!row) throw new Error("Failed to create task");
  try {
    createLogEntry({ eventType: "task_created", agentId, taskId: id, newValue: "pending" });
  } catch {}
  return rowToAgentTask(row);
}

export function getPendingTaskForAgent(agentId: string): AgentTask | null {
  const row = getDb()
    .prepare<AgentTaskRow, [string]>(
      "SELECT * FROM agent_tasks WHERE agentId = ? AND status = 'pending' ORDER BY createdAt ASC LIMIT 1",
    )
    .get(agentId);
  return row ? rowToAgentTask(row) : null;
}

export function startTask(taskId: string): AgentTask | null {
  const oldTask = getTaskById(taskId);
  const row = getDb()
    .prepare<AgentTaskRow, [string]>(
      `UPDATE agent_tasks SET status = 'in_progress', lastUpdatedAt = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE id = ? RETURNING *`,
    )
    .get(taskId);
  if (row && oldTask) {
    try {
      createLogEntry({ eventType: "task_status_change", taskId, agentId: row.agentId, oldValue: oldTask.status, newValue: "in_progress" });
    } catch {}
  }
  return row ? rowToAgentTask(row) : null;
}

export function getTaskById(id: string): AgentTask | null {
  const row = taskQueries.getById().get(id);
  return row ? rowToAgentTask(row) : null;
}

export function getTasksByAgentId(agentId: string): AgentTask[] {
  return taskQueries.getByAgentId().all(agentId).map(rowToAgentTask);
}

export function getTasksByStatus(status: AgentTaskStatus): AgentTask[] {
  return taskQueries.getByStatus().all(status).map(rowToAgentTask);
}

export function getAllTasks(status?: AgentTaskStatus): AgentTask[] {
  if (status) {
    return getDb()
      .prepare<AgentTaskRow, [AgentTaskStatus]>(
        "SELECT * FROM agent_tasks WHERE status = ? ORDER BY lastUpdatedAt DESC",
      )
      .all(status)
      .map(rowToAgentTask);
  }
  return getDb()
    .prepare<AgentTaskRow, []>("SELECT * FROM agent_tasks ORDER BY lastUpdatedAt DESC")
    .all()
    .map(rowToAgentTask);
}

export function completeTask(id: string, output?: string): AgentTask | null {
  const oldTask = getTaskById(id);
  const finishedAt = new Date().toISOString();
  let row = taskQueries.updateStatus().get("completed", finishedAt, id);
  if (!row) return null;

  if (output) {
    row = taskQueries.setOutput().get(output, id);
  }

  if (row && oldTask) {
    try {
      createLogEntry({ eventType: "task_status_change", taskId: id, agentId: row.agentId, oldValue: oldTask.status, newValue: "completed" });
    } catch {}
  }

  return row ? rowToAgentTask(row) : null;
}

export function failTask(id: string, reason: string): AgentTask | null {
  const oldTask = getTaskById(id);
  const finishedAt = new Date().toISOString();
  const row = taskQueries.setFailure().get(reason, finishedAt, id);
  if (row && oldTask) {
    try {
      createLogEntry({ eventType: "task_status_change", taskId: id, agentId: row.agentId, oldValue: oldTask.status, newValue: "failed", metadata: { reason } });
    } catch {}
  }
  return row ? rowToAgentTask(row) : null;
}

export function deleteTask(id: string): boolean {
  const result = getDb().run("DELETE FROM agent_tasks WHERE id = ?", [id]);
  return result.changes > 0;
}

export function updateTaskProgress(id: string, progress: string): AgentTask | null {
  const row = taskQueries.setProgress().get(progress, id);
  if (row) {
    try {
      createLogEntry({ eventType: "task_progress", taskId: id, agentId: row.agentId, newValue: progress });
    } catch {}
  }
  return row ? rowToAgentTask(row) : null;
}

// ============================================================================
// Combined Queries (Agent with Tasks)
// ============================================================================

export function getAgentWithTasks(id: string): AgentWithTasks | null {
  const txn = getDb().transaction(() => {
    const agent = getAgentById(id);
    if (!agent) return null;

    const tasks = getTasksByAgentId(id);
    return { ...agent, tasks };
  });

  return txn();
}

export function getAllAgentsWithTasks(): AgentWithTasks[] {
  const txn = getDb().transaction(() => {
    const agents = getAllAgents();
    return agents.map((agent) => ({
      ...agent,
      tasks: getTasksByAgentId(agent.id),
    }));
  });

  return txn();
}

// ============================================================================
// Agent Log Queries
// ============================================================================

type AgentLogRow = {
  id: string;
  eventType: AgentLogEventType;
  agentId: string | null;
  taskId: string | null;
  oldValue: string | null;
  newValue: string | null;
  metadata: string | null;
  createdAt: string;
};

function rowToAgentLog(row: AgentLogRow): AgentLog {
  return {
    id: row.id,
    eventType: row.eventType,
    agentId: row.agentId ?? undefined,
    taskId: row.taskId ?? undefined,
    oldValue: row.oldValue ?? undefined,
    newValue: row.newValue ?? undefined,
    metadata: row.metadata ?? undefined,
    createdAt: row.createdAt,
  };
}

export const logQueries = {
  insert: () =>
    getDb().prepare<AgentLogRow, [string, string, string | null, string | null, string | null, string | null, string | null]>(
      `INSERT INTO agent_log (id, eventType, agentId, taskId, oldValue, newValue, metadata, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) RETURNING *`,
    ),

  getByAgentId: () =>
    getDb().prepare<AgentLogRow, [string]>(
      "SELECT * FROM agent_log WHERE agentId = ? ORDER BY createdAt DESC",
    ),

  getByTaskId: () =>
    getDb().prepare<AgentLogRow, [string]>(
      "SELECT * FROM agent_log WHERE taskId = ? ORDER BY createdAt DESC",
    ),

  getByEventType: () =>
    getDb().prepare<AgentLogRow, [string]>(
      "SELECT * FROM agent_log WHERE eventType = ? ORDER BY createdAt DESC",
    ),

  getAll: () =>
    getDb().prepare<AgentLogRow, []>(
      "SELECT * FROM agent_log ORDER BY createdAt DESC",
    ),
};

export function createLogEntry(entry: {
  eventType: AgentLogEventType;
  agentId?: string;
  taskId?: string;
  oldValue?: string;
  newValue?: string;
  metadata?: Record<string, unknown>;
}): AgentLog {
  const id = crypto.randomUUID();
  const row = logQueries.insert().get(
    id,
    entry.eventType,
    entry.agentId ?? null,
    entry.taskId ?? null,
    entry.oldValue ?? null,
    entry.newValue ?? null,
    entry.metadata ? JSON.stringify(entry.metadata) : null,
  );
  if (!row) throw new Error("Failed to create log entry");
  return rowToAgentLog(row);
}

export function getLogsByAgentId(agentId: string): AgentLog[] {
  return logQueries.getByAgentId().all(agentId).map(rowToAgentLog);
}

export function getLogsByTaskId(taskId: string): AgentLog[] {
  return logQueries.getByTaskId().all(taskId).map(rowToAgentLog);
}

export function getAllLogs(limit?: number): AgentLog[] {
  if (limit) {
    return getDb()
      .prepare<AgentLogRow, [number]>("SELECT * FROM agent_log ORDER BY createdAt DESC LIMIT ?")
      .all(limit)
      .map(rowToAgentLog);
  }
  return logQueries.getAll().all().map(rowToAgentLog);
}
