import Database from 'better-sqlite3';
import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import { nanoid } from 'nanoid';
import type { Project, Session, ClaudeModel, PermissionMode, ThoughtComment } from '../shared/types';
import type { SDKResultMessage, SDKUsage } from '../shared/sdk-types';
import { DEFAULT_MODEL, DEFAULT_PERMISSION_MODE } from '../shared/types';

const HIVE_DIR = path.join(app.getPath('home'), '.hive');
const DB_PATH = path.join(HIVE_DIR, 'hive.db');

// Ensure directory exists
if (!fs.existsSync(HIVE_DIR)) {
  fs.mkdirSync(HIVE_DIR, { recursive: true });
}

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    directory TEXT NOT NULL UNIQUE,
    settings TEXT DEFAULT '{}',
    created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
    updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    claude_session_id TEXT,
    name TEXT NOT NULL,
    action_type TEXT CHECK(action_type IN ('research', 'plan', 'implement', 'freeform')),
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'running', 'waiting', 'idle', 'error', 'finished', 'archived')),
    metadata TEXT DEFAULT '{}',
    created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
    updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
  );

  CREATE TABLE IF NOT EXISTS worktrees (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    path TEXT NOT NULL UNIQUE,
    branch TEXT NOT NULL,
    description TEXT,
    created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
  CREATE INDEX IF NOT EXISTS idx_worktrees_project ON worktrees(project_id);

  -- Pending tool call approvals (waiting for user decision)
  CREATE TABLE IF NOT EXISTS pending_approvals (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    tool_use_id TEXT NOT NULL,
    tool_name TEXT NOT NULL,
    tool_input TEXT NOT NULL,
    hash TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
  );

  -- Approved tool calls (ready to auto-approve on resume)
  CREATE TABLE IF NOT EXISTS approved_tool_calls (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    hash TEXT NOT NULL,
    approved_at INTEGER NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_pending_session ON pending_approvals(session_id);
  CREATE INDEX IF NOT EXISTS idx_approved_session_hash ON approved_tool_calls(session_id, hash);

  -- Persisted result messages with analytics data
  CREATE TABLE IF NOT EXISTS session_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    claude_session_id TEXT NOT NULL,
    subtype TEXT NOT NULL,
    timestamp TEXT,
    result TEXT,
    total_cost_usd REAL,
    duration_ms INTEGER,
    duration_api_ms INTEGER,
    num_turns INTEGER,
    usage_json TEXT,
    created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
  );

  CREATE INDEX IF NOT EXISTS idx_session_results_session ON session_results(session_id);
  CREATE INDEX IF NOT EXISTS idx_session_results_claude_session ON session_results(claude_session_id);

  -- Thought comments for the redesigned Thoughts pane (text-based anchoring)
  CREATE TABLE IF NOT EXISTS thought_comments (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    content TEXT NOT NULL,
    selected_text TEXT NOT NULL,
    context_before TEXT DEFAULT '',
    context_after TEXT DEFAULT '',
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'sent', 'archived')),
    git_commit TEXT,
    sent_to_session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
    sent_at INTEGER,
    created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
    updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
  );

  CREATE INDEX IF NOT EXISTS idx_thought_comments_project ON thought_comments(project_id);
  CREATE INDEX IF NOT EXISTS idx_thought_comments_file ON thought_comments(file_path);
  CREATE INDEX IF NOT EXISTS idx_thought_comments_status ON thought_comments(status);
`);

// Migration: Add model column to sessions if it doesn't exist
try {
  db.exec(`ALTER TABLE sessions ADD COLUMN model TEXT DEFAULT 'claude-opus-4-5-20250514'`);
} catch {
  // Column already exists, ignore
}

// Migration: Add permission_mode column to sessions if it doesn't exist
try {
  db.exec(`ALTER TABLE sessions ADD COLUMN permission_mode TEXT DEFAULT 'default'`);
} catch {
  // Column already exists, ignore
}

// Migration: Add permission_expires_at column to sessions if it doesn't exist
try {
  db.exec(`ALTER TABLE sessions ADD COLUMN permission_expires_at INTEGER`);
} catch {
  // Column already exists, ignore
}

// Migration: Update thought_comments to text-based anchoring (drop old table if schema mismatch)
try {
  // Check if the new columns exist
  db.exec(`SELECT selected_text FROM thought_comments LIMIT 1`);
} catch {
  // Schema mismatch - drop and recreate table
  db.exec(`DROP TABLE IF EXISTS thought_comments`);
  db.exec(`
    CREATE TABLE thought_comments (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      file_path TEXT NOT NULL,
      content TEXT NOT NULL,
      selected_text TEXT NOT NULL,
      context_before TEXT DEFAULT '',
      context_after TEXT DEFAULT '',
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'sent', 'archived')),
      git_commit TEXT,
      sent_to_session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
      sent_at INTEGER,
      created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
      updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_thought_comments_project ON thought_comments(project_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_thought_comments_file ON thought_comments(file_path)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_thought_comments_status ON thought_comments(status)`);
}

// Prepared statements
const statements = {
  // Projects
  getAllProjects: db.prepare(`
    SELECT id, name, directory, settings, created_at as createdAt, updated_at as updatedAt
    FROM projects ORDER BY updated_at DESC
  `),
  getProjectById: db.prepare(`
    SELECT id, name, directory, settings, created_at as createdAt, updated_at as updatedAt
    FROM projects WHERE id = ?
  `),
  insertProject: db.prepare(`
    INSERT INTO projects (id, name, directory, settings)
    VALUES (?, ?, ?, ?)
  `),
  updateProject: db.prepare(`
    UPDATE projects SET name = ?, settings = ?, updated_at = ? WHERE id = ?
  `),
  deleteProject: db.prepare(`DELETE FROM projects WHERE id = ?`),

  // Sessions
  getSessionsByProject: db.prepare(`
    SELECT id, project_id as projectId, claude_session_id as claudeSessionId,
           name, model, permission_mode as permissionMode, permission_expires_at as permissionExpiresAt,
           action_type as actionType, status, metadata,
           created_at as createdAt, updated_at as updatedAt
    FROM sessions WHERE project_id = ? ORDER BY updated_at DESC
  `),
  insertSession: db.prepare(`
    INSERT INTO sessions (id, project_id, claude_session_id, name, model, permission_mode, permission_expires_at, action_type, status, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),
  updateSessionStatus: db.prepare(`
    UPDATE sessions SET status = ?, updated_at = ? WHERE id = ?
  `),
  updateSessionName: db.prepare(`
    UPDATE sessions SET name = ?, updated_at = ? WHERE id = ?
  `),
  updateSessionModel: db.prepare(`
    UPDATE sessions SET model = ?, updated_at = ? WHERE id = ?
  `),
  updateSessionPermissionMode: db.prepare(`
    UPDATE sessions SET permission_mode = ?, permission_expires_at = ?, updated_at = ? WHERE id = ?
  `),
  updateClaudeSessionId: db.prepare(`
    UPDATE sessions SET claude_session_id = ?, updated_at = ? WHERE id = ?
  `),
  getSessionById: db.prepare(`
    SELECT id, project_id as projectId, claude_session_id as claudeSessionId,
           name, model, permission_mode as permissionMode, permission_expires_at as permissionExpiresAt,
           action_type as actionType, status, metadata,
           created_at as createdAt, updated_at as updatedAt
    FROM sessions WHERE id = ?
  `),
  deleteSession: db.prepare(`DELETE FROM sessions WHERE id = ?`),

  // Pending Approvals
  insertPendingApproval: db.prepare(`
    INSERT INTO pending_approvals (id, session_id, tool_use_id, tool_name, tool_input, hash, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `),
  getPendingApprovalsBySession: db.prepare(`
    SELECT id, session_id as sessionId, tool_use_id as toolUseId, tool_name as toolName,
           tool_input as toolInput, hash, created_at as createdAt
    FROM pending_approvals WHERE session_id = ? ORDER BY created_at ASC
  `),
  deletePendingApproval: db.prepare(`DELETE FROM pending_approvals WHERE id = ?`),
  deletePendingApprovalsBySession: db.prepare(`DELETE FROM pending_approvals WHERE session_id = ?`),

  // Approved Tool Calls
  insertApprovedToolCall: db.prepare(`
    INSERT INTO approved_tool_calls (id, session_id, hash, approved_at)
    VALUES (?, ?, ?, ?)
  `),
  getApprovedToolCall: db.prepare(`
    SELECT id, session_id as sessionId, hash, approved_at as approvedAt
    FROM approved_tool_calls WHERE session_id = ? AND hash = ?
  `),
  getApprovedToolCallsBySession: db.prepare(`
    SELECT id, session_id as sessionId, hash, approved_at as approvedAt
    FROM approved_tool_calls WHERE session_id = ?
  `),
  deleteApprovedToolCall: db.prepare(`DELETE FROM approved_tool_calls WHERE id = ?`),
  deleteApprovedToolCallsBySession: db.prepare(`DELETE FROM approved_tool_calls WHERE session_id = ?`),

  // Session Results
  insertSessionResult: db.prepare(`
    INSERT INTO session_results (
      session_id, claude_session_id, subtype, timestamp, result,
      total_cost_usd, duration_ms, duration_api_ms, num_turns, usage_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),
  getSessionResultsByClaudeId: db.prepare(`
    SELECT * FROM session_results WHERE claude_session_id = ? ORDER BY created_at ASC
  `),

  // Thought Comments
  getCommentsByProject: db.prepare(`
    SELECT id, project_id as projectId, file_path as filePath, content,
           selected_text as selectedText, context_before as contextBefore, context_after as contextAfter,
           status, git_commit as gitCommit, sent_to_session_id as sentToSessionId,
           sent_at as sentAt, created_at as createdAt, updated_at as updatedAt
    FROM thought_comments WHERE project_id = ? ORDER BY created_at DESC
  `),
  getCommentsByFile: db.prepare(`
    SELECT id, project_id as projectId, file_path as filePath, content,
           selected_text as selectedText, context_before as contextBefore, context_after as contextAfter,
           status, git_commit as gitCommit, sent_to_session_id as sentToSessionId,
           sent_at as sentAt, created_at as createdAt, updated_at as updatedAt
    FROM thought_comments WHERE file_path = ? AND status != 'archived' ORDER BY created_at ASC
  `),
  getPendingCommentsByProject: db.prepare(`
    SELECT id, project_id as projectId, file_path as filePath, content,
           selected_text as selectedText, context_before as contextBefore, context_after as contextAfter,
           status, git_commit as gitCommit, sent_to_session_id as sentToSessionId,
           sent_at as sentAt, created_at as createdAt, updated_at as updatedAt
    FROM thought_comments WHERE project_id = ? AND status = 'pending' ORDER BY created_at ASC
  `),
  insertComment: db.prepare(`
    INSERT INTO thought_comments (id, project_id, file_path, content, selected_text, context_before, context_after, git_commit)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `),
  updateCommentStatus: db.prepare(`
    UPDATE thought_comments SET status = ?, sent_to_session_id = ?, sent_at = ?, updated_at = ? WHERE id = ?
  `),
  deleteComment: db.prepare(`DELETE FROM thought_comments WHERE id = ?`),
  getCommentById: db.prepare(`
    SELECT id, project_id as projectId, file_path as filePath, content,
           selected_text as selectedText, context_before as contextBefore, context_after as contextAfter,
           status, git_commit as gitCommit, sent_to_session_id as sentToSessionId,
           sent_at as sentAt, created_at as createdAt, updated_at as updatedAt
    FROM thought_comments WHERE id = ?
  `),
};

interface ProjectRow {
  id: string;
  name: string;
  directory: string;
  settings: string;
  createdAt: number;
  updatedAt: number;
}

interface SessionRow {
  id: string;
  projectId: string;
  claudeSessionId: string | null;
  name: string;
  model: ClaudeModel | null;
  permissionMode: PermissionMode | null;
  permissionExpiresAt: number | null;
  actionType: Session['actionType'];
  status: Session['status'];
  metadata: string;
  createdAt: number;
  updatedAt: number;
}

interface PendingApprovalRow {
  id: string;
  sessionId: string;
  toolUseId: string;
  toolName: string;
  toolInput: string;
  hash: string;
  createdAt: number;
}

interface ApprovedToolCallRow {
  id: string;
  sessionId: string;
  hash: string;
  approvedAt: number;
}

interface SessionResultRow {
  id: number;
  session_id: string;
  claude_session_id: string;
  subtype: string;
  timestamp: string | null;
  result: string | null;
  total_cost_usd: number | null;
  duration_ms: number | null;
  duration_api_ms: number | null;
  num_turns: number | null;
  usage_json: string | null;
  created_at: number;
}

interface ThoughtCommentRow {
  id: string;
  projectId: string;
  filePath: string;
  content: string;
  selectedText: string;
  contextBefore: string;
  contextAfter: string;
  status: ThoughtComment['status'];
  gitCommit: string | null;
  sentToSessionId: string | null;
  sentAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface PendingApproval {
  id: string;
  sessionId: string;
  toolUseId: string;
  toolName: string;
  toolInput: unknown;
  hash: string;
  createdAt: number;
}

export interface ApprovedToolCall {
  id: string;
  sessionId: string;
  hash: string;
  approvedAt: number;
}

// Database API
export const database = {
  projects: {
    list(): Project[] {
      const rows = statements.getAllProjects.all() as ProjectRow[];
      return rows.map(row => ({
        ...row,
        settings: JSON.parse(row.settings || '{}'),
      }));
    },

    create(data: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>): Project {
      const id = nanoid();
      const now = Date.now();
      statements.insertProject.run(id, data.name, data.directory, JSON.stringify(data.settings || {}));
      return {
        id,
        ...data,
        settings: data.settings || {},
        createdAt: now,
        updatedAt: now,
      };
    },

    delete(id: string): void {
      statements.deleteProject.run(id);
    },
  },

  sessions: {
    listByProject(projectId: string): Session[] {
      const rows = statements.getSessionsByProject.all(projectId) as SessionRow[];
      return rows.map(row => ({
        ...row,
        model: row.model || DEFAULT_MODEL,
        permissionMode: row.permissionMode || DEFAULT_PERMISSION_MODE,
        permissionExpiresAt: row.permissionExpiresAt,
        metadata: JSON.parse(row.metadata || '{}'),
      }));
    },

    create(data: Omit<Session, 'id' | 'createdAt' | 'updatedAt'>): Session {
      const id = nanoid();
      const now = Date.now();
      const model = data.model || DEFAULT_MODEL;
      const permissionMode = data.permissionMode || DEFAULT_PERMISSION_MODE;
      statements.insertSession.run(
        id,
        data.projectId,
        data.claudeSessionId,
        data.name,
        model,
        permissionMode,
        data.permissionExpiresAt || null,
        data.actionType,
        data.status,
        JSON.stringify(data.metadata || {})
      );
      return {
        id,
        ...data,
        model,
        permissionMode,
        permissionExpiresAt: data.permissionExpiresAt || null,
        metadata: data.metadata || {},
        createdAt: now,
        updatedAt: now,
      };
    },

    updateStatus(id: string, status: Session['status']): void {
      statements.updateSessionStatus.run(status, Date.now(), id);
    },

    updateName(id: string, name: string): void {
      statements.updateSessionName.run(name, Date.now(), id);
    },

    updateClaudeSessionId(id: string, claudeSessionId: string): void {
      statements.updateClaudeSessionId.run(claudeSessionId, Date.now(), id);
    },

    updateModel(id: string, model: ClaudeModel): void {
      statements.updateSessionModel.run(model, Date.now(), id);
    },

    updatePermissionMode(id: string, mode: PermissionMode, expiresAt: number | null): void {
      statements.updateSessionPermissionMode.run(mode, expiresAt, Date.now(), id);
    },

    getById(id: string): Session | undefined {
      const row = statements.getSessionById.get(id) as SessionRow | undefined;
      if (!row) return undefined;
      return {
        ...row,
        model: row.model || DEFAULT_MODEL,
        permissionMode: row.permissionMode || DEFAULT_PERMISSION_MODE,
        permissionExpiresAt: row.permissionExpiresAt,
        metadata: JSON.parse(row.metadata || '{}'),
      };
    },

    delete(id: string): void {
      statements.deleteSession.run(id);
    },
  },

  pendingApprovals: {
    create(data: Omit<PendingApproval, 'id' | 'createdAt'>): PendingApproval {
      const id = nanoid();
      const now = Date.now();
      statements.insertPendingApproval.run(
        id,
        data.sessionId,
        data.toolUseId,
        data.toolName,
        JSON.stringify(data.toolInput),
        data.hash,
        now
      );
      return { id, ...data, createdAt: now };
    },

    listBySession(sessionId: string): PendingApproval[] {
      const rows = statements.getPendingApprovalsBySession.all(sessionId) as PendingApprovalRow[];
      return rows.map(row => ({
        ...row,
        toolInput: JSON.parse(row.toolInput),
      }));
    },

    delete(id: string): void {
      statements.deletePendingApproval.run(id);
    },

    deleteBySession(sessionId: string): void {
      statements.deletePendingApprovalsBySession.run(sessionId);
    },
  },

  approvedToolCalls: {
    create(data: Omit<ApprovedToolCall, 'id' | 'approvedAt'>): ApprovedToolCall {
      const id = nanoid();
      const now = Date.now();
      statements.insertApprovedToolCall.run(id, data.sessionId, data.hash, now);
      return { id, ...data, approvedAt: now };
    },

    findByHash(sessionId: string, hash: string): ApprovedToolCall | undefined {
      const row = statements.getApprovedToolCall.get(sessionId, hash) as ApprovedToolCallRow | undefined;
      return row;
    },

    listBySession(sessionId: string): ApprovedToolCall[] {
      return statements.getApprovedToolCallsBySession.all(sessionId) as ApprovedToolCallRow[];
    },

    delete(id: string): void {
      statements.deleteApprovedToolCall.run(id);
    },

    deleteBySession(sessionId: string): void {
      statements.deleteApprovedToolCallsBySession.run(sessionId);
    },
  },

  sessionResults: {
    insert(data: {
      sessionId: string;
      claudeSessionId: string;
      subtype: string;
      timestamp?: string;
      result?: string;
      totalCostUsd?: number;
      durationMs?: number;
      durationApiMs?: number;
      numTurns?: number;
      usage?: SDKUsage;
    }): void {
      statements.insertSessionResult.run(
        data.sessionId,
        data.claudeSessionId,
        data.subtype,
        data.timestamp || null,
        data.result || null,
        data.totalCostUsd ?? null,
        data.durationMs ?? null,
        data.durationApiMs ?? null,
        data.numTurns ?? null,
        data.usage ? JSON.stringify(data.usage) : null
      );
    },

    getByClaudeSessionId(claudeSessionId: string): SDKResultMessage[] {
      const rows = statements.getSessionResultsByClaudeId.all(claudeSessionId) as SessionResultRow[];
      return rows.map(row => ({
        type: 'result' as const,
        subtype: row.subtype as SDKResultMessage['subtype'],
        session_id: row.claude_session_id,
        timestamp: row.timestamp || undefined,
        result: row.result || undefined,
        total_cost_usd: row.total_cost_usd || undefined,
        duration_ms: row.duration_ms || undefined,
        duration_api_ms: row.duration_api_ms || undefined,
        num_turns: row.num_turns || undefined,
        usage: row.usage_json ? JSON.parse(row.usage_json) : undefined,
      }));
    },
  },

  thoughtComments: {
    listByProject(projectId: string): ThoughtComment[] {
      const rows = statements.getCommentsByProject.all(projectId) as ThoughtCommentRow[];
      return rows;
    },

    listByFile(filePath: string): ThoughtComment[] {
      const rows = statements.getCommentsByFile.all(filePath) as ThoughtCommentRow[];
      return rows;
    },

    listPendingByProject(projectId: string): ThoughtComment[] {
      const rows = statements.getPendingCommentsByProject.all(projectId) as ThoughtCommentRow[];
      return rows;
    },

    getById(id: string): ThoughtComment | undefined {
      const row = statements.getCommentById.get(id) as ThoughtCommentRow | undefined;
      return row;
    },

    create(data: {
      projectId: string;
      filePath: string;
      content: string;
      selectedText: string;
      contextBefore: string;
      contextAfter: string;
      gitCommit?: string | null;
    }): ThoughtComment {
      const id = nanoid();
      const now = Date.now();
      statements.insertComment.run(
        id,
        data.projectId,
        data.filePath,
        data.content,
        data.selectedText,
        data.contextBefore,
        data.contextAfter,
        data.gitCommit ?? null
      );
      return {
        id,
        projectId: data.projectId,
        filePath: data.filePath,
        content: data.content,
        selectedText: data.selectedText,
        contextBefore: data.contextBefore,
        contextAfter: data.contextAfter,
        status: 'pending',
        gitCommit: data.gitCommit ?? null,
        sentToSessionId: null,
        sentAt: null,
        createdAt: now,
        updatedAt: now,
      };
    },

    updateStatus(id: string, status: ThoughtComment['status'], sessionId?: string): void {
      const now = Date.now();
      const sentAt = status === 'sent' ? now : null;
      statements.updateCommentStatus.run(status, sessionId ?? null, sentAt, now, id);
    },

    delete(id: string): void {
      statements.deleteComment.run(id);
    },
  },

  close(): void {
    db.close();
  },
};

export { db };
