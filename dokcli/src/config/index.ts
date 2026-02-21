import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export interface DokcliConfig {
  serverUrl: string;
  apiKey: string;
}

export const CONFIG_DIR = path.join(os.homedir(), ".dokcli");
export const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");

const DEFAULT_SERVER_URL = "https://app.dokploy.com";

function readConfigFile(): Partial<DokcliConfig> {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
    return JSON.parse(raw) as Partial<DokcliConfig>;
  } catch {
    return {};
  }
}

export function loadConfig(): DokcliConfig {
  const file = readConfigFile();
  return {
    serverUrl: process.env.DOKPLOY_SERVER_URL || file.serverUrl || DEFAULT_SERVER_URL,
    apiKey: process.env.DOKPLOY_API_KEY || file.apiKey || "",
  };
}

export function saveConfig(updates: Partial<DokcliConfig>): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  const existing = readConfigFile();
  const merged = { ...existing, ...updates };
  fs.writeFileSync(CONFIG_PATH, `${JSON.stringify(merged, null, 2)}\n`);
}

export function getApiKey(): string | null {
  const config = loadConfig();
  return config.apiKey || null;
}

export function getServerUrl(): string {
  return loadConfig().serverUrl;
}

export function ensureAuth(): { apiKey: string; serverUrl: string } {
  const config = loadConfig();
  if (!config.apiKey) {
    throw new Error(
      "No API key configured. Run `dokcli login --key <key>` or set DOKPLOY_API_KEY env var.",
    );
  }
  return { apiKey: config.apiKey, serverUrl: config.serverUrl };
}
