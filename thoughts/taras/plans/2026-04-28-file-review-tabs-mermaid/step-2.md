---
id: step-2
name: Multi-file open + switch + close
depends_on: [step-1]
status: ready
---

<!-- During /v-implement, `desplega:step-running` adds `assignee` and `claimed_at` while
working, then transitions `status` to `done` (success) or back to `ready` (retry-able failure). -->

# step-2: Multi-file open + switch + close

## Overview

Make tabs actually work as a multi-file UX. After step-1, the strip exists but only one tab can live at a time. This step lets the user open multiple files (CLI args `file-review a.md b.md`, `cmd+O` appends instead of replacing, and drag-and-drop appends), click any tab to switch, close any tab via its `×` or via `cmd+W`, and jump to the Nth tab via `cmd+1..9`. Editor + preview swap their displayed content based on the active tab. **Critical correctness bar**: switching tabs must NOT lose dirty edits — the outgoing tab's editor doc gets snapshotted to `tab.doc` before swap. Cursor position, scroll offset, and per-tab comments cache are deferred to step-3; this step handles the doc-content snapshot only.

## Changes Required:

#### 1. Multi-file open

**File**: `file-review/src/main.ts`
**Changes**:
- Refactor `loadFile(path, { mode: 'replace' | 'append' } = { mode: 'append' })`:
  - `append` (default): if a tab already has this path, `setActive` to it; else `tabManager.add({ path, ... })` and `setActive(newId)`.
  - `replace`: existing single-tab behavior (used internally for the seed-on-launch case if no args, or for explicit "replace current tab" UX — wire to a context-menu "replace in current tab" later, not in this step).
- Update `showFilePickerAndLoad` to call `loadFile(path)` (default `append`).
- Drag-and-drop handler: in Tauri, use `getCurrentWebview().onDragDropEvent((event) => { ... })` from `@tauri-apps/api/webview` (Tauri 2's API — replaces v1's `tauri://file-drop` event). For `dev:web` fallback, register HTML5 `dragover` + `drop` listeners on `document.body`. For each path, call `loadFile(path)` (append). Verify the exact import path against the installed `@tauri-apps/api` v2.10 docs at implementation time.

**File**: `file-review/src-tauri/src/lib.rs`
**Changes**:
- The CLI-args entry point (where stdin / argv files are passed to JS): emit a `tauri://files-from-args` event with **all** paths. JS listens and calls `loadFile` for each.
- `set_current_file` command: stays as-is (still tracks "active file" — we keep one Rust-side active for the close-export flow until step-3 promotes it to multi-file).

#### 2. Switching tabs (with doc snapshot)

**File**: `file-review/src/tabs.ts`
**Changes**:
- Extend `Tab` interface: add `doc: string` (the in-memory editor content with comment markers inlined). Initialize from disk on `add`.

**File**: `file-review/src/main.ts`
**Changes**:
- Add `snapshotActiveDoc()`: `const tab = tabManager.getActive(); if (!tab) return; tabManager.update(tab.id, { doc: getEditorContent() });` — captures the dirty/clean editor state into the tab.
- Add `activateTab(id)`: pulls target tab; calls `setEditorContent(target.doc)` (NOT `API.readFile` — the in-memory doc is the source of truth once a tab exists); replays `parseAndStripComments(target.doc)` into `tab.comments`; calls `renderCommentState()` and `updateViewMode()`.
- Hook into `tabManager.subscribe`: on active-change `{ from, to }` → call `snapshotActiveDoc()` (against `from`) **before** activating `to`. The subscriber API in step-1's `tabs.ts` must expose both old and new IDs for this to work — confirm/adjust there.
- `API.setCurrentFile(target.path)` so the Rust save flow points at the right file.
- Cursor/scroll preservation, per-tab comments cache as a separate field, and dirty-tracking refinements are step-3's job. This step's snapshot is just `doc` so no edits are lost on switch.

#### 3. Closing tabs

**File**: `file-review/src/main.ts` and `file-review/src/tabs-view.ts`
**Changes**:
- `closeTab(id)`: if the tab is dirty, prompt via `confirm()` "Discard unsaved changes in `<basename>`?". On confirm or if clean, `tabManager.remove(id)`. If `id` was active, `setActive(nextTab?.id ?? null)`. If 0 tabs remain, show empty state (existing flow).
- Tabs-view: any tab's `×` button works — not just the active one. Middle-click on the tab body also closes (matches browser convention).

#### 4. Keyboard shortcuts: cmd+W, cmd+1..9, cmd+T rebind

**File**: `file-review/src/shortcuts.ts`
**Changes**:
- Add `Cmd+W` handler: `closeTab(tabManager.activeId)`. Place this **before** the `editingText` early-return at line 151 (it must work even with editor focus).
- Add `Cmd+1..9` handler: `tabManager.setActive(tabManager.tabs[n - 1]?.id)`. Also placed before the `editingText` guard.
- Move existing `Cmd+T` (theme toggle) to `Cmd+Shift+T`. Free `Cmd+T` for "new tab" (opens file picker, append mode).
- Update the in-app keyboard help overlay (toolbar `?` button → existing help modal) to reflect new shortcuts.

**File**: `file-review/src-tauri/src/lib.rs`
**Changes**:
- Tauri menu accelerator for `Cmd+W`: emit a `menu:close-tab` event the JS listens to (in case the OS-level Cmd+W still fires before the JS handler).

#### 5. Open-multiple via dialog + drag-drop

**File**: `file-review/src/file-picker.ts`
**Changes**:
- `showFilePicker()` already uses Tauri's `open` dialog — pass `{ multiple: true }` and return `string[]`.

**File**: `file-review/src/main.ts`
**Changes**:
- `showFilePickerAndLoad`: handle `string[]` — for each path, `loadFile(path)`.
- Drag-drop: register Tauri's `tauri://drag-drop` event on the window (or fall back to HTML5 `drop` for `dev:web`); for each path, `loadFile(path)`.

### Success Criteria:

#### Automated Verification:
- [ ] Typecheck passes: `cd file-review && bun run check`
- [ ] Build passes: `cd file-review && bun run build`
- [ ] No new `console.error` or unhandled-rejection in dev console (sub-agent confirms)

#### Automated QA:
- [ ] Sub-agent launches `bun run dev:web file-review/test-files/sample.md file-review/test-files/sample-2.md` (creates a 2nd test file if missing), confirms two tabs visible, second active
- [ ] Sub-agent clicks the first tab, confirms editor swaps to its content; clicks the second, confirms swap-back
- [ ] **Dirty-edit preservation regression test**: sub-agent edits tab A (types "ZZZZ" at line 1), switches to tab B, switches back to A — confirms "ZZZZ" is still in the editor (the doc-snapshot path). This is the critical correctness bar for this step.
- [ ] Sub-agent presses `Cmd+1`, confirms first tab activates; `Cmd+2`, confirms second activates
- [ ] Sub-agent edits the second tab one char (confirm dirty dot appears), presses `Cmd+W`, confirms a confirmation prompt fires; on dismiss the tab stays; on accept the tab closes
- [ ] Sub-agent presses `Cmd+W` on a clean first tab, confirms it closes silently and editor returns to empty state
- [ ] Sub-agent presses `Cmd+T`, confirms a file picker opens (not a theme toggle); `Cmd+Shift+T` toggles theme
- [ ] Sub-agent triggers an HTML5 drop event on the window with two file paths in `dev:web`, confirms two new tabs appear

#### Manual Verification:
- [ ] CLI args path: `bun run dev -- file-review/test-files/a.md file-review/test-files/b.md` opens both as tabs (Tauri-only — covered by manual run since CLI handoff differs from `dev:web`)
- [ ] Drag-drop in the actual Tauri window (not browser) appends tabs

**Implementation Note**: This step is a vertical slice — QA-able on its own. After completing this step, pause for manual confirmation. After verification passes, commit with `[step-2] Multi-file open + switch + close + keyboard shortcuts`.
