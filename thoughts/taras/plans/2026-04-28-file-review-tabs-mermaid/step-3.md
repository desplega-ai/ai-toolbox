---
id: step-3
name: Per-tab state preservation + multi-file export
depends_on: [step-2]
status: done
assignee:
claimed_at:
---

<!-- During /v-implement, `desplega:step-running` adds `assignee` and `claimed_at` while
working, then transitions `status` to `done` (success) or back to `ready` (retry-able failure). -->

# step-3: Per-tab state preservation + multi-file export

## Overview

Make tab-switching feel instant and lossless beyond just doc content. Step-2 already snapshots `tab.doc` on switch (preventing dirty-edit loss). This step layers on **cursor position**, **scroll offset**, **per-tab parsed comments cache**, **per-tab dirty flag** with its own `lastSavedSnapshot`, and a per-tab `pendingPreviewComment`. Also: extend the close-window comment-export flow (`src-tauri/src/lib.rs` `WindowEvent::CloseRequested`) so it dumps comments for **every** open tab (not just the active file).

## Changes Required:

#### 1. Tab caches cursor + scroll (doc already cached in step-2)

**File**: `file-review/src/tabs.ts`
**Changes**:
- Extend `Tab` interface (step-2 already added `doc`): add `cursor: { from: number; to: number }`, `scrollTop: number`.
- `add()` initializes them as `{ from: 0, to: 0 }` and `0`.

**File**: `file-review/src/main.ts`
**Changes**:
- Promote step-2's `snapshotActiveDoc()` into a fuller `snapshotActiveTab()`: also reads `getEditorState()` (introduced in step-1) to capture `cursor` + `scrollTop` into the active tab.
- `activateTab(id)`: extend step-2's version — after `setEditorContent(target.doc)`, also call `setEditorState({ cursor: target.cursor, scrollTop: target.scrollTop })`. Use `target.comments` directly (don't re-parse) once per-tab comment cache is wired up.
- The subscriber registered in step-2 (`{ from, to }` callback) keeps the same shape — just snapshots more fields now.
- The `onDocumentChange` listener in `editor.ts` updates `readActive().doc` (already happening) and `readActive().hasUnsavedChanges` / dirty-snapshot fields per tab.

#### 2. Read-from-disk only happens once per tab (on open)

**File**: `file-review/src/main.ts`
**Changes**:
- `loadFile(path)` (append branch): `API.readFile(path)` → `parseAndStripComments` → `tabManager.add({ path, doc: editorContent, comments, hasUnsavedChanges: false, lastSavedSnapshot: serialize(...), ... })`.
- `loadFile(path)` (replace branch): same but mutate the existing tab.
- `activateTab` no longer reads disk.

#### 3. Per-tab dirty-tracking

**File**: `file-review/src/main.ts`, `file-review/src/editor.ts`
**Changes**:
- `syncUnsavedChangesState()` operates on the active tab (via `readActive() / writeActive`). Already covered by step-1's refactor — verify here.
- Tab strip dirty indicator: subscribe to `tabManager` for `update` events and re-render (or just toggle `data-dirty` on the affected `.tab` button).
- `saveFile()`: writes the active tab's path; updates the active tab's `lastSavedSnapshot` and `hasUnsavedChanges = false`. No change of behavior for single-tab; just per-tab now.

#### 4. Multi-file comment export on close

**File**: `file-review/src-tauri/src/lib.rs`
**Changes**:
- New Tauri command `submit_tab_states(payload: Vec<TabState>)` where `TabState = { path: String, content: String }` (content = the in-memory editor doc with comment markers inlined — i.e., the result of `serializeComments(tab.doc, tab.comments)` from `comments.ts`).
- `AppState`: add `Mutex<Vec<TabState>>` `open_tabs`. Keep `current_file: Mutex<Option<PathBuf>>` as "active tab" for the menu/save flow.
- `WindowEvent::CloseRequested` (lines 110-176): instead of reading active file from disk, iterate `open_tabs`. For each, call `parse_comments_for_output(content)` (the existing string-based parser — no disk read needed since we already have the in-memory string). Dump grouped by file path:
  ```
  ## file-review/test-files/a.md

  - <comment 1>
  - <comment 2>

  ## file-review/test-files/b.md

  - <comment 3>
  ```
- When `open_tabs` has exactly one entry, preserve the **existing single-file output format** (no `## <path>` heading) for backward compatibility with shell consumers. Only multi-tab sessions get the heading-grouped format.
- `format_comments_readable` and `format_comments_json` get a multi-file wrapper that loops; both formats keep their single-file shape when only one tab is open.
- `state.silent` still suppresses output — unchanged.

**File**: `file-review/src/main.ts`, `file-review/src/api.ts`
**Changes**:
- New helper `pushTabStatesToRust()`: builds payload as `tabManager.tabs.map(t => ({ path: t.path, content: serializeComments(t.doc, t.comments) }))` — using the existing `serializeComments` import from `comments.ts`. Call **only on close**, NOT on every save/switch:
  - Register a `beforeunload` handler that calls a synchronous-ish path (`API.submitTabStates(payload)` — Tauri commands return a promise; the handler awaits in the `dev:web` flow and uses Tauri's `WindowEvent::CloseRequested` interception in the desktop flow).
  - In the desktop flow, the Rust close handler must already have `open_tabs` populated. To avoid a race: also call `pushTabStatesToRust()` once when a tab is **closed** by the user (so a partial-session stdout reflects what was open at that moment). Saves do NOT push state — they only update Rust's `current_file`.
- This minimizes serialization on hot paths; the worst case is one push per tab-close + one final push on window-close.

#### 5. Process-comments round-trip

**File**: `file-review/scripts/` and any docs referencing single-file `process-comments`
**Changes**:
- The `/file-review:process-comments` skill reads from disk per-file, so multi-tab doesn't break it inherently — verify by closing a multi-tab session, parsing the stdout, confirming the per-file headings appear and the skill picks the right one when run with a path arg.
- Document the multi-file output format in `file-review/README.md` if it differs from today's.

### Success Criteria:

#### Automated Verification:
- [ ] Typecheck passes: `cd file-review && bun run check`
- [ ] Build passes: `cd file-review && bun run build`
- [ ] Rust tests/cargo check passes: `cd file-review/src-tauri && cargo check`
- [ ] No `disk read on activate` in `activateTab` (grep `API.readFile` and confirm only `loadFile` calls it)

#### Automated QA:
- [ ] Sub-agent opens two files; in tab A, scrolls to line 100 + places cursor at line 50; switches to tab B, scrolls to line 30; switches back to A — confirms cursor at line 50, scroll at line 100
- [ ] Sub-agent edits tab A (dirty), switches to tab B, edits B (dirty), confirms both `data-dirty="true"`; saves A (`Cmd+S`), confirms only A's dirty clears
- [ ] Sub-agent closes the window with both tabs dirty; captures stdout; asserts the output has `## <path-A>` and `## <path-B>` sections each with the unsaved comments
- [ ] Sub-agent runs `/file-review:process-comments file-review/test-files/a.md` after close, confirms it ingests A's comments correctly

#### Manual Verification:
- [ ] Switching tabs feels instantaneous (no flicker, no disk-read latency)
- [ ] Closing a dirty tab via X, Cmd+W, or window-close all surface the same confirm prompt and behave consistently

**Implementation Note**: This step is a vertical slice — QA-able on its own. After completing this step, pause for manual confirmation. After verification passes, commit with `[step-3] Per-tab state preservation + multi-file comment export`.
