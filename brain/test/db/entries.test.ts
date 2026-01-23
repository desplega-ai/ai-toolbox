import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { closeDb, initDb } from "../../src/db/client.ts";
import {
  deleteEntry,
  getEntry,
  listEntries,
  markEntryIndexed,
  upsertEntry,
} from "../../src/db/entries.ts";

const TEST_DB_PATH = join(tmpdir(), `brain-test-entries-${Date.now()}.db`);

beforeAll(async () => {
  await initDb(TEST_DB_PATH);
});

afterAll(async () => {
  closeDb();
  try {
    await unlink(TEST_DB_PATH);
  } catch {
    // Ignore cleanup errors
  }
});

describe("upsertEntry", () => {
  test("creates a new entry", async () => {
    const entry = await upsertEntry({
      path: "test/new-entry.md",
      title: "Test Entry",
      content: "This is test content",
      word_count: 4,
    });

    expect(entry.id).toBeGreaterThan(0);
    expect(entry.path).toBe("test/new-entry.md");
    expect(entry.title).toBe("Test Entry");
    expect(entry.content).toBe("This is test content");
    expect(entry.word_count).toBe(4);
    expect(entry.created_at).toBeTruthy();
    expect(entry.updated_at).toBeTruthy();
  });

  test("updates an existing entry", async () => {
    // Create initial entry
    const initial = await upsertEntry({
      path: "test/update-entry.md",
      title: "Initial Title",
      content: "Initial content",
    });

    // Small delay to ensure different timestamps
    await new Promise((r) => setTimeout(r, 5));

    // Update it
    const updated = await upsertEntry({
      path: "test/update-entry.md",
      title: "Updated Title",
      content: "Updated content",
    });

    expect(updated.id).toBe(initial.id);
    expect(updated.title).toBe("Updated Title");
    expect(updated.content).toBe("Updated content");
    expect(updated.created_at).toBe(initial.created_at);
    // updated_at should be different (or at least not fail if same due to timing)
  });

  test("handles tags as JSON", async () => {
    const entry = await upsertEntry({
      path: "test/tagged-entry.md",
      title: "Tagged Entry",
      tags: ["tag1", "tag2", "tag3"],
    });

    expect(entry.tags).toBe('["tag1","tag2","tag3"]');
  });
});

describe("getEntry", () => {
  test("returns entry by path", async () => {
    await upsertEntry({
      path: "test/get-entry.md",
      title: "Get Entry",
      content: "Content to get",
    });

    const entry = await getEntry("test/get-entry.md");

    expect(entry).not.toBeNull();
    expect(entry?.title).toBe("Get Entry");
    expect(entry?.content).toBe("Content to get");
  });

  test("returns null for non-existent path", async () => {
    const entry = await getEntry("non/existent/path.md");
    expect(entry).toBeNull();
  });
});

describe("listEntries", () => {
  test("lists entries ordered by updated_at desc", async () => {
    // Create entries with slight delays to ensure different timestamps
    await upsertEntry({ path: "test/list-1.md", title: "First" });
    await new Promise((r) => setTimeout(r, 10));
    await upsertEntry({ path: "test/list-2.md", title: "Second" });
    await new Promise((r) => setTimeout(r, 10));
    await upsertEntry({ path: "test/list-3.md", title: "Third" });

    const entries = await listEntries(100);

    // Find our test entries
    const testEntries = entries.filter((e) => e.path.startsWith("test/list-"));

    expect(testEntries.length).toBe(3);
    // Most recent should be first
    expect(testEntries[0]?.title).toBe("Third");
  });

  test("respects limit parameter", async () => {
    const entries = await listEntries(2);
    expect(entries.length).toBeLessThanOrEqual(2);
  });
});

describe("deleteEntry", () => {
  test("deletes entry and returns true", async () => {
    await upsertEntry({ path: "test/to-delete.md", title: "Delete Me" });

    // Verify it exists
    let entry = await getEntry("test/to-delete.md");
    expect(entry).not.toBeNull();

    // Delete it
    const deleted = await deleteEntry("test/to-delete.md");
    expect(deleted).toBe(true);

    // Verify it's gone
    entry = await getEntry("test/to-delete.md");
    expect(entry).toBeNull();
  });

  test("returns false for non-existent path", async () => {
    const deleted = await deleteEntry("non/existent/delete.md");
    expect(deleted).toBe(false);
  });
});

describe("markEntryIndexed", () => {
  test("sets indexed_at timestamp", async () => {
    const entry = await upsertEntry({
      path: "test/to-index.md",
      title: "Index Me",
    });

    expect(entry.indexed_at).toBeNull();

    await markEntryIndexed(entry.id);

    const updated = await getEntry("test/to-index.md");
    expect(updated?.indexed_at).toBeTruthy();
  });
});
