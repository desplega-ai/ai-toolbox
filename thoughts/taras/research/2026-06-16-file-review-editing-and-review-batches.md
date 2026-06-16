---
date: 2026-06-16T13:26:02+0200
researcher: Claude (opencode researching)
git_commit: e70561d0657006c8757185ba330e0b3922650573
branch: main
repository: ai-toolbox
topic: "file-review: editing things and review batches"
tags: [research, codebase, file-review, editor, comments, tabs, review-session]
status: complete
autonomy: critical
last_updated: 2026-06-16
last_updated_by: Claude (opencode) + Taras (file-review)
---

# Research: file-review editing support and review batches

**Date**: 2026-06-16 13:26:02+0200
**Researcher**: Claude (opencode researching)
**Git Commit**: e70561d0657006c8757185ba330e0b3922650573
**Branch**: main

## Research Question
I would like to offer two new things in the file-review/:
1. Be able to edit things
2. Be able to have "review batches"

## Summary
The file-review tool is a Tauri-based desktop (and web-mode) application providing a CodeMirror 6 + Vim editor for Markdown (and any) files, together with an inline comment annotation system that stores feedback directly in the source file using HTML markers of the form `…` and the line variant. 

Editing of source content (typing, undo/redo, history) is fully enabled in the CodeMirror instance at all times (`editor.ts:37-54` has no readOnly compartment, no editable:false, and the view dispatches real changes); the "review" aspect is provided exclusively by decorative `Decoration.mark` highlights for comment ranges (`comments.ts:39`) plus a parallel rendered preview pane for .md (visibility toggle only, controlled by `isRawMode` / `markdown_raw` config), plus a sidebar. All content including any user source edits is persisted only on explicit save paths that always serialize current comments back into the markers around ranges: `saveFile` / close-save / `saveAllDirtyTabs` → `getSerializedContentForPersistence` → `API.writeFile` (`main.ts:1375-1387`, `1442`, `853`; `api.ts:183-184`). Rust implements `write_file` as direct `std::fs::write` (`file_ops.rs:37-40`).

Multi-file support exists in the native Tauri path through a `TabManager` holding per-tab state (`tabs.ts:21-39`: `doc`, `comments`, `hasUnsavedChanges`, `lastSavedSnapshot`, cursor/scroll), append-mode loading (`main.ts:1153`), OS picker with `multiple:true` (`file-picker.ts:13`), drag-drop (`main.ts:479`), tab strip UI, and Cmd+T / 1-9 / rotate navigation. A `closedFiles` memory (kept only for non-discarded closes) + `pushTabStatesToRust` (debounced + explicit) feeds `submit_tab_states` so that the window `CloseRequested` handler sees a complete **review session** (`main.ts:83-98`, `1295-1318`, `1455-1470`; `file_ops.rs:17-30`, `70-75`). The export loop in `lib.rs:218-271` aggregates over the snapshot `Vec<TabState>` (with markers) producing grouped JSON or `## <path>\n\n<body>` sections (special-casing single tab for backward compat), or falls back to a disk read. Web mode remains single-file (`main.rs:162-163` comment; no `/api/submit-tab-states`; `web_server.rs:278-356` uses only `current_file`).

The agent-facing story (`.agents/skills/file-review/SKILL.md`) is intentionally separated into two phases: (1) launch the blocking GUI (`file-review "<abs path>"` via Bash tool `run_in_background: true` / timeout 600000), capture stdout on close; (2) **Process Comments** (independent of GUI) which re-parses the *same* markers from the file on disk, presents per-comment `AskUserQuestion` ("Apply edit" / "Acknowledge" / "Skip"), and for "Apply" the agent performs normal source edits + removes the marker block. Process-comments and process-review are thin redirects to the same unified skill logic. The binary accepts multiple paths and does the full session export; current documented skill/command surfaces launch one path per invocation. "review session" terminology appears in-popover header and code comments for the closed-files + final-export aggregation.

No higher-order "batch of reviews" (e.g. queued sessions, background multi-review processor, or `--batch` mode) exists beyond the multi-tab "review session" within one GUI instance and one exit-time collection. Source editing during review is possible and saved (full CM + explicit save), but remediation edits that address feedback are performed in the post-GUI process phase.

## Detailed Findings

### Editor and "Edit Things" Capabilities
- `file-review/src/editor.ts:36`: singleton `EditorView` created once with full editing stack: `history()`, `keymap`, `markdown()`, `drawSelection()`, `lineNumbers()` etc.
- `editor.ts:47`: `EditorView.updateListener` on `docChanged` drives comment remapping + dirty state via onDocumentChange (main.ts).
- No read-only anywhere in extensions array, reconfigures, or callers (`editor.ts:37-54`, `63-86`; dedicated contrast in analyzer report).
- `setEditorContent` (`editor.ts:100`) performs unrestricted replace; user keystrokes produce real transactions persisted in history.
- Vim: optional high-precedence compartment (Prec.high) wrapping `@replit/codemirror-vim`; does not affect editability (`editor.ts:75-86`, `11` import; `vim.ts` exists but unused export).
- Save is **always explicit**: `shortcuts.ts:166` (Cmd+S), menu listener, toolbar, quit dialogs; never autosave on change (`main.ts:1375-1387` for `saveFile`; dirty computed only for confirm prompts and tab-dirty UI indicators via `serializeComments(...) !== lastSavedSnapshot`).
- Markdown preview (`markdown-preview.ts`, toggled by `markdown_raw`): when active, raw editor container is `display:none`; preview is pure rendered + injected commentable spans/highlights/hover "+" for comment creation. Source-of-truth remains the (hidden) CM doc; edits only ever happen in CM.
- `main.ts:268`: `hasUnsavedChanges` + `lastSavedSnapshot` live on the `Tab`; `markSnapshotAsSaved` updates after successful write.
- Source writes routed exclusively through `API.writeFile` → Tauri `write_file` (or web POST); `@tauri-apps/plugin-fs` listed in package.json but never imported/used in src/*.ts.
- Markdown files receive bidirectional sync for comments (sidebar ↔ editor highlights ↔ preview highlights) on every mutation; positions survive edits via `mapCommentsThroughChanges` (`comments.ts:284`).

### Comments, Serialization, and Review Markers
- `ReviewComment` TS (`comments.ts:4-11`) and Rust duplicate (`comments.rs:5-15`): `{id, text, comment_type: "inline"|"line", marker_pos, highlight_start, highlight_end}`.
- Creation entirely in JS (`main.ts:1021` `handleAddCommentShortcut` / preview path `1059`, then `handleCommentSubmit:1080` which calls `createComment` + `addComment` + `writeActive`).
- `comments.ts:222-263`: `serializeComments` walks in reverse-offset order and wraps ranges with the three canonical marker families; sanitizes `-->`.
- `parseAndStripComments` / `stripCommentMarkers` + `mapRawOffsetToClean` (`comments.ts:145-220`): produce the clean doc fed to editor + remapped comment positions.
- Live highlights: `commentHighlightField` StateField (`comments.ts:39`) supplying `Decoration.mark({class:"cm-comment-highlight", "data-comment-id":...})`.
- Transport: live editor path never calls the Rust `insert_*`/`remove_comment` commands for mutation — those exist primarily for the HTTP web layer. All state kept client-side in `Tab.comments`; debounced `pushTabStatesToRust` sends already-serialized `TabState {path, content-with-markers}` snapshots (`main.ts:1295`; `file_ops.rs:70`).
- Final extraction (`comments.rs:68-148` `parse_comments_for_output`): runs in Rust only for stdout export; builds `OutputComment` with line numbers + highlighted `content` slice; performs byte ↔ line mapping.
- Offset translation (`comments.rs:41-65`): `char_offset_to_byte_offset` / `byte_offset_to_char_offset` because CM/JS uses UTF-16 code units; used on the insert/remove command paths and internal parse.
- Persistence: markers are intentionally left in the file on every save / close-with-save; they are the canonical storage. No sidecar.

### TabManager, Multi-file, Closed Files, and "Review Session"
- `tabs.ts:21-39` Tab interface and `TabManager` (plain array + activeId + two subscriber buses: activeChange and general).
- Load/append (`main.ts:1153`): dedupe by path, `API.readFile` + parse, `tabManager.add`, `setCurrentFile`.
- `file-picker.ts:13`: `multiple: true` + filters; loop-calls `loadFile(..., "append")` also used by drag-drop and initial CLI seed.
- Snapshot on switch (`main.ts:1249`): capture live editor `getEditorContent()`, cursor, scrollTop for prior tab (`snapshotActiveDocFor`); comments already live on Tab object.
- `closedFiles` (main.ts:83-98, not inside TabManager): `ClosedFileEntry[]` with de-dupe; populated **only** on `closeTab` for paths that were not "discarded" in the save/discard dialog (`1455-1467`); header rendered as "In this review session" popover (`140`).
- `pushTabStatesToRust` (`1295-1318`): augments the live open states with filtered closed states and sends the whole array via `submit_tab_states`; called debounced on any tab mutation, plus explicit after close/remove/reopen/beforeunload.
- In Rust, `AppState.open_tabs: Mutex<Vec<TabState>>` is just an overwrite from the last submit; snapshot is source of truth for non-silent non-stdin CloseRequested when non-empty (`file_ops.rs:22-25` comment).
- `lib.rs:218`: `single_tab = tab_snapshot.len() == 1`; multi produces per-path groups or `## path` sections; both json and readable paths filter files with zero comments.

### Backend File Ops, Write, Export, Web Differences
- `file_ops.rs:33-40`:
  ```rust
  pub fn read_file(path: String) -> Result<String,String> { fs::read_to_string... }
  pub fn write_file(path: String, content: String) -> Result<(),String> { fs::write... }
  ```
  No permissions layer beyond OS; tauri_plugin_fs is initialized but unused for custom read/write.
- `submit_tab_states` simply `*open = states;`.
- Web mode: identical direct fs read/write in axum handlers; no submit_tab_states route ever registered (`web_server.rs:116-131`); `AppState` for web constructed with `initial_files` capped to the primary only (`main.rs:166-168`); quit path does disk read only.
- Stdin: special temp file write (`main.rs:275`), `original_content` backup for modified detection in export only.
- CloseRequested decision tree (lib.rs:167-290, summarized): silent short-circuit → stdin branch (prefer snapshot.content) → `!tab_snapshot.is_empty()` multi (aggregate) → current_file disk fallback.
- Output formats (comments.rs:151-263): readable with `=== Review Comments (N) ===` blocks and line ranges; json arrays (or per-single comments array); stdin wrapper adds file + content + modified.

### Agent Skill / Command / CLI Invocation and Process Phase
- Binary args: multiple `[FILE]` supported (main.rs:50-56), `--silent/-s`, `--json/-j`, `--web` etc. Help text documents them.
- Launch contract (`.agents/skills/file-review/SKILL.md:89-97`, mirrored in cc-plugin and invoked from `.claude/CLAUDE.md:58` and `.config/opencode/commands/file-review.md`):
  - `file-review "<absolute_path>"` (or `-` for stdin)
  - Bash tool with `run_in_background: true`, `timeout: 600000`
  - No shell `&`; the tool provides backgrounding + notification when closed.
- On GUI exit, stdout (the formatted review comments) is delivered as the tool result to the agent.
- Skill then immediately enters "Process Comments" (SKILL:133-211): reads the file, re-applies the same regexes the Rust parser uses, lists comments, then **for each** an `AskUserQuestion` with options "Apply edit", "Acknowledge (remove markers only)", "Skip". "Apply edit" → agent proposes + (after user ok) performs the source edit then strips the marker block. The GUI is already closed at this point.
- `/process-comments` and `process-review` skills are thin shims that jump straight to the Process Comments section of the file-review skill.
- Commands (`file-review.md`, `process-comments.md`) are thin argument-hint + delegate frontmatter.
- Current documented surfaces pass exactly one path; the binary itself wires all received paths into the multi-tab session.

### Historical Context (from prior research/plans)
- 2026-01-13 early tool + implementation plan: single-file only, initial marker syntax, Rust parse/insert/remove + CloseRequested single-file stdout, separate process loop in CC plugin.
- 2026-01-15 web mode: introduced the api abstraction layer, axum mirror, web /api/quit + final-report modal; explicitly single-file scoped.
- 2026-01-19 preview work: added the rendered md side with post-render comment injection + interactive add; raw/preview toggle.
- 2026-02-05 unified skill: consolidated routing/install/review/process into one SKILL.md; commands became thin delegates ("follow the file-review:file-review skill").
- 2026-04-28 tabs + mermaid: introduced explicit Tab / TabManager replacing module globals; motivated by "have to relaunch file-review per file"; added append multi-open (CLI/picker/drag/Cmd+T), snapshot-on-switch, activate hydration of single CM view + preview, dirty tracking, closedFiles + "review session" popover + unified close export via submit + open_tabs, `pushTabStatesToRust`. Multi-file export in lib.rs CloseRequested became the aggregation over tabs (with single-tab backward flat output). This is the origin of the "review session" concept and the machinery that supports what could be interpreted as in-GUI "review batches".

No prior document describes "review batches" as a distinct batch-of-sessions feature; the word "batch" appears in various plans in the loose sense of "handling multiple at once."

## Code References

| File                                      | Line(s)       | Description |
|-------------------------------------------|---------------|-------------|
| `file-review/src/editor.ts`              | 36-54, 100-108, 47 | Singleton editable CM init, setEditorContent full replace, docChanged listener (no readOnly) |
| `file-review/src/main.ts`                | 1153-1198, 1249, 1375-1387, 1295-1318, 1455-1470, 83-98, 140 | loadFile + initialFiles loop, snapshotActiveDocFor, saveFile + serialize, pushTabStatesToRust, closedFiles populate + "In this review session" header |
| `file-review/src/tabs.ts`                | 21-39, 80-90 | Tab shape (doc + comments + lastSavedSnapshot + hasUnsavedChanges + cursor/scroll), TabManager |
| `file-review/src/comments.ts`            | 4-11, 39, 145-263, 284-305 | ReviewComment, commentHighlightField (mark decorations), parse/strip/serialize, mapCommentsThroughChanges |
| `file-review/src/file-picker.ts`         | 7-31     | multiple:true dialog wrapper |
| `file-review/src/api.ts`                 | 176-184, 70-89 | submit_tab_states, write_file, read_file, full invoke/http surface + command map |
| `file-review/src-tauri/src/file_ops.rs` | 9-30, 33-40, 70-75 | TabState, AppState (open_tabs, initial_files, ...), read/write_file (fs direct), submit_tab_states |
| `file-review/src-tauri/src/lib.rs`       | 146-293 (esp 167-271), 218, 308-326 | CloseRequested decision tree (stdin/snapshot/fallback), single_tab grouping, invoke_handler registration |
| `file-review/src-tauri/src/comments.rs` | 5-28, 41-65, 68-148, 151-263 | ReviewComment/OutputComment, UTF offset helpers, parse_comments_for_output, all format_* (readable/json/stdin) |
| `file-review/src-tauri/src/web_server.rs` | 116-131, 197-212, 278-356 | Missing submit route, read/write handlers (fs), simplified quit (disk only, single) |
| `file-review/src-tauri/src/main.rs`      | 50-91, 162-174, 275 | CLI file_args + flags + stdin temp write, web mode state construction (single), explicit multi-file comment |
| `~/.agents/skills/file-review/SKILL.md`  | 89-97, 108-115, 133-211 | Launch contract (bg bash + timeout), stdout capture then Process Comments, exact marker regexes, per-comment AskUserQuestion + apply path |
| `~/.config/opencode/commands/file-review.md` | 1-15, 57-68 | Thin delegate + documented flags, launch format |

## Open Questions
- Web mode multi-file support remains Tauri-only (see `main.rs:162`); input from review marked this item not relevant to the current query.
- The Tauri `insert_*`/`remove_comment`/`parse_comments` commands exist only for the web HTTP layer (active edit path is pure client-side); marked "?" during review.
- "review batches" is not a named top-level concept. The closest existing facility is the per-invocation multi-tab "review session" (see below).
- (Review clarification received on the session/batch point): “it’s like each time file-review is opened the comments until closed are batched in a “review session”, so in case these are left we can still see them in the future as previous batch”
- Test surface (only comment-transform + markdown-preview tests) does not assert batch/session/export aggregation at scale; reviewer marked "ok".

## Appendix

### Architecture Notes
- Core invariant: one CodeMirror instance, per-tab document + comment state swapped in/out on activation; comments stored in source via deliberate marker pollution; single exit-time collection point for all tabs + remembered closes.
- Separation of concerns: GUI phase = human adds feedback markers (and may freely edit source); agent process phase = machine consumes markers to perform (or acknowledge) the remedial edits.
- State hand-off between TS and Rust for export is snapshot of serialized-with-markers content (not live comment objects); Rust never owns the active comment list during editing.
- Dirty / unsaved tracking uses the serialized form (markers + content) as the saved baseline, so mixed source edits + comment edits are tracked uniformly.
- Backward-compat output for single-tab sessions intentionally flattens to prior non-grouped shape.

### Historical Context (from thoughts/)
See "Historical Context" subsection in Detailed Findings above for the chronological evolution that produced the tabs/review-session machinery, web single-file bounds, unified skill routing, and the preview/comment UX. Earlier single-file+separate-process design is still the skeleton of the current two-phase (GUI then process) contract. The April 2026 tabs change directly introduced the per-invocation multi + closedFile "review session" and the submit/open_tabs export path that now exists.

### Related Research
- `thoughts/shared/research/2026-01-15-file-review-web-mode-research.md`
- `thoughts/shared/plans/2026-01-13-file-review-tool.md` + `-implementation-plan.md`
- `thoughts/taras/plans/2026-02-05-file-review-unified-skill.md`
- `thoughts/shared/plans/2026-04-28-file-review-tabs-mermaid/{root,step-*.md}`
- `thoughts/shared/plans/2026-01-19-file-review-markdown-*.md`
- `cc-plugin/file-review/commands/file-review.md` (and skills mirrors)
- `~/.agents/skills/file-review/SKILL.md` (canonical current)

**Research + file-review QA pass complete.** Document produced per `researching` skill (Critical autonomy). File-review launched on this doc via Bash background + 600s timeout; 4 review comments collected and processed (markers removed per "Acknowledge" path in Process Comments workflow; one clarification incorporated verbatim). No source edits required.
