---
id: step-1
name: TabManager refactor + single-tab strip
depends_on: []
status: done
assignee:
claimed_at:
---

<!-- During /v-implement, `desplega:step-running` adds `assignee` and `claimed_at` while
working, then transitions `status` to `done` (success) or back to `ready` (retry-able failure). -->

# step-1: TabManager refactor + single-tab strip

## Overview

Introduce an explicit `Tab` model and `TabManager` that owns what is today scattered across module-scoped globals (`currentFilePath`, `comments`, `hasUnsavedChanges`, `lastSavedSnapshot`, `isMarkdownFile`, `isRawMode`, `pendingPreviewComment`). Render a tab strip above `#main-container` that shows the single active tab with the file's basename + dirty indicator. Keep one `editorView` and one `previewContainer` — they always reflect the active tab. **No multi-file behavior yet** — opening a file still replaces (we make multi-file work in step-2). After this step, the user sees a tab bar with one tab and a close button (closing returns to the empty state) — every other behavior is byte-for-byte identical to today.

## Changes Required:

#### 1. New: TabManager module

**File**: `file-review/src/tabs.ts` (new)
**Changes**:
- Export `interface Tab { id: string; path: string | null; comments: ReviewComment[]; isMarkdownFile: boolean; isRawMode: boolean; hasUnsavedChanges: boolean; lastSavedSnapshot: string; pendingPreviewComment: PendingPreviewComment | null; cursor?: { from: number; to: number }; scrollTop?: number; }`
- Export `class TabManager` with: `tabs: Tab[]`, `activeId: string | null`, `getActive()`, `add(tab)`, `remove(id)`, `setActive(id)`, `update(id, patch)`, `subscribe(listener)` (event-bus for tab list / active changes).
- Use `crypto.randomUUID()` for tab IDs.
- Pure data layer — no DOM, no Tauri calls.

#### 2. Wire TabManager through main.ts

**File**: `file-review/src/main.ts`
**Changes**:
- Replace globals at lines 55-72 with a single `tabManager = new TabManager()` import.
- Add helpers `readActive()` / `writeActive(patch)` that proxy to `tabManager.getActive()` and `tabManager.update(active.id, patch)`.
- Replace every read of `currentFilePath` / `comments` / `hasUnsavedChanges` / `lastSavedSnapshot` / `isMarkdownFile` / `isRawMode` / `pendingPreviewComment` with `readActive().<field>`.
- Replace every assignment with `writeActive({ field: value })`.
- `loadFile(path)` (line 689): if no tabs, create one via `tabManager.add({ path, ... })`; else `tabManager.update(activeId, { path, ... })` (replace-in-active-tab — multi-tab open lands in step-2).
- `closeActiveTab()`: new helper. If only one tab, remove it and show empty state. Wire to a new `#tab-close-active` button on the strip and a placeholder noop for now.

#### 3. Tab strip DOM + render

**File**: `file-review/index.html`
**Changes**:
- Insert `<div id="tab-strip" class="tab-strip" role="tablist"></div>` between the closing `</div>` of `#toolbar` (line 40) and `<div id="main-container">` (line 41).

**File**: `file-review/src/styles.css`
**Changes**:
- Add `.tab-strip` (flex row, scrollable horizontally, theme-aware bg/border), `.tab` (padding, dirty-dot pseudo-element when `[data-dirty="true"]`), `.tab.active` (highlighted), `.tab-close` (X button, hover only), `.tab-strip:empty` → `display: none`.
- Use existing CSS custom properties (`--bg-secondary`, `--border-color`, etc.).

**File**: `file-review/src/tabs-view.ts` (new)
**Changes**:
- Export `initTabStrip(tabManager)` that subscribes to `tabManager` and renders `<button class="tab" data-tab-id="<id>" data-dirty="<bool>" role="tab" aria-selected="<bool>"><span class="tab-label">basename</span><span class="tab-close">×</span></button>` per tab into `#tab-strip`.
- Click on tab → `tabManager.setActive(id)`.
- Click on `.tab-close` → `closeTab(id)` (stops propagation; in step-1 only the active tab can be closed; step-2 enables close any).
- For now, hide strip when 0 tabs (CSS `:empty`); show when 1+.

#### 4. Refactor editor.ts to remove implicit-active-file assumption

**File**: `file-review/src/editor.ts`
**Changes**:
- No structural change to `editorView` (still one instance) — but document with comment that the editor's content is always "the active tab's content". The `setEditorContent(content)` and `getEditorContent()` helpers stay.
- Add `getEditorState() → { cursor, scrollTop }` and `setEditorState({ cursor?, scrollTop? })` for step-3 to call (used during tab activation).

#### 5. Refactor markdown-preview.ts/sidebar.ts/toc.ts/preview-nav.ts comment plumbing

**File**: `file-review/src/markdown-preview.ts`, `file-review/src/sidebar.ts`, `file-review/src/toc.ts`, `file-review/src/preview-nav.ts`
**Changes**:
- **Approach (chosen)**: pass a `getActiveTab: () => Tab | null` accessor (closing over `tabManager`) into `initPreview`, `initSidebar`, `initToc`, and `PreviewNavigator`'s constructor — once, at startup. Each module calls `getActiveTab()` whenever it needs `comments` or `path`. Keeps function signatures of internal helpers unchanged; only the init/constructor signatures gain one parameter.
- The existing `addCommentCallback` global in `markdown-preview.ts:39` stays as the "user added a comment" event channel — but its handler in `main.ts` now writes via `writeActive({ comments: [...readActive().comments, newComment] })` instead of mutating a free variable.
- The `pendingLineNumber` flag in `sidebar.ts:9` becomes a local in `initSidebar`'s closure (it was always per-instance — no semantic change, just stops looking like a global).

#### 6. CLI args / launch path: seed first tab

**File**: `file-review/src/main.ts`
**Changes**:
- The startup path that reads CLI args (Tauri side passes path to JS; today it triggers `loadFile`) — wrap so the tab gets created via `tabManager.add(...)` instead of mutating globals.

### Success Criteria:

*(Push everything you can into the first two buckets — Automated Verification + Automated QA — so the agent provides proof of work. Manual Verification is the exception, not the default.)*

#### Automated Verification:
- [x] Typecheck passes: `cd file-review && bun run check`
- [x] Build passes: `cd file-review && bun run build`
- [x] No `any` types introduced in `tabs.ts` or `tabs-view.ts`
- [x] `grep -rE 'let (currentFilePath|hasUnsavedChanges|lastSavedSnapshot|isMarkdownFile|isRawMode|pendingPreviewComment)\s*[=:]' file-review/src/` returns only matches inside `tabs.ts` (i.e. all the old module-globals are gone from `main.ts`)

#### Automated QA:
- [ ] Sub-agent launches `bun run dev:web file-review/test-files/sample.md`, takes a screenshot, confirms: tab bar visible above editor pane with one tab labeled `sample.md`, no console errors, editor content matches the file
- [ ] Sub-agent clicks the tab's `×` close button, confirms editor empties to the existing empty state and tab bar hides
- [ ] Sub-agent re-opens the file via the toolbar "Open" button, confirms a new tab appears (replaces old empty state) — single-tab semantics preserved
- [ ] Sub-agent edits one character, confirms the tab gets a `data-dirty="true"` attribute and visible dirty indicator; cmd+S clears it

#### Manual Verification:
- [ ] Tab strip styling looks coherent with the rest of the toolbar/sidebar in both light and dark themes
- [ ] No visual jank when transitioning empty-state → file-loaded → empty-state
- [ ] Vim mode, comment markers, save shortcut, and existing toolbar buttons all behave exactly as before

**Implementation Note**: This step is a vertical slice — QA-able on its own. After completing this step, pause for manual confirmation. After verification passes, commit with `[step-1] Introduce TabManager + single-tab strip`.
