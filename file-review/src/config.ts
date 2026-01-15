import { API } from "./api";

export interface WindowConfig {
  width: number;
  height: number;
}

export interface AppConfig {
  theme: "dark" | "light";
  vim_mode: boolean;
  font_size: number;
  window: WindowConfig;
}

export async function loadConfig(): Promise<AppConfig> {
  return API.loadConfig();
}

export async function saveConfig(config: AppConfig): Promise<void> {
  return API.saveConfig(config);
}

export async function getConfigPath(): Promise<string> {
  return API.getConfigPath();
}

export async function openConfigInEditor(): Promise<void> {
  return API.openConfigInEditor();
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
