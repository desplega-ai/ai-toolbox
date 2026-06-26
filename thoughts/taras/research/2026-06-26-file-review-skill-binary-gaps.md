---
date: 2026-06-26T13:02:35+02:00
researcher: Claude (for Taras)
git_commit: e70561d0657006c8757185ba330e0b3922650573
branch: main
repository: ai-toolbox
topic: "Gaps between the file-review plugin skill and what the binary actually supports (e.g. multi-files), with a proposal to restructure the skill"
tags: [research, codebase, file-review, cc-plugin, skill, multi-file, cli]
status: complete
autonomy: autopilot
last_updated: 2026-06-26
last_updated_by: Claude (for Taras)
---

# Research: file-review skill vs. binary capability gaps (+ restructure proposal)

**Date**: 2026-06-26T13:02:35+02:00
**Researcher**: Claude (for Taras)
**Git Commit**: e70561d0657006c8757185ba330e0b3922650573
**Branch**: main

## Research Question
What are the gaps between the file-review **skill** in `cc-plugin/file-review/` and what the **binary** in `file-review/` actually supports (e.g. multi-files), and how should the skill be changed / restructured to close them?

> Note: the default `researching` skill is documentary-only, but this request explicitly asks for a proposal, so a **Proposed Restructure** section is included after the gap analysis.

## Summary

The skill in `cc-plugin/file-review/` describes a **single-file, GUI-only** tool. The binary in `file-review/` (package version `1.10.0`) has since grown into a **multi-file tabbed reviewer** with **stdin piping**, a **web/tunnel server mode**, a **config file**, and a substantially different **keyboard map**. The plugin manifest is at `1.5.0` and the canonical `SKILL.md` was last meaningfully edited **2026-03-12**; the multi-file/tabs feature landed **2026-05-05** (`8d9b943`, `c06b8f8`, `ee17bf6`) and web mode shortly before it (`ba8c06c`). **The skill simply predates most of what the binary now does.**

The headline gap is **multi-file**: the binary accepts any number of positional path arguments and opens one tab per path (`main.rs:50-56`, `lib.rs:23-48`), then on close emits comments **grouped per file under `## <path>` headers** (`lib.rs:218-271`). The skill never mentions tabs, only ever launches `file-review "<path>"` with one path (`SKILL.md:91-92`), and its **Process Comments** workflow assumes a single file (`SKILL.md:166-205`) — so a multi-file review session would surface output the skill's parser doesn't anticipate.

Beyond multi-file, there are concrete **factual errors** (the shortcut table maps `Cmd+T` to "Toggle theme" when it is actually **New Tab** — theme toggle is `Cmd+Shift+T`), a **phantom `--bg` flag** plumbed through the command wrapper that the binary doesn't implement, and entire undocumented surfaces: **stdin mode**, **`--web`/`--tunnel`/`--port`/`--subdomain`**, the **`~/.file-reviewer.json` config** (including `save_on_quit`, which changes whether edits persist), and the fact that the documented install command (`install:app`) builds a binary that **cannot** run `--web`.

## Detailed Findings

### 1. The binary's real CLI surface (`main.rs`)

Flag parsing in `main.rs:16-91` and the `--help` text in `main.rs:280-318`:

| Flag | Meaning | Source |
|------|---------|--------|
| `-h, --help` | Help (also prints config path + contents) | `main.rs:21-24`, `305-317` |
| `-v, --version` | Version | `main.rs:16-19` |
| `-s, --silent` | Suppress comment output on close | `main.rs:27` |
| `-j, --json` | JSON output on close | `main.rs:28` |
| `-w, --web` | Web server mode (requires `web` feature) | `main.rs:29`, `94-105` |
| `-o, --open` | Auto-open browser (web) | `main.rs:33` |
| `-t, --tunnel` | localtunnel for remote access (web) | `main.rs:31` |
| `--subdomain NAME` | Request a tunnel subdomain | `main.rs:35-38` |
| `--port PORT` | HTTP port (default **3456**) | `main.rs:41-45` |
| `[FILE]...` | **One or more** file paths → one tab each | `main.rs:50-56` |
| `-` / piped stdin | Read content from stdin into a temp file | `main.rs:62-91`, `245-278` |

**The skill documents only `--silent` and `--json`** (`SKILL.md:98`) plus a single positional path.

### 2. Multi-file / tabs — the headline gap

**Binary supports it fully:**
- All non-flag args are collected as file paths (`main.rs:50-56`) and passed as a `Vec<String>` to `run(file_paths, ...)` (`lib.rs:23`). `current_file` = first path; `initial_files` = all paths (`lib.rs:30-48`).
- The frontend fetches `getInitialFiles()` and opens a tab per path via `loadFile(path, "append")` (`main.ts:442-447`), rendering a tab strip (`tabs-view.ts:14`).
- Users can open **more** files after launch via `Cmd+T` / `Cmd+O` (multi-select file picker, `file-picker.ts:16`) or **drag-and-drop** (`main.ts:481`).
- Tab navigation: `Cmd+W` close, `Cmd+1…9` jump, `Cmd+N`/`Cmd+P` next/prev (`shortcuts.ts:152-198`).
- On close, `submit_tab_states` pushes every tab's content back to Rust (`lib.rs:314`, frontend `main.ts:1295-1314`); output is **grouped per file** with `## <path>` headers when >1 tab, but stays **flat for a single tab** (backward-compat) (`lib.rs:218-271`). JSON multi-tab → array of `{path, comments}` objects, single-tab → bare comments array (`lib.rs:223-253`).

**Skill is single-file throughout:** launch shows one quoted path (`SKILL.md:91-92`); the example output is the flat single-file form (`SKILL.md:108-117`); **Process Comments** says "Read the file" (singular) and never accounts for `## <path>` grouping or N files each carrying their own markers (`SKILL.md:166-205`).

> Caveat for any future doc: **web mode is single-file only.** `run_web_mode` seeds `initial_files` with just the primary file (`main.rs:163-173`) and `/api/quit` reads only `current_file` (`web_server.rs:279-311`). Multi-file output grouping is **Tauri-native only**.

### 3. Keyboard shortcut table is wrong/stale (`SKILL.md:119-130` vs `shortcuts.ts:8-33`)

| Skill says | Reality | Evidence |
|------------|---------|----------|
| `Cmd+T` = **Toggle theme** | `Cmd+T` = **New tab (open file)** | `shortcuts.ts:15`, `lib.rs:65`, `shortcuts.ts:179-183` |
| (missing) | `Cmd+Shift+T` = **Toggle theme** | `shortcuts.ts:19`, `211-213` |
| (missing) | `Cmd+W` close tab, `Cmd+1…9` jump, `Cmd+N`/`P` next/prev | `shortcuts.ts:16-18`, `174-198` |
| (missing) | `Cmd+M` toggle markdown raw/pretty | `shortcuts.ts:20`, `214-215` |
| (missing) | `Cmd++`/`Cmd+-` zoom, `Cmd+Z`/`Cmd+Shift+Z` undo/redo | `shortcuts.ts:23-24`, `223-235` |
| (missing) | Preview vim nav (`j/k`, `gg/G`), preview search (`/`, `Cmd+F`, `n/N`) | `shortcuts.ts:28-33` |

Correct in the skill: `Cmd+K` add comment, `Cmd+S` save, `Cmd+Q` quit, `Cmd+/` help, `Cmd+Shift+V` vim, `Cmd+O` open.

### 4. stdin mode — undocumented

`cat file.md | file-review` (auto-detected when stdin isn't a TTY) or `file-review -` reads content into a persistent temp file `file-review-<date>-<hash>.md` (`main.rs:62-91`, `245-278`). Output has a **distinct shape**: `=== File ===` / `=== Content ===` / `=== Review Comments [(content modified)] ===` plus a `modified` boolean (`comments.rs:212-263`). The skill has zero coverage of this; it only ever passes an absolute path.

### 5. Web / tunnel mode — undocumented (and an install trap)

`--web` starts an axum HTTP server mirroring the Tauri commands as REST endpoints (`web_server.rs:105-134`); `--tunnel` wraps it in localtunnel for remote review, `--subdomain`/`--port`/`--open` tune it (`main.rs:143-242`). Comments come back via `POST /api/quit`, printed to stdout the same way as native close (`web_server.rs:279-356`).

**Install trap:** the skill's install path uses `bun run install:app` (`SKILL.md:49`), which builds **without** the `web` feature. Such a binary rejects `--web` with *"Web mode requires the 'web' feature"* (`main.rs:101-105`). The web-capable build is `bun run install:web` → `tauri build --features web` (`package.json:13-16`). (This also matches the project memory: file-review releases use `bun run release`, and CLAUDE.md's release process uses `install:web`.)

### 6. Config file — undocumented

`~/.file-reviewer.json` (`config.rs:44-48`) persists `theme`, `vim_mode`, `font_size`, `markdown_raw`, `save_on_quit`, and `window {width,height}` (`config.rs:11-22`). It's surfaced in `--help` (`main.rs:305-317`) and editable from the in-app shortcuts modal ("Edit Config", `shortcuts.ts:115-123`). **`save_on_quit` matters for the skill's contract:** when true, the file is written on quit, so review markers/edits persist to disk without an explicit `Cmd+S`.

### 7. Phantom `--bg` flag in the command wrapper

`commands/file-review.md` advertises `--bg` in its `argument-hint` and instructs "Pass through any arguments and flags (`--bg`, `--silent`, `--json`)" (`file-review.md:2,14`). But the binary has **no** `--bg` flag (`main.rs`), and `SKILL.md:95` explicitly says "Do **NOT** use `--bg`". It's a dead/contradictory flag — backgrounding is handled by the Bash tool's `run_in_background`, not a binary flag.

### 8. Comment marker format — accurate (minor cosmetic drift)

The skill's marker formats and extraction regexes (`SKILL.md:137-162`) match the binary (`comments.rs:72-148`, `270-345`). One cosmetic mismatch: the skill's example output renders the arrow as ASCII `->` (`SKILL.md:114`), but the binary emits the Unicode `→` (`comments.rs:175`, `258`). IDs are the first 8 chars of a UUID v4 (`comments.rs:359`), consistent with the skill's "8-character alphanumeric".

## Gap Summary Table

| Capability | Binary | Skill | Severity |
|------------|--------|-------|----------|
| Multiple file paths → tabs | ✅ `main.rs:50-56`, `lib.rs:30-48` | ❌ single path only | **High** |
| Per-file `## <path>` grouped output | ✅ `lib.rs:218-271` | ❌ not parsed | **High** |
| Multi-file Process Comments | n/a (output gives it) | ❌ single-file assumption | **High** |
| Shortcut table correctness | ✅ `shortcuts.ts:8-33` | ❌ `Cmd+T` wrong + many missing | **High** |
| stdin piping (`cat … \| file-review`, `-`) | ✅ `main.rs:62-91` | ❌ absent | Medium |
| Web/tunnel mode (`--web`/`-t`/`--port`…) | ✅ `web_server.rs`, `main.rs:143-242` | ❌ absent | Medium |
| `install:web` needed for web mode | ✅ `package.json:13-16` | ❌ documents `install:app` only | Medium |
| Config `~/.file-reviewer.json` (+`save_on_quit`) | ✅ `config.rs` | ❌ absent | Medium |
| Phantom `--bg` flag | ❌ no such flag | ⚠️ advertised in command wrapper | Low |
| `→` vs `->` in example output | `→` (`comments.rs:175`) | `->` | Cosmetic |

## Proposed Changes / Restructure

The current three-skill layout is sound — `install` and `process-review` are thin redirects into one canonical `SKILL.md` with an intent router (`SKILL.md:12-27`). **Keep that shape**; the fixes are about content accuracy and one new reference section, not architecture.

**A. Correctness fixes (do first, low risk):**
1. Rewrite the **Keyboard Shortcuts** table from `shortcuts.ts` (fix `Cmd+T`→New Tab, add `Cmd+Shift+T` theme, `Cmd+W`, `Cmd+1…9`, `Cmd+N/P`, `Cmd+M`, zoom, undo/redo, preview nav/search).
2. Remove the **phantom `--bg`** from `commands/file-review.md` (`argument-hint` and the pass-through instruction) to match `SKILL.md:95`.
3. Fix the example arrow `->` → `→`.

**B. Add multi-file support (the core ask):**
4. In **Review a File**, document launching `file-review <path1> <path2> …` (one tab per path) and that more files open via `Cmd+T`/`Cmd+O`/drag-drop. Add a short "Tabs" note to the shortcuts/UX section.
5. Make **Process Comments multi-file aware**: when >1 file is reviewed, the close output is grouped under `## <path>` headers (`lib.rs:218-271`); each file on disk still holds its own markers. **Consume the grouped close-output as the source of truth** (it carries per-file path, line numbers, and content); **re-read a file from disk only when needed** — e.g. `--silent` suppressed the output or it was truncated. The workflow iterates files: parse the grouped output per `## <path>` section, resolve each comment, then strip markers from the file on disk. Keep the single-file flat-output path as the default for one tab. _(Decided 2026-06-26.)_

**C. New "Binary / CLI Reference" subsection** (single source of truth, mirrors `--help`):
6. Full flag table (Section 1 above), stdin usage, and the default output formats (native flat, native multi-tab `## path`, JSON shapes, stdin `=== File ===` block).

**D. Advanced / optional surfaces:**
7. Document **web/tunnel mode** under an "Advanced" heading, **explicitly single-file** (decided — no multi-file web), and requiring the **`install:web`** build. Update the **Install** section so anyone wanting `--web` builds with `bun run install:web` (and align with `bun run release` per project memory). **Homebrew ships native-only** (decided assumption), so the web section must add a caveat: `brew install` users who want `--web` must build from source with `bun run install:web`.
8. Document the **`~/.file-reviewer.json` config**, especially `save_on_quit` (affects whether edits persist) and that `--help` / the in-app modal expose it.

**E. Optional restructure if `SKILL.md` grows too large:** split the new CLI Reference into a fourth thin skill (e.g. `cli-reference`) that the router points to, mirroring the existing redirect pattern — only if length becomes a problem; otherwise an inline subsection is simpler.

## Code References

| File | Line | Description |
|------|------|-------------|
| `file-review/src-tauri/src/main.rs` | 16-91 | CLI flag parsing + multi-file/stdin extraction |
| `file-review/src-tauri/src/main.rs` | 101-105 | `--web` rejected without `web` feature |
| `file-review/src-tauri/src/main.rs` | 143-242 | Web/tunnel run path |
| `file-review/src-tauri/src/main.rs` | 280-318 | `--help` text (source of truth for flags + config) |
| `file-review/src-tauri/src/lib.rs` | 23-48 | `run(file_paths: Vec<String>)`, seeds tabs from all paths |
| `file-review/src-tauri/src/lib.rs` | 218-271 | Multi-tab `## <path>` grouped output; single-tab flat fallback |
| `file-review/src-tauri/src/comments.rs` | 151-179 | `format_comments_readable` (`=== Review Comments (N) ===`, `→`) |
| `file-review/src-tauri/src/comments.rs` | 212-263 | stdin-mode output (`=== File ===` / `=== Content ===` / modified) |
| `file-review/src-tauri/src/config.rs` | 11-22, 44-48 | `~/.file-reviewer.json` schema + path |
| `file-review/src-tauri/src/web_server.rs` | 279-356 | `/api/quit` → comment output + shutdown |
| `file-review/src/shortcuts.ts` | 8-33, 152-237 | Canonical keyboard map + handlers |
| `file-review/package.json` | 13-16 | `install:app` (no web) vs `install:web` (`--features web`) |
| `cc-plugin/file-review/skills/file-review/SKILL.md` | 91-130, 166-205 | Single-file launch, stale shortcuts, single-file Process Comments |
| `cc-plugin/file-review/commands/file-review.md` | 2, 14 | Phantom `--bg` flag |
| `cc-plugin/file-review/.claude-plugin/plugin.json` | 4 | Plugin version `1.5.0` |

## Resolved Decisions

_(Resolved by Taras during file-review of this doc, 2026-06-26.)_

- **Homebrew build**: Assume the Homebrew formula ships **only the native binary** (no `web` feature). Therefore the web/tunnel docs must tell `brew install` users to **build from source with `bun run install:web`** if they want `--web`. (Formula lives in `desplega-ai/homebrew-tap`, outside this repo — no need to verify before writing the caveat.)
- **Multi-file Process Comments source of truth**: **Consume the grouped close-output directly** (it already carries per-file paths, line numbers, and content). **Re-read a file from disk only if needed** — e.g. `--silent` was used or the output was truncated/incomplete.
- **Web mode multi-file**: **No.** Keep the skill's web section **explicitly single-file**; do not pursue making web mode multi-file.

## Appendix

- **Architecture notes**: The plugin uses a router skill (`SKILL.md`) with two thin redirect skills (`install`, `process-review`) and two backward-compat slash commands (`file-review`, `process-comments`). Output-on-close is the integration contract: the binary prints comments to stdout, the Bash `run_in_background` launch captures it, and the skill parses it. The binary deliberately keeps **single-tab output flat** for backward-compat with shell consumers (`lib.rs:222`).
- **Historical context (from thoughts/)**:
  - `thoughts/taras/research/2026-01-15-file-review-web-mode-research.md` — prior research on web mode (the `--web`/`--tunnel` work the skill never absorbed).
  - `thoughts/taras/research/2026-01-13-file-review-tool-implementation-plan.md` — original tool implementation plan.
  - `thoughts/taras/research/2026-01-14-skill-wrapper-refactoring.md` — the skill-wrapper/redirect pattern this plugin follows.
- **Version drift**: `SKILL.md` last edited 2026-03-12 (`6638c33`); multi-file landed 2026-05-05 (`c06b8f8` TabManager, `8d9b943` open/switch/close, `ee17bf6` multi-file export); web mode `ba8c06c`. Plugin manifest `1.5.0`; binary `package.json` `1.10.0`.
- **Related research**:
  - `thoughts/taras/research/2026-01-15-file-review-web-mode-research.md` — web/tunnel mode details.
