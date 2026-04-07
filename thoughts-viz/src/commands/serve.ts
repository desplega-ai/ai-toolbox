import { resolve } from "node:path";
import chalk from "chalk";
import { Command } from "commander";
import pkg from "../../package.json";
import { loadCache, resolvePathOrId, saveCache } from "../cache.ts";
import { buildGraph } from "../indexer/graph.ts";
import { parseFiles } from "../indexer/parser.ts";
import { scanDirectory } from "../indexer/scanner.ts";
import type { GraphData } from "../types.ts";

async function indexDirectory(dir: string): Promise<GraphData> {
  const absoluteDir = resolve(dir);
  const scanned = await scanDirectory(absoluteDir);
  const parsed = await parseFiles(scanned);
  return buildGraph(parsed, absoluteDir, pkg.version);
}

export const serveCommand = new Command("serve")
  .description(
    "Start the graph visualization server.\n" +
      "With <path-or-id>: indexes and serves a single directory (dev mode).\n" +
      "Without args or --production: serves exported repos from public/data/ (production mode).",
  )
  .argument("[path-or-id]", "path to thoughts directory or 8-char cache ID (omit for production mode)")
  .option("-p, --port <number>", "port to serve on", "3456")
  .option("--no-open", "don't open browser automatically")
  .option("--production", "force production mode (serve from public/data/)")
  .option("--force", "force re-index ignoring cache")
  .action(
    async (
      pathOrId: string | undefined,
      opts: { port: string; open: boolean; production?: boolean; force?: boolean },
    ) => {
      const port = Number.parseInt(opts.port, 10);
      const url = `http://localhost:${port}`;

      // Production mode: no path or --production flag
      if (!pathOrId || opts.production) {
        const { startProductionServer } = await import("../server.ts");
        startProductionServer(port);
        console.log(chalk.blue(`Serving production mode at ${url}`));
        if (opts.open) Bun.spawn(["open", url]);
        return;
      }

      // Dev/single mode: index + serve in-memory
      const dir = await resolvePathOrId(pathOrId);

      let graphData: GraphData | null = null;

      if (!opts.force) {
        graphData = await loadCache(dir);
        if (graphData) {
          graphData.metadata.version = pkg.version;
          console.log(
            chalk.yellow(
              `Using cached index (${graphData.nodes.length} files, ${graphData.edges.length} edges)`,
            ),
          );
        }
      }

      if (!graphData) {
        console.log(chalk.blue(`Indexing ${dir}...`));
        const startTime = performance.now();
        graphData = await indexDirectory(dir);
        const elapsed = (performance.now() - startTime).toFixed(0);

        const connected = graphData.nodes.filter((n) => n.connectionCount > 0).length;
        console.log(
          chalk.green(
            `Indexed ${graphData.nodes.length} files, ${graphData.edges.length} edges (${connected} connected) in ${elapsed}ms`,
          ),
        );

        await saveCache(dir, graphData);
      }

      const { startServer } = await import("../server.ts");
      startServer(graphData, port);
      console.log(chalk.blue(`Serving at ${url}`));
      if (opts.open) Bun.spawn(["open", url]);
    },
  );
