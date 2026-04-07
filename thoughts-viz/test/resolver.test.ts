import { describe, expect, test } from "bun:test";
import { resolveEdges } from "../src/indexer/resolver.ts";
import type { ParsedFile, RawEdge } from "../src/types.ts";

function makeFile(relativePath: string): ParsedFile {
  const filename = relativePath.split("/").pop()!;
  return {
    absolutePath: `/fake/${relativePath}`,
    relativePath,
    filename,
    owner: relativePath.split("/")[0]!,
    docType: "research",
    date: "2025-01-01",
    topic: "Test",
    tags: [],
    status: "complete",
    author: "Claude",
    rawRelated: [],
    rawSupersedes: [],
    rawResearch: null,
    bodyContent: "",
  };
}

const files: ParsedFile[] = [
  makeFile("shared/research/alpha.md"),
  makeFile("shared/research/beta.md"),
  makeFile("shared/plans/plan-a.md"),
  makeFile("taras/research/alpha.md"), // same filename, different owner
];

describe("resolver", () => {
  test("resolves filename-only reference", () => {
    const raw: RawEdge[] = [
      {
        sourceFile: "shared/plans/plan-a.md",
        targetRef: "beta.md",
        type: "citation",
        bidirectional: false,
      },
    ];

    const resolved = resolveEdges(raw, files);
    expect(resolved).toHaveLength(1);
    expect(resolved[0]!.target).toBe("shared/research/beta.md");
  });

  test("resolves full path with thoughts/ prefix", () => {
    const raw: RawEdge[] = [
      {
        sourceFile: "shared/plans/plan-a.md",
        targetRef: "thoughts/shared/research/alpha.md",
        type: "research-source",
        bidirectional: false,
      },
    ];

    const resolved = resolveEdges(raw, files);
    expect(resolved).toHaveLength(1);
    expect(resolved[0]!.target).toBe("shared/research/alpha.md");
  });

  test("prefers same-owner on filename collision", () => {
    const raw: RawEdge[] = [
      {
        sourceFile: "taras/research/alpha.md",
        targetRef: "alpha.md",
        type: "related",
        bidirectional: false,
      },
    ];

    // taras/research/alpha.md referencing "alpha.md" — self-reference should still resolve
    // but since source=target, the edge should resolve to same-owner first
    const resolved = resolveEdges(raw, files);
    expect(resolved).toHaveLength(1);
    expect(resolved[0]!.target).toBe("taras/research/alpha.md");
  });

  test("creates reverse edges for bidirectional", () => {
    const raw: RawEdge[] = [
      {
        sourceFile: "shared/research/alpha.md",
        targetRef: "beta.md",
        type: "related",
        bidirectional: true,
      },
    ];

    const resolved = resolveEdges(raw, files);
    expect(resolved).toHaveLength(2);
    expect(resolved[0]!.source).toBe("shared/research/alpha.md");
    expect(resolved[0]!.target).toBe("shared/research/beta.md");
    expect(resolved[1]!.source).toBe("shared/research/beta.md");
    expect(resolved[1]!.target).toBe("shared/research/alpha.md");
  });

  test("deduplicates same source-target-type", () => {
    const raw: RawEdge[] = [
      {
        sourceFile: "shared/plans/plan-a.md",
        targetRef: "beta.md",
        type: "citation",
        bidirectional: false,
      },
      {
        sourceFile: "shared/plans/plan-a.md",
        targetRef: "beta.md",
        type: "citation",
        bidirectional: false,
      },
    ];

    const resolved = resolveEdges(raw, files);
    expect(resolved).toHaveLength(1);
  });

  test("skips unresolvable references", () => {
    const raw: RawEdge[] = [
      {
        sourceFile: "shared/plans/plan-a.md",
        targetRef: "nonexistent.md",
        type: "citation",
        bidirectional: false,
      },
    ];

    const resolved = resolveEdges(raw, files);
    expect(resolved).toHaveLength(0);
  });
});
