import chalk from "chalk";
import { Command } from "commander";
import { loadConfig, loadSpec } from "../config/index.ts";
import { countEndpoints } from "../spec/parser.ts";

export const listCommand = new Command("list").description("List registered APIs").action(() => {
  const config = loadConfig();
  const apiNames = Object.keys(config.apis);

  if (apiNames.length === 0) {
    console.log("No APIs registered. Use `oapi register` to add one.");
    return;
  }

  // Collect rows
  const rows: Array<{
    name: string;
    source: string;
    baseUrl: string;
    endpoints: string;
    refreshed: string;
  }> = [];

  for (const name of apiNames) {
    const api = config.apis[name];
    if (!api) continue;
    const spec = loadSpec(name);
    const endpoints = spec ? String(countEndpoints(spec)) : "?";
    const refreshed = api.lastRefreshed
      ? api.lastRefreshed.slice(0, 10) // just the date part
      : "unknown";

    rows.push({
      name,
      source: api.source,
      baseUrl: api.baseUrl,
      endpoints,
      refreshed,
    });
  }

  // Calculate column widths
  const headers = {
    name: "Name",
    source: "Source",
    baseUrl: "Base URL",
    endpoints: "Endpoints",
    refreshed: "Refreshed",
  };
  const cols = {
    name: Math.max(headers.name.length, ...rows.map((r) => r.name.length)),
    source: Math.max(headers.source.length, ...rows.map((r) => r.source.length)),
    baseUrl: Math.max(headers.baseUrl.length, ...rows.map((r) => r.baseUrl.length)),
    endpoints: Math.max(headers.endpoints.length, ...rows.map((r) => r.endpoints.length)),
    refreshed: Math.max(headers.refreshed.length, ...rows.map((r) => r.refreshed.length)),
  };

  // Print header
  const header = [
    chalk.bold(headers.name.padEnd(cols.name)),
    chalk.bold(headers.source.padEnd(cols.source)),
    chalk.bold(headers.baseUrl.padEnd(cols.baseUrl)),
    chalk.bold(headers.endpoints.padEnd(cols.endpoints)),
    chalk.bold(headers.refreshed.padEnd(cols.refreshed)),
  ].join("  ");
  console.log(header);

  // Print rows
  for (const row of rows) {
    const line = [
      chalk.cyan(row.name.padEnd(cols.name)),
      row.source.padEnd(cols.source),
      row.baseUrl.padEnd(cols.baseUrl),
      row.endpoints.padEnd(cols.endpoints),
      row.refreshed.padEnd(cols.refreshed),
    ].join("  ");
    console.log(line);
  }
});
