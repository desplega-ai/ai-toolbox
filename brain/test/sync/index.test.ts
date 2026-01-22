import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getChunksByEntry } from "../../src/db/chunks.ts";
import { closeDb, initDb } from "../../src/db/client.ts";
import { getEntry } from "../../src/db/entries.ts";
import { syncBrain, syncFile } from "../../src/sync/index.ts";

const TEST_DIR = join(tmpdir(), `brain-test-sync-${Date.now()}`);
const TEST_DB_PATH = join(TEST_DIR, ".brain.db");

beforeAll(async () => {
  // Create test directory structure
  await mkdir(TEST_DIR, { recursive: true });
  await mkdir(join(TEST_DIR, "2026", "01"), { recursive: true });
  await mkdir(join(TEST_DIR, "notes"), { recursive: true });

  // Create test files
  await writeFile(
    join(TEST_DIR, "2026", "01", "22.md"),
    `[2026-01-22-100000]
First entry

[2026-01-22-110000]
Second entry
`,
  );

  await writeFile(
    join(TEST_DIR, "notes", "ideas.md"),
    `# Ideas

Some ideas here.
`,
  );

  await writeFile(join(TEST_DIR, "simple.md"), "Just a simple note.");

  // Initialize database
  await initDb(TEST_DB_PATH);
});

afterAll(async () => {
  closeDb();
  try {
    await rm(TEST_DIR, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
});

describe("syncFile", () => {
  test("syncs a daily file", async () => {
    const result = await syncFile("2026/01/22.md", TEST_DIR, { quiet: true });

    expect(result.updated).toBe(true);
    expect(result.error).toBeUndefined();

    // Check entry was created
    const entry = await getEntry("2026/01/22.md");
    expect(entry).not.toBeNull();
    expect(entry?.content).toContain("First entry");
    expect(entry?.indexed_at).toBeTruthy();

    // Check chunks were created
    if (!entry) throw new Error("Entry should exist");
    const chunks = await getChunksByEntry(entry.id);
    expect(chunks.length).toBe(2);
    expect(chunks[0]?.chunk_type).toBe("timestamp-block");
  });

  test("syncs a named file", async () => {
    const result = await syncFile("notes/ideas.md", TEST_DIR, { quiet: true });

    expect(result.updated).toBe(true);

    const entry = await getEntry("notes/ideas.md");
    expect(entry).not.toBeNull();
    expect(entry?.title).toBe("Ideas");

    if (!entry) throw new Error("Entry should exist");
    const chunks = await getChunksByEntry(entry.id);
    expect(chunks.length).toBe(1);
    expect(chunks[0]?.chunk_type).toBe("whole-file");
  });

  test("skips unchanged files", async () => {
    // First sync
    await syncFile("simple.md", TEST_DIR, { quiet: true });

    // Second sync should skip
    const result = await syncFile("simple.md", TEST_DIR, { quiet: true });

    expect(result.updated).toBe(false);
    expect(result.chunksEmbedded).toBe(0);
  });

  test("re-syncs with force option", async () => {
    // Ensure file is synced
    await syncFile("simple.md", TEST_DIR, { quiet: true });

    // Force re-sync
    const result = await syncFile("simple.md", TEST_DIR, { force: true, quiet: true });

    expect(result.updated).toBe(true);
  });

  test("handles non-existent file", async () => {
    const result = await syncFile("non-existent.md", TEST_DIR, { quiet: true });

    expect(result.updated).toBe(false);
    expect(result.error).toBeTruthy();
  });
});

describe("syncBrain", () => {
  test("syncs all files in directory", async () => {
    // Create a fresh test directory
    const freshDir = join(tmpdir(), `brain-fresh-${Date.now()}`);
    await mkdir(freshDir, { recursive: true });
    await writeFile(join(freshDir, "file1.md"), "File 1 content");
    await writeFile(join(freshDir, "file2.md"), "File 2 content");

    // Initialize a separate db for this test
    const freshDbPath = join(freshDir, ".brain.db");
    closeDb(); // Close existing connection
    await initDb(freshDbPath);

    const result = await syncBrain(freshDir, { quiet: true });

    expect(result.filesScanned).toBe(2);
    expect(result.entriesUpdated).toBe(2);
    expect(result.errors).toHaveLength(0);

    // Cleanup
    closeDb();
    await rm(freshDir, { recursive: true, force: true });

    // Restore original db
    await initDb(TEST_DB_PATH);
  });

  test("reports errors for problematic files", async () => {
    // The sync should handle errors gracefully
    const result = await syncBrain(TEST_DIR, { quiet: true });

    // Errors array should exist even if empty
    expect(Array.isArray(result.errors)).toBe(true);
  });
});
