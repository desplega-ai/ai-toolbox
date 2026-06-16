---
date: 2026-06-16T14:00:00+0200
author: Claude (planning, critical autonomy via /desplega:create-plan)
topic: "file-review: editing support and review batches"
status: draft
autonomy: critical
input_research: thoughts/taras/research/2026-06-16-file-review-editing-and-review-batches.md
related_plans:
  - thoughts/taras/plans/2026-04-28-file-review-tabs-mermaid/root.md
  - thoughts/taras/plans/2026-02-05-file-review-unified-skill.md
plan_type: standard
---

# file-review: Editing Support and Review Batches — Implementation Plan

> **For Claude:** This plan was created following the `/desplega:create-plan` thin wrapper spec (autonomy from research frontmatter + critical mode defaults + AskUserQuestion conventions) + the `desplega:planning` skill rules. All major decisions, gaps, and phase boundaries will use AskUserQuestion. Heavy analysis uses sub-agents. Never implement from within this planning session. Handoff to fresh `/desplega:implement-plan` session.

## Overview

**One-sentence goal:** Provide first-class support in the file-review tool (GUI + agent skill) for (1) editing/review remediation workflows and (2) "review batches" — named, re-openable, or historically visible collections of prior review sessions (especially ones that left behind comment markers in source files).

- **Motivation**: Research document (2026-06-16) states the explicit stakeholder desire: "I would like to offer two new things in the file-review/: 1. Be able to edit things 2. Be able to have 'review batches'." Current code has full source editing + multi-tab "review session" machinery (from the tabs v-plan), but remediation edits ("Apply edit") happen only post-GUI in the agent Process Comments skill using AskUserQuestion + source patches. Sessions with lingering markers are discoverable only manually. The research itself was processed via the existing flow (4 comments, all "Acknowledge").
- **Related**: The provided research `thoughts/taras/research/2026-06-16-file-review-editing-and-review-batches.md` (autonomy: critical, file-reviewed), previous file-review tabs work (`thoughts/taras/plans/2026-04-28-file-review-tabs-mermaid/{root,step-*.md}`), unified skill (`thoughts/taras/plans/2026-02-05-file-review-unified-skill.md`), core files listed in research appendix (editor/main/comments/tabs + Rust file_ops/lib + skill definitions). 

## Current State Analysis

(Initial stub from research. **Deep sub-agent validation (Critical loop)** performed via 3 parallel targeted `task` agents (`general` + two `codebase-analyzer`) + fresh reads/greps. All research claims + line citations validated 1:1 with zero drift since the research's git commit. New actionable evidence surfaced for minimal implementation surfaces. Findings synthesized below.)

**Validated core facts (file:line) — no change from research + 2026-04 tabs work:**

- Full source editing always live + never read-only: `file-review/src/editor.ts:36-54,100,47`; doc lives clean-only.
- Markers **intentionally** written into user source on save/close (`main.ts:1375,852,1465`; `comments.ts:222-263` serialize; `api.ts:183`; Rust direct fs write); stripped only for CM (`comments.ts:145-220` parseAndStrip + stripCommentMarkers + offset maps); never shown/editable as literal text in editor or preview.
- Hard separation of concerns: GUI phase = feedback creation + source edits by human (decorations only via `commentHighlightField` + sidebar edit/delete of *text* (sidebar.ts:131-144)); remediation = **exclusive** post-GUI agent path in `Process Comments`.
- Session/batch machinery (per-invocation): `TabManager` + snapshot-on-switch (`tabs.ts:21-39`, `main.ts:1153,1249,429`); `closedFiles` (main.ts:83-98) populated only on non-discard closeTab paths + rendered as "In this review session" (140-166); `pushTabStatesToRust` + `submit_tab_states` (1295-1318, 1314) feeds Rust `AppState.open_tabs`; CloseRequested aggregates + emits grouped stdout (`lib.rs:160-271`, `file_ops.rs:71,10`; single-tab back-compat). Web deliberately single + no submit route (web_server.rs:116-131, main.rs:162-163).
- Export / reporting always re-parses markers at close-time (Rust `parse_comments_for_output` `comments.rs:68-148` + identical regexes in skill); markers left on disk.
- Zero-path handling: binary accepts 0-N (main.rs:50-56); skill proposes "recent thoughts plans/research" via AskUserQuestion (SKILL.md:70-77); empty state in UI otherwise. No cross-launch batch index or marker discovery today.
- Process Comments (the *only* apply path): reads disk (post-close), extracts with TS copies of the regexes (SKILL:156-161), per-comment `AskUserQuestion` + for Apply: host `edit` (replaces marked span with remediated content, no markers) + strip. Rust `remove_comment` unused for agent apply path. Confirmed exact match to research 34/93/136.
- Test surface thin (only transform + preview tests).

**Sub-agent discoveries / actionable for this feature (new evidence):**

- No durable prior-batch record exists. "Previous batches" reduce exactly to the set of files that today still contain active `review-(start|line-start)` markers. Discovery possible by limited/local grep/scan (thoughts/**/*.md + CWD relevant files) in skill zero-path logic or new thin surfaces. Proposed minimal: live on-demand scan; no sidecar/index for v1 (per user decision during planning). (Validated in batch sub-agent report.)
- Smallest future hooks (if we want provenance later): write lightweight append record at the one place that already sees the full session set (`submit_tab_states` in file_ops.rs:71 + the CloseRequested aggregation in lib.rs:158 and web quit 279). Use ~/.file-reviewer-sessions.jsonl next to existing config (or defer entirely). User chose to defer the sidecar decision and do pure live marker scan for first drop.
- Remediation of "edit things": intentionally and hard out of GUI (CM never sees marker bytes; apply is host edit after the bg Bash delivers stdout). No current TODOs/hooks for in-GUI apply (sidebar edits only feedback text). Per user decision: **keep the separation**; first improvement = discovery/polish of the Process path + surfaces (better group-by-prior-session if possible, richer context in Ask, easier launch from pending markers, regression-proofing the agent apply + strip). Polish stays in skill layer + minor CLI ergonomics; avoids touching the Tauri binary editing model.
- CLI / binary surface today is intentionally thin (flags only for output format/silent; args = files or none). Adding `--list-pending` or dedicated subcommand is easy later but not required for v1 live-scan scoping.
- Web remains single-file; batch work can be Tauri-first (or explicitly documented as such).

**Open items closed or deferred by Critical checkpoint AskUserQuestions during this session (user responses recorded here):**

- Autonomy + scope: `critical` from research frontmatter; "Both features".
- Commits: Yes (Recommended) after manual verification per phase.
- Storage for batches: Defer sidecar; implement v1 as live/on-demand discovery (grep for markers in relevant trees + propose in existing no-path / empty-state flows).
- Remediation first step: Keep hard GUI-vs-Process separation; improve discoverability + the Process Comments UX/polish.

Full original file:line + historical inventory remain valid; they live in the attached 2026-06-16 research appendix. Sub-agents cross-checked against current HEAD and reproduced the citation table nearly byte-for-byte. 

No other call sites, no accidental mutation of markers in CM, no other apply paths. The architecture and the explicit two-phase contract are the correct foundation.

## Desired End State

(High-level only; will be detailed + validated with sub-agents + user.)

A state where:
- Reviewers (human or agent-driven) can fluidly edit source *and* comments/markers during a review session (or have a clear in-tool path to "apply" feedback without leaving the GUI).
- Prior review sessions / batches that left markers are discoverable and re-activatable (via CLI flags, a new "resume/review-batches" subcommand/skill surface, or list view when markers exist; the "previous batch" info is queryable).
- The two-phase (GUI then Process) contract remains reliable or is explicitly evolved; Process Comments still works as the safe agent path, but humans have better in-GUI flows.
- Existing multi-tab, dirty tracking, comment remapping, mermaid, vim, etc. continue unchanged.
- Automated verification + file-review on the changes + skill surfaces all pass.
- Backward compat for single-file and existing marker parsing/export.

Concrete acceptance will be listed per-phase Success Criteria using Automated Verification / Automated QA / Manual Verification buckets.

## What We're NOT Doing

- Full multi-user collaboration or real-time co-editing.
- Persistent cross-launch "last session" restore for *all* open files (unless it falls out of batches work).
- Rewriting the marker format or breaking backward compat of `parse_comments_for_output` / Process Comments regexes.
- Adding a file-tree browser or folder mode (scope remains files + tabs).
- Making web mode a full peer of Tauri for batching (only as needed to keep parity where it matters for the feature).
- New test frameworks (stick to existing tsc + bun build + limited unit tests + e2e smoke + file-review usage).

## Implementation Approach

- Treat "edit things" and "review batches" as *two vertical slices* that can be planned/implemented somewhat independently once the shared mental model is locked (but they interact at the "leftover markers" boundary).
- Build on the existing TabManager + closedFiles + submit/open_tabs + Process Comments primitives instead of inventing new persistence.
- For "batches": add a thin query/list capability (skill + CLI surface?) that surfaces files containing review markers as "pending review batches/sessions", with metadata if possible (date of last marker write?, number of comments). Re-opening uses the existing load + append paths.
- For "edit things": clarify the intent (in-GUI apply? editable comments in sidebar? direct marker editing with preview of changes?). Start with smallest possible enhancement on top of current Apply being agent-only; keep the "GUI = human feedback; agent = remediation" separation as a safe default unless Taras chooses to collapse phases.
- Follow the same discipline as the tabs v-plan: one editor instance, swap per-tab state; Rust stays the export surface.
- Use standard planning discipline: sub-agents (`task` with `codebase-locator` / `general` / `codebase-analyzer`), AskUserQuestion at each Critical gate, concrete per-phase automated checks (primarily `bun run check`, `bun run build`, smoke `file-review` usage + file-review of artifacts), file-review of the plan itself, no implementation in this session.
- If/when the work naturally splits into >4 steps or parallel vertical slices, propose converting to (or spawning) a v-plan DAG.

## Quick Verification Reference

Common commands (run from repo root unless noted):

- Typecheck: `cd file-review && bun run check`
- Build (app): `cd file-review && bun run build`
- Dev Tauri: `cd file-review && bun run dev -- <one or more .md files>`
- Dev web: `cd file-review && bun run dev:web -- <file>`
- Install local binary (for skill tests): `cd file-review && bun run install:app`
- The review skill launch contract (critical for end-to-end): `file-review "<abs path>"` under Bash tool `run_in_background: true`, `timeout: 600000`
- Lint/type for the plugin layer (if any TS in cc-plugin): relevant bun/pnpm in ai-toolbox root if needed
- End-to-end loop verification: use `/file-review:file-review <new-plan-or-research>` + Process Comments through AskUserQuestion

(Exact commands will be repeated + expanded in each phase's Automated Verification section.)

---

## Phase 1: Clarify Semantics + Current Behavior Audit (Sub-agent Validated)

### Overview

**Concrete deliverable when phase complete:** the revised "Current State Analysis" (now permanently enriched with 3 sub-agent traces + zero-drift confirmation), user-locked scope/decisions for both "edit things" + "review batches", and explicit v1 direction (live marker discovery + Process Comments polish while explicitly preserving the hard GUI/feedback vs. post-close remediation separation).

This phase is the "audit + lock" slice — it closes the research's open questions via evidence (not speculation).

### Changes Required:

#### 1. Plan document (this file)
**File**: `thoughts/taras/plans/2026-06-16-file-review-editing-and-review-batches.md` (lines 25-140 area)
**Changes**: Current State Analysis, Desired End State, What We're NOT, and Implementation Approach grown from stub → sub-agent-verified synthesis (with new actionable file:line guidance); append user decisions; Phase 1 success criteria marked done.

### Success Criteria:

#### Automated Verification:
- [x] `cd file-review && bun run check` (baseline still green throughout — sub-agents did not modify source)
- [x] `cd file-review && bun run build` (baseline still green)
- [x] No drift: `git diff e70561d..HEAD -- file-review/ cc-plugin/file-review/ cc-plugin/base/skills/file-review cc-plugin/base/commands/file-review*` produces clean (or only whitespace) on the relevant files.

#### Automated QA:
- [x] Three sub-agents (`general` + `codebase-analyzer` x2) + direct reads produced exhaustive validated maps of:
  - marker write/parse/strip/serialize (comments.ts + main.ts) and proof markers **never** reach CM doc (`editor.ts` + parseAndStrip flows)
  - the *only* apply path being post-GUI host `edit` in the Process Comments skill (cc-plugin/.../SKILL.md:156-211 + agent edit usage)
  - full TabManager/closedFiles/push/submit/export aggregation with exact sites (tabs.ts + main + lib.rs + file_ops)
  - zero prior-batch durable state + the precise on-the-fly discovery opportunity (live marker grep in skill zero-path or new thin helper)
- Citations are `file:line` heavy and reference both the original research + live code.

#### Manual Verification:
- [x] Scope + v1 direction locked via AskUserQuestion during this session (see updated Current State + living section below):
  - Both features.
  - Commit per phase: Yes (Recommended).
  - Batches v1: live marker discovery / proposal (defer sidecar decision).
  - Edit/remediation v1: keep hard separation; polish discoverability + the existing Process Comments flow.
- [ ] Taras reviews the synthesized Current State + Phase outline in this document (ideally via `/file-review:file-review` on the plan itself) and confirms the audit is sufficient to proceed to concrete phases.

**Implementation Note**: This phase's verification is largely satisfied by the sub-agent work + the AskUserQuestion answers Taras gave. Pause for final human sign-off on the plan artifact quality per Critical rule before "declaring" the phase green for any commit.

### QA Spec (optional):

None. (The sub-agent output itself serves as the enduring evidence pack. A separate `desplega:qa` doc can be spun later for end-to-end scenarios that cross the GUI + agent Process + multiple historical markers.)

---

## Phase 2: Batch Discovery (v1 Live Marker Scan + Proposal Polish)

### Overview

Deliverable: when no path (or via explicit flag/help), the skill (and optionally the binary/UI) can discover files containing active `review-*` markers in contextually relevant locations (thoughts/ trees, CWD workspace, last few session files, configurable short list) and propose them via AskUserQuestion (or GUI empty-state list + Cmd+O integration) as "pending review batches/sessions". Re-invoking `file-review` on them re-uses all existing load/append/tab/submit behavior. The existing Process Comments agents/SDKs continue to work unchanged on any file that has markers. No sidecar, no new index, no change to marker format or Rust aggregation for this minimal slice.

Concrete success: agent or human asks "what needs review?" or launches `/desplega:create-plan` etc. with no arg and sees recent + "files with pending markers from prior review sessions" as candidates; picks one (or more) and gets the normal GUI + later Process flow.

### Changes Required:

#### 1. Skill (agent entry point — primary surface for v1)
**File**: `cc-plugin/file-review/skills/file-review/SKILL.md` (and mirror under `cc-plugin/file-review/skills/file-review/SKILL.md`, plus the opencode/command variant if it duplicates proposal logic)
**Changes**:
- Extend the "If no path provided" block (SKILL ~70-77) to also run a tightly scoped discovery (e.g. `grep -l '<!--\s*review-(start|line-start)' thoughts/taras/ thoughts/shared/ . --include="*.md" 2>/dev/null | head -20` or a small helper that uses exact regexes from the skill itself).
- Present the "pending marker" set **after or alongside** the recent-plans list, using similar AskUserQuestion multi-select or "use these too" flow.
- When files are chosen, launch exactly as today: one (or batch) `file-review "abs"` bg bash 600s then Process Comments.
- Add a short "Review batches" subsection or note that this is the live interpretation of "review batches" v1 per plan; document the exact discovery command/scope so it is auditable and evolvable.
- Optional: expose a thin `process-pending` or reuse existing paths after the human selects from a "current pending markers" list.

#### 2. Command layer (thin)
**File**: `cc-plugin/file-review/commands/file-review.md` + base commands that delegate
**Changes**: Argument hint or help text addition: "When omitted, proposes recent work + files containing review markers (pending batches)."

#### 3. (Optional, small, non-blocking) Binary / GUI hint for humans
**Files**: `file-review/src/main.ts` (empty-state area ~904), `file-review/src-tauri/src/main.rs` (or just docs)
**Changes**: Either a "Scan workspace for files with review markers" button visible in empty state that does a local limited walk + load append (feeding the normal flow), **or** just document in README/shortcuts that you can `file-review $(grep -l '<!-- review-start' ...)` . Keep tiny; main v1 value is the agent-skill proposal path.

No Rust change required for v1. No new persistence. Discovery remains opportunistic and scope-limited (never a full $HOME walk).

### Success Criteria:

#### Automated Verification:
- [ ] `cd file-review && bun run check`
- [ ] `cd file-review && bun run build`
- [ ] The discovery regex/grep used in skill is identical (or a tested superset) to the extraction patterns already in SKILL.md:156-161 so it never misses what Process would find.
- [ ] `which file-review` succeeds (or the binary is in PATH) and `file-review --help` (or direct invocation with no args) exercises the documented zero-path flow in the skill.

#### Automated QA:
- [ ] Spawn the review skill (or direct the agent through `file-review` command) with "no path" on a workspace that has the current plan (which contains no markers) + plant 1-2 synthetic marker files in a subdir of thoughts; verify the AskUserQuestion surfaces the pending-marker candidates + recent plans.
- [ ] Choose one marked file; full GUI launch (bg bash contract) succeeds; Process Comments round-trips with real Ask flow + apply/ack works (markers removed if chosen).
- [ ] The discovery command itself emits only files that still have active markers at proposal time (re-parse quick check in the synthesis step of the skill).

#### Manual Verification:
- [ ] Human review of the skill change (or the agent proposing a file with markers from a prior batch) feels natural and does not spam irrelevant files.
- [ ] `/file-review:file-review` on the updated skill file + plan succeeds; comments processed cleanly.

**Implementation Note**: After verification, create commit (because user chose "Yes (Recommended)").

---

## Phase 3: Polish Process Comments for Review Batches + Better Remediation UX

### Overview

Deliverable: the post-GUI "Process Comments" flow (the canonical place humans/agents do the "edit things" addressed by markers) is improved for the reality of batches: when multiple files with markers from one or more prior sessions are chosen together, the agent experience groups/presents context (original snippet + feedback + perhaps "this came from review session X"), makes Apply safe+reviewable (diff preview) and summarizable. Even single-file flows get richer surrounding context and decision help. All changes remain inside the skill layer + use the existing host editor tools; no change to marker storage, GUI separation, or binary.

### Changes Required:

#### 1. Skill
**File**: `cc-plugin/*/skills/file-review/SKILL.md` (canonical + mirrors) + thin process-*.md commands if they need annotation.
**Changes**:
- In the Process Comments loop: collect comments across chosen files first, then present grouped.
- For each marker, supply more surrounding lines (configurable context) in the AskUserQuestion description.
- When "Apply edit" chosen: before the final host edit, show a crisp unified diff (old marked span → proposed remediation) and get explicit OK (or default for trivial cases).
- Optional: if the proposal tool context includes prior session info (from Phase 2 discovery), surface "N markers from the same batch" hints.
- Final summary enhanced to list files touched + per-file apply/ack/skip counts.
- Keep full example outputs up to date.

#### 2. Possibly small helper utilities (optional)
Extract or improve the "parse all markers with context" logic into a tiny reusable utility referenced by the skill (DRY with the existing inline regexes).

No binary changes.

### Success Criteria:

#### Automated Verification:
- [ ] `cd file-review && bun run check && cd .. && bun run build` (for plugin if any) or just the skill files are markdown + validated via file-review itself.

#### Automated QA:
- [ ] End-to-end: use the v1 discovery path (Phase 2) to surface 2+ files that have markers (plant them as part of test), run the Process Comments flow on the set, exercise "Apply" on one (verified host edit + strip), "Acknowledge" on another, produce final summary. Screenshot or captured Ask history + resulting clean file content constitutes the QA artifact.
- [ ] The AskUserQuestion uses proper ask-user skill formatting (headers, 1-5 word labels + descriptions, recommended first).

#### Manual Verification:
- [ ] The richer context and diff proposals make the remediation step feel obviously better than before; no accidental destructive applies.
- [ ] `/file-review:file-review` on the skill after edits + process the comments.

**Implementation Note**: Commit after explicit verification.

---

## Phase 4: Integration, Cross-Cutting QA, Docs, Handoff + File-Review of Plan Itself

### Overview

Deliverable: the full loop (new discovery surfaces + polished Process) has been used on this very plan + supporting artifacts; any review comments collected during planning are processed; docs/README/shortcuts updated with the new capabilities; QA evidence pack (including any `desplega:qa` scenarios if generated) is written; the plan is marked complete per the Haiku structural validator + file-review pass; explicit handoff instruction for a fresh `/desplega:implement-plan` session is emitted.

### Changes Required:

#### 1. This plan
**File**: `thoughts/taras/plans/2026-06-16-file-review-editing-and-review-batches.md`
**Changes**: Fill every remaining checkbox; update living status; append any final derail notes / follow-ups. Add explicit "Manual E2E" commands at bottom per global planning guidelines.

#### 2. Agent docs & skill self-description
**Files**: `cc-plugin/file-review/skills/file-review/SKILL.md` (and file-review subdir mirror), relevant command .md files, possibly top-level README in file-review/, and any "how to use as agent" section.
**Changes**: Document the new zero-path "includes pending review markers / batches" behavior + the improved Process experience. Mention limited-scope live scan (exact command or logic location) and that it is the v1 realization of the research request.

#### 3. Optional: cross-refs in other base skills
Many interactive skills hardcode "after major work, do /file-review + process-review". Add a one-line nudge about the new discovery if the agent ever invokes file-review with no argument.

#### 4. Evidence
- Run `/file-review:file-review <this-plan.md>` (or equivalent) per rule.
- Process any comments collected.
- Optionally produce a small `thoughts/taras/qa/2026-06-16-file-review-batches.md` via `desplega:qa` if the feature warrants separate scenario doc (decide via Ask at end of phase 3/4).

### Success Criteria:

#### Automated Verification:
- [ ] All prior checks still green.
- [ ] Haiku sub-agent reports the plan passes structural rules: every phase has Overview + the three Success Criteria buckets (Automated Verification commands are runnable, Automated QA uses agent tools, Manual is truly human-only), `- [ ]` items, paths exist and are cited with file:line.
- [ ] The plan file itself and the touched skills receive successful file-review + process-review (markers removed per "Acknowledge" or "Apply").

#### Automated QA:
- [ ] End-to-end agent usage demo recorded (step by step in plan or as thought update): no-path proposal of a marker-bearing plan, GUI review + comments, auto-notify with stdout, Process Comments with richer prompts + verified safe applies, final cleaned file.
- [ ] `/desplega:implement-plan` handoff text is present and accurate.

#### Manual Verification:
- [ ] Taras walks the final plan (or has file-review comments processed) and agrees "this is the correct v1 scope given the research."
- [ ] "Plan ready. What's next?" AskUserQuestion per rule 10.

**Implementation Note**: Final commits + handoff only after all manual verifications (including the file-review of the plan) have green checks.

---

## Appendix

- **Follow-up plans**:
  - Sidecar / durable named review batches + metadata / history UI (when the "defer" decision is revisited).
  - In-GUI remediation affordances or a collapsed one-phase model (explicitly out for this plan per user choice; can be a later breaking rethink).
  - Web multi-file parity for submit + close aggregation (mentioned but deprioritized).
  - Richer tests around export aggregation + multi batch scenarios.
- **Derail notes**:
  - The sub-agent work confirmed that the marker format + two-phase separation is a very strong invariant; any future "edit things" that wants to move apply inside the GUI will be a bigger architectural shift than a simple feature add.
  - Live-marker discovery is intentionally cheap/opportunistic — scope the walk at planning/implementation time to avoid perf or privacy surprises.
- **References**:
  - Primary research: `thoughts/taras/research/2026-06-16-file-review-editing-and-review-batches.md`
  - Sub-agent evidence pack: the three task result blobs captured in this planning session (general for discovery + two codebase-analyzer for apply-path + session machinery).
  - Previous file-review: `thoughts/taras/plans/2026-04-28-file-review-tabs-mermaid/{root,step-*.md}` (origin of TabManager/closed/submit), `thoughts/taras/plans/2026-02-05-file-review-unified-skill.md`, older shared plans.
  - Core code locations: exhaustive lists and maps in the three sub-agent outputs above + the research appendix table.
  - Skill/command sources: `~/.agents/skills/file-review/SKILL.md`, `cc-plugin/file-review/skills/file-review/SKILL.md`, `cc-plugin/base/commands/create-plan.md` (thin wrapper behavior) and siblings, `cc-plugin/file-review/commands/*`.

## Planning Status & Next (living section)

- [x] Setup complete (autonomy: `critical` from frontmatter of input research; scope "both features" locked).
- [x] Commit preference: "Yes (Recommended)" recorded via AskUserQuestion.
- [x] Batches storage policy: "defer (implement v1 as live/on-demand marker discovery)" chosen.
- [x] Remediation policy: "keep hard separation + polish existing Process Comments path" chosen.
- [x] Scaffold written + Current State Analysis replaced with sub-agent validated synthesis.
- [x] Phase 1 (audit + semantics lock) success criteria satisfied by the sub-agents + Ask answers; ready for final human sign-off.
- [ ] Phase 2 (live batch discovery) + Phase 3 (Process polish) detailed + ready for impl.
- [ ] Phase 4 (integration + handoff) ready.
- Current step: Critical planning loop — sub-agents completed and synthesized; questions asked and answered; plan body updated. Next: validate structure (Haiku sub-agent), open `file-review` on this plan file for comments, process them, final Ask "Plan ready. What's next?", then explicit handoff instruction.
- Target (unchanged): file-review-reviewed, Haiku-validated, commit-ready plan handed off for fresh `/desplega:implement-plan <path>` in a new session. No implementation here.

**Next actions in this session (Critical):**
1. (Done) Haiku validation sub-agent run (see separate result; fixes applied in this edit pass).
2. (Active) Bash `file-review` on the plan path running in background (per exact launch contract + 600s timeout). GUI must be closed by Taras for stdout (formatted review comments) to arrive; on notification we will Process Comments.
3. Final "Plan ready. What's next?" AskUserQuestion (rule 10).
4. Emit the fresh-session handoff verbatim + stop. No implementation.

Open a new Claude Code session and run `/desplega:implement-plan thoughts/taras/plans/2026-06-16-file-review-editing-and-review-batches.md`. Starting fresh keeps the implementation context clean.
