import { getDb } from "./client.ts";
import type { Chunk, SearchResult } from "./schema.ts";

export interface ChunkInput {
  chunk_index: number;
  chunk_type: "timestamp-block" | "header-section" | "whole-file";
  content: string;
  content_hash?: string;
  embedding?: number[];
  embedding_model?: string;
  start_line?: number;
}

/**
 * Upsert chunks for an entry
 * Replaces all existing chunks for the entry
 */
export async function upsertChunks(entryId: number, chunks: ChunkInput[]): Promise<void> {
  const db = await getDb();

  // Delete existing chunks for this entry
  await db.execute({
    sql: "DELETE FROM chunks WHERE entry_id = ?",
    args: [entryId],
  });

  // Insert new chunks
  for (const chunk of chunks) {
    // Convert embedding array to blob if present
    const embeddingBlob = chunk.embedding ? new Float32Array(chunk.embedding).buffer : null;

    await db.execute({
      sql: `INSERT INTO chunks (entry_id, chunk_index, chunk_type, content, content_hash, embedding, embedding_model, start_line)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        entryId,
        chunk.chunk_index,
        chunk.chunk_type,
        chunk.content,
        chunk.content_hash ?? null,
        embeddingBlob,
        chunk.embedding_model ?? null,
        chunk.start_line ?? null,
      ],
    });
  }
}

/**
 * Get chunks for an entry
 */
export async function getChunksByEntry(entryId: number): Promise<Chunk[]> {
  const db = await getDb();

  const result = await db.execute({
    sql: "SELECT * FROM chunks WHERE entry_id = ? ORDER BY chunk_index",
    args: [entryId],
  });

  return result.rows.map((row) => ({
    id: row.id as number,
    entry_id: row.entry_id as number,
    chunk_index: row.chunk_index as number,
    chunk_type: row.chunk_type as Chunk["chunk_type"],
    content: row.content as string,
    content_hash: row.content_hash as string | null,
    embedding: row.embedding ? new Float32Array(row.embedding as ArrayBuffer) : null,
    embedding_model: row.embedding_model as string | null,
    start_line: row.start_line as number | null,
  }));
}

/**
 * Search chunks using vector similarity
 * Returns chunks with their parent entries, ordered by similarity score
 */
export async function searchSemantic(embedding: number[], limit = 10): Promise<SearchResult[]> {
  const db = await getDb();

  // Convert embedding to blob
  const embeddingBlob = new Float32Array(embedding).buffer;

  // Use vector_top_k for semantic search
  // Note: This requires libSQL vector extensions
  try {
    const result = await db.execute({
      sql: `SELECT c.*, e.*,
            vector_distance_cos(c.embedding, ?) as distance
            FROM chunks c
            JOIN entries e ON c.entry_id = e.id
            WHERE c.embedding IS NOT NULL
            ORDER BY distance ASC
            LIMIT ?`,
      args: [embeddingBlob, limit],
    });

    return result.rows.map((row) => ({
      entry: {
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
      },
      chunk: {
        id: row.id as number,
        entry_id: row.entry_id as number,
        chunk_index: row.chunk_index as number,
        chunk_type: row.chunk_type as Chunk["chunk_type"],
        content: row.content as string,
        content_hash: row.content_hash as string | null,
        embedding: null, // Don't return embeddings in search results
        embedding_model: row.embedding_model as string | null,
        start_line: row.start_line as number | null,
      },
      score: 1 - (row.distance as number), // Convert distance to similarity score
    }));
  } catch {
    // Vector search not supported, fall back to empty results
    return [];
  }
}

/**
 * Get chunk by hash (for checking if re-embedding is needed)
 */
export async function getChunkByHash(entryId: number, hash: string): Promise<Chunk | null> {
  const db = await getDb();

  const result = await db.execute({
    sql: "SELECT * FROM chunks WHERE entry_id = ? AND content_hash = ?",
    args: [entryId, hash],
  });

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  if (!row) return null;

  return {
    id: row.id as number,
    entry_id: row.entry_id as number,
    chunk_index: row.chunk_index as number,
    chunk_type: row.chunk_type as Chunk["chunk_type"],
    content: row.content as string,
    content_hash: row.content_hash as string | null,
    embedding: row.embedding ? new Float32Array(row.embedding as ArrayBuffer) : null,
    embedding_model: row.embedding_model as string | null,
    start_line: row.start_line as number | null,
  };
}
