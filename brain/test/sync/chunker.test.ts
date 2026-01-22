import { describe, expect, test } from "bun:test";
import {
  chunkContent,
  chunkDailyFile,
  chunkNamedFile,
  estimateTokens,
  isDailyFile,
} from "../../src/sync/chunker.ts";

describe("chunkDailyFile", () => {
  test("chunks by timestamp blocks", () => {
    const content = `[2026-01-22-100000]
First entry

[2026-01-22-110000]
Second entry`;

    const chunks = chunkDailyFile(content);

    expect(chunks).toHaveLength(2);
    expect(chunks[0]?.type).toBe("timestamp-block");
    expect(chunks[0]?.content).toContain("First entry");
    expect(chunks[0]?.startLine).toBe(0);
    expect(chunks[1]?.content).toContain("Second entry");
    expect(chunks[1]?.startLine).toBe(3);
  });

  test("handles single entry", () => {
    const content = `[2026-01-22-100000]
Single entry here`;

    const chunks = chunkDailyFile(content);

    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.type).toBe("timestamp-block");
    expect(chunks[0]?.content).toContain("Single entry");
  });

  test("returns whole-file chunk if no timestamps found", () => {
    const content = `Just some text
without any timestamps`;

    const chunks = chunkDailyFile(content);

    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.type).toBe("whole-file");
    expect(chunks[0]?.content).toContain("Just some text");
  });

  test("handles empty content", () => {
    const chunks = chunkDailyFile("");
    expect(chunks).toHaveLength(0);
  });

  test("handles content with only whitespace", () => {
    const chunks = chunkDailyFile("   \n\n   ");
    expect(chunks).toHaveLength(0);
  });

  test("preserves multi-line entries", () => {
    const content = `[2026-01-22-100000]
Line 1
Line 2
Line 3`;

    const chunks = chunkDailyFile(content);

    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.content).toContain("Line 1");
    expect(chunks[0]?.content).toContain("Line 2");
    expect(chunks[0]?.content).toContain("Line 3");
  });
});

describe("chunkNamedFile", () => {
  test("returns whole-file chunk for short files", () => {
    const content = `# My Note

This is a short note.`;

    const chunks = chunkNamedFile(content);

    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.type).toBe("whole-file");
  });

  test("chunks by ## headers for long files", () => {
    const longContent =
      "# Title\n\n" +
      "Some intro text.\n\n" +
      "## Section 1\n\n" +
      "A".repeat(500) +
      "\n\n" +
      "## Section 2\n\n" +
      "B".repeat(500);

    const chunks = chunkNamedFile(longContent);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]?.type).toBe("header-section");
  });

  test("handles file with no ## headers as whole file", () => {
    const content = "A".repeat(2000); // Long but no headers

    const chunks = chunkNamedFile(content);

    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.type).toBe("whole-file");
  });

  test("handles empty content", () => {
    const chunks = chunkNamedFile("");
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.content).toBe("");
  });
});

describe("isDailyFile", () => {
  test("matches daily file pattern", () => {
    expect(isDailyFile("2026/01/22.md")).toBe(true);
    expect(isDailyFile("2024/12/31.md")).toBe(true);
  });

  test("rejects non-daily patterns", () => {
    expect(isDailyFile("notes/idea.md")).toBe(false);
    expect(isDailyFile("2026-01-22.md")).toBe(false);
    expect(isDailyFile("2026/1/22.md")).toBe(false); // Single digit month
    expect(isDailyFile("2026/01/22")).toBe(false); // No .md extension
  });
});

describe("chunkContent", () => {
  test("uses chunkDailyFile for daily paths", () => {
    const content = `[2026-01-22-100000]
Test entry`;

    const chunks = chunkContent(content, "2026/01/22.md");

    expect(chunks[0]?.type).toBe("timestamp-block");
  });

  test("uses chunkNamedFile for named paths", () => {
    const content = "Short note";

    const chunks = chunkContent(content, "notes/idea.md");

    expect(chunks[0]?.type).toBe("whole-file");
  });
});

describe("estimateTokens", () => {
  test("estimates ~4 chars per token", () => {
    expect(estimateTokens("test")).toBe(1);
    expect(estimateTokens("testtest")).toBe(2);
    expect(estimateTokens("A".repeat(100))).toBe(25);
  });

  test("rounds up", () => {
    expect(estimateTokens("abc")).toBe(1); // 3/4 = 0.75, ceil = 1
    expect(estimateTokens("abcde")).toBe(2); // 5/4 = 1.25, ceil = 2
  });

  test("handles empty string", () => {
    expect(estimateTokens("")).toBe(0);
  });
});
