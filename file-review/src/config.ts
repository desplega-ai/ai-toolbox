import { invoke } from "@tauri-apps/api/core";

export interface WindowConfig {
  width: number;
  height: number;
}

export interface AppConfig {
  theme: "dark" | "light";
  vim_mode: boolean;
  window: WindowConfig;
}

export async function loadConfig(): Promise<AppConfig> {
  return invoke<AppConfig>("load_config");
}

export async function saveConfig(config: AppConfig): Promise<void> {
  return invoke("save_config", { config });
}

export async function getConfigPath(): Promise<string> {
  return invoke<string>("get_config_path_string");
}

export async function openConfigInEditor(): Promise<void> {
  return invoke("open_config_in_editor");
}

// Migration from localStorage (call once on first load)
export function migrateFromLocalStorage(): Partial<AppConfig> | null {
  const theme = localStorage.getItem("file-review-theme") as
    | "dark"
    | "light"
    | null;
  const vimMode = localStorage.getItem("file-review-vim");

  if (!theme && !vimMode) {
    return null; // Nothing to migrate
  }

  const migrated: Partial<AppConfig> = {};
  if (theme) migrated.theme = theme;
  if (vimMode) migrated.vim_mode = vimMode === "true";

  // Clear localStorage after migration
  localStorage.removeItem("file-review-theme");
  localStorage.removeItem("file-review-vim");

  return migrated;
}
