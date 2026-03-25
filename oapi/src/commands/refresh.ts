import * as fs from "node:fs";
import { Command } from "commander";
import { loadConfig, saveConfig, saveSpec } from "../config/index.ts";
import type { ApiEntry } from "../config/types.ts";
import { printError, printSuccess } from "../output/index.ts";
import { countEndpoints, getSpecVersion } from "../spec/parser.ts";

async function refreshSingle(name: string, api: ApiEntry): Promise<Record<string, unknown>> {
  let spec: Record<string, unknown>;

  if (api.source === "remote") {
    if (!api.url) throw new Error(`No URL stored for remote API '${name}'`);
    const response = await fetch(api.url);
    if (!response.ok) {
      throw new Error(`Failed to fetch spec: ${response.status} ${response.statusText}`);
    }
    spec = (await response.json()) as Record<string, unknown>;
  } else {
    if (!api.path) throw new Error(`No path stored for local API '${name}'`);
    if (!fs.existsSync(api.path)) {
      throw new Error(`Local spec file not found: ${api.path}`);
    }
    const raw = fs.readFileSync(api.path, "utf-8");
    spec = JSON.parse(raw) as Record<string, unknown>;
  }

  saveSpec(name, spec);
  return spec;
}

export const refreshCommand = new Command("refresh")
  .description("Refresh cached OpenAPI spec(s)")
  .argument("[name]", "Name of the API to refresh (omit for --all)")
  .option("-a, --all", "Refresh all registered APIs")
  .action(async (name: string | undefined, options: { all?: boolean }) => {
    try {
      const config = loadConfig();

      if (options.all) {
        const names = Object.keys(config.apis);
        if (names.length === 0) {
          console.log("No APIs registered.");
          return;
        }

        for (const apiName of names) {
          try {
            const api = config.apis[apiName];
            if (!api) continue;
            const spec = await refreshSingle(apiName, api);
            api.lastRefreshed = new Date().toISOString();
            const endpointCount = countEndpoints(spec);
            const version = getSpecVersion(spec);
            printSuccess(`Refreshed '${apiName}' (${endpointCount} endpoints, OpenAPI ${version})`);
          } catch (error) {
            printError(`Failed to refresh '${apiName}': ${(error as Error).message}`);
          }
        }

        saveConfig(config);
        return;
      }

      if (!name) {
        printError("Provide an API name or use --all");
        process.exit(2);
      }

      const api = config.apis[name];
      if (!api) {
        printError(`API '${name}' is not registered`);
        process.exit(1);
      }

      const spec = await refreshSingle(name, api);
      api.lastRefreshed = new Date().toISOString();
      saveConfig(config);

      const endpointCount = countEndpoints(spec);
      const version = getSpecVersion(spec);
      printSuccess(`Refreshed '${name}' (${endpointCount} endpoints, OpenAPI ${version})`);
    } catch (error) {
      printError((error as Error).message);
      process.exit(1);
    }
  });
