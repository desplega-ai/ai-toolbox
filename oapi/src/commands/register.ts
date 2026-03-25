import * as fs from "node:fs";
import * as path from "node:path";
import { Command } from "commander";
import { loadConfig, saveConfig, saveSpec } from "../config/index.ts";
import type { ApiEntry } from "../config/types.ts";
import { printError, printSuccess } from "../output/index.ts";
import { countEndpoints, getSpecVersion, isValidSpec } from "../spec/parser.ts";

async function fetchSpec(url: string): Promise<Record<string, unknown>> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch spec: ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as Record<string, unknown>;
}

function readLocalSpec(filePath: string): Record<string, unknown> {
  const absolute = path.resolve(filePath);
  if (!fs.existsSync(absolute)) {
    throw new Error(`File not found: ${absolute}`);
  }
  const raw = fs.readFileSync(absolute, "utf-8");
  return JSON.parse(raw) as Record<string, unknown>;
}

function deriveBaseUrl(spec: Record<string, unknown>, remoteUrl?: string): string | null {
  // Try servers[0].url from spec
  const servers = spec.servers as Array<Record<string, unknown>> | undefined;
  if (servers && servers.length > 0 && typeof servers[0]?.url === "string") {
    return servers[0].url;
  }

  // Try to derive from remote URL (strip path like /openapi.json)
  if (remoteUrl) {
    try {
      const url = new URL(remoteUrl);
      return `${url.protocol}//${url.host}`;
    } catch {
      return null;
    }
  }

  return null;
}

export const registerCommand = new Command("register")
  .description("Register a local or remote OpenAPI spec")
  .requiredOption("-n, --name <name>", "Name for this API")
  .option("-l, --local <file>", "Path to local OpenAPI spec file")
  .option("-r, --remote <url>", "URL to remote OpenAPI spec")
  .option("-b, --base-url <url>", "Base URL for API requests (auto-derived if not set)")
  .action(async (options: { name: string; local?: string; remote?: string; baseUrl?: string }) => {
    try {
      const { name, local, remote, baseUrl: baseUrlOpt } = options;

      // Validate: exactly one of --local or --remote
      if (!local && !remote) {
        printError("Provide either --local <file> or --remote <url>");
        process.exit(2);
      }
      if (local && remote) {
        printError("Provide only one of --local or --remote, not both");
        process.exit(2);
      }

      // Fetch or read the spec
      let spec: Record<string, unknown>;
      if (remote) {
        spec = await fetchSpec(remote);
      } else {
        spec = readLocalSpec(local as string);
      }

      // Validate it's a valid OpenAPI spec
      if (!isValidSpec(spec)) {
        printError("Not a valid OpenAPI spec (missing 'openapi' or 'paths' field)");
        process.exit(2);
      }

      // Derive base URL
      const baseUrl = baseUrlOpt || deriveBaseUrl(spec, remote);
      if (!baseUrl) {
        printError("Could not determine base URL. Provide --base-url explicitly.");
        process.exit(2);
      }

      // Save spec to cache
      saveSpec(name, spec);

      // Save config entry
      const config = loadConfig();
      const entry: ApiEntry = {
        source: remote ? "remote" : "local",
        baseUrl,
        lastRefreshed: new Date().toISOString(),
      };
      if (remote) entry.url = remote;
      if (local) entry.path = path.resolve(local);

      config.apis[name] = entry;
      saveConfig(config);

      const endpointCount = countEndpoints(spec);
      const version = getSpecVersion(spec);
      printSuccess(`Registered '${name}' (${endpointCount} endpoints, OpenAPI ${version})`);
    } catch (error) {
      printError((error as Error).message);
      process.exit(1);
    }
  });
