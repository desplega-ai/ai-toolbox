import chalk from "chalk";
import { Command } from "commander";
import { ensureAuth } from "../config/index.ts";
import { fetchSpec, getSpec, loadSpecCache, saveSpecCache } from "../spec/index.ts";
import { parseSpec } from "../spec/parser.ts";

export const specCommand = new Command("spec").description("Manage the OpenAPI spec cache");

specCommand
  .command("fetch")
  .description("Fetch and cache the OpenAPI spec from the server")
  .action(async () => {
    const { apiKey, serverUrl } = ensureAuth();
    console.log(chalk.dim(`Fetching spec from ${serverUrl}...`));

    const spec = await fetchSpec(serverUrl, apiKey);
    saveSpecCache(spec);

    const commands = parseSpec(spec);
    const tags = new Set(commands.map((c) => c.tag));

    console.log(chalk.green("Spec fetched and cached."));
    console.log(`  Version: ${spec.info?.version || "unknown"}`);
    console.log(`  Endpoints: ${commands.length}`);
    console.log(`  Tag groups: ${tags.size}`);
  });

specCommand
  .command("show")
  .description("Show info about the cached spec")
  .action(async () => {
    const cached = loadSpecCache();
    let spec: Awaited<ReturnType<typeof getSpec>>;
    let source: string;

    if (cached) {
      spec = cached;
      source = "cache";
    } else {
      try {
        spec = await getSpec();
        source = "fallback";
      } catch {
        console.log(chalk.yellow("No spec available. Run `dokcli spec fetch` first."));
        return;
      }
    }

    const commands = parseSpec(spec);
    const tags = new Set(commands.map((c) => c.tag));

    console.log(chalk.bold("OpenAPI Spec Info:"));
    console.log(`  Source:    ${source}`);
    console.log(`  Version:  ${spec.info?.version || "unknown"}`);
    console.log(`  Endpoints: ${commands.length}`);
    console.log(`  Tags:     ${[...tags].sort().join(", ")}`);
  });
