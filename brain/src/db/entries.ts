import { getDb } from "./client.ts";
import type { Entry } from "./schema.ts";

export interface EntryInput {
  path: string;
  title?: string;
  content?: string;
  content_hash?: string;
  word_count?: number;
  tags?: string[];
}

/**
 * Insert or update an entry in the database
 */
export async function upsertEntry(input: EntryInput): Promise<Entry> {
  const db = await getDb();
  const now = new Date().toISOString();

  const tags = input.tags ? JSON.stringify(input.tags) : null;

  // Check if entry exists
  const existing = await db.execute({
    sql: "SELECT id, created_at FROM entries WHERE path = ?",
    args: [input.path],
  });

  if (existing.rows.length > 0) {
    const row = existing.rows[0];
    // Update existing entry
    await db.execute({
      sql: `UPDATE entries SET
        title = ?,
        content = ?,
        content_hash = ?,
        updated_at = ?,
        word_count = ?,
        tags = ?
      WHERE path = ?`,
      args: [
        input.title ?? null,
        input.content ?? null,
        input.content_hash ?? null,
        now,
        input.word_count ?? null,
        tags,
        input.path,
      ],
    });

    return {
      id: row?.id as number,
      path: input.path,
      title: input.title ?? null,
      content: input.content ?? null,
      content_hash: input.content_hash ?? null,
      created_at: row?.created_at as string,
      updated_at: now,
      indexed_at: null,
      word_count: input.word_count ?? null,
      tags,
    };
  }

  // Insert new entry
  const result = await db.execute({
    sql: `INSERT INTO entries (path, title, content, content_hash, created_at, updated_at, word_count, tags)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      input.path,
      input.title ?? null,
      input.content ?? null,
      input.content_hash ?? null,
      now,
      now,
      input.word_count ?? null,
      tags,
    ],
  });

  return {
    id: Number(result.lastInsertRowid),
    path: input.path,
    title: input.title ?? null,
    content: input.content ?? null,
    content_hash: input.content_hash ?? null,
    created_at: now,
    updated_at: now,
    indexed_at: null,
    word_count: input.word_count ?? null,
    tags,
  };
}

/**
 * Get an entry by path
 */
export async function getEntry(path: string): Promise<Entry | null> {
  const db = await getDb();

  const result = await db.execute({
    sql: "SELECT * FROM entries WHERE path = ?",
    args: [path],
  });

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  if (!row) return null;

  return {
    id: row.id as number,
    path: row.path as string,
    title: row.title as string | null,
    content: row.content as string | null,
    content_hash: row.content_hash as string | null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    indexed_at: row.indexed_at as string | null,
    word_count: row.word_count as number | null,
    tags: row.tags as string | null,
  };
}

/**
 * List entries, optionally limited
 */
export async function listEntries(limit = 100): Promise<Entry[]> {
  const db = await getDb();

  const result = await db.execute({
    sql: "SELECT * FROM entries ORDER BY updated_at DESC LIMIT ?",
    args: [limit],
  });

  return result.rows.map((row) => ({
    id: row.id as number,
    path: row.path as string,
    title: row.title as string | null,
    content: row.content as string | null,
    content_hash: row.content_hash as string | null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    indexed_at: row.indexed_at as string | null,
    word_count: row.word_count as number | null,
    tags: row.tags as string | null,
  }));
}

/**
 * Delete an entry by path
 * @returns true if deleted, false if not found
 */
export async function deleteEntry(path: string): Promise<boolean> {
  const db = await getDb();
  const existing = await getEntry(path);
  if (!existing) return false;

  await db.execute({
    sql: "DELETE FROM entries WHERE path = ?",
    args: [path],
  });
  return true;
}

/**
 * Search entries using full-text search (FTS5)
 */
export async function searchFts(query: string, limit = 10): Promise<Entry[]> {
  const db = await getDb();

  const result = await db.execute({
    sql: `SELECT e.* FROM entries e
          JOIN entries_fts fts ON e.id = fts.rowid
          WHERE entries_fts MATCH ?
          ORDER BY bm25(entries_fts)
          LIMIT ?`,
    args: [query, limit],
  });

  return result.rows.map((row) => ({
    id: row.id as number,
    path: row.path as string,
    title: row.title as string | null,
    content: row.content as string | null,
    content_hash: row.content_hash as string | null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    indexed_at: row.indexed_at as string | null,
    word_count: row.word_count as number | null,
    tags: row.tags as string | null,
  }));
}

/**
 * Update the indexed_at timestamp for an entry
 */
export async function markEntryIndexed(entryId: number): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();

  await db.execute({
    sql: "UPDATE entries SET indexed_at = ? WHERE id = ?",
    args: [now, entryId],
  });
}
