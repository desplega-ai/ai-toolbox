import type { GraphData, GraphEdge, GraphNode, ParsedFile } from "../types.ts";
import { extractReferences } from "./references.ts";
import { resolveEdges } from "./resolver.ts";

export function buildGraph(files: ParsedFile[], sourceDir: string, version: string): GraphData {
  const rawEdges = extractReferences(files);
  const edges = resolveEdges(rawEdges, files);

  // Count connections per node
  const connectionCounts = new Map<string, number>();
  for (const edge of edges) {
    connectionCounts.set(edge.source, (connectionCounts.get(edge.source) ?? 0) + 1);
    connectionCounts.set(edge.target, (connectionCounts.get(edge.target) ?? 0) + 1);
  }

  const nodes: GraphNode[] = files.map((f) => ({
    id: f.relativePath,
    filename: f.filename,
    topic: f.topic,
    docType: f.docType,
    owner: f.owner,
    date: f.date,
    tags: f.tags,
    status: f.status,
    author: f.author,
    connectionCount: connectionCounts.get(f.relativePath) ?? 0,
  }));

  return {
    nodes,
    edges,
    metadata: {
      indexedAt: new Date().toISOString(),
      sourceDir,
      fileCount: files.length,
      version,
    },
  };
}
