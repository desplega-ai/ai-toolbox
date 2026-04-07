export type DocType = "research" | "plan" | "brainstorm";

export type EdgeType = "related" | "supersedes" | "research-source" | "citation" | "markdown-link";

export interface ScannedFile {
  absolutePath: string;
  relativePath: string;
  filename: string;
  owner: string;
  docType: DocType;
  date: string;
}

export interface ParsedFile extends ScannedFile {
  topic: string;
  tags: string[];
  status: string;
  author: string;
  rawRelated: string[];
  rawSupersedes: string[];
  rawResearch: string | null;
  bodyContent: string;
}

export interface RawEdge {
  sourceFile: string;
  targetRef: string;
  type: EdgeType;
  bidirectional: boolean;
}

export interface GraphNode {
  id: string;
  filename: string;
  topic: string;
  docType: DocType;
  owner: string;
  date: string;
  tags: string[];
  status: string;
  author: string;
  connectionCount: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  type: EdgeType;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  metadata: {
    indexedAt: string;
    sourceDir: string;
    fileCount: number;
    version: string;
  };
}
