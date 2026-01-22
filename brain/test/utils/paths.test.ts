import { describe, expect, test } from "bun:test";
import { homedir } from "node:os";
import {
  expandPath,
  formatPath,
  getTimestamp,
  getTodayPath,
  isValidEntryPath,
  normalizeEntryPath,
  titleFromPath,
} from "../../src/utils/paths.ts";

describe("expandPath", () => {
  test("expands ~ to home directory", () => {
    const home = homedir();
    expect(expandPath("~")).toBe(home);
  });

  test("expands ~/path to home directory path", () => {
    const home = homedir();
    expect(expandPath("~/Documents")).toBe(`${home}/Documents`);
    expect(expandPath("~/a/b/c")).toBe(`${home}/a/b/c`);
  });

  test("returns absolute paths unchanged", () => {
    expect(expandPath("/usr/local")).toBe("/usr/local");
    expect(expandPath("/")).toBe("/");
  });

  test("returns relative paths unchanged", () => {
    expect(expandPath("foo/bar")).toBe("foo/bar");
    expect(expandPath("./foo")).toBe("./foo");
  });
});

describe("formatPath", () => {
  test("replaces home directory with ~", () => {
    const home = homedir();
    expect(formatPath(`${home}/Documents`)).toBe("~/Documents");
    expect(formatPath(home)).toBe("~");
  });

  test("returns non-home paths unchanged", () => {
    expect(formatPath("/usr/local")).toBe("/usr/local");
    expect(formatPath("relative/path")).toBe("relative/path");
  });
});

describe("getTodayPath", () => {
  test("returns YYYY/MM/DD.md format", () => {
    const path = getTodayPath();
    expect(path).toMatch(/^\d{4}\/\d{2}\/\d{2}\.md$/);
  });

  test("returns correct date", () => {
    const path = getTodayPath();
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    expect(path).toBe(`${year}/${month}/${day}.md`);
  });
});

describe("getTimestamp", () => {
  test("returns YYYY-MM-DD-HHMMSS format", () => {
    const timestamp = getTimestamp();
    expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}-\d{6}$/);
  });

  test("starts with current date", () => {
    const timestamp = getTimestamp();
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    expect(timestamp.startsWith(`${year}-${month}-${day}-`)).toBe(true);
  });
});

describe("isValidEntryPath", () => {
  test("accepts alphanumeric paths", () => {
    expect(isValidEntryPath("notes")).toBe(true);
    expect(isValidEntryPath("notes/ideas")).toBe(true);
    expect(isValidEntryPath("2026/01/22")).toBe(true);
  });

  test("accepts hyphens and underscores", () => {
    expect(isValidEntryPath("my-notes")).toBe(true);
    expect(isValidEntryPath("my_notes")).toBe(true);
    expect(isValidEntryPath("project-ideas/startup_idea")).toBe(true);
  });

  test("rejects paths with spaces", () => {
    expect(isValidEntryPath("my notes")).toBe(false);
    expect(isValidEntryPath("notes/my idea")).toBe(false);
  });

  test("rejects paths with special characters", () => {
    expect(isValidEntryPath("notes.md")).toBe(false);
    expect(isValidEntryPath("notes@work")).toBe(false);
    expect(isValidEntryPath("notes#1")).toBe(false);
  });
});

describe("normalizeEntryPath", () => {
  test("adds .md extension if missing", () => {
    expect(normalizeEntryPath("notes")).toBe("notes.md");
    expect(normalizeEntryPath("2026/01/22")).toBe("2026/01/22.md");
  });

  test("preserves .md extension if present", () => {
    expect(normalizeEntryPath("notes.md")).toBe("notes.md");
  });

  test("removes leading slashes", () => {
    expect(normalizeEntryPath("/notes")).toBe("notes.md");
    expect(normalizeEntryPath("///notes")).toBe("notes.md");
  });

  test("removes trailing slashes", () => {
    expect(normalizeEntryPath("notes/")).toBe("notes.md");
    expect(normalizeEntryPath("notes///")).toBe("notes.md");
  });
});

describe("titleFromPath", () => {
  test("extracts last segment and capitalizes", () => {
    expect(titleFromPath("notes/my-idea")).toBe("My Idea");
    expect(titleFromPath("projects/startup")).toBe("Startup");
  });

  test("handles underscores", () => {
    expect(titleFromPath("my_great_idea")).toBe("My Great Idea");
  });

  test("handles mixed separators", () => {
    expect(titleFromPath("my-great_idea")).toBe("My Great Idea");
  });

  test("removes .md extension", () => {
    expect(titleFromPath("notes/idea.md")).toBe("Idea");
  });

  test("handles single segment paths", () => {
    expect(titleFromPath("idea")).toBe("Idea");
  });
});
