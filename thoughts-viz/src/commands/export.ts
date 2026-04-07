import { mkdir } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import chalk from "chalk";
import { Command } from "commander";
import pkg from "../../package.json";
import { loadCache, resolvePathOrId, saveCache } from "../cache.ts";
import { buildGraph } from "../indexer/graph.ts";
import { parseFiles } from "../indexer/parser.ts";
import { scanDirectory } from "../indexer/scanner.ts";
import { buildTimeline } from "../indexer/timeline.ts";
import type { GraphData } from "../types.ts";

interface ManifestEntry {
  id: string;
  name: string;
  file: string;
  fileCount: number;
  edgeCount: number;
}

interface Manifest {
  repos: ManifestEntry[];
}

async function loadOrIndex(dir: string, timeline?: boolean, timelineLimit?: number): Promise<GraphData> {
  const cached = await loadCache(dir);
  if (cached && (!timeline || cached.metadata.timeline)) {
    cached.metadata.version = pkg.version;
    return cached;
  }
  const scanned = await scanDirectory(dir);
  const parsed = await parseFiles(scanned);
  const data = buildGraph(parsed, dir, pkg.version);

  if (timeline) {
    const tl = await buildTimeline(dir, pkg.version, timelineLimit);
    if (tl) {
      data.timeline = tl;
      data.metadata.timeline = true;
    }
  }

  await saveCache(dir, data);
  return data;
}

async function updateManifest(outputPath: string, name: string, data: GraphData): Promise<void> {
  const outputDir = dirname(outputPath);
  const file = basename(outputPath);
  const id = file.replace(/\.json$/, "");
  const manifestPath = resolve(outputDir, "manifest.json");

  let manifest: Manifest = { repos: [] };
  const manifestFile = Bun.file(manifestPath);
  if (await manifestFile.exists()) {
    manifest = await manifestFile.json();
  }

  const entry: ManifestEntry = {
    id,
    name,
    file,
    fileCount: data.nodes.length,
    edgeCount: data.edges.length,
  };

  const idx = manifest.repos.findIndex((r) => r.id === id);
  if (idx >= 0) {
    manifest.repos[idx] = entry;
  } else {
    manifest.repos.push(entry);
  }

  await Bun.write(manifestPath, JSON.stringify(manifest, null, 2));
}

export const exportCommand = new Command("export")
  .description("Export indexed graph data as a static JSON file for deployment")
  .argument("<path-or-id>", "path to thoughts directory, or 8-char cache ID")
  .requiredOption("-o, --output <file>", "output JSON file path (e.g. public/data/my-repo.json)")
  .option("-n, --name <name>", "display name for the repo in the UI")
  .option("--no-timeline", "skip git commit timeline data")
  .option("--timeline-limit <n>", "max commits to process for timeline", Number.parseInt)
  .action(async (pathOrId: string, opts: { output: string; name?: string; timeline: boolean; timelineLimit?: number }) => {
    const dir = await resolvePathOrId(pathOrId);
    const outputPath = resolve(opts.output);
    const id = basename(outputPath).replace(/\.json$/, "");
    const name = opts.name ?? id;

    console.log(chalk.blue(`Loading/indexing ${dir}...`));
    const graphData = await loadOrIndex(dir, opts.timeline, opts.timelineLimit);

    await mkdir(dirname(outputPath), { recursive: true });
    await Bun.write(outputPath, JSON.stringify(graphData));

    const sizeKb = (Buffer.byteLength(JSON.stringify(graphData)) / 1024).toFixed(0);
    console.log(
      chalk.green(
        `Exported ${graphData.nodes.length} files, ${graphData.edges.length} edges (${sizeKb}KB) → ${outputPath}`,
      ),
    );

    await updateManifest(outputPath, name, graphData);
    console.log(chalk.blue(`Manifest updated: ${dirname(outputPath)}/manifest.json`));
  });
