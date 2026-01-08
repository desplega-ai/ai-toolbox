import { homedir } from "node:os";
import { join } from "node:path";
import type { GlobalConfig, ProjectEntry } from "./types.ts";
import { DEFAULT_GLOBAL_CONFIG } from "./types.ts";

const GLOBAL_CONFIG_PATH = join(homedir(), ".wts.json");

/**
 * Load global configuration from ~/.wts.json
 * Returns default config if file doesn't exist
 */
export async function loadGlobalConfig(): Promise<GlobalConfig> {
  const file = Bun.file(GLOBAL_CONFIG_PATH);
  if (!(await file.exists())) {
    return DEFAULT_GLOBAL_CONFIG;
  }

  try {
    const content = await file.json();
    return {
      ...DEFAULT_GLOBAL_CONFIG,
      ...content,
      defaults: {
        ...DEFAULT_GLOBAL_CONFIG.defaults,
        ...content.defaults,
      },
    };
  } catch {
    console.error(`Warning: Failed to parse ${GLOBAL_CONFIG_PATH}, using defaults`);
    return DEFAULT_GLOBAL_CONFIG;
  }
}

/**
 * Save global configuration to ~/.wts.json
 */
export async function saveGlobalConfig(config: GlobalConfig): Promise<void> {
  await Bun.write(GLOBAL_CONFIG_PATH, JSON.stringify(config, null, 2));
}

/**
 * Register a project in global config
 */
export async function registerProject(projectName: string, projectPath: string): Promise<void> {
  const config = await loadGlobalConfig();

  const entry: ProjectEntry = {
    path: projectPath,
    registeredAt: new Date().toISOString(),
  };

  config.projects[projectName] = entry;
  await saveGlobalConfig(config);
}

/**
 * Unregister a project from global config
 */
export async function unregisterProject(projectName: string): Promise<boolean> {
  const config = await loadGlobalConfig();

  if (!(projectName in config.projects)) {
    return false;
  }

  delete config.projects[projectName];
  await saveGlobalConfig(config);
  return true;
}

/**
 * Get all tracked projects
 */
export async function getTrackedProjects(): Promise<Record<string, ProjectEntry>> {
  const config = await loadGlobalConfig();
  return config.projects;
}

/**
 * Check if a project is registered
 */
export async function isProjectRegistered(projectName: string): Promise<boolean> {
  const config = await loadGlobalConfig();
  return projectName in config.projects;
}

/**
 * Get project entry by name
 */
export async function getProjectEntry(projectName: string): Promise<ProjectEntry | undefined> {
  const config = await loadGlobalConfig();
  return config.projects[projectName];
}
