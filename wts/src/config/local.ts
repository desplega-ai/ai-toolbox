import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import { getProjectName } from "../utils/paths.ts";
import { loadGlobalConfig } from "./global.ts";
import type { LocalConfig, ResolvedConfig } from "./types.ts";

const LOCAL_CONFIG_FILENAME = ".wts-config.json";

/**
 * Load local configuration from .wts-config.json in project root
 * Returns undefined if file doesn't exist
 */
export async function loadLocalConfig(gitRoot: string): Promise<LocalConfig | undefined> {
  const configPath = join(gitRoot, LOCAL_CONFIG_FILENAME);
  const file = Bun.file(configPath);

  if (!(await file.exists())) {
    return undefined;
  }

  try {
    return await file.json();
  } catch {
    console.error(`Warning: Failed to parse ${configPath}`);
    return undefined;
  }
}

/**
 * Save local configuration to .wts-config.json in project root
 */
export async function saveLocalConfig(gitRoot: string, config: LocalConfig): Promise<void> {
  const configPath = join(gitRoot, LOCAL_CONFIG_FILENAME);
  await Bun.write(configPath, JSON.stringify(config, null, 2));
}

/**
 * Resolve configuration by merging global defaults with local overrides
 */
export async function resolveConfig(gitRoot: string): Promise<ResolvedConfig> {
  const globalConfig = await loadGlobalConfig();
  const localConfig = await loadLocalConfig(gitRoot);
  const projectName = getProjectName(gitRoot);

  return {
    projectName,
    gitRoot,
    worktreeDir: localConfig?.worktreeDir ?? globalConfig.defaults.worktreeDir,
    tmuxWindowTemplate: localConfig?.tmuxWindowTemplate ?? globalConfig.defaults.tmuxWindowTemplate,
    autoTmux: localConfig?.autoTmux ?? globalConfig.defaults.autoTmux,
    autoClaude: localConfig?.autoClaude ?? globalConfig.defaults.autoClaude,
    setupScript: localConfig?.setupScript,
  };
}

/**
 * Get the absolute worktree base directory for a project
 */
export function getWorktreeBaseDir(config: ResolvedConfig): string {
  let baseDir = config.worktreeDir;

  // Expand ~ to home directory
  if (baseDir.startsWith("~")) {
    baseDir = join(homedir(), baseDir.slice(1));
  }

  // If absolute path, use directly; otherwise join with gitRoot
  if (isAbsolute(baseDir)) {
    return join(baseDir, config.projectName);
  }

  return join(config.gitRoot, baseDir, config.projectName);
}
