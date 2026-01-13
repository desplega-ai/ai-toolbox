import { loadConfig, getConfigPath, openConfigInEditor } from "./config";

export interface Shortcut {
  keys: string;
  description: string;
}

export const shortcuts: Shortcut[] = [
  { keys: "⌘K", description: "Add comment to selection" },
  { keys: "⌘S", description: "Save file" },
  { keys: "⌘Q", description: "Quit application" },
  { keys: "⌘/", description: "Toggle shortcuts help" },
  { keys: "⌘T", description: "Toggle theme (light/dark)" },
  { keys: "⌘⇧V", description: "Toggle vim mode" },
  { keys: "⌘O", description: "Open file" },
  { keys: "^Q", description: "Vim visual block mode" },
];

let helpModalVisible = false;

export async function showShortcutsHelp() {
  if (helpModalVisible) {
    hideShortcutsHelp();
    return;
  }

  const config = await loadConfig();
  const configPath = await getConfigPath();

  const modal = document.createElement("div");
  modal.id = "shortcuts-modal";
  modal.className = "shortcuts-modal";
  modal.innerHTML = `
    <div class="shortcuts-content">
      <div class="shortcuts-header">
        <h3>Keyboard Shortcuts</h3>
        <button class="close-btn">×</button>
      </div>
      <div class="shortcuts-list">
        ${shortcuts
          .map(
            (s) => `
          <div class="shortcut-item">
            <kbd>${s.keys}</kbd>
            <span>${s.description}</span>
          </div>
        `
          )
          .join("")}
      </div>
      <div class="settings-section">
        <h4>Current Settings</h4>
        <div class="settings-list">
          <div class="setting-item">
            <span class="setting-label">Theme</span>
            <span class="setting-value">${config.theme}</span>
          </div>
          <div class="setting-item">
            <span class="setting-label">Vim Mode</span>
            <span class="setting-value">${config.vim_mode ? "Enabled" : "Disabled"}</span>
          </div>
          <div class="setting-item">
            <span class="setting-label">Window Size</span>
            <span class="setting-value">${config.window.width}×${config.window.height}</span>
          </div>
        </div>
        <div class="config-path">
          <span class="path-label">Config file:</span>
          <code>${configPath}</code>
        </div>
        <div class="config-actions">
          <button id="edit-config-btn" class="primary-btn">Edit Config</button>
          <button id="reload-config-btn" class="secondary-btn">Reload</button>
        </div>
      </div>
    </div>
  `;

  modal.querySelector(".close-btn")?.addEventListener("click", hideShortcutsHelp);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) hideShortcutsHelp();
  });

  modal.querySelector("#edit-config-btn")?.addEventListener("click", async () => {
    await openConfigInEditor();
    hideShortcutsHelp();
  });

  modal.querySelector("#reload-config-btn")?.addEventListener("click", () => {
    window.dispatchEvent(new CustomEvent("reload-config"));
    hideShortcutsHelp();
  });

  document.body.appendChild(modal);
  helpModalVisible = true;
}

export function hideShortcutsHelp() {
  document.getElementById("shortcuts-modal")?.remove();
  helpModalVisible = false;
}

export function initShortcuts(handlers: Record<string, () => void>) {
  document.addEventListener("keydown", (e) => {
    const isMeta = e.metaKey || e.ctrlKey;

    if (isMeta && e.key === "k") {
      e.preventDefault();
      handlers.addComment?.();
    } else if (isMeta && e.key === "/") {
      e.preventDefault();
      showShortcutsHelp();
    } else if (isMeta && e.key === "t") {
      e.preventDefault();
      handlers.toggleTheme?.();
    } else if (isMeta && e.key.toLowerCase() === "v" && e.shiftKey) {
      e.preventDefault();
      handlers.toggleVim?.();
    } else if (isMeta && e.key === "o") {
      e.preventDefault();
      handlers.openFile?.();
    }
  });
}
