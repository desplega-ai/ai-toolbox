import { describe, expect, test } from "bun:test";
import { parseFile } from "../src/indexer/parser.ts";
import type { ScannedFile } from "../src/types.ts";
import { join } from "node:path";

const thoughtsDir = join(import.meta.dir, "../../thoughts");

describe("parser", () => {
  test("parses research file with full frontmatter", async () => {
    const scanned: ScannedFile = {
      absolutePath: join(thoughtsDir, "shared/research/2025-12-15-hive-ux-ui-design-spec.md"),
      relativePath: "shared/research/2025-12-15-hive-ux-ui-design-spec.md",
      filename: "2025-12-15-hive-ux-ui-design-spec.md",
      owner: "shared",
      docType: "research",
      date: "2025-12-15",
    };

    const parsed = await parseFile(scanned);
    expect(parsed.topic).toBeTruthy();
    expect(parsed.tags.length).toBeGreaterThan(0);
    expect(parsed.status).toBeTruthy();
    expect(parsed.rawRelated.length).toBeGreaterThan(0);
  });

  test("parses plan file with research reference", async () => {
    const scanned: ScannedFile = {
      absolutePath: join(thoughtsDir, "taras/plans/2026-01-22-brain-cli-mvp.md"),
      relativePath: "taras/plans/2026-01-22-brain-cli-mvp.md",
      filename: "2026-01-22-brain-cli-mvp.md",
      owner: "taras",
      docType: "plan",
      date: "2026-01-22",
    };

    const parsed = await parseFile(scanned);
    expect(parsed.topic).toBeTruthy();
    expect(parsed.rawResearch).toBeTruthy();
  });

  test("falls back to filename when no frontmatter or heading", async () => {
    // Create a temp file with no frontmatter
    const tmpPath = join(import.meta.dir, "tmp-test.md");
    await Bun.write(tmpPath, "Just some text without frontmatter or heading.\n");

    const scanned: ScannedFile = {
      absolutePath: tmpPath,
      relativePath: "test/tmp-test.md",
      filename: "tmp-test.md",
      owner: "test",
      docType: "research",
      date: "",
    };

    const parsed = await parseFile(scanned);
    expect(parsed.topic).toBe("tmp-test");
    expect(parsed.tags).toEqual([]);
    expect(parsed.status).toBe("unknown");

    // Cleanup
    const { unlink } = await import("node:fs/promises");
    await unlink(tmpPath);
  });
});
