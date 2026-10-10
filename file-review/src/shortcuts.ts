import { loadConfig, getConfigPath, openConfigInEditor } from "./config";
import { icons } from "./icons";

export interface Shortcut {
  keys: string;
  description: string;
}

export interface ShortcutGroup {
  title: string;
  shortcuts: Shortcut[];
}

// Rendered as sections in the help modal. Keep in sync with the handlers
// below, preview-nav.ts, lightbox.ts, composer.ts, sidebar.ts and layout.ts.
export const shortcutGroups: ShortcutGroup[] = [
  {
    title: "Comments",
    shortcuts: [
      { keys: "⌘K", description: "Comment on selection, active block or line" },
      { keys: "⌘ click", description: "Comment on a preview block" },
      { keys: "⌘↵", description: "Submit comment or save edit" },
      { keys: "Esc", description: "Cancel comment, clear selected comment" },
    ],
  },
  {
    title: "Navigation",
    shortcuts: [
      { keys: "⌃- / ⌘[", description: "Back (after following a link or outline entry)" },
      { keys: "⌃⇧- / ⌘]", description: "Forward" },
      { keys: "⌘F", description: "Search the preview" },
      { keys: "↵ / ⇧↵", description: "Next / previous match (in search)" },
      { keys: "Esc", description: "Close search" },
    ],
  },
  {
    title: "View",
    shortcuts: [
      { keys: "⌘M", description: "Toggle preview / source" },
      { keys: "⌘B", description: "Toggle outline rail" },
      { keys: "⌘⌥B", description: "Toggle comments rail" },
      { keys: "← / →", description: "Resize focused rail divider" },
      { keys: "⌘⇧E", description: "Toggle reading width (narrow/full)" },
      { keys: "⌘⇧T", description: "Toggle theme (light/dark)" },
      { keys: "⌘+ / ⌘-", description: "Zoom in / out" },
      { keys: "⌘/", description: "Toggle shortcuts help" },
    ],
  },
  {
    title: "Tabs",
    shortcuts: [
      { keys: "⌘T", description: "New tab (open file)" },
      { keys: "⌘W", description: "Close active tab" },
      { keys: "⌘1…9", description: "Switch to Nth tab" },
      { keys: "⌘N / ⌘P", description: "Next / previous tab" },
    ],
  },
  {
    title: "File",
    shortcuts: [
      { keys: "⌘O", description: "Open file" },
      { keys: "⌘S", description: "Save file" },
      { keys: "⌘Z / ⌘⇧Z", description: "Undo / redo" },
      { keys: "⌘Q", description: "Quit application" },
      { keys: "S / Q / C / Esc", description: "Unsaved dialog: save, quit, close tab, cancel" },
    ],
  },
  {
    title: "Lightbox",
    shortcuts: [
      { keys: "+ / -", description: "Zoom in / out" },
      { keys: "0", description: "Fit to screen" },
      { keys: "← / →", description: "Previous / next image" },
      { keys: "Double-click", description: "Toggle fit and 100%" },
      { keys: "Esc", description: "Close viewer" },
    ],
  },
  {
    title: "Vim",
    shortcuts: [
      { keys: "⌘⇧V", description: "Toggle vim mode" },
      { keys: "j / k", description: "Preview: next / previous block" },
      { keys: "gg / G", description: "Preview: first / last block" },
      { keys: "⌃D / ⌃U", description: "Page down / up (preview and editor)" },
      { keys: "/", description: "Preview: search" },
      { keys: "n / N", description: "Preview: next / previous match" },
      { keys: "Esc", description: "Preview: clear active block" },
      { keys: "⌃Q", description: "Editor: visual block mode" },
    ],
  },
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
        <button class="close-btn" aria-label="Close" title="Close">${icons.x}</button>
      </div>
      <div class="shortcuts-list">
        ${shortcutGroups
          .map(
            (group) => `
          <section class="shortcuts-group">
            <h4>${group.title}</h4>
            ${group.shortcuts
              .map(
                (s) => `
              <div class="shortcut-item">
                <kbd>${s.keys}</kbd>
                <span>${s.description}</span>
              </div>
            `
              )
              .join("")}
          </section>
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

export interface ShortcutHandlers {
  addComment?: () => void;
  save?: () => void;
  toggleTheme?: () => void;
  toggleVim?: () => void;
  toggleMarkdownView?: () => void;
  openFile?: () => void;
  newTab?: () => void;
  closeTab?: () => void;
  jumpToTab?: (n: number) => void;
  nextTab?: () => void;
  prevTab?: () => void;
  zoomIn?: () => void;
  zoomOut?: () => void;
  undo?: () => void;
  redo?: () => void;
  toggleLeftRail?: () => void;
  toggleRightRail?: () => void;
  toggleReadingWidth?: () => void;
  goBack?: () => void;
  goForward?: () => void;
}

export function initShortcuts(handlers: ShortcutHandlers) {
  document.addEventListener("keydown", (e) => {
    const isMeta = e.metaKey || e.ctrlKey;
    if (!isMeta) return;

    const key = e.key.toLowerCase();
    const editingText = isEditableTarget(e.target);

    // Keep native clipboard/select-all behavior untouched. Shifted variants
    // (cmd+shift+V toggles vim) fall through.
    if (!e.shiftKey && (key === "a" || key === "c" || key === "v" || key === "x")) {
      return;
    }

    // Save should always work regardless of focus.
    if (key === "s") {
      e.preventDefault();
      handlers.save?.();
      return;
    }

    // Tab management — must work even when CodeMirror has focus, so we
    // route these BEFORE the editingText guard.
    if (key === "w") {
      e.preventDefault();
      handlers.closeTab?.();
      return;
    }
    if (key === "t" && !e.shiftKey) {
      e.preventDefault();
      handlers.newTab?.();
      return;
    }
    if (/^[1-9]$/.test(e.key) && !e.shiftKey) {
      e.preventDefault();
      handlers.jumpToTab?.(parseInt(e.key, 10));
      return;
    }
    if (key === "n" && !e.shiftKey) {
      e.preventDefault();
      handlers.nextTab?.();
      return;
    }
    if (key === "p" && !e.shiftKey) {
      e.preventDefault();
      handlers.prevTab?.();
      return;
    }

    // Back / forward through link jumps. Ctrl+- (and Ctrl+Shift+-) like
    // VS Code on macOS; Cmd+[ / Cmd+] like a browser, unless CodeMirror used
    // them (indent in Source mode). Match on `code`: Shift turns "-" into "_".
    if (e.code === "Minus" && e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      if (e.shiftKey) handlers.goForward?.();
      else handlers.goBack?.();
      return;
    }
    if (e.metaKey && !e.shiftKey && !e.altKey && !e.defaultPrevented && !editingText) {
      if (e.code === "BracketLeft") {
        e.preventDefault();
        handlers.goBack?.();
        return;
      }
      if (e.code === "BracketRight") {
        e.preventDefault();
        handlers.goForward?.();
        return;
      }
    }

    // Layout toggles also work from CodeMirror. Match on `code` because
    // Option changes `key` on macOS (Option+B types "∫"). Skip keys CodeMirror
    // already consumed, e.g. vim Ctrl+B page up, and Ctrl+B in text fields
    // (emacs-style cursor back).
    if (
      e.code === "KeyB" &&
      !e.shiftKey &&
      !e.defaultPrevented &&
      !(editingText && e.ctrlKey && !e.metaKey)
    ) {
      e.preventDefault();
      if (e.altKey) handlers.toggleRightRail?.();
      else handlers.toggleLeftRail?.();
      return;
    }
    if (e.code === "KeyE" && e.shiftKey && !e.altKey) {
      e.preventDefault();
      handlers.toggleReadingWidth?.();
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
    } else if (key === "t" && e.shiftKey) {
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
