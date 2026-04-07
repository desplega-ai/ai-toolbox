import chalk from "chalk";
import { Command } from "commander";
import pkg from "../../package.json";
import { cacheId, loadCache, resolvePathOrId, saveCache } from "../cache.ts";
import { buildGraph } from "../indexer/graph.ts";
import { parseFiles } from "../indexer/parser.ts";
import { scanDirectory } from "../indexer/scanner.ts";
import { buildTimeline } from "../indexer/timeline.ts";

export const indexCommand = new Command("index")
  .description("Index a thoughts directory and cache the result (no server)")
  .argument("<path-or-id>", "path to thoughts directory, or 8-char cache ID")
  .option("--force", "force re-index ignoring cache")
  .option("--no-timeline", "skip git commit timeline data")
  .option("--timeline-limit <n>", "max commits to process for timeline", Number.parseInt)
  .action(async (pathOrId: string, opts: { force?: boolean; timeline: boolean; timelineLimit?: number }) => {
    const dir = await resolvePathOrId(pathOrId);

    if (!opts.force) {
      const cached = await loadCache(dir);
      if (cached) {
        // If timeline requested but cached data doesn't have it, treat as cache miss
        if (!opts.timeline || cached.metadata.timeline) {
          console.log(
            chalk.yellow(
              `Cache is fresh (${cached.nodes.length} files, ${cached.edges.length} edges). Use --force to re-index.`,
            ),
          );
          return;
        }
      }
    }

    console.log(chalk.blue(`Indexing ${dir}...`));
    const startTime = performance.now();

    const scanned = await scanDirectory(dir);
    const parsed = await parseFiles(scanned);
    const graphData = buildGraph(parsed, dir, pkg.version);

    if (opts.timeline) {
      const timeline = await buildTimeline(dir, pkg.version, opts.timelineLimit);
      if (timeline) {
        graphData.timeline = timeline;
        graphData.metadata.timeline = true;
      }
    }

    const elapsed = (performance.now() - startTime).toFixed(0);

    const connected = graphData.nodes.filter((n) => n.connectionCount > 0).length;
    console.log(
      chalk.green(
        `Indexed ${graphData.nodes.length} files, ${graphData.edges.length} edges (${connected} connected) in ${elapsed}ms`,
      ),
    );

    await saveCache(dir, graphData);
    console.log(chalk.blue(`Cache saved. ID: ${chalk.cyan(cacheId(dir))}`));
  });
