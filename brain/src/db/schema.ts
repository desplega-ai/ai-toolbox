/**
 * Database schema for the brain CLI.
 * Uses SQLite with FTS5 for full-text search and libSQL vector extensions for semantic search.
 */

export const SCHEMA_VERSION = 2;

/**
 * SQL statements to create the database schema
 */
export const CREATE_SCHEMA = `
-- Metadata table for schema versioning and settings
CREATE TABLE IF NOT EXISTS metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Core entries table (files)
CREATE TABLE IF NOT EXISTS entries (
  id INTEGER PRIMARY KEY,
  path TEXT NOT NULL UNIQUE,
  title TEXT,
  content TEXT,
  content_hash TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  indexed_at TEXT,
  word_count INTEGER,
  tags TEXT  -- JSON array
);

-- Chunks table (embeddings per structural chunk)
CREATE TABLE IF NOT EXISTS chunks (
  id INTEGER PRIMARY KEY,
  entry_id INTEGER NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  chunk_type TEXT NOT NULL,  -- 'timestamp-block', 'header-section', 'whole-file'
  content TEXT NOT NULL,
  content_hash TEXT,
  embedding F32_BLOB(1536),
  embedding_model TEXT,
  start_line INTEGER,
  UNIQUE(entry_id, chunk_index)
);

-- Full-text search index
CREATE VIRTUAL TABLE IF NOT EXISTS entries_fts USING fts5(
  title, content, tags,
  content='entries',
  content_rowid='id'
);

-- FTS triggers to keep index in sync
CREATE TRIGGER IF NOT EXISTS entries_ai AFTER INSERT ON entries BEGIN
  INSERT INTO entries_fts(rowid, title, content, tags) VALUES (new.id, new.title, new.content, new.tags);
END;

CREATE TRIGGER IF NOT EXISTS entries_ad AFTER DELETE ON entries BEGIN
  INSERT INTO entries_fts(entries_fts, rowid, title, content, tags) VALUES('delete', old.id, old.title, old.content, old.tags);
END;

CREATE TRIGGER IF NOT EXISTS entries_au AFTER UPDATE ON entries BEGIN
  INSERT INTO entries_fts(entries_fts, rowid, title, content, tags) VALUES('delete', old.id, old.title, old.content, old.tags);
  INSERT INTO entries_fts(rowid, title, content, tags) VALUES (new.id, new.title, new.content, new.tags);
END;

-- Vector similarity index (created after table if supported)
-- Note: This may fail on SQLite without libSQL extensions, which is fine

-- Todos table (CLI-managed, not extracted from markdown)
CREATE TABLE IF NOT EXISTS todos (
  id INTEGER PRIMARY KEY,
  project TEXT,                    -- NULL = global, else project name
  text TEXT NOT NULL,
  status TEXT DEFAULT 'open',      -- open, done, cancelled
  due_date TEXT,                   -- ISO date (YYYY-MM-DD) or NULL
  created_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS todos_status_idx ON todos(status);
CREATE INDEX IF NOT EXISTS todos_project_idx ON todos(project);
`;

/**
 * SQL to create the vector index (separate to allow graceful failure)
 */
export const CREATE_VECTOR_INDEX = `
CREATE INDEX IF NOT EXISTS chunks_vec_idx ON chunks (
  libsql_vector_idx(embedding, 'metric=cosine')
);
`;

/**
 * Entry record type
 */
export interface Entry {
  id: number;
  path: string;
  title: string | null;
  content: string | null;
  content_hash: string | null;
  created_at: string;
  updated_at: string;
  indexed_at: string | null;
  word_count: number | null;
  tags: string | null; // JSON array
}

/**
 * Chunk record type
 */
export interface Chunk {
  id: number;
  entry_id: number;
  chunk_index: number;
  chunk_type: "timestamp-block" | "header-section" | "whole-file";
  content: string;
  content_hash: string | null;
  embedding: Float32Array | null;
  embedding_model: string | null;
  start_line: number | null;
}

/**
 * Search result with entry and chunk info
 */
export interface SearchResult {
  entry: Entry;
  chunk: Chunk;
  score: number;
}

/**
 * Todo record type
 */
export interface Todo {
  id: number;
  project: string | null;
  text: string;
  status: "open" | "done" | "cancelled";
  due_date: string | null;
  created_at: string;
  completed_at: string | null;
}
