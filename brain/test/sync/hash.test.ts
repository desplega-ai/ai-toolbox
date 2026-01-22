import { describe, expect, test } from "bun:test";
import { hashContent } from "../../src/sync/hash.ts";

describe("hashContent", () => {
  test("returns consistent hash for same content", async () => {
    const hash1 = await hashContent("Hello, World!");
    const hash2 = await hashContent("Hello, World!");

    expect(hash1).toBe(hash2);
  });

  test("returns different hash for different content", async () => {
    const hash1 = await hashContent("Hello, World!");
    const hash2 = await hashContent("Hello, World?");

    expect(hash1).not.toBe(hash2);
  });

  test("returns valid SHA-256 hex string", async () => {
    const hash = await hashContent("test");

    // SHA-256 produces 64 hex characters
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  test("matches known SHA-256 hash", async () => {
    // Known SHA-256 hash for "test"
    const expectedHash = "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";
    const hash = await hashContent("test");

    expect(hash).toBe(expectedHash);
  });

  test("handles empty string", async () => {
    const hash = await hashContent("");

    // Known SHA-256 hash for empty string
    expect(hash).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });

  test("handles unicode content", async () => {
    const hash = await hashContent("Hello 👋 World 🌍");

    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  test("handles long content", async () => {
    const longContent = "A".repeat(100000);
    const hash = await hashContent(longContent);

    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });
});
