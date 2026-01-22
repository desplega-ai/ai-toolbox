import { homedir } from "node:os";
import { join } from "node:path";

export interface BrainConfig {
  /** Brain directory path */
  path: string;
  /** Override $EDITOR env var */
  editor?: string;
  /** Embedding model name (default: "text-embedding-3-small") */
  embeddingModel?: string;
  /** Embedding dimensions (default: 1536) */
  embeddingDimensions?: number;
}

const CONFIG_PATH = join(homedir(), ".brain.json");

const DEFAULT_CONFIG: Partial<BrainConfig> = {
  embeddingModel: "text-embedding-3-small",
  embeddingDimensions: 1536,
};

/**
 * Get the path to the config file
 */
export function getConfigPath(): string {
  return CONFIG_PATH;
}

/**
 * Load config from ~/.brain.json
 * Returns undefined if config doesn't exist
 */
export async function loadConfig(): Promise<BrainConfig | undefined> {
  const file = Bun.file(CONFIG_PATH);
  if (!(await file.exists())) {
    return undefined;
  }

  try {
    const content = await file.json();
    return {
      ...DEFAULT_CONFIG,
      ...content,
    } as BrainConfig;
  } catch {
    console.error(`Warning: Failed to parse ${CONFIG_PATH}`);
    return undefined;
  }
}

/**
 * Save config to ~/.brain.json
 */
export async function saveConfig(config: BrainConfig): Promise<void> {
  await Bun.write(CONFIG_PATH, JSON.stringify(config, null, 2));
}

/**
 * Get the brain directory path from config
 */
export async function getBrainPath(): Promise<string | undefined> {
  const config = await loadConfig();
  return config?.path;
}

/**
 * Get the configured editor (config.editor > $EDITOR > vim)
 */
export async function getEditor(): Promise<string> {
  const config = await loadConfig();
  return config?.editor ?? process.env.EDITOR ?? "vim";
}

/**
 * Get the database path (.brain.db inside brain directory)
 */
export async function getDbPath(): Promise<string | undefined> {
  const brainPath = await getBrainPath();
  if (!brainPath) return undefined;
  return join(brainPath, ".brain.db");
}
