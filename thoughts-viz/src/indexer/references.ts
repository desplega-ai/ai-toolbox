import type { ParsedFile, RawEdge } from "../types.ts";

/** Extract edges from frontmatter `related` field — bidirectional */
function extractRelated(file: ParsedFile): RawEdge[] {
  return file.rawRelated.map((ref) => ({
    sourceFile: file.relativePath,
    targetRef: ref,
    type: "related" as const,
    bidirectional: true,
  }));
}

/** Extract edges from frontmatter `supersedes` field — directional */
function extractSupersedes(file: ParsedFile): RawEdge[] {
  return file.rawSupersedes.map((ref) => ({
    sourceFile: file.relativePath,
    targetRef: ref,
    type: "supersedes" as const,
    bidirectional: false,
  }));
}

/** Extract edge from frontmatter `research` field — directional */
function extractResearchField(file: ParsedFile): RawEdge[] {
  if (!file.rawResearch) return [];
  return [
    {
      sourceFile: file.relativePath,
      targetRef: file.rawResearch,
      type: "research-source" as const,
      bidirectional: false,
    },
  ];
}

/** Extract inline citations: research: `filename.md` or `filename.md:46-118` */
function extractInlineCitations(file: ParsedFile): RawEdge[] {
  const edges: RawEdge[] = [];
  const regex = /research:\s*`([^`]+)`/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(file.bodyContent)) !== null) {
    const ref = match[1]!.replace(/:\d+-\d+$/, ""); // strip line range
    edges.push({
      sourceFile: file.relativePath,
      targetRef: ref,
      type: "citation" as const,
      bidirectional: false,
    });
  }

  return edges;
}

/** Extract markdown links to .md files: [text](./filename.md) or [text](filename.md) */
function extractMarkdownLinks(file: ParsedFile): RawEdge[] {
  const edges: RawEdge[] = [];
  const regex = /\]\((\.\/)?([\w-]+\.md)\)/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(file.bodyContent)) !== null) {
    edges.push({
      sourceFile: file.relativePath,
      targetRef: match[2]!,
      type: "markdown-link" as const,
      bidirectional: false,
    });
  }

  return edges;
}

export function extractReferences(files: ParsedFile[]): RawEdge[] {
  const edges: RawEdge[] = [];

  for (const file of files) {
    edges.push(
      ...extractRelated(file),
      ...extractSupersedes(file),
      ...extractResearchField(file),
      ...extractInlineCitations(file),
      ...extractMarkdownLinks(file),
    );
  }

  return edges;
}
