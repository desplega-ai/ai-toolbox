import chalk from "chalk";
import { Command } from "commander";
import pkg from "../../package.json";
import { listCaches, saveCache } from "../cache.ts";
import { buildGraph } from "../indexer/graph.ts";
import { parseFiles } from "../indexer/parser.ts";
import { scanDirectory } from "../indexer/scanner.ts";
import { buildTimeline } from "../indexer/timeline.ts";

export const syncCommand = new Command("sync")
  .description("Re-index all cached directories (only stale ones unless --force)")
  .option("--force", "re-index all, even fresh caches")
  .option("--no-timeline", "skip git commit timeline data")
  .option("--timeline-limit <n>", "max commits to process for timeline", Number.parseInt)
  .action(async (opts: { force?: boolean; timeline: boolean; timelineLimit?: number }) => {
    const caches = await listCaches();

    if (caches.length === 0) {
      console.log(chalk.yellow("No cached indexes to sync."));
      return;
    }

    const toSync = opts.force ? caches : caches.filter((c) => c.stale);

    if (toSync.length === 0) {
      console.log(chalk.green("All caches are fresh. Use --force to re-index anyway."));
      return;
    }

    console.log(chalk.blue(`Syncing ${toSync.length} of ${caches.length} indexes...\n`));

    for (const c of toSync) {
      try {
        const startTime = performance.now();
        const scanned = await scanDirectory(c.sourceDir);
        const parsed = await parseFiles(scanned);
        const graphData = buildGraph(parsed, c.sourceDir, pkg.version);

        if (opts.timeline) {
          const tl = await buildTimeline(c.sourceDir, pkg.version, opts.timelineLimit);
          if (tl) {
            graphData.timeline = tl;
            graphData.metadata.timeline = true;
          }
        }

        await saveCache(c.sourceDir, graphData);
        const elapsed = (performance.now() - startTime).toFixed(0);

        const tlLabel = graphData.metadata.timeline ? `, ${graphData.timeline?.commits.length} commits` : "";
        console.log(
          chalk.green(
            `  ${c.sourceDir} — ${graphData.nodes.length} files, ${graphData.edges.length} edges${tlLabel} (${elapsed}ms)`,
          ),
        );
      } catch (err) {
        console.log(chalk.red(`  ${c.sourceDir} — failed: ${(err as Error).message}`));
      }
    }

    console.log(chalk.blue("\nSync complete."));
  });
