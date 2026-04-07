import { describe, expect, test } from "bun:test";
import { extractReferences } from "../src/indexer/references.ts";
import type { ParsedFile } from "../src/types.ts";

function makeParsedFile(overrides: Partial<ParsedFile>): ParsedFile {
  return {
    absolutePath: "/tmp/test.md",
    relativePath: "shared/research/test.md",
    filename: "test.md",
    owner: "shared",
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
    ...overrides,
  };
}

describe("references", () => {
  test("extracts related edges (bidirectional)", () => {
    const file = makeParsedFile({
      rawRelated: ["other-research.md", "another.md"],
    });

    const edges = extractReferences([file]);
    expect(edges).toHaveLength(2);
    expect(edges[0]!.type).toBe("related");
    expect(edges[0]!.bidirectional).toBe(true);
    expect(edges[0]!.targetRef).toBe("other-research.md");
  });

  test("extracts supersedes edges (directional)", () => {
    const file = makeParsedFile({
      rawSupersedes: ["old-approach.md"],
    });

    const edges = extractReferences([file]);
    expect(edges).toHaveLength(1);
    expect(edges[0]!.type).toBe("supersedes");
    expect(edges[0]!.bidirectional).toBe(false);
  });

  test("extracts research field edge", () => {
    const file = makeParsedFile({
      relativePath: "taras/plans/my-plan.md",
      rawResearch: "thoughts/taras/research/my-research.md",
    });

    const edges = extractReferences([file]);
    expect(edges).toHaveLength(1);
    expect(edges[0]!.type).toBe("research-source");
    expect(edges[0]!.targetRef).toBe("thoughts/taras/research/my-research.md");
  });

  test("extracts inline citations with line ranges", () => {
    const file = makeParsedFile({
      bodyContent: `
Some context here.
- Storage architecture (research: \`2025-12-15-hive-storage.md:46-118\`)
- UI design (research: \`2025-12-15-hive-ux.md\`)
`,
    });

    const edges = extractReferences([file]);
    expect(edges).toHaveLength(2);
    expect(edges[0]!.type).toBe("citation");
    expect(edges[0]!.targetRef).toBe("2025-12-15-hive-storage.md");
    expect(edges[1]!.targetRef).toBe("2025-12-15-hive-ux.md");
  });

  test("extracts markdown links", () => {
    const file = makeParsedFile({
      bodyContent: `
Building on ([prior brainstorm](./2026-03-11-session-discovery.md)), we explored...
Also see [other doc](other-doc.md).
`,
    });

    const edges = extractReferences([file]);
    expect(edges).toHaveLength(2);
    expect(edges[0]!.type).toBe("markdown-link");
    expect(edges[0]!.targetRef).toBe("2026-03-11-session-discovery.md");
    expect(edges[1]!.targetRef).toBe("other-doc.md");
  });

  test("handles file with all reference types", () => {
    const file = makeParsedFile({
      rawRelated: ["related.md"],
      rawSupersedes: ["old.md"],
      rawResearch: "thoughts/shared/research/base.md",
      bodyContent: `
Citing (research: \`cited.md:10-20\`) and linking [here](./linked.md).
`,
    });

    const edges = extractReferences([file]);
    expect(edges).toHaveLength(5);

    const types = edges.map((e) => e.type);
    expect(types).toContain("related");
    expect(types).toContain("supersedes");
    expect(types).toContain("research-source");
    expect(types).toContain("citation");
    expect(types).toContain("markdown-link");
  });
});
