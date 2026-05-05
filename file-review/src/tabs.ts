import type { ReviewComment } from "./comments";

/**
 * A pending preview-mode comment — the user clicked the "+" button on a
 * preview block and we're waiting for them to type the comment text.
 *
 * Mirrors the shape used in `main.ts` before this refactor so we can drop
 * it in without behavior change.
 */
export interface PendingPreviewComment {
  sourceStart: number;
  sourceEnd: number;
  element: HTMLElement;
}

/**
 * Per-tab state. Step-2 activates multiple tabs by snapshotting the active
 * tab's editor content into `doc` before swapping. `cursor` and `scrollTop`
 * are reserved for step-3 — they're optional today.
 */
export interface Tab {
  id: string;
  path: string | null;
  /**
   * In-memory editor content (clean content with comment markers stripped).
   * Source of truth for tab content once a tab exists — `loadFile` seeds it
   * from disk; `snapshotActiveDoc()` (in `main.ts`) updates it on every
   * tab switch so dirty edits survive.
   */
  doc: string;
  comments: ReviewComment[];
  isMarkdownFile: boolean;
  isRawMode: boolean;
  hasUnsavedChanges: boolean;
  lastSavedSnapshot: string;
  pendingPreviewComment: PendingPreviewComment | null;
  cursor?: { from: number; to: number };
  scrollTop?: number;
}

export type TabSubscriber = () => void;

/**
 * Fired when the active tab changes (or is set/cleared). `from` is the
 * outgoing tab id (null on first activation), `to` is the incoming.
 * Subscribers run synchronously *before* `notify()` fires the regular
 * subscribers — gives callers a chance to snapshot outgoing tab state.
 */
export type ActiveChangeSubscriber = (
  from: string | null,
  to: string | null
) => void;

/**
 * Pure data layer for tabs. No DOM, no Tauri calls. `tabs-view.ts` owns
 * rendering; `main.ts` owns the lifecycle and bridges to the editor /
 * preview / sidebar singletons.
 */
export class TabManager {
  tabs: Tab[] = [];
  activeId: string | null = null;
  private subscribers: Set<TabSubscriber> = new Set();
  private activeChangeSubscribers: Set<ActiveChangeSubscriber> = new Set();

  /** Returns the active tab, or null if no tabs are open. */
  getActive(): Tab | null {
    if (!this.activeId) return null;
    return this.tabs.find((t) => t.id === this.activeId) ?? null;
  }

  /** Find tab by path (first match). null if no match. */
  findByPath(path: string): Tab | null {
    return this.tabs.find((t) => t.path === path) ?? null;
  }

  /**
   * Add a new tab. If `makeActive` is true (default), activates it.
   * Tab IDs are generated via `crypto.randomUUID()`.
   */
  add(init: Omit<Tab, "id">, makeActive = true): Tab {
    const tab: Tab = { id: crypto.randomUUID(), ...init };
    this.tabs.push(tab);
    if (makeActive) {
      const prev = this.activeId;
      this.activeId = tab.id;
      this.notifyActiveChange(prev, tab.id);
    }
    this.notify();
    return tab;
  }

  /**
   * Remove a tab. If the removed tab was active, fall back to the previous
   * tab in the list (or null if none remain).
   */
  remove(id: string): void {
    const idx = this.tabs.findIndex((t) => t.id === id);
    if (idx < 0) return;

    this.tabs.splice(idx, 1);

    if (this.activeId === id) {
      const prev = this.activeId;
      if (this.tabs.length === 0) {
        this.activeId = null;
      } else {
        // Prefer the tab that was just to the left; if we removed index 0,
        // use the new index 0 (which was previously index 1).
        const newIdx = Math.max(0, idx - 1);
        this.activeId = this.tabs[newIdx].id;
      }
      this.notifyActiveChange(prev, this.activeId);
    }

    this.notify();
  }

  /** Make `id` active. No-op if `id` doesn't match a tab or is already active. */
  setActive(id: string): void {
    if (this.activeId === id) return;
    if (!this.tabs.some((t) => t.id === id)) return;
    const prev = this.activeId;
    this.activeId = id;
    this.notifyActiveChange(prev, id);
    this.notify();
  }

  /**
   * Patch fields on the tab with the given `id`. Returns the updated tab
   * or null if the id was not found.
   */
  update(id: string, patch: Partial<Tab>): Tab | null {
    const tab = this.tabs.find((t) => t.id === id);
    if (!tab) return null;
    Object.assign(tab, patch);
    this.notify();
    return tab;
  }

  /**
   * Subscribe to tab-list / active-tab changes. Returns an unsubscribe fn.
   * Listeners are called synchronously after every mutation — render code
   * should be cheap and idempotent.
   */
  subscribe(listener: TabSubscriber): () => void {
    this.subscribers.add(listener);
    return () => {
      this.subscribers.delete(listener);
    };
  }

  /**
   * Subscribe to *active-tab* changes only. Fires synchronously *before*
   * regular `subscribe()` listeners — use this to snapshot outgoing tab
   * state (e.g. editor doc / cursor / scroll) before the next tab paints.
   * Does NOT fire for tab-list mutations that don't change the active id.
   */
  subscribeActiveChange(listener: ActiveChangeSubscriber): () => void {
    this.activeChangeSubscribers.add(listener);
    return () => {
      this.activeChangeSubscribers.delete(listener);
    };
  }

  private notify(): void {
    for (const listener of this.subscribers) {
      listener();
    }
  }

  private notifyActiveChange(from: string | null, to: string | null): void {
    for (const listener of this.activeChangeSubscribers) {
      listener(from, to);
    }
  }
}
