import type { Tab, TabManager } from "./tabs";

export interface TabStripCallbacks {
  /** User clicked a tab body to make it active. */
  onActivate: (id: string) => void;
  /** User clicked the X button on a tab. */
  onClose: (id: string) => void;
}

/**
 * Wire the tab strip DOM (`#tab-strip`) to a `TabManager`. Re-renders on
 * every TabManager change. Hides itself when no tabs exist (CSS `:empty`).
 */
export function initTabStrip(
  tabManager: TabManager,
  callbacks: TabStripCallbacks
): void {
  const strip = document.getElementById("tab-strip");
  if (!strip) return;

  const render = () => {
    const activeId = tabManager.activeId;
    strip.innerHTML = "";

    for (const tab of tabManager.tabs) {
      strip.appendChild(renderTab(tab, tab.id === activeId, callbacks));
    }
  };

  tabManager.subscribe(render);
  render();
}

function renderTab(
  tab: Tab,
  isActive: boolean,
  callbacks: TabStripCallbacks
): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.className = "tab" + (isActive ? " active" : "");
  btn.dataset.tabId = tab.id;
  btn.dataset.dirty = String(tab.hasUnsavedChanges);
  btn.setAttribute("role", "tab");
  btn.setAttribute("aria-selected", String(isActive));

  const label = document.createElement("span");
  label.className = "tab-label";
  label.textContent = tabLabel(tab);
  label.title = tab.path ?? "(unsaved)";
  btn.appendChild(label);

  const close = document.createElement("span");
  close.className = "tab-close";
  close.textContent = "×"; // ×
  close.setAttribute("role", "button");
  close.setAttribute("aria-label", "Close tab");
  btn.appendChild(close);

  btn.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    if (target.classList.contains("tab-close")) {
      e.stopPropagation();
      callbacks.onClose(tab.id);
      return;
    }
    callbacks.onActivate(tab.id);
  });

  return btn;
}

function tabLabel(tab: Tab): string {
  if (!tab.path) return "(unsaved)";
  const parts = tab.path.split("/");
  return parts[parts.length - 1] || tab.path;
}
