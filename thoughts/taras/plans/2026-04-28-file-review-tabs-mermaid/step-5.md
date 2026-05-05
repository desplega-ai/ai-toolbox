---
id: step-5
name: Integration + cross-cutting QA
depends_on: [step-3, step-4]
status: done
assignee:
claimed_at:
---

<!-- During /v-implement, `desplega:step-running` adds `assignee` and `claimed_at` while
working, then transitions `status` to `done` (success) or back to `ready` (retry-able failure). -->

# step-5: Integration + cross-cutting QA

## Overview

Verify that tabs (steps 1–3) and mermaid (step 4) compose cleanly. Open multiple files in tabs where at least two contain mermaid blocks, switch between them, edit, save, close — confirm preview state is per-tab, no diagram leaks across tabs, no double-render after switch+return, and the multi-file comment-export flow still produces correct output. Also: bump version + run a Tauri release build to catch packaging issues that don't surface in `dev:web`.

## Changes Required:

#### 1. Cross-feature wiring sanity

**File**: `file-review/src/main.ts`
**Changes**:
- Confirm `activateTab(id)` calls `updatePreview` (which now awaits mermaid render). Make sure switching to a tab whose markdown contains mermaid blocks renders correctly without manual scroll/refresh.
- Confirm theme toggle re-renders mermaid in the **active** tab's preview. (Background tabs' diagrams will re-render lazily on next activation — document this.)

#### 2. Help overlay and README updates

**File**: `file-review/src/main.ts` (help modal HTML) + `file-review/README.md`
**Changes**:
- Update the keyboard shortcut help section: list `Cmd+T` (new tab), `Cmd+W` (close tab), `Cmd+1..9` (switch tab), `Cmd+Shift+T` (toggle theme — moved).
- Add a "Tabs" section to README describing CLI multi-file usage: `file-review a.md b.md c.md`.
- Add a "Mermaid" section to README listing supported diagram types and noting `securityLevel: 'strict'` (no scripted features).

#### 3. Version bump + release prep

**File**: `file-review/package.json`, `file-review/src-tauri/tauri.conf.json`, `file-review/src-tauri/Cargo.toml`
**Changes**:
- Bump from `1.7.3` to `1.8.0` (minor — two new features) in all three files. Per project CLAUDE.md, these must stay in sync.
- After `bun run install:web` runs, `file-review/src-tauri/Cargo.lock` will be updated by the build — commit and push it as a separate commit per the project release process.

### Success Criteria:

#### Automated Verification:
- [ ] Typecheck passes: `cd file-review && bun run check`
- [ ] Build passes: `cd file-review && bun run build`
- [ ] Cargo build passes: `cd file-review/src-tauri && cargo build --release`
- [ ] All three version files match: `grep -E '^"?version"?\s*[=:]' file-review/package.json file-review/src-tauri/tauri.conf.json file-review/src-tauri/Cargo.toml` shows `1.8.0` everywhere
- [ ] No leftover `console.log` / `dbg!` calls in changed files

#### Automated QA:
- [ ] Sub-agent launches `bun run dev:web file-review/test-files/with-mermaid.md file-review/test-files/sample.md`, confirms two tabs, both render correctly, mermaid SVGs only in the right tab
- [ ] Sub-agent presses `Cmd+1` then `Cmd+2` ten times rapidly, confirms no console errors and no DOM accumulation (count `.mermaid[data-processed="true"]` stays bounded)
- [ ] Sub-agent edits the mermaid file (one keystroke per second × 10), confirms diagrams update without stacking
- [ ] Sub-agent toggles theme on the mermaid tab, switches to the non-mermaid tab, switches back, confirms diagrams have the new theme (lazy re-render fires on activation)
- [ ] Sub-agent dirties both tabs, closes window, captures stdout, asserts both files appear in the multi-file comment export with their respective comments
- [ ] Sub-agent runs `/file-review:process-comments file-review/test-files/sample.md` against the captured output, confirms it ingests comments correctly

#### Manual Verification:
- [ ] Run a real Tauri release build via `bun run install:web`; open the installed binary on `with-mermaid.md` + `sample.md` simultaneously; verify mermaid renders, tabs work, save works, comment-export-on-close works
- [ ] Visual judgment: tab strip, mermaid styling, error UI all look polished in both themes

### QA Spec (optional):

Cross-cutting evidence-heavy verification with screenshots, recordings, and the multi-file export stdout transcript belongs in a separate QA doc.

**QA Doc**: `thoughts/taras/qa/2026-04-28-file-review-tabs-mermaid.md` (generate via `desplega:qa`; scenarios live in the doc, not here).

**Implementation Note**: This step is a vertical slice — QA-able on its own. After completing this step, pause for manual confirmation. After verification passes, commit with `[step-5] Integration QA + version bump to 1.8.0`.
