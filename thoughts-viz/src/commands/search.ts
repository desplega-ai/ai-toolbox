import Fuse from "fuse.js";
import chalk from "chalk";
import { Command } from "commander";
import pkg from "../../package.json";
import { loadCache, resolvePathOrId } from "../cache.ts";
import { buildGraph } from "../indexer/graph.ts";
import { parseFiles } from "../indexer/parser.ts";
import { scanDirectory } from "../indexer/scanner.ts";
import type { GraphNode } from "../types.ts";

function formatResultMarkdown(results: GraphNode[]): string {
  if (results.length === 0) return "No results found.";

  let md = `| # | Type | Owner | File | Topic | Connections |\n`;
  md += `|---|------|-------|------|-------|-------------|\n`;
  for (let i = 0; i < results.length; i++) {
    const n = results[i]!;
    const name = n.filename.replace(/\.md$/, "").replace(/^\d{4}-\d{2}-\d{2}-/, "");
    md += `| ${i + 1} | ${n.docType} | ${n.owner} | ${name} | ${n.topic.slice(0, 50)} | ${n.connectionCount} |\n`;
  }
  return md;
}

function formatResultText(results: GraphNode[]): void {
  if (results.length === 0) {
    console.log(chalk.yellow("No results found."));
    return;
  }

  const typeColors: Record<string, (s: string) => string> = {
    research: chalk.blue,
    plan: chalk.green,
    brainstorm: chalk.magenta,
  };

  for (const n of results) {
    const colorFn = typeColors[n.docType] ?? chalk.white;
    const name = n.filename.replace(/\.md$/, "").replace(/^\d{4}-\d{2}-\d{2}-/, "");
    const conns = n.connectionCount > 0 ? chalk.dim(` (${n.connectionCount} connections)`) : "";
    console.log(`  ${colorFn(`[${n.docType}]`)} ${chalk.bold(name)}${conns}`);
    console.log(`    ${chalk.dim(n.id)}`);
    if (n.topic !== name) {
      console.log(`    ${chalk.dim(n.topic)}`);
    }
  }
}

export const searchCommand = new Command("search")
  .description("Fuzzy search for files in an indexed thoughts directory")
  .argument("<path-or-id>", "path to thoughts directory, or 8-char cache ID")
  .argument("<pattern>", "search pattern (fuzzy matched against filename, topic, tags)")
  .option("--format <format>", "output format: json, markdown, or text", "text")
  .option("--limit <n>", "max results", "10")
  .action(async (pathOrId: string, pattern: string, opts: { format: string; limit: string }) => {
    const dir = await resolvePathOrId(pathOrId);
    const limit = Number.parseInt(opts.limit, 10);

    let graphData = await loadCache(dir);
    if (!graphData) {
      console.error(chalk.yellow("No cache found, indexing..."));
      const scanned = await scanDirectory(dir);
      const parsed = await parseFiles(scanned);
      graphData = buildGraph(parsed, dir, pkg.version);
    }

    const fuse = new Fuse(graphData.nodes, {
      keys: [
        { name: "filename", weight: 0.3 },
        { name: "topic", weight: 0.4 },
        { name: "tags", weight: 0.2 },
        { name: "id", weight: 0.1 },
      ],
      threshold: 0.45,
    });

    const results = fuse.search(pattern, { limit }).map((r) => r.item);

    if (opts.format === "json") {
      console.log(JSON.stringify(results, null, 2));
    } else if (opts.format === "markdown") {
      console.log(formatResultMarkdown(results));
    } else {
      console.log(chalk.blue(`Search: "${pattern}" (${results.length} results)\n`));
      formatResultText(results);
    }
  });
