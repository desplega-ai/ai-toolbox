import chalk from "chalk";
import type {
  GraphData,
  GraphEdge,
  GraphNode,
  ParsedFile,
  ScannedFile,
  TimelineData,
  TimelineDiff,
  TimelineSnapshot,
} from "../types.ts";
import {
  getChangedFilesBetween,
  getCommitsForPath,
  getFileContentAtCommit,
  getFilesAtCommit,
  getGitRoot,
  isGitRepo,
} from "./git-history.ts";
import { buildGraph } from "./graph.ts";
import { parseFileFromContent } from "./parser.ts";
import { inferDocType, parseDateFromFilename } from "./scanner.ts";

function edgeKey(e: GraphEdge): string {
  return `${e.source}|${e.target}|${e.type}`;
}

function buildScannedFile(relativePath: string): ScannedFile {
  const filename = relativePath.split("/").pop()!;
  const segments = relativePath.split("/");
  const owner = segments[0] ?? "unknown";
  const typeSegment = segments[1] ?? "";
  return {
    absolutePath: "", // not used when parsing from content
    relativePath,
    filename,
    owner,
    docType: inferDocType(typeSegment),
    date: parseDateFromFilename(filename),
  };
}

export async function buildTimeline(
  dir: string,
  version: string,
  limit?: number,
): Promise<TimelineData | null> {
  if (!(await isGitRepo(dir))) {
    console.log(chalk.yellow("Not a git repository — skipping timeline"));
    return null;
  }

  const gitRoot = await getGitRoot(dir);
  const commits = await getCommitsForPath(gitRoot, dir, limit);

  if (commits.length === 0) {
    console.log(chalk.yellow("No commits found for this path — skipping timeline"));
    return null;
  }

  console.log(chalk.blue(`Building timeline from ${commits.length} commits...`));

  const snapshots: TimelineSnapshot[] = [];
  const allNodesMap = new Map<string, GraphNode>();
  const allEdgesMap = new Map<string, GraphEdge>();

  // Cache of parsed files carried forward between commits
  let prevParsedFiles = new Map<string, ParsedFile>();
  let prevHash: string | null = null;

  for (let i = 0; i < commits.length; i++) {
    const commit = commits[i]!;
    const hash = commit.hash;

    // Get all .md files at this commit
    const filesAtCommit = await getFilesAtCommit(gitRoot, dir, hash);

    // Determine which files changed since last commit
    let changedFiles: Set<string>;
    if (prevHash === null) {
      // First commit — all files are new
      changedFiles = new Set(filesAtCommit);
    } else {
      const changed = await getChangedFilesBetween(gitRoot, dir, prevHash, hash);
      changedFiles = new Set(changed);
    }

    // Build parsed file list: reuse cached for unchanged, re-parse for changed
    const currentParsedFiles = new Map<string, ParsedFile>();
    const filesAtCommitSet = new Set(filesAtCommit);

    for (const filePath of filesAtCommit) {
      if (!changedFiles.has(filePath) && prevParsedFiles.has(filePath)) {
        // Carry forward unchanged file
        currentParsedFiles.set(filePath, prevParsedFiles.get(filePath)!);
      } else {
        // Parse changed/new file
        try {
          const content = await getFileContentAtCommit(gitRoot, dir, filePath, hash);
          const scanned = buildScannedFile(filePath);
          const parsed = parseFileFromContent(scanned, content);
          currentParsedFiles.set(filePath, parsed);
        } catch {
          // File might not exist at this commit (e.g., listed in diff but deleted)
          // Skip silently
        }
      }
    }

    // Build graph for this snapshot
    const parsedArray = Array.from(currentParsedFiles.values());
    const graph = buildGraph(parsedArray, dir, version);

    // Record snapshot
    const nodeIds = graph.nodes.map((n) => n.id);
    const edgeKeys = graph.edges.map(edgeKey);

    snapshots.push({ commitIndex: i, nodeIds, edgeKeys });

    // Track files changed count
    commit.filesChanged = changedFiles.size;

    // Collect all unique nodes and edges
    for (const node of graph.nodes) {
      if (!allNodesMap.has(node.id)) {
        allNodesMap.set(node.id, node);
      }
    }
    for (const edge of graph.edges) {
      const key = edgeKey(edge);
      if (!allEdgesMap.has(key)) {
        allEdgesMap.set(key, edge);
      }
    }

    // Advance
    prevParsedFiles = currentParsedFiles;
    prevHash = hash;

    if ((i + 1) % 20 === 0) {
      console.log(chalk.gray(`  processed ${i + 1}/${commits.length} commits...`));
    }
  }

  // Compute diffs between consecutive snapshots
  const diffs: TimelineDiff[] = [];
  for (let i = 0; i < snapshots.length; i++) {
    const snap = snapshots[i]!;
    if (i === 0) {
      // First commit: everything is "added"
      diffs.push({
        commitIndex: 0,
        addedNodeIds: snap.nodeIds,
        removedNodeIds: [],
        addedEdgeKeys: snap.edgeKeys,
        removedEdgeKeys: [],
      });
      continue;
    }

    const prevSnap = snapshots[i - 1]!;
    const prev = new Set(prevSnap.nodeIds);
    const curr = new Set(snap.nodeIds);
    const prevEdges = new Set(prevSnap.edgeKeys);
    const currEdges = new Set(snap.edgeKeys);

    diffs.push({
      commitIndex: i,
      addedNodeIds: snap.nodeIds.filter((id) => !prev.has(id)),
      removedNodeIds: prevSnap.nodeIds.filter((id) => !curr.has(id)),
      addedEdgeKeys: snap.edgeKeys.filter((k) => !prevEdges.has(k)),
      removedEdgeKeys: prevSnap.edgeKeys.filter((k) => !currEdges.has(k)),
    });
  }

  console.log(
    chalk.green(
      `Timeline built: ${commits.length} commits, ${allNodesMap.size} unique nodes, ${allEdgesMap.size} unique edges`,
    ),
  );

  return {
    commits,
    snapshots,
    diffs,
    allNodes: Array.from(allNodesMap.values()),
    allEdges: Array.from(allEdgesMap.values()),
  };
}
