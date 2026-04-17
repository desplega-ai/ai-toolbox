---
date: 2026-04-17T00:00:00Z
author: Taras
topic: "script-builder skill for cc-plugin/base"
tags: [plan, cc-plugin, base, skill, scripts, qa, testing]
status: completed
git_commit: f4f814f1d6e7676c019bb92cdfd91eeb0e7a5ec0
source_brainstorm: thoughts/taras/brainstorms/2026-04-16-script-builder-skill.md
last_updated: 2026-04-17
last_updated_by: Taras
---

# script-builder Skill — Implementation Plan

## Overview

Add a new `script-builder` skill to `cc-plugin/base/skills/` that converts testing/validation intent into durable, re-runnable scripts committed to the target project's `scripts/` directory. The skill is human-first (direct `/script-builder` use) and sub-skill-capable (callable from `planning`, `qa`, `verifying`), supports TypeScript/Python/Bash with auto-detection, enforces a context-optimal PASS/FAIL + `/tmp` log output convention, scans for existing scripts to dedup, and auto-edits target `CLAUDE.md`/`AGENTS.md` with `<important if="...">` discovery blocks.

## Current State Analysis

`cc-plugin/base/` hosts 11 skills today (`brainstorming`, `planning`, `researching`, `implementing`, `reviewing`, `verifying`, `qa`, `questioning`, `learning`, `tdd-planning`, `phase-running`). Each skill lives at `cc-plugin/base/skills/<name>/SKILL.md` (+ optional `template.md`) and is fronted by a thin wrapper at `cc-plugin/base/commands/<name>.md`. The gap: no skill today **generates** a committed, re-runnable validation script — `qa` (`cc-plugin/base/skills/qa/SKILL.md:97-119`) can execute ad-hoc verification, `verifying` (`cc-plugin/base/skills/verifying/SKILL.md:100-111`) re-runs plan-defined commands, and `planning` writes `#### Automated Verification:` checkboxes that reference commands or scripts that may not yet exist.

### Key Discoveries:

- **Skill layout convention**: `SKILL.md` with `name`/`description` frontmatter; optional sibling `template.md` for persisted artifacts (e.g., `cc-plugin/base/skills/brainstorming/template.md:1-39`, `cc-plugin/base/skills/qa/template.md:1-74`).
- **Command wrapper convention**: YAML frontmatter (`description`, `model: inherit`, `argument-hint`) + "Parse autonomy → invoke skill" body (`cc-plugin/base/commands/brainstorm.md:1-33`, `cc-plugin/base/commands/qa.md:1-33`).
- **Sibling integration pattern**: `**OPTIONAL SUB-SKILL:** desplega:<skill>` callouts placed inline in process steps (see `desplega:learning` usage in `cc-plugin/base/skills/brainstorming/SKILL.md:131-133`, `qa/SKILL.md:173-175`, `verifying/SKILL.md:140-143`, `planning/SKILL.md:194-197`).
- **`<important if="...">` reference pattern**: agent-swarm's `CLAUDE.md` uses ~17 such blocks to route agents toward relevant sections, each keyed on an intent phrase (`agent-swarm/CLAUDE.md:39,72,113,131,221,265` etc.). Script-builder will emit one block per generated script.
- **Reference script shape**: agent-swarm `scripts/e2e-workflow-test.ts:1-21` shows the expected header-comment + PASS/FAIL counter pattern. Mix of `.ts` (Bun), `.sh`, `.sql`, and `.ts` Docker-driven tests coexist.
- **Plugin manifest location**: `cc-plugin/base/.claude-plugin/plugin.json` (currently `1.11.1`). New-skill addition = minor bump to `1.12.0`. No marketplace manifest change needed (new plugin would require editing `.claude-plugin/marketplace.json:10-56`, but we're adding to an existing plugin).
- **Success Criteria mandate**: every phase in this plan must have `### Success Criteria:` with `#### Automated Verification:` and `#### Manual Verification:` subsections, per `cc-plugin/base/skills/planning/SKILL.md:232-276`.

## Desired End State

A new `cc-plugin/base/skills/script-builder/` exists with a complete `SKILL.md`, `templates/` subdir for TS/Python/Bash, and a `cc-plugin/base/commands/script-builder.md` wrapper. Invoking `/script-builder` (or `desplega:script-builder` as a sub-skill) drives an interactive flow that:

1. Auto-detects mode (retrospective from session history vs forward-declared from requirements Q&A)
2. Scans the target project's `scripts/` for overlap, proposing reuse/extend before generating new
3. Auto-detects language (TS/Python/Bash) from repo signals, shows the detected choice, allows override
4. Drafts the script from a template with the mandatory PASS/FAIL + `/tmp` log convention
5. Syntax/type-checks the generated script
6. Auto-edits `CLAUDE.md`/`AGENTS.md` with an idempotent `<important if="...">` discovery block
7. Offers opt-in escalation to run + iterate with human-approved fixes on each failure

`planning`, `qa`, and `verifying` SKILL.md files gain `**OPTIONAL SUB-SKILL:** desplega:script-builder` callouts at the right points in their flows. `cc-plugin/base/.claude-plugin/plugin.json` version bumps to `1.12.0` and `cc-plugin/base/README.md` lists the new skill + command.

Verify by: (a) listing files in the new skill directory, (b) invoking `/script-builder` in a test project and confirming end-to-end flow, (c) confirming sibling-skill references grep cleanly.

## Quick Verification Reference

Common commands to verify the implementation:
- List skill structure: `ls cc-plugin/base/skills/script-builder/`
- List templates: `ls cc-plugin/base/skills/script-builder/templates/`
- Grep sibling refs: `grep -rn "desplega:script-builder" cc-plugin/base/skills/`
- Verify plugin version: `cat cc-plugin/base/.claude-plugin/plugin.json | grep version`
- Verify command wrapper: `ls cc-plugin/base/commands/script-builder.md`

Key files to check:
- `cc-plugin/base/skills/script-builder/SKILL.md` (primary artifact)
- `cc-plugin/base/skills/script-builder/templates/{typescript.ts.tmpl,python.py.tmpl,bash.sh.tmpl}`
- `cc-plugin/base/commands/script-builder.md`
- `cc-plugin/base/skills/{planning,qa,verifying}/SKILL.md` (integration edits)
- `cc-plugin/base/.claude-plugin/plugin.json` (version bump)
- `cc-plugin/base/README.md` (skills/commands tables)

## What We're NOT Doing

- **Not** touching the marketplace manifest (`.claude-plugin/marketplace.json`) — this is a new skill inside an existing plugin, not a new plugin.
- **Not** adding a `--list` / registry view across projects — rejected in brainstorm as post-v1.
- **Not** auto-staging or auto-committing generated scripts or CLAUDE.md edits — leave unstaged, show diff, user commits (per brainstorm open-question resolution).
- **Not** adding CI-integration offers (propose adding scripts to a CI job) — out of scope for v1.
- **Not** enforcing a strict output-shape validator on generated scripts — the convention is a template, not a checked contract.
- **Not** hardcoding a retry limit on escalation/iterate mode — the human is the implicit bound.
- **Not** supporting languages beyond TypeScript, Python, Bash in v1 (Rust/Go/etc. fall back to bash).
- **Not** building a separate `scripts/INDEX.md` registry file — CLAUDE.md `<important if>` blocks are the registry.

### Abort Semantics

When the user picks "Stop" at any AskUserQuestion gate (syntax-check failure in Step 6, iterate-loop failure in Step 9, etc.):
- **Leave the generated script in place** at its final path; do not delete.
- **Leave the CLAUDE.md / AGENTS.md edit in place** if already applied (Step 7 has typically already run by this point).
- **Print a one-line note** with both paths so the user can manually continue, edit, or `git checkout` to discard.
- Do not `git restore` or otherwise revert on the user's behalf.

### Scripts-Dir Config Persistence

First-time resolution: the skill reads the target project's `CLAUDE.md` for a `<!-- script-builder:dir=<path> -->` marker. If found, that's the scripts dir. If not, default to `scripts/` if it exists, otherwise ask via AskUserQuestion (`scripts/ (Recommended) | custom path | skip dir persistence for this run`). On the first successful generation for a project (see Phase 4 Step 7), the marker is added to `CLAUDE.md` so subsequent runs are silent. Rationale: brainstorm leaned toward CLAUDE.md marker because it lives with the docs that already guide agents — no separate config file to discover.

## Implementation Approach

Six incremental phases, each independently verifiable:

1. **Scaffold + wrapper** — create the skill directory with a minimal SKILL.md skeleton and the `/script-builder` command wrapper so the skill is discoverable.
2. **Language templates** — add TS/Python/Bash templates implementing the PASS/FAIL + `/tmp` log convention.
3. **Core process steps** — flesh out SKILL.md with mode detection, dedup scan, intent gathering, language detection, draft, syntax-check.
4. **Doc auto-edit + escalation** — add the CLAUDE.md/AGENTS.md `<important if>` block logic and the opt-in run-iterate loop.
5. **Sibling skill integration** — add `**OPTIONAL SUB-SKILL:**` callouts to `planning`, `qa`, `verifying`.
6. **Version + README** — bump plugin version and update the plugin README.

Phases 1 and 2 are independent; 3 depends on 2 (templates must exist to be referenced); 4 depends on 3; 5 and 6 are independent of each other and the skill body, so can go last in any order.

---

## Phase 1: Skill scaffold + slash command wrapper

### Overview

Create the skill directory with a minimal `SKILL.md` (frontmatter + working agreement + when-to-use + autonomy mode + stub process steps) and the `cc-plugin/base/commands/script-builder.md` wrapper. Goal: the skill is discoverable and invocable, even if it only echoes "not yet implemented" for now.

### Changes Required:

#### 1. Create skill directory + minimal SKILL.md
**File**: `cc-plugin/base/skills/script-builder/SKILL.md`
**Changes**: New file. Frontmatter: `name: script-builder`, `description: Generate durable, re-runnable validation scripts from testing intent. Supports TypeScript, Python, Bash with auto-detection, enforces context-optimal PASS/FAIL + /tmp log output, and auto-documents scripts in CLAUDE.md.`. Body mirrors the sibling skill structure (Working Agreement, When to Use, Autonomy Mode table with Autopilot/Critical/Verbose, stub Process Steps heading). Include `<!-- FILLED IN LATER PHASES -->` markers where deeper logic is added.

#### 2. Create slash command wrapper
**File**: `cc-plugin/base/commands/script-builder.md`
**Changes**: New file. Frontmatter `description`, `model: inherit`, `argument-hint: [--autonomy=MODE] [intent]`. Body follows the `/brainstorm` pattern (`cc-plugin/base/commands/brainstorm.md:1-33`): parse `--autonomy=autopilot|critical|verbose` flag, default to Critical, invoke `desplega:script-builder` skill with the intent.

### Success Criteria:

#### Automated Verification:
- [x] Skill directory exists: `ls cc-plugin/base/skills/script-builder/SKILL.md`
- [x] Command wrapper exists: `ls cc-plugin/base/commands/script-builder.md`
- [x] SKILL.md has `name: script-builder` frontmatter: `grep -n "^name: script-builder" cc-plugin/base/skills/script-builder/SKILL.md`
- [x] SKILL.md has Autonomy Mode section: `grep -n "## Autonomy Mode" cc-plugin/base/skills/script-builder/SKILL.md`
- [x] Command wrapper invokes the skill: `grep -n "desplega:script-builder" cc-plugin/base/commands/script-builder.md`

#### Manual Verification:
- [ ] In a fresh Claude Code session, `/script-builder` is listed as an available command.
- [ ] Invoking `/script-builder test intent` routes to the skill (even if the skill body is stub).
- [ ] SKILL.md reads cleanly top-to-bottom, matching the structural shape of `cc-plugin/base/skills/qa/SKILL.md`.

**Implementation Note**: After completing this phase, pause for manual confirmation. If commit-per-phase was requested, create a commit after verification passes.

---

## Phase 2: Language templates

### Overview

Add `cc-plugin/base/skills/script-builder/templates/` with TypeScript (Bun-first, Node-fallback-aware), Python (uv-first, vanilla-fallback-aware), and Bash templates. Each template enforces the **context-optimal output** convention: minimal stdout (one PASS/FAIL line + `/tmp` log path), full verbose output redirected to `/tmp/<script-name>-<YYYYMMDD-HHMMSS>.log`, exit 0 on success and non-zero on failure, support for `--help`, `--verbose`, and `--json` flags, and a top-of-file header comment documenting what the script tests, when to run it, required env vars, and example invocations.

### Changes Required:

#### 1. TypeScript template
**File**: `cc-plugin/base/skills/script-builder/templates/typescript.ts.tmpl`
**Changes**: New file. Shebang `#!/usr/bin/env bun` (with a comment noting Node fallback). Header comment placeholder with `{{WHAT}}`, `{{WHEN}}`, `{{ENV}}`, `{{EXAMPLE}}` substitution markers. Arg parser for `--help`, `--verbose`, `--json`. Log path: `/tmp/{{SCRIPT_NAME}}-$(date +%Y%m%d-%H%M%S).log`. PASS/FAIL summary function that prints one line + log path. Body contains a `{{TEST_BODY}}` marker where the skill substitutes the generated test logic. Model the structure after `agent-swarm/scripts/e2e-workflow-test.ts:1-60`.

#### 2. Python template
**File**: `cc-plugin/base/skills/script-builder/templates/python.py.tmpl`
**Changes**: New file. Shebang `#!/usr/bin/env python3`. The `# /// script` uv inline metadata block is a `{{UV_METADATA}}` marker that the skill **substitutes only when the Python/uv detection signal fired** (i.e., `uv.lock` or uv-configured `pyproject.toml` was present); for vanilla Python projects the skill substitutes an empty string so the block is omitted. Header comment with same substitution markers. `argparse`-based `--help`/`--verbose`/`--json`. `/tmp` log redirection via a `TeeLogger` class (stdout/stderr dual-write). PASS/FAIL summary. `sys.exit(0 | 1)`. Body `{{TEST_BODY}}` marker.

#### 3. Bash template
**File**: `cc-plugin/base/skills/script-builder/templates/bash.sh.tmpl`
**Changes**: New file. Shebang `#!/usr/bin/env bash` + `set -euo pipefail`. Header comment block. `getopts`-based `--help`/`--verbose`. `LOG_FILE="/tmp/{{SCRIPT_NAME}}-$(date +%Y%m%d-%H%M%S).log"`. Redirect verbose output via `exec` or `tee`. Trap EXIT for cleanup. PASS/FAIL echo + log path. Exit codes 0/1. Body `{{TEST_BODY}}` marker.

#### 4. Templates README (optional, light)
**File**: `cc-plugin/base/skills/script-builder/templates/README.md`
**Changes**: New file. One-paragraph description of the substitution markers (`{{WHAT}}`, `{{WHEN}}`, `{{ENV}}`, `{{EXAMPLE}}`, `{{SCRIPT_NAME}}`, `{{TEST_BODY}}`) and the output-shape contract (PASS/FAIL + `/tmp` log). This is how the skill itself (and humans) find the conventions fast.

### Success Criteria:

#### Automated Verification:
- [x] Templates directory exists: `ls cc-plugin/base/skills/script-builder/templates/`
- [x] All three template files exist: `ls cc-plugin/base/skills/script-builder/templates/typescript.ts.tmpl cc-plugin/base/skills/script-builder/templates/python.py.tmpl cc-plugin/base/skills/script-builder/templates/bash.sh.tmpl`
- [x] Each template has required substitution markers: `grep -l "{{SCRIPT_NAME}}" cc-plugin/base/skills/script-builder/templates/*.tmpl` returns all three
- [x] Each template references `/tmp/.*\.log`: `grep -l "/tmp/" cc-plugin/base/skills/script-builder/templates/*.tmpl` returns all three
- [x] Each template has `--help` flag handling: `grep -l -E "(--help|help)" cc-plugin/base/skills/script-builder/templates/*.tmpl` returns all three
- [x] Bash template has `set -euo pipefail`: `grep -n "set -euo pipefail" cc-plugin/base/skills/script-builder/templates/bash.sh.tmpl`

#### Manual Verification:
- [ ] Copy each template to a scratch file with **all markers filled** — use a trivial `{{TEST_BODY}}` (e.g., `console.log('hello')` for TS, `print('hello')` for Python, `echo 'hello'` for Bash); `{{SCRIPT_NAME}}=scratch`; `{{WHAT}}/{{WHEN}}/{{ENV}}/{{EXAMPLE}}` with placeholder strings; `{{UV_METADATA}}` empty for Python. Run each scratch and confirm: (a) only one PASS line prints to stdout by default, (b) full output lands in `/tmp/scratch-*.log`, (c) `--verbose` streams the full log to stdout, (d) exit code is 0; then replace the trivial body with `exit 1` / `raise SystemExit(1)` / `process.exit(1)` and re-run to confirm the FAIL line and non-zero exit.
- [ ] Header comments are readable standalone (I could hand the file to a fresh agent and they'd know what it does and when to run it).

**Implementation Note**: After completing this phase, pause for manual confirmation. If commit-per-phase was requested, create a commit after verification passes.

---

## Phase 3: Core process steps (detection, dedup, draft, syntax-check)

### Overview

Flesh out `SKILL.md`'s Process Steps section with the core flow: mode detection (retrospective vs forward-declared), scripts/ dedup scan, intent gathering Q&A, language detection, draft generation, syntax/type-check. This is where the skill becomes functional end-to-end for the default (non-escalated) tier.

### Changes Required:

#### 1. Add Step 1: Mode detection
**File**: `cc-plugin/base/skills/script-builder/SKILL.md`
**Changes**: Add `### Step 1: Detect Mode (Retrospective vs Forward-Declared)` section. Document the heuristics: (a) scan recent session tool-use history for test/validation-shaped activity (curl, bun/python run, db query, qa-use browser actions) — if present, assume retrospective; (b) parse the user's invocation message for narrative cues ("we just figured out", "turn this into") vs intent cues ("I want to test", "validate"); (c) fallback to forward-declared when ambiguous. Spell out: retrospective mode's first action is "summarize what I saw, ask user to confirm"; forward mode's first action is requirements Q&A. Do NOT ask "which mode?" — silent detection.

#### 2. Add Step 2: Dedup scan
**File**: `cc-plugin/base/skills/script-builder/SKILL.md`
**Changes**: Add `### Step 2: Scan Existing Scripts for Overlap` section. Document: (a) **Resolve scripts dir** per the "Scripts-Dir Config Persistence" rules above (CLAUDE.md marker → `scripts/` default → AskUserQuestion); (b) **Edge case — dir absent**: if the resolved path doesn't exist, skip the dedup scan entirely, print a one-line note to the user ("No existing scripts directory at `<path>` — proceeding to intent gathering"), and optionally offer to create it before Step 5; (c) read the dir, extract header comments, file-name tokens, and CLAUDE.md `<important if>` trigger phrases; (d) fuzzy-match against current intent; (e) if ≥1 plausible match, use AskUserQuestion with options `Reuse as-is | Extend existing | Generate new anyway`. Explicitly: never silently skip dedup on borderline matches — surface and let the user decide. "Extend" branch appends a sub-command/flag to the existing script instead of creating a new file.

#### 3. Add Step 3: Gather intent
**File**: `cc-plugin/base/skills/script-builder/SKILL.md`
**Changes**: Add `### Step 3: Gather Intent` section. **Forward mode**: Q&A for "what am I testing?", "success signal?", "failure signal?", "inputs/outputs?", "required env?". **Retrospective mode**: summarize the observed session activity back to the user via text; use AskUserQuestion to confirm: `That's the flow | Close but fix X | Start over`. Both modes converge on the same internal intent structure.

#### 4. Add Step 4: Detect language + runner
**File**: `cc-plugin/base/skills/script-builder/SKILL.md`
**Changes**: Add `### Step 4: Detect Language` section. Priority order: `package.json`+`tsconfig.json` → TypeScript (Bun if `bun.lock`/`bunfig.toml` present, else `tsx`, else compiled Node); `pyproject.toml`/`uv.lock`/`requirements.txt` → Python (uv if uv-configured, else `python3`); both present → dominant source-directory count wins with AskUserQuestion tiebreaker; `Cargo.toml`/`go.mod` → fall back to bash; nothing detected → bash. Task-driven override: if the intent is clearly shell-y ("check 3 docker containers respond"), propose bash even in a TS project. Use AskUserQuestion to confirm detected language with the detected option first (Recommended).

#### 5. Add Step 5: Draft from template
**File**: `cc-plugin/base/skills/script-builder/SKILL.md`
**Changes**: Add `### Step 5: Draft the Script` section. Document: (a) pick template by language; (b) resolve substitution markers (`{{WHAT}}`, `{{WHEN}}`, `{{ENV}}`, `{{EXAMPLE}}`, `{{SCRIPT_NAME}}`); (c) generate `{{TEST_BODY}}` from gathered intent; (d) write to configured scripts dir with a conventional file name using the prefix table below (advisory, not enforced — skill proposes a name matching the intent shape, user can override).

Include this naming-conventions mini-table literally in the SKILL.md body:

| Prefix | When | Example |
|--------|------|---------|
| `e2e-*` | End-to-end flows across multiple components | `e2e-auth-flow.ts` |
| `check-*` | Idempotent single-probe verifications | `check-db-boundary.sh` |
| `smoke-*` | Minimal-viability post-deploy checks | `smoke-prod-api.ts` |
| `measure-*` | Performance / size / token measurements | `measure-tool-tokens.ts` |
| `seed-*` / `generate-*` | Data seeding or artifact generation (rare for validation) | `seed-api-keys.sh` |

If the intent doesn't match any prefix cleanly, propose a free-form name (e.g., `validate-<area>.ts`).

#### 6. Add Step 6: Syntax/type-check
**File**: `cc-plugin/base/skills/script-builder/SKILL.md`
**Changes**: Add `### Step 6: Syntax/Type-Check` section. Run the appropriate checker: TS → `bunx tsc --noEmit <file>` (or `npx tsc --noEmit` if Bun absent); Python → `python3 -m py_compile <file>` + `ruff check <file>` if available; Bash → `shellcheck <file>` if available, else `bash -n <file>`. On failure: show the error, propose a concrete fix, use AskUserQuestion `Apply fix | Investigate | Stop`. On success: proceed to Phase 4's doc-edit step.

### Success Criteria:

#### Automated Verification:
- [x] SKILL.md has all six core steps: `grep -nE "^### Step [1-6]:" cc-plugin/base/skills/script-builder/SKILL.md | wc -l` equals 6
- [x] Mode detection documented: `grep -n "Retrospective" cc-plugin/base/skills/script-builder/SKILL.md`
- [x] Dedup scan documented: `grep -nE "(Dedup|Existing Scripts)" cc-plugin/base/skills/script-builder/SKILL.md`
- [x] Language detection priority list present: `grep -n "bun.lock" cc-plugin/base/skills/script-builder/SKILL.md`
- [x] Template marker references are in SKILL.md: `grep -n "{{TEST_BODY}}" cc-plugin/base/skills/script-builder/SKILL.md`
- [x] SKILL.md references AskUserQuestion in at least 3 places: `grep -c "AskUserQuestion" cc-plugin/base/skills/script-builder/SKILL.md` returns ≥3

#### Manual Verification:
- [ ] In a TypeScript project with `bun.lock`, invoke `/script-builder test the auth endpoint` and confirm: (a) language is detected as TypeScript (Bun), (b) scripts dir is scanned for overlap, (c) draft is produced using `typescript.ts.tmpl`, (d) syntax check runs.
- [ ] In a Python project with `uv.lock`, invoke `/script-builder validate ingestion pipeline` and confirm Python (uv) flow.
- [ ] In a project with no recent session activity and a narrative prompt ("we just verified the webhook works, turn that into a script"), confirm retrospective mode triggers and the skill summarizes back before drafting.
- [ ] In the same project, invoke with a forward intent ("I want to test the webhook signature validation") and confirm forward mode triggers with Q&A.
- [ ] With a scripts dir containing a fuzzy-matching script, confirm the dedup gate surfaces the match and offers reuse/extend/new-anyway.

**Implementation Note**: After completing this phase, pause for manual confirmation. If commit-per-phase was requested, create a commit after verification passes.

### QA Spec (optional):

**Approach:** manual | cli-verification
**Test Scenarios:**
- [ ] TC-3.1: Language auto-detect — TypeScript/Bun
  - Steps: Run `/script-builder <intent>` in a project with `package.json`+`tsconfig.json`+`bun.lock`.
  - Expected: Detected language is TypeScript (Bun). Draft uses `typescript.ts.tmpl`.
- [ ] TC-3.2: Language auto-detect — Python/uv
  - Steps: Run `/script-builder <intent>` in a project with `pyproject.toml`+`uv.lock`.
  - Expected: Detected language is Python (uv). Draft uses `python.py.tmpl`.
- [ ] TC-3.3: Retrospective mode
  - Steps: In a session where the agent just ran a series of curl/db commands that validated something, invoke `/script-builder turn this into a script`.
  - Expected: Skill summarizes what it saw, asks for confirmation, does NOT run forward Q&A.
- [ ] TC-3.4: Dedup surface
  - Steps: With `scripts/e2e-auth.ts` present, invoke `/script-builder test the auth flow`.
  - Expected: Skill surfaces the match and offers reuse/extend/new.

---

## Phase 4: CLAUDE.md / AGENTS.md auto-edit + escalation mode

### Overview

Add the two remaining core steps to `SKILL.md`: (a) auto-editing the target project's `CLAUDE.md` and/or `AGENTS.md` with an idempotent `<important if="...">` block describing how and when to run the generated script; (b) the opt-in escalation tier that runs the script and iterates (run → report → propose fix → AskUserQuestion → loop) with no blind auto-fix.

### Changes Required:

#### 1. Add Step 7: Auto-edit CLAUDE.md / AGENTS.md
**File**: `cc-plugin/base/skills/script-builder/SKILL.md`
**Changes**: Add `### Step 7: Document the Script` section. Document the block template (literal markdown inside a fenced code block inside SKILL.md):

```
<important if="[TRIGGER: e.g., you are testing the auth flow]">

## [Area] validation

Run `scripts/<name>` to [one-liner]. Requires [env/deps]. Example: `<cmd>`. Full log at `/tmp/<name>-*.log`.

Generated/maintained via `/script-builder`.

</important>
```

Document behavior: (a) edit both `CLAUDE.md` and `AGENTS.md` if both exist; edit only what exists; never create either from scratch; (b) placement heuristic: find the first existing testing/validation section header and append there, otherwise add a new `## Scripts for testing & validation` section near the end but before any license/meta sections; (c) idempotency: if a block with the same `scripts/<name>` path already exists, update it in place instead of appending; (d) after the edit, run `git diff <file>` (or equivalent) and print a short summary to the user; (e) never auto-stage — user commits.

#### 2. Add Step 8: Offer Escalation
**File**: `cc-plugin/base/skills/script-builder/SKILL.md`
**Changes**: Add `### Step 8: Offer Escalation` section. After the doc edit, use AskUserQuestion: `Want me to run it now to confirm it works? | I'll run it myself later | Just generate, don't run`. Autopilot behavior: auto-escalate to running; Critical: ask at the tier boundary; Verbose: ask earlier (per step).

#### 3. Add Step 9: Iterate Loop (escalated tier)
**File**: `cc-plugin/base/skills/script-builder/SKILL.md`
**Changes**: Add `### Step 9: Iterate on Failures (Escalated Tier Only)` section. Document the loop: (1) run the script, capture exit code + `tail` of the `/tmp` log; (2) if pass, report PASS and exit; (3) if fail, summarize in 1–3 lines (error class + likely cause from grepping the log for common error signatures); (4) propose a concrete diff (the exact edit the skill would apply); (5) AskUserQuestion `Apply fix | Investigate differently | Stop`; (6) on Apply, edit the script and loop back to (1). No hardcoded retry cap — the human is the bound. Note: side-effects (API calls, prod-adjacent systems, cost) should be flagged before the first run.

#### 4. Add Step 10: Handoff
**File**: `cc-plugin/base/skills/script-builder/SKILL.md`
**Changes**: Add final `### Step 10: Handoff` section. If invoked as a sub-skill, return control with the script path + PASS/FAIL status. If invoked directly, use AskUserQuestion: `Run it with /qa | Run /verify-plan | Commit the script and doc changes | Done`.

### Success Criteria:

#### Automated Verification:
- [x] SKILL.md has Steps 7-10: `grep -nE "^### Step (7|8|9|10):" cc-plugin/base/skills/script-builder/SKILL.md | wc -l` equals 4
- [x] Block template present in SKILL.md: `grep -n "<important if=" cc-plugin/base/skills/script-builder/SKILL.md`
- [x] Idempotency documented: `grep -n "idempot" cc-plugin/base/skills/script-builder/SKILL.md`
- [x] Iterate loop structure present: `grep -nE "(Apply fix|propose a concrete diff)" cc-plugin/base/skills/script-builder/SKILL.md`
- [x] Escalation/autonomy wiring mentioned: `grep -n "Autopilot" cc-plugin/base/skills/script-builder/SKILL.md`

#### Manual Verification:
- [ ] Generate a script in a test project with only `CLAUDE.md` (no `AGENTS.md`). Confirm: (a) only CLAUDE.md is edited, (b) the `<important if>` block lands under an existing testing section if one exists, or in a new "Scripts for testing & validation" section otherwise, (c) `git diff` shows the insertion, (d) nothing is auto-staged.
- [ ] Re-run the skill with the same script name. Confirm the existing block is updated in place (not duplicated).
- [ ] In a project with both `CLAUDE.md` and `AGENTS.md`, confirm both are edited.
- [ ] Escalation path: generate a deliberately-broken script, accept "Run it now", confirm: (a) FAIL is reported with 1–3 line summary, (b) a concrete diff is proposed, (c) AskUserQuestion offers Apply/Investigate/Stop, (d) on Apply the script is edited and re-run.

**Implementation Note**: After completing this phase, pause for manual confirmation. If commit-per-phase was requested, create a commit after verification passes.

### QA Spec (optional):

**Approach:** manual
**Test Scenarios:**
- [ ] TC-4.1: Idempotent doc edit
  - Steps: Run `/script-builder` twice for the same intent/script name in a project with `CLAUDE.md`.
  - Expected: Second run updates the existing block in place; `grep -c "<important if=.*scripts/<name>" CLAUDE.md` returns 1, not 2.
- [ ] TC-4.2: Doc edit placement
  - Steps: Run in a project where `CLAUDE.md` has an existing `## Testing` section.
  - Expected: New block lands within/after the Testing section, not at the end of the file.
- [ ] TC-4.3: Escalation iterate loop
  - Steps: Generate a known-broken script; accept "Run it now"; reject the first proposed fix; accept the second.
  - Expected: Loop runs twice; final state is a passing script with 2 diffs applied.

---

## Phase 5: Sibling skill integration

### Overview

Add `**OPTIONAL SUB-SKILL:** desplega:script-builder` callouts to `planning`, `qa`, and `verifying` SKILL.md files at the right points in their flows. Additive-only — do not change existing behavior of those skills.

### Changes Required:

#### 1. Edit planning SKILL.md
**File**: `cc-plugin/base/skills/planning/SKILL.md`
**Changes**: In **Step 4: Detailed Plan Writing** (`cc-plugin/base/skills/planning/SKILL.md:157-174`), right after the `**QA Specs (optional)**` paragraph and before the `**Template:**` paragraph, add an `**OPTIONAL SUB-SKILL:**` block noting that referenced commands/scripts that don't yet exist can be generated via `desplega:script-builder` during implementation, and that plans may use a checkbox like `- [ ] Run scripts/foo.ts (generate via /script-builder if missing)`. Do NOT edit the "Success Criteria Requirements (MANDATORY)" section at the end — those are rules for plan authors, not for the skill's process.

#### 2. Edit qa SKILL.md
**File**: `cc-plugin/base/skills/qa/SKILL.md`
**Changes**: In Step 3 (Execute Tests, `cc-plugin/base/skills/qa/SKILL.md:97-119`), after the "For CLI verification" paragraph, add an `**OPTIONAL SUB-SKILL:**` block noting that when a QA case needs repeated CLI validation with no existing script, `desplega:script-builder` can generate one inline and the QA session uses the generated script for this and future runs.

#### 3. Edit verifying SKILL.md
**File**: `cc-plugin/base/skills/verifying/SKILL.md`
**Changes**: In Step 5 (Success Criteria Re-run, `cc-plugin/base/skills/verifying/SKILL.md:100-111`), after the existing guidance, add an `**OPTIONAL SUB-SKILL:**` block noting that missing or flaky/verbose commands can be wrapped into re-runnable scripts via `desplega:script-builder`, converting raw commands into PASS/FAIL + `/tmp` log scripts that are cleaner to re-run in future verifications.

### Success Criteria:

#### Automated Verification:
- [x] All three sibling skills reference script-builder: `grep -rln "desplega:script-builder" cc-plugin/base/skills/{planning,qa,verifying}/SKILL.md` returns all three paths
- [x] Each reference uses `OPTIONAL SUB-SKILL` pattern: `grep -rln "OPTIONAL SUB-SKILL.*script-builder" cc-plugin/base/skills/{planning,qa,verifying}/SKILL.md` returns all three
- [x] No unrelated edits to sibling skills: `git diff cc-plugin/base/skills/planning/SKILL.md cc-plugin/base/skills/qa/SKILL.md cc-plugin/base/skills/verifying/SKILL.md` shows only the three additions (no deletions or rewrites of other sections)

#### Manual Verification:
- [ ] Read each of the three edited SKILL.md files top-to-bottom. Confirm the new callouts are in contextually sensible locations (not mid-paragraph) and read naturally.
- [ ] Invoke `/create-plan` for a scenario needing a validation script and confirm the planning flow mentions `/script-builder` as the generator.
- [ ] Invoke `/qa` on a feature needing CLI validation and confirm the qa flow offers script-builder at the gap point.
- [ ] Invoke `/verify-plan` on a plan with a flaky/verbose command and confirm the verifying flow offers script-builder to wrap it.

**Implementation Note**: After completing this phase, pause for manual confirmation. If commit-per-phase was requested, create a commit after verification passes.

---

## Phase 6: Plugin version bump + README update

### Overview

Bump `cc-plugin/base/.claude-plugin/plugin.json` version from `1.11.1` to `1.12.0` (minor bump for new feature) and update `cc-plugin/base/README.md` to list the new `/script-builder` command and `script-builder` skill in the respective tables. Per `ai-toolbox/CLAUDE.md` rules, no marketplace manifest edit is needed since this is a new skill inside an existing plugin.

### Changes Required:

#### 1. Bump plugin version
**File**: `cc-plugin/base/.claude-plugin/plugin.json`
**Changes**: Update `"version": "1.11.1"` → `"version": "1.12.0"`.

#### 2. Update README
**File**: `cc-plugin/base/README.md`
**Changes**: In the "Commands" table (starting at `cc-plugin/base/README.md:62`), add a row `| `script-builder` | Generate durable validation scripts from testing intent |`. In the "Skills" table (starting at `cc-plugin/base/README.md:77`), add a row `| `script-builder` | Generate TS/Python/Bash validation scripts with PASS/FAIL + /tmp log convention |`. No workflow-diagram edit needed (the workflow remains brainstorm → research → plan → review → implement → verify-plan; script-builder is an optional sub-skill, not a step).

### Success Criteria:

#### Automated Verification:
- [x] Version is bumped: `grep -n '"version": "1.12.0"' cc-plugin/base/.claude-plugin/plugin.json`
- [x] README mentions script-builder command: `grep -n "script-builder" cc-plugin/base/README.md | wc -l` returns ≥2 (one in Commands table, one in Skills table)
- [x] Plugin JSON still parses: `python3 -c "import json; json.load(open('cc-plugin/base/.claude-plugin/plugin.json'))"`

#### Manual Verification:
- [ ] Reload the plugin from the in-repo source (use the local/dev reload flow — `/plugin` UI with the local source path, not `/plugin install` which pulls from the remote marketplace). Confirm the version shown is `1.12.0` and both the `/script-builder` command and the `script-builder` skill appear in listings.
- [ ] Render the README in a markdown preview and confirm the new rows are aligned and readable.

**Implementation Note**: After completing this phase, pause for manual confirmation. If commit-per-phase was requested, create a commit after verification passes.

---

## Testing Strategy

**Unit-level (per phase)**: the Automated Verification checkboxes above act as unit checks — each is a grep/ls/parse command that should pass before proceeding.

**Integration-level (post-Phase 4)**: exercise the full skill end-to-end in a scratch project:

1. **Forward-declared happy path** — Empty session, fresh TypeScript project with `bun.lock`. Invoke `/script-builder test the /api/health endpoint`. Walk through: detection → dedup (no matches) → intent Q&A → TS/Bun draft → syntax check → CLAUDE.md edit → accept escalation → run → PASS. Confirm generated file has PASS/FAIL output convention and CLAUDE.md has the new `<important if>` block.

2. **Retrospective happy path** — Session where the agent just ran `curl http://localhost:3000/api/health; curl ...; bun run test:health`. Invoke `/script-builder turn this into a script`. Confirm: retrospective detection, summary-back, confirmation, draft matches the observed actions.

3. **Dedup path** — Pre-populate `scripts/check-health.ts` (with matching header). Invoke `/script-builder verify the /api/health endpoint`. Confirm dedup gate surfaces `check-health.ts`, offers reuse/extend/new-anyway.

4. **Escalation iterate path** — Deliberately induce a failure (e.g., wrong port). Accept "Run it now", confirm 1–3 line failure summary, confirm proposed diff fixes the port, accept Apply, confirm next run passes.

5. **Sibling integration path** — Invoke `/create-plan` for a feature that needs validation scripts; confirm plan output references `/script-builder`. Similarly invoke `/qa` on a feature with CLI-testable behavior; confirm the qa flow offers script-builder at the CLI-verification step.

**Manual E2E (pre-release)**: after all six phases land, run the five integration scenarios above in at least two distinct target projects (one TS/Bun, one Python/uv). Confirm no behavioral regression in `planning`, `qa`, `verifying` (run their standard flows once each with no script-builder involvement).

## References

- Source brainstorm: `thoughts/taras/brainstorms/2026-04-16-script-builder-skill.md`
- Sibling skill reference (structure): `cc-plugin/base/skills/qa/SKILL.md`, `cc-plugin/base/skills/brainstorming/SKILL.md`
- Command wrapper reference: `cc-plugin/base/commands/brainstorm.md`, `cc-plugin/base/commands/qa.md`
- `<important if="...">` pattern: `agent-swarm/CLAUDE.md:39-329`
- Example durable validation script: `agent-swarm/scripts/e2e-workflow-test.ts`
- Plugin manifest: `cc-plugin/base/.claude-plugin/plugin.json`
- Marketplace manifest (unchanged, for context): `.claude-plugin/marketplace.json`
- Repo-level plugin-versioning rules: `ai-toolbox/CLAUDE.md:47-58`

## Review Errata

_Reviewed: 2026-04-17 by Claude (autopilot)_

No Critical findings. Plan is actionable top-to-bottom; the flow from scaffold → templates → core steps → doc-edit/escalation → sibling integration → version bump is coherent and each phase is independently verifiable. Success Criteria use runnable grep/ls/python-parse commands; manual verification sections are concrete. Below are gaps worth addressing before implementation starts.

### Important

- [x] **E1. Phase 5 line reference corrected.** Changed Phase 5 Change #1 to point at `planning/SKILL.md:157-174` (Step 4: Detailed Plan Writing) and placed the callout after the `**QA Specs (optional)**` paragraph. Explicit note added to NOT edit the "Success Criteria Requirements (MANDATORY)" section.

- [x] **E2. Scripts-dir config persistence resolved.** Added a new "Scripts-Dir Config Persistence" subsection after "What We're NOT Doing". Mechanism: CLAUDE.md `<!-- script-builder:dir=<path> -->` marker. First-run resolution order: marker → `scripts/` default → AskUserQuestion. Phase 4 Step 7 adds the marker on first successful generation. Phase 3 Step 2 reads it at dedup time.

- [x] **E3. Scripts-dir-absent edge case added.** Phase 3 Change #2 (Step 2: Dedup scan) now explicitly handles the dir-absent case: skip scan, print note, proceed to intent gathering, optionally offer to create before Step 5.

### Minor

- [x] **E4. Phase 6 local-reload wording clarified.** Manual verification now says "Reload the plugin from the in-repo source (use the local/dev reload flow — not `/plugin install` which pulls from the remote marketplace)."

- [x] **E5. Python template uv metadata conditionality specified.** Phase 2 Change #2 now states the `# /// script` block is a `{{UV_METADATA}}` substitution marker, filled only when uv detection fired (uv.lock or uv-configured pyproject.toml); empty substitution for vanilla Python.

- [x] **E6. Naming convention table added.** Phase 3 Change #5 now includes an explicit prefix table (`e2e-*`, `check-*`, `smoke-*`, `measure-*`, `seed-*`/`generate-*`) with when-to-use and example columns. Advisory, not enforced — skill proposes, user overrides.

- [x] **E7. Phase 2 scratch test-body specified.** Manual verification now gives concrete trivial bodies per language (`console.log('hello')` / `print('hello')` / `echo 'hello'`), all marker values, and an explicit "then replace with exit-1 and re-run" step to exercise the FAIL path.

- [x] **E8. Abort semantics specified.** Added "Abort Semantics" subsection under "What We're NOT Doing": on Stop at any gate, leave script in place, leave CLAUDE.md edit in place, print one-line note with both paths, never auto-revert.

### Resolved
- [x] All Important (E1–E3) and Minor (E4–E8) items addressed in-plan on 2026-04-17.

### Follow-ups for Implementation

Errata fully resolved in the plan body. During implementation, the sections to watch are: the new "Scripts-Dir Config Persistence" rules (apply in Phase 3 Step 2 and Phase 4 Step 7), the corrected Phase 5 line reference (`planning/SKILL.md:157-174`), and the naming-convention table (Phase 3 Step 5).

---

## Alternative: Lean v1 Proposal (recommended)

After a radical-candor pass and reading the `skill-creator` SKILL.md, the full plan above looks **overspecified for a v1 skill**. A SKILL.md is a prompt, not a program; 10 numbered Steps with fuzzy heuristics (retrospective mode detection, idempotent markdown editing, diff-proposal iteration) is heavier than the skill needs on day one. `skill-creator` explicitly warns against rigid MUSTs and encourages iteration via evals rather than big-bang design.

### What Lean v1 ships

**Core flow (5 steps, all in SKILL.md body):**

1. **Gather intent** — forward-mode only. Q&A for what's being tested, success/failure signals, inputs, required env.
2. **Detect language** — `package.json`+`tsconfig.json` → TS (Bun if `bun.lock`); `pyproject.toml`/`uv.lock` → Python (uv if configured); else Bash. Confirm via AskUserQuestion.
3. **Draft the script** — use the fenced-code template embedded inline in SKILL.md (see Appendix A of the skill doc). Write to `scripts/<name>.ext`. Enforce PASS/FAIL + `/tmp/<name>-<ts>.log` convention.
4. **Syntax-check** — `bun/tsc`, `python3 -m py_compile`, or `bash -n`. On failure: show error, suggest fix, AskUserQuestion `Apply | Investigate | Stop`.
5. **Append `<important if>` block to CLAUDE.md** — single append, no idempotency check. Show `git diff`. Leave unstaged.

### What Lean v1 explicitly defers

| Deferred | Why | Unblock trigger |
|----------|-----|-----------------|
| Retrospective mode | Heuristic for "session has validation-shaped activity" is fuzzy; model will misfire. | Real user pain: "I keep copy-pasting my manual session — add retro mode." Re-add behind `--from-session` flag. |
| Dedup scan | First-time users have no `scripts/` to scan. Duplicate-script pain is loud and self-correcting. | After 3+ reports of "I made the same script twice." |
| Scripts-dir config persistence | Default `scripts/` works for every reference project (agent-swarm, cope, qa-use, etc.). | First time a user wants a different path. |
| Idempotent CLAUDE.md editing | Append-only is fine for v1; a duplicate block is visible in diff. | First user complaint about duplicate blocks. |
| Escalation/iterate loop | The user can run `bun scripts/foo.ts` themselves and invoke `/script-builder` again with the error. | After seeing whether people actually want the skill to babysit execution. |
| Standalone template files (`templates/*.tmpl`) | SKILL.md can hold 3 fenced-code templates in Appendix A — one file, one place to edit. `skill-creator` says bundle only when pulling its weight. | If templates grow complex enough that inlining hurts readability. |

### Phase breakdown (4 phases, not 6)

**L1. Scaffold + SKILL.md + command wrapper** (~1 session)
- Create `cc-plugin/base/skills/script-builder/SKILL.md` with frontmatter (pushy description per skill-creator guidance), Working Agreement, When to Use, Autonomy Mode, the 5-step process body, and an **Appendix A: Templates** section containing three fenced-code blocks (TypeScript/Bun, Python, Bash) with `{{SCRIPT_NAME}}`, `{{WHAT}}`, `{{TEST_BODY}}` markers.
- Create `cc-plugin/base/commands/script-builder.md` wrapper (mirrors `/brainstorm`).
- **Success**: `/script-builder test the /api/health endpoint` in a TS/Bun project produces a draft `scripts/check-health.ts`, syntax-checks it, writes an `<important if>` block to CLAUDE.md, and shows the diff. No CLAUDE.md changes get auto-staged.

**L2. Seed evals + one manual iteration** (~half session)
- Create `cc-plugin/base/skills/script-builder/evals/evals.json` with 3 realistic prompts (TS happy path, Python happy path, Bash-in-TS-project override). No assertions yet — just prompts.
- Run each prompt manually; observe where the SKILL.md body under-specifies or misfires.
- Apply one round of SKILL.md improvements based on observations. Keep the body under 500 lines.
- **Success**: all 3 evals produce a usable script + doc block on the first try without Taras correcting the skill mid-flight.

**L3. Sibling integration** (same as Phase 5 in the full plan, unchanged)
- Add `**OPTIONAL SUB-SKILL:**` callouts to `planning/SKILL.md:157-174` (Step 4, after QA Specs paragraph), `qa/SKILL.md:97-119` (Step 3), and `verifying/SKILL.md:100-111` (Step 5).
- **Success**: `grep -rln "desplega:script-builder" cc-plugin/base/skills/{planning,qa,verifying}/SKILL.md` returns 3 files.

**L4. Version bump + README** (same as Phase 6 in the full plan, unchanged)
- `cc-plugin/base/.claude-plugin/plugin.json`: `1.11.1` → `1.12.0`.
- `cc-plugin/base/README.md`: add `/script-builder` row to Commands table, `script-builder` row to Skills table.

### What this cuts (concrete size delta)

- **Files**: ~8 fewer new files (3 `.tmpl`, 1 templates README, plus whatever config-persistence reading logic would spawn).
- **SKILL.md length**: ~40% smaller (5 steps vs 10, plus inline templates).
- **Implementation time**: L1 + L2 fit a single working session; the full 6-phase plan is probably 3+ sessions.
- **Risk surface**: every deferred item is something that can be added later without breaking v1 — additive, not load-bearing.

### What stays non-negotiable in Lean v1

- **Context-optimal output convention** (PASS/FAIL + `/tmp` log) — the *actual* reason this skill exists. Drop this and the skill is just a codegen tool.
- **Pushy description in frontmatter** per skill-creator's triggering guidance — the skill has to actually fire when Taras types "turn this into a script" or "I want to verify X end-to-end."
- **Sibling callouts** — without them, other skills won't discover this one and it dies in a corner.

### Recommendation

**Ship Lean v1 (L1-L4), run it for a couple weeks on real tasks, then revisit what to add.** The deferred items are all "add when needed" — building them speculatively is exactly the over-engineering the radical-candor pass flagged.

If we want to keep this plan file as the v1 reference: **rename the top half to "Phase 5: Future Enhancements"** and promote L1-L4 to Phases 1-4. But that's a sizeable edit — I'd do it if you confirm you want to go lean.
