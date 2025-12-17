import { Database } from "bun:sqlite";
import type {
	Agent,
	AgentStatus,
	AgentTask,
	AgentTaskStatus,
	AgentWithTasks,
} from "../types";

let db: Database | null = null;

export function initDb(dbPath = "./cc-orch.sqlite"): Database {
	if (db) {
		console.error("Database already initialized.");
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
      status TEXT NOT NULL CHECK(status IN ('in_progress', 'completed', 'failed')),
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
  `);

	console.error("Database initialized at", dbPath);
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

	getById: () =>
		getDb().prepare<AgentRow, [string]>("SELECT * FROM agents WHERE id = ?"),

	getAll: () =>
		getDb().prepare<AgentRow, []>("SELECT * FROM agents ORDER BY name"),

	updateStatus: () =>
		getDb().prepare<AgentRow, [AgentStatus, string]>(
			"UPDATE agents SET status = ?, lastUpdatedAt = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? RETURNING *",
		),

	delete: () =>
		getDb().prepare<null, [string]>("DELETE FROM agents WHERE id = ?"),
};

export function createAgent(
	agent: Omit<Agent, "id" | "createdAt" | "lastUpdatedAt"> & { id?: string },
): Agent {
	const id = agent.id ?? crypto.randomUUID();
	const row = agentQueries
		.insert()
		.get(id, agent.name, agent.isLead ? 1 : 0, agent.status);
	if (!row) throw new Error("Failed to create agent");
	return rowToAgent(row);
}

export function getAgentById(id: string): Agent | null {
	const row = agentQueries.getById().get(id);
	return row ? rowToAgent(row) : null;
}

export function getAllAgents(): Agent[] {
	return agentQueries.getAll().all().map(rowToAgent);
}

export function updateAgentStatus(
	id: string,
	status: AgentStatus,
): Agent | null {
	const row = agentQueries.updateStatus().get(status, id);
	return row ? rowToAgent(row) : null;
}

export function deleteAgent(id: string): boolean {
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

	getById: () =>
		getDb().prepare<AgentTaskRow, [string]>(
			"SELECT * FROM agent_tasks WHERE id = ?",
		),

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
			`UPDATE agent_tasks SET status = ?, finishedAt = ?, lastUpdatedAt = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
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

	delete: () =>
		getDb().prepare<null, [string]>("DELETE FROM agent_tasks WHERE id = ?"),
};

export function createTask(agentId: string, task: string): AgentTask {
	const id = crypto.randomUUID();
	const row = taskQueries.insert().get(id, agentId, task, "in_progress");
	if (!row) throw new Error("Failed to create task");
	return rowToAgentTask(row);
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
		.prepare<AgentTaskRow, []>(
			"SELECT * FROM agent_tasks ORDER BY lastUpdatedAt DESC",
		)
		.all()
		.map(rowToAgentTask);
}

export function completeTask(id: string, output?: string): AgentTask | null {
	const finishedAt = new Date().toISOString();
	let row = taskQueries.updateStatus().get("completed", finishedAt, id);
	if (!row) return null;

	if (output) {
		row = taskQueries.setOutput().get(output, id);
	}

	return row ? rowToAgentTask(row) : null;
}

export function failTask(id: string, reason: string): AgentTask | null {
	const finishedAt = new Date().toISOString();
	const row = taskQueries.setFailure().get(reason, finishedAt, id);
	return row ? rowToAgentTask(row) : null;
}

export function deleteTask(id: string): boolean {
	const result = getDb().run("DELETE FROM agent_tasks WHERE id = ?", [id]);
	return result.changes > 0;
}

export function updateTaskProgress(
	id: string,
	progress: string,
): AgentTask | null {
	const row = taskQueries.setProgress().get(progress, id);
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
