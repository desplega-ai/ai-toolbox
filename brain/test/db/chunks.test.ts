import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getChunkByHash, getChunksByEntry, upsertChunks } from "../../src/db/chunks.ts";
import { closeDb, initDb } from "../../src/db/client.ts";
import { upsertEntry } from "../../src/db/entries.ts";

const TEST_DB_PATH = join(tmpdir(), `brain-test-chunks-${Date.now()}.db`);

let testEntryId: number;

beforeAll(async () => {
  await initDb(TEST_DB_PATH);

  // Create a test entry to use for chunks
  const entry = await upsertEntry({
    path: "test/chunks-entry.md",
    title: "Chunks Test Entry",
    content: "Test content for chunking",
  });
  testEntryId = entry.id;
});

afterAll(async () => {
  closeDb();
  try {
    await unlink(TEST_DB_PATH);
  } catch {
    // Ignore cleanup errors
  }
});

describe("upsertChunks", () => {
  test("inserts chunks for an entry", async () => {
    await upsertChunks(testEntryId, [
      {
        chunk_index: 0,
        chunk_type: "timestamp-block",
        content: "First chunk content",
        content_hash: "hash1",
        start_line: 0,
      },
      {
        chunk_index: 1,
        chunk_type: "timestamp-block",
        content: "Second chunk content",
        content_hash: "hash2",
        start_line: 5,
      },
    ]);

    const chunks = await getChunksByEntry(testEntryId);

    expect(chunks).toHaveLength(2);
    expect(chunks[0]?.chunk_index).toBe(0);
    expect(chunks[0]?.content).toBe("First chunk content");
    expect(chunks[1]?.chunk_index).toBe(1);
    expect(chunks[1]?.content).toBe("Second chunk content");
  });

  test("replaces existing chunks on upsert", async () => {
    // First insert
    await upsertChunks(testEntryId, [
      {
        chunk_index: 0,
        chunk_type: "whole-file",
        content: "Original content",
        content_hash: "original-hash",
      },
    ]);

    // Second insert should replace
    await upsertChunks(testEntryId, [
      {
        chunk_index: 0,
        chunk_type: "whole-file",
        content: "Replaced content",
        content_hash: "replaced-hash",
      },
    ]);

    const chunks = await getChunksByEntry(testEntryId);

    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.content).toBe("Replaced content");
    expect(chunks[0]?.content_hash).toBe("replaced-hash");
  });

  test("handles embeddings", async () => {
    // Create 1536-dimensional embedding (matching OpenAI text-embedding-3-small)
    const embedding = Array(1536)
      .fill(0)
      .map((_, i) => Math.sin(i * 0.01));

    await upsertChunks(testEntryId, [
      {
        chunk_index: 0,
        chunk_type: "whole-file",
        content: "Embedded content",
        embedding,
        embedding_model: "test-model",
      },
    ]);

    const chunks = await getChunksByEntry(testEntryId);

    expect(chunks[0]?.embedding_model).toBe("test-model");
    // Embedding should be stored as Float32Array
    if (chunks[0]?.embedding) {
      expect(chunks[0].embedding).toBeInstanceOf(Float32Array);
      expect(chunks[0].embedding.length).toBe(1536);
    }
  });
});

describe("getChunksByEntry", () => {
  test("returns chunks ordered by chunk_index", async () => {
    // Create a new entry for this test
    const entry = await upsertEntry({
      path: "test/ordered-chunks.md",
      title: "Ordered Chunks",
    });

    // Insert chunks out of order
    await upsertChunks(entry.id, [
      { chunk_index: 2, chunk_type: "header-section", content: "Third" },
      { chunk_index: 0, chunk_type: "header-section", content: "First" },
      { chunk_index: 1, chunk_type: "header-section", content: "Second" },
    ]);

    const chunks = await getChunksByEntry(entry.id);

    expect(chunks[0]?.content).toBe("First");
    expect(chunks[1]?.content).toBe("Second");
    expect(chunks[2]?.content).toBe("Third");
  });

  test("returns empty array for entry with no chunks", async () => {
    const entry = await upsertEntry({
      path: "test/no-chunks.md",
      title: "No Chunks",
    });

    const chunks = await getChunksByEntry(entry.id);

    expect(chunks).toHaveLength(0);
  });
});

describe("getChunkByHash", () => {
  test("returns chunk by content hash", async () => {
    const entry = await upsertEntry({
      path: "test/hash-lookup.md",
      title: "Hash Lookup",
    });

    await upsertChunks(entry.id, [
      {
        chunk_index: 0,
        chunk_type: "whole-file",
        content: "Content with specific hash",
        content_hash: "specific-hash-123",
      },
    ]);

    const chunk = await getChunkByHash(entry.id, "specific-hash-123");

    expect(chunk).not.toBeNull();
    expect(chunk?.content).toBe("Content with specific hash");
  });

  test("returns null for non-matching hash", async () => {
    const chunk = await getChunkByHash(testEntryId, "non-existent-hash");
    expect(chunk).toBeNull();
  });
});
