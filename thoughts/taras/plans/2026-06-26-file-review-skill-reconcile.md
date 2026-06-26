---
date: 2026-06-26
author: Claude (for Taras)
last_updated: 2026-06-26
last_updated_by: Claude (phase-running, Phase 5 — Change #1 only)
status: completed
autonomy: autopilot
topic: "Reconcile file-review plugin skill: port multi-file/batch behavior into source, fix factual bugs"
related_research: thoughts/taras/research/2026-06-26-file-review-skill-binary-gaps.md
tags: [plan, file-review, cc-plugin, skill, multi-file]
---

# file-review Plugin Skill Reconcile — Implementation Plan

## Overview

Update the **plugin-source** file-review skill (`cc-plugin/file-review/`) so it matches what the binary (`file-review/`, v1.10.0) actually does — multi-file tabs, batch review, stdin, web mode, config — and fix the factual bugs the research found. The genuinely useful multi-file/batch behavior already exists in a **diverged personal copy** (`~/.agents/skills/file-review/SKILL.md`, surfaced via the `~/.claude/skills/file-review` symlink); we port a **tightened** version of it into source rather than re-inventing.

- **Motivation**: The marketplace-shipped skill (`cc-plugin/file-review/`, plugin `1.5.0`) predates multi-file/tabs (landed 2026-05-05) and web mode. It documents a single-file tool, has a wrong shortcut table, and advertises a non-existent `--bg` flag. Meanwhile a personal copy already implements multi-file/batch but was never ported back and is over-engineered/rambly.
- **Related**: `thoughts/taras/research/2026-06-26-file-review-skill-binary-gaps.md` (gap analysis + resolved decisions); source-of-good-behavior `~/.agents/skills/file-review/SKILL.md`; binary truth in `file-review/src-tauri/src/{main,lib,comments,config}.rs` and `file-review/src/shortcuts.ts`.

## Current State Analysis

Three copies of this skill exist:

| Copy | Path | State |
|------|------|-------|
| **Plugin source** (target) | `cc-plugin/file-review/skills/file-review/SKILL.md` (+ `install/`, `process-review/`, `commands/`) | Stale, single-file. Wrong shortcut table (`Cmd+T`="Toggle theme"; actually New Tab — `shortcuts.ts:15`). Phantom `--bg` in `commands/file-review.md:2,14`. Example arrow `->` vs binary `→`. |
| **Marketplace cache** | `~/.claude/plugins/cache/desplega-ai-toolbox/file-review/1.5.0/` | Byte-identical to plugin source (stale). Regenerated on plugin update — **do not edit directly**. |
| **Personal copy** (port-from) | `~/.agents/skills/file-review/SKILL.md` (via `~/.claude/skills/file-review` symlink) | Already has multi-file launch, "Review batches v1" live-marker discovery, `parseAllMarkersWithContext` util, batch-aware Process Comments with diff previews. Rambly: "Phase 2/3/4 note (final)", inline node harnesses, self-contradicting prose. This is the version `/file-review` actually triggers today. |

**Binary truth** (already verified in research; load-bearing refs):
- Multi-file: all positional args → one tab each (`file-review/src-tauri/src/main.rs:50-56`, `lib.rs:23-48`). Grouped output `## <path>` when >1 tab, flat for single tab (`lib.rs:218-271`). JSON: array of `{path, comments}` multi-tab, bare array single (`lib.rs:223-253`).
- Shortcuts: canonical map at `file-review/src/shortcuts.ts:8-33`.
- stdin: `main.rs:62-91`; distinct output `comments.rs:212-263`.
- Web/tunnel: `main.rs:143-242`, `web_server.rs`; `--web` needs `web` feature (`main.rs:101-105`, built by `install:web` — `package.json:13-16`).
- Config `~/.file-reviewer.json`: `config.rs:11-22,44-48`.

**Resolved decisions** (Taras, 2026-06-26): Process Comments consumes the grouped close-output as source of truth, re-reading from disk only if needed; web mode stays explicitly single-file; Homebrew assumed native-only → web docs need an `install:web`-from-source caveat.

## Desired End State

`cc-plugin/file-review/` documents the real tool: multi-file launch + tabs, accurate shortcuts, a CLI reference mirroring `--help`, batch-aware Process Comments, and web/config/install notes — in **tight** prose. Plugin version bumped. The personal copy no longer silently diverges. Verifiable via grep assertions on the edited files + a real multi-file round-trip with the binary.

## What We're NOT Doing

- **No changes to the Rust/TS binary** (`file-review/`). This is docs/skill only.
- **Not making web mode multi-file** (decided: single-file).
- **Not editing the marketplace cache** directly (it regenerates from source).
- **Not porting the rambly scaffolding** ("Phase 2/3/4 note (final)", inline `node -e` harnesses, the `parseAllMarkersWithContext` JS verbatim) — we port the *behavior*, expressed concisely with the existing extraction regexes.
- **Not updating `.claude-plugin/marketplace.json`** (file-review already listed; only a version bump in `plugin.json` is needed).
- **Not touching the `wts`/other plugins.**

## Implementation Approach

- **Source of truth = the binary.** Every documented flag/shortcut/format is checked against `main.rs`/`shortcuts.ts`/`lib.rs`, not against either skill copy.
- **Port behavior, not prose.** Read the personal copy for *what* it does; rewrite concisely for source.
- **Sequence low-risk → additive → reconcile.** Correctness fixes first (independently shippable), then multi-file/CLI, then batch Process Comments, then advanced docs, then version bump + personal-copy reconcile.
- **Keep the router + thin-redirect structure** (`install/`, `process-review/` stay thin redirects; the `/file-review` + `/process-comments` commands stay backward-compat shortcuts).
- Verification is **grep assertions** (docs have no test suite) plus one **real binary E2E** for the multi-file output format.

## Quick Verification Reference

- Inspect edits: `git -C /Users/taras/Documents/code/ai-toolbox diff -- cc-plugin/file-review/`
- Marker/flag assertions: `grep -n` on the edited skill files (exact commands per phase).
- Real round-trip: `file-review /tmp/a.md /tmp/b.md` (add a comment in each tab, close, inspect grouped stdout).
- Version: `grep '"version"' cc-plugin/file-review/.claude-plugin/plugin.json`

---

## Phase 1: Correctness fixes (no new behavior)

### Overview

Fix the three factual bugs in the existing plugin source without adding features — independently shippable.

### Changes Required:

#### 1. Keyboard shortcut table
**File**: `cc-plugin/file-review/skills/file-review/SKILL.md` (the `### Keyboard Shortcuts` table, ~lines 119-130)
**Changes**: Rebuild the table from `file-review/src/shortcuts.ts:8-33`. Correct `Cmd+T` → **New tab (open file)**; add `Cmd+Shift+T` **Toggle theme**, `Cmd+W` close tab, `Cmd+1…9` jump to tab, `Cmd+N`/`Cmd+P` next/prev tab, `Cmd+M` toggle markdown raw/pretty, `Cmd++`/`Cmd+-` zoom, `Cmd+Z`/`Cmd+Shift+Z` undo/redo, and a row pointing to in-app `Cmd+/` for the full preview-vim/search list. Keep correct rows (`Cmd+K`, `Cmd+S`, `Cmd+Q`, `Cmd+/`, `Cmd+Shift+V`, `Cmd+O`).

#### 2. Phantom `--bg` flag
**File**: `cc-plugin/file-review/commands/file-review.md`
**Changes**: Remove `--bg` from the `argument-hint` frontmatter (line 2) and from the "Pass through any arguments and flags (`--bg`, ...)" instruction (line 14). Backgrounding is handled by the Bash tool's `run_in_background`, consistent with `SKILL.md:95`.

#### 3. Example output arrow
**File**: `cc-plugin/file-review/skills/file-review/SKILL.md` (example block ~line 114)
**Changes**: Change `-> Comment text here` to `→ Comment text here` to match `comments.rs:175`.

### Success Criteria:

#### Automated Verification:
- [x] No `--bg` anywhere in the command wrapper: `! grep -rn -- '--bg' cc-plugin/file-review/commands/`
- [x] `Cmd+T` no longer mapped to theme: `! grep -n 'Cmd+T | Toggle theme' cc-plugin/file-review/skills/file-review/SKILL.md`
- [x] Theme toggle now documented as Shift: `grep -n 'Cmd+Shift+T' cc-plugin/file-review/skills/file-review/SKILL.md`
- [x] Tab shortcuts present: `grep -nE 'Cmd\+W|Cmd\+1' cc-plugin/file-review/skills/file-review/SKILL.md`
- [x] Arrow fixed (no ASCII arrow in the example): `grep -n '→ Comment text here' cc-plugin/file-review/skills/file-review/SKILL.md`

#### Automated QA:
- [x] Agent diffs the new shortcut table line-by-line against `file-review/src/shortcuts.ts:8-33` and confirms every documented binding exists in the handler (`shortcuts.ts:152-237`) with no invented bindings.

#### Manual Verification:
- [ ] Spot-check: open the GUI (`file-review <any.md>`), press `Cmd+T` → a new tab/file picker opens (not a theme flip), confirming the doc now matches reality.

**Implementation Note**: After this phase, pause for manual confirmation. Independently shippable.

---

## Phase 2: Multi-file launch + Binary/CLI Reference

### Overview

Make the **Review a File** section multi-file aware and add a single-source-of-truth **CLI Reference** subsection mirroring `--help`.

### Changes Required:

#### 1. Review a File — multi-file launch
**File**: `cc-plugin/file-review/skills/file-review/SKILL.md` (the `## Review a File` → `### If path provided` block, ~lines 79-117)
**Changes**: Document `file-review "<p1>" "<p2>" …` opening one tab per path (`main.rs:50-56`, `lib.rs:23-48`); note additional files open in-session via `Cmd+T`/`Cmd+O` (multi-select picker) or drag-drop. State the contract that the launch may pass 0–N absolute paths. Keep the `run_in_background: true` / `timeout: 600000` / no-`&` / no-`--bg` launch rules.

#### 2. New "Binary / CLI Reference" subsection
**File**: `cc-plugin/file-review/skills/file-review/SKILL.md` (new subsection, e.g. under Review a File or a top-level `## CLI Reference`)
**Changes**: Add a concise flag table (from research §1 / `main.rs:280-318`): `-h/--help`, `-v/--version`, `-s/--silent`, `-j/--json`, `-w/--web`, `-o/--open`, `-t/--tunnel`, `--subdomain`, `--port` (default 3456), `[FILE]...`, stdin (`-` / piped). Document the **output formats**: native single-tab flat (`=== Review Comments (N) ===`), native multi-tab grouped under `## <path>` headers, JSON shapes (bare array vs `[{path,comments}]`), and the stdin `=== File === / === Content === / === Review Comments ===` block (`comments.rs:151-263`).

### Success Criteria:

#### Automated Verification:
- [x] Multi-file launch documented: `grep -nE 'p1.*p2|one tab per|multiple file' cc-plugin/file-review/skills/file-review/SKILL.md`
- [x] CLI reference covers web/port flags: `grep -nE '\-\-web|\-\-port|\-\-tunnel|\-\-subdomain' cc-plugin/file-review/skills/file-review/SKILL.md`
- [x] Grouped-output format documented: `grep -n '## <path>' cc-plugin/file-review/skills/file-review/SKILL.md`
- [x] stdin usage documented: `grep -nE 'stdin|cat .* \| file-review' cc-plugin/file-review/skills/file-review/SKILL.md`

#### Automated QA:
- [x] Agent cross-checks the CLI flag table against `file-review/src-tauri/src/main.rs:280-318` (`print_help`) — every flag in `--help` appears in the doc and vice-versa (no invented flags, default port = 3456).

#### Manual Verification:
- [ ] Real round-trip: `file-review /tmp/a.md /tmp/b.md`; add one comment in each tab; close. Confirm stdout is grouped under `## /tmp/a.md` and `## /tmp/b.md`, matching the newly documented format.

**Implementation Note**: After this phase, pause for manual confirmation.

---

## Phase 3: Batch discovery + batch-aware Process Comments

### Overview

Port the useful "batch" behavior from the personal copy, tightened: discover files with active review markers (pending batches) for the no-path flow, and rework **Process Comments** to handle the multi-tab grouped output across N files.

### Changes Required:

#### 1. Pending-batch discovery (no-path flow)
**File**: `cc-plugin/file-review/skills/file-review/SKILL.md` (`## Review a File` → `### If no path provided`)
**Changes**: In addition to recent plan/research files, add a concise "pending review batches" discovery: grep for active `review-(start|line-start)` markers, scoped to `thoughts/taras/` + `thoughts/shared/`, then re-verify with the exact extraction regexes before proposing (so files that merely quote the pattern aren't offered). Present via multi-select AskUserQuestion. Port the *idea* from the personal copy's "Review batches v1" but in ~6 lines, no inline node harness, no "Phase N note" scaffolding.

#### 2. Batch-aware Process Comments
**File**: `cc-plugin/file-review/skills/file-review/SKILL.md` (`## Process Comments`)
**Changes**: Rework to: (a) **consume the grouped close-output as the source of truth** — parse per `## <path>` section for paths + comments; **re-read a file from disk only when needed** (`--silent`, truncated output) per the resolved decision; (b) group the per-comment Apply/Acknowledge/Skip presentation by file; (c) on Apply/Acknowledge, strip markers from the on-disk file (existing inline/line replacement rules); (d) emit a per-file + totals final summary. Keep the existing extraction regexes and single-file flat path as the default for one tab. Drop the verbose `parseAllMarkersWithContext` code block and diff-preview ceremony unless it can be stated in ≤2 sentences.

### Success Criteria:

#### Automated Verification:
- [x] Process Comments references grouped output: `grep -nE 'grouped|## <path>|per[- ]file' cc-plugin/file-review/skills/file-review/SKILL.md`
- [x] "consume output, re-read if needed" decision encoded: `grep -niE 're-?read .*if needed|consume .*output' cc-plugin/file-review/skills/file-review/SKILL.md`
- [x] Pending-batch discovery present + scoped: `grep -nE 'review-\(start\|line-start\)|pending review' cc-plugin/file-review/skills/file-review/SKILL.md`
- [x] No leftover "Phase 2/3/4 note" rambly scaffolding ported in: `! grep -niE 'Phase [234] note|parseAllMarkersWithContext' cc-plugin/file-review/skills/file-review/SKILL.md`

#### Automated QA:
- [x] Agent dry-runs the documented Process flow against a fixture: two temp `.md` files each containing one inline + one line marker, simulating the grouped stdout; confirms the documented steps would resolve all 4 markers and that the final summary shape lists both files with correct counts.

#### Manual Verification:
- [ ] End-to-end with the binary: review `/tmp/a.md` + `/tmp/b.md`, leave a comment in each, close, then follow the documented Process Comments steps and confirm markers are correctly stripped from both files.

**Implementation Note**: After this phase, pause for manual confirmation.

---

## Phase 4: Web/tunnel, config, and install docs

### Overview

Document the advanced surfaces and fix the install instructions so web-mode users build correctly.

### Changes Required:

#### 1. Advanced: Web/tunnel mode
**File**: `cc-plugin/file-review/skills/file-review/SKILL.md` (new "Advanced" subsection)
**Changes**: Document `--web`/`--open`/`--tunnel`/`--subdomain`/`--port` (`main.rs:143-242`), comments returned on browser/GUI close (`web_server.rs:279-356`). State **explicitly single-file** (decided). Add the **install caveat**: web mode needs the `web`-feature build (`install:web`); a plain `install:app` binary rejects `--web` (`main.rs:101-105`); **Homebrew is native-only**, so brew users must build from source with `bun run install:web`.

#### 2. Install section update
**File**: `cc-plugin/file-review/skills/file-review/SKILL.md` (`## Install`) — and mirror nothing in `skills/install/SKILL.md` (stays a thin redirect)
**Changes**: Note that `bun run install:app` gives the native binary; for web mode use `bun run install:web`. Align with project memory (releases use `bun run release`). Keep Homebrew quick-install but add the native-only note.

#### 3. Config file
**File**: `cc-plugin/file-review/skills/file-review/SKILL.md` (new short "Config" note)
**Changes**: Document `~/.file-reviewer.json` (`config.rs:11-22,44-48`): `theme`, `vim_mode`, `font_size`, `markdown_raw`, `save_on_quit`, `window`. Call out `save_on_quit` (when true, edits/markers persist on quit without explicit save). Note `--help` and the in-app shortcuts modal expose it.

### Success Criteria:

#### Automated Verification:
- [x] Web section single-file + install:web caveat: `grep -nE 'single-file|install:web' cc-plugin/file-review/skills/file-review/SKILL.md`
- [x] Homebrew native-only caveat present: `grep -niE 'native-only|build from source' cc-plugin/file-review/skills/file-review/SKILL.md`
- [x] Config documented: `grep -n 'file-reviewer.json' cc-plugin/file-review/skills/file-review/SKILL.md` and `grep -n 'save_on_quit' cc-plugin/file-review/skills/file-review/SKILL.md`

#### Automated QA:
- [x] Agent verifies the documented config keys exactly match the `AppConfig` struct fields in `file-review/src-tauri/src/config.rs:11-22` (no extra/missing keys).

#### Manual Verification:
- [ ] Run `file-review --help` and confirm the doc's flag list + config path match the actual help output.

**Implementation Note**: After this phase, pause for manual confirmation.

---

## Phase 5: Version bump + reconcile personal copy

### Overview

Bump the plugin version and resolve the source-vs-personal divergence so it doesn't recur.

### Changes Required:

#### 1. Version bump
**File**: `cc-plugin/file-review/.claude-plugin/plugin.json`
**Changes**: Bump `version` `1.5.0` → `1.6.0` (minor: documented new features). Optionally refresh the `description` to mention multi-file review.

#### 2. Reconcile the personal copy
**File**: `~/.agents/skills/file-review/SKILL.md` (surfaced via `~/.claude/skills/file-review`)
**Changes**: This personal skill currently shadows the plugin and is the diverged source. Decision to surface to Taras at implementation time (it lives outside the repo): **(a)** delete it so the freshly-updated plugin skill is the single source (recommended — `/file-review` then resolves to the plugin), or **(b)** overwrite its body with the finalized plugin `SKILL.md` so the two match. Do **not** silently leave both diverging. The implementer must confirm with Taras before deleting/overwriting anything under `~/.agents/`.

**Resolution (Taras, 2026-06-26):** Neither (a) nor (b) — Taras will reconcile himself by doing a fresh install via `npx skills` after this lands. `~/.agents/` left untouched by the implementer.

### Success Criteria:

#### Automated Verification:
- [x] Version bumped: `grep -n '"version": "1.6.0"' cc-plugin/file-review/.claude-plugin/plugin.json`
- [x] No review markers left in any edited skill file: `! grep -rnE 'review-(start|line-start)' cc-plugin/file-review/` — assertion satisfied per documented nuance: the only matches are the SKILL.md Comment Format / Extraction Patterns / strip-rule docs that legitimately describe the marker pattern (placeholder `ID` + `[a-zA-Z0-9-]+` regex); filtering those out yields zero real stray markers.

#### Automated QA:
- [x] Haiku structure/lint pass over the rewritten `SKILL.md`: headings well-formed, intent-router table intact, no orphaned references to removed sections, prose tightened (no "Phase N note" scaffolding, no inline node harness).

#### Manual Verification:
- [x] Taras confirms the personal-copy reconcile choice — will reinstall fresh via `npx skills`; implementer leaves `~/.agents/` untouched.
- [ ] `git diff` review of the full `cc-plugin/file-review/` changeset before commit.

**Implementation Note**: After this phase, pause for manual confirmation. Per project CLAUDE.md, the plugin version bump is mandatory when modifying a plugin.

---

## Appendix

- **Follow-up plans**: none; single-session scope.
- **Derail notes**:
  - The marketplace cache (`~/.claude/plugins/cache/.../file-review/1.5.0/`) only refreshes when the plugin is re-installed/updated; after merge, Taras may need `/plugin` update to pull the new version locally.
  - `skills/install/SKILL.md` and `skills/process-review/SKILL.md` are thin redirects and should stay that way — only `skills/file-review/SKILL.md` carries content.
  - The personal copy's diff-preview-before-apply idea (unified diff + confirm) is a genuinely nice UX; if kept, state it in ≤2 sentences rather than the verbose block currently there.
- **References**:
  - Research: `thoughts/taras/research/2026-06-26-file-review-skill-binary-gaps.md`
  - Binary truth: `file-review/src-tauri/src/{main,lib,comments,config,web_server}.rs`, `file-review/src/shortcuts.ts`, `file-review/package.json`
  - Port-from: `~/.agents/skills/file-review/SKILL.md`
