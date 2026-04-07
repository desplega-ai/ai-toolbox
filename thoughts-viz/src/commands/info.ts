import chalk from "chalk";
import { Command } from "commander";
import pkg from "../../package.json";
import { loadCache, resolvePathOrId } from "../cache.ts";
import { buildGraph } from "../indexer/graph.ts";
import { parseFiles } from "../indexer/parser.ts";
import { scanDirectory } from "../indexer/scanner.ts";
import type { GraphData, GraphNode } from "../types.ts";

function formatSummaryMarkdown(data: GraphData): string {
  const { nodes, edges, metadata } = data;
  const byType = { research: 0, plan: 0, brainstorm: 0 };
  for (const n of nodes) {
    if (n.docType in byType) byType[n.docType as keyof typeof byType]++;
  }

  const edgesByType: Record<string, number> = {};
  for (const e of edges) {
    edgesByType[e.type] = (edgesByType[e.type] ?? 0) + 1;
  }

  const connected = nodes.filter((n) => n.connectionCount > 0).length;
  const isolated = nodes.length - connected;

  let md = `# thoughts-viz info\n\n`;
  md += `- **Directory**: ${metadata.sourceDir}\n`;
  md += `- **Version**: ${metadata.version}\n`;
  md += `- **Indexed at**: ${metadata.indexedAt}\n\n`;
  md += `## Files (${nodes.length})\n\n`;
  md += `| Type | Count |\n|------|-------|\n`;
  for (const [type, count] of Object.entries(byType)) {
    md += `| ${type} | ${count} |\n`;
  }
  md += `\n## Connections\n\n`;
  md += `- **Total edges**: ${edges.length}\n`;
  md += `- **Connected nodes**: ${connected}\n`;
  md += `- **Isolated nodes**: ${isolated}\n\n`;
  md += `| Edge type | Count |\n|-----------|-------|\n`;
  for (const [type, count] of Object.entries(edgesByType)) {
    md += `| ${type} | ${count} |\n`;
  }

  return md;
}

function formatFileMarkdown(node: GraphNode, data: GraphData): string {
  const edges = data.edges.filter((e) => e.source === node.id || e.target === node.id);

  let md = `# ${node.topic}\n\n`;
  md += `- **File**: ${node.filename}\n`;
  md += `- **Path**: ${node.id}\n`;
  md += `- **Type**: ${node.docType}\n`;
  md += `- **Owner**: ${node.owner}\n`;
  md += `- **Date**: ${node.date || "unknown"}\n`;
  md += `- **Status**: ${node.status}\n`;
  md += `- **Author**: ${node.author}\n`;
  if (node.tags.length > 0) {
    md += `- **Tags**: ${node.tags.join(", ")}\n`;
  }
  md += `- **Connections**: ${node.connectionCount}\n`;

  if (edges.length > 0) {
    md += `\n## Connections\n\n`;
    md += `| Direction | Type | File |\n|-----------|------|------|\n`;
    for (const e of edges) {
      const isSource = e.source === node.id;
      const otherId = isSource ? e.target : e.source;
      const other = data.nodes.find((n) => n.id === otherId);
      const dir = isSource ? "→" : "←";
      md += `| ${dir} | ${e.type} | ${other?.filename ?? otherId} |\n`;
    }
  }

  return md;
}

function formatFileJson(node: GraphNode, data: GraphData): object {
  const edges = data.edges.filter((e) => e.source === node.id || e.target === node.id);
  return {
    ...node,
    connections: edges.map((e) => ({
      direction: e.source === node.id ? "outgoing" : "incoming",
      type: e.type,
      file: e.source === node.id ? e.target : e.source,
    })),
  };
}

async function loadOrIndex(dir: string): Promise<GraphData> {
  const cached = await loadCache(dir);
  if (cached) return cached;

  console.error(chalk.yellow("No cache found, indexing..."));
  const scanned = await scanDirectory(dir);
  const parsed = await parseFiles(scanned);
  return buildGraph(parsed, dir, pkg.version);
}

function findFile(data: GraphData, name: string): GraphNode | null {
  // Exact match on filename or relativePath
  const exact =
    data.nodes.find((n) => n.filename === name) ??
    data.nodes.find((n) => n.id === name);
  if (exact) return exact;

  // Partial match (contains)
  const partial = data.nodes.filter(
    (n) => n.filename.includes(name) || n.id.includes(name),
  );
  if (partial.length === 1) return partial[0]!;
  return null;
}

export const infoCommand = new Command("info")
  .description("Show summary or per-file info about a thoughts directory")
  .argument("<path-or-id>", "path to thoughts directory, or 8-char cache ID")
  .option("--format <format>", "output format: json or markdown", "markdown")
  .option("--file <name>", "show info for a specific file (filename or relative path)")
  .action(async (pathOrId: string, opts: { format: string; file?: string }) => {
    const dir = await resolvePathOrId(pathOrId);
    const graphData = await loadOrIndex(dir);

    if (opts.file) {
      const node = findFile(graphData, opts.file);
      if (!node) {
        console.error(chalk.red(`File not found: "${opts.file}"`));
        console.error(chalk.dim("Use 'thoughts-viz search' to find files."));
        process.exit(1);
      }

      if (opts.format === "json") {
        console.log(JSON.stringify(formatFileJson(node, graphData), null, 2));
      } else {
        console.log(formatFileMarkdown(node, graphData));
      }
      return;
    }

    if (opts.format === "json") {
      console.log(JSON.stringify(graphData, null, 2));
    } else {
      console.log(formatSummaryMarkdown(graphData));
    }
  });
