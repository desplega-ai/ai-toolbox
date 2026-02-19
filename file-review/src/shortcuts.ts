import { loadConfig, getConfigPath, openConfigInEditor } from "./config";

export interface Shortcut {
  keys: string;
  description: string;
}

export const shortcuts: Shortcut[] = [
  { keys: "⌘K", description: "Add comment to selection" },
  { keys: "⌘S", description: "Save file" },
  { keys: "⌘Z", description: "Undo" },
  { keys: "⌘⇧Z", description: "Redo" },
  { keys: "⌘Q", description: "Quit application" },
  { keys: "⌘/", description: "Toggle shortcuts help" },
  { keys: "⌘T", description: "Toggle theme (light/dark)" },
  { keys: "⌘M", description: "Toggle markdown view (raw/pretty)" },
  { keys: "⌘⇧V", description: "Toggle vim mode" },
  { keys: "⌘O", description: "Open file" },
  { keys: "⌘+", description: "Zoom in" },
  { keys: "⌘-", description: "Zoom out" },
  { keys: "^Q", description: "Vim visual block mode" },
  { keys: "^D", description: "Vim half-page down" },
  { keys: "^U", description: "Vim half-page up" },
];

let helpModalVisible = false;

function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;

  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
    return true;
  }

  return false;
}

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
            <span class="setting-label">Font Size</span>
            <span class="setting-value">${config.font_size || 14}px</span>
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
    if (!isMeta) return;

    const key = e.key.toLowerCase();
    const editingText = isEditableTarget(e.target);

    // Keep native clipboard/select-all behavior untouched.
    if (key === "a" || key === "c" || key === "v" || key === "x") {
      return;
    }

    // Save should always work regardless of focus.
    if (key === "s") {
      e.preventDefault();
      handlers.save?.();
      return;
    }

    // In input/textarea/contenteditable, keep native text-editing shortcuts.
    if (editingText) {
      return;
    }

    if (key === "k") {
      e.preventDefault();
      handlers.addComment?.();
    } else if (e.key === "/") {
      e.preventDefault();
      showShortcutsHelp();
    } else if (key === "t") {
      e.preventDefault();
      handlers.toggleTheme?.();
    } else if (key === "m") {
      e.preventDefault();
      handlers.toggleMarkdownView?.();
    } else if (key === "v" && e.shiftKey) {
      e.preventDefault();
      handlers.toggleVim?.();
    } else if (key === "o") {
      e.preventDefault();
      handlers.openFile?.();
    } else if (e.key === "=" || e.key === "+") {
      e.preventDefault();
      handlers.zoomIn?.();
    } else if (e.key === "-") {
      e.preventDefault();
      handlers.zoomOut?.();
    } else if (key === "z" && e.shiftKey) {
      e.preventDefault();
      handlers.redo?.();
    } else if (key === "z") {
      e.preventDefault();
      handlers.undo?.();
    }
  });
}
