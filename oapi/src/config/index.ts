import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ApiEntry, OapiConfig, Profile } from "./types.ts";
import { DEFAULT_CONFIG } from "./types.ts";

const configRoot = process.env.OAPI_CONFIG_DIR || path.join(os.homedir(), ".oapi");

export const CONFIG_DIR = configRoot;
export const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");
export const SPECS_DIR = path.join(CONFIG_DIR, "specs");

export function ensureConfigDir(): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  fs.mkdirSync(SPECS_DIR, { recursive: true, mode: 0o700 });
}

function readConfigFile(): Partial<OapiConfig> {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
    return JSON.parse(raw) as Partial<OapiConfig>;
  } catch {
    return {};
  }
}

export function loadConfig(): OapiConfig {
  const file = readConfigFile();
  return {
    apis: file.apis ?? DEFAULT_CONFIG.apis,
    profiles: file.profiles ?? DEFAULT_CONFIG.profiles,
    defaults: file.defaults ?? DEFAULT_CONFIG.defaults,
  };
}

export function saveConfig(config: OapiConfig): void {
  ensureConfigDir();
  fs.writeFileSync(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
}

export function getApi(name: string): ApiEntry | undefined {
  const config = loadConfig();
  return config.apis[name];
}

export function getProfile(name: string): Profile | undefined {
  const config = loadConfig();
  return config.profiles[name];
}

export function getDefaultProfile(apiName: string): Profile | undefined {
  const config = loadConfig();
  const profileName = config.defaults[apiName];
  if (!profileName) return undefined;
  return config.profiles[profileName];
}

export function getSpecPath(name: string): string {
  return path.join(SPECS_DIR, `${name}.json`);
}

export function loadSpec(name: string): Record<string, unknown> | null {
  const specPath = getSpecPath(name);
  try {
    const raw = fs.readFileSync(specPath, "utf-8");
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function saveSpec(name: string, spec: unknown): void {
  ensureConfigDir();
  const specPath = getSpecPath(name);
  fs.writeFileSync(specPath, `${JSON.stringify(spec, null, 2)}\n`, { mode: 0o600 });
}

export function deleteSpec(name: string): void {
  const specPath = getSpecPath(name);
  try {
    fs.unlinkSync(specPath);
  } catch {
    // ignore if already gone
  }
}
