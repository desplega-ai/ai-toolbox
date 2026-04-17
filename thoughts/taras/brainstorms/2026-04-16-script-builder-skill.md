---
date: 2026-04-16T00:00:00Z
author: Taras
topic: "script-builder skill for cc-plugin/base"
tags: [brainstorm, cc-plugin, base, testing, qa, scripts]
status: complete
exploration_type: idea
last_updated: 2026-04-16
last_updated_by: Taras
---

# script-builder skill for cc-plugin/base — Brainstorm

## Context

Taras wants a new skill in `cc-plugin/base/` (working name: `script-builder`) whose sole purpose is to help users and coding agents generate **one-off / custom / special scripts** that are later used by coding agents (Claude or others) to autonomously **test/validate** things during:

- `/qa` skill runs
- `/create-plan` flow (when the plan needs "here's how you'd actually verify this")
- Any future QA-style flow that wants a durable, re-runnable validation harness

### Key constraints from Taras

- Lives alongside other base skills: `qa/`, `verifying/`, `planning/`, `reviewing/`, `tdd-planning/`, `brainstorming/`, etc.
- **Not** opinionated on language — but prefers **TypeScript** or **Python** based on the target project's primary language.
- **Storage location configurable**, default `scripts/` at repo root.
- Deliverable includes updating the target project's `CLAUDE.md` / `AGENTS.md` with:
  - How to use the generated scripts
  - **When** to use them (e.g., "when testing X or Y")
- Two input modes:
  1. **Forward-declared**: "I want to be able to test X" → synthesize from requirements
  2. **Retrospective**: after a one-off manual back-and-forth where the agent already did the thing, synthesize the process into a reusable script
- Main focus: **testing / validation** (not general scripting — distinguishing this from a plain code-gen tool).

### Inspiration (patterns Taras likes)

From `agent-swarm/CLAUDE.md`:
- `scripts/` directory holding `e2e-*.ts`, `generate-*.ts`, `check-*.sh`, `seed.ts`, `measure-*.ts`, etc.
- `<important if="...">` blocks around each script family that describe WHEN an agent should reach for it ("if you are running E2E tests with Docker", "if you are testing MCP tools via curl")
- Mix of `.ts` (Bun) and `.sh` living together
- Heavy use of typed e2e scripts that hit the real HTTP server / Docker

From `cope/` (has `qa-tests/` and `e2e/`) and `qa-use/` (has `scripts/` + `qa-tests/`): similar pattern — durable scripted test harnesses, callable by agents.

### Related existing skills

- `cc-plugin/base/skills/qa` — runs QA, can execute CLI verification, but doesn't *build* the CLI/scripts
- `cc-plugin/base/skills/verifying` — post-implementation checkbox/re-run audit
- `cc-plugin/base/skills/planning` — plans that include "Automated Verification" sections which often reference commands/scripts that don't yet exist

The gap: there's no skill today that **bridges a QA intent → a durable, committed, re-runnable script** that lives in the target repo.

## Exploration

### Q: Who is the primary caller of this skill — who's typing `/script-builder` (or triggering it)?

**Answer:** 80% human (Taras directly), 20% agent (could be referenced as a sub-skill by other skills like `qa` or `planning`).

**Insights:**
- Design leans **human-first, conversational, interactive** (like `/brainstorm` or `/qa`) — not a silent helper.
- But the skill must still be **callable as a sub-skill** — it needs a clean programmatic entry with the script intent pre-filled, so it can skip the "what are we building" question when the parent skill already knows.
- Implication: the skill needs two entry shapes — one for direct `/script-builder <intent>` and one for `**SUB-SKILL**: desplega:script-builder` with args. Same Socratic loop, but sub-skill mode compresses/skips the early questions.
- The 80/20 split also means UX investment should go into the human path first; sub-skill integration is secondary.

### Q: Where does the skill's job end — does it just DRAFT the script, or run/iterate until it actually works?

**Answer:** Tiered — draft by default, iterate on request.

**Insights:**
- **Default mode is lightweight**: generate script → syntax/type-check → show it → done. Fast, low-risk, cheap to invoke.
- **Escalated mode (opt-in)**: run against the real target, capture stdout/stderr/exit code, iterate on failure. This is where the skill becomes QA-grade.
- The tiering implies a **handoff point**: after draft, the skill should ask "want me to run it and iterate until green?" — a natural AskUserQuestion gate.
- Escalation mode needs safeguards: some scripts hit prod-adjacent systems, cost money (API calls), or take long. Should probably confirm side-effects before running.
- Tiering also maps cleanly to the **autonomy modes** pattern already used by sibling skills: Verbose = always ask, Critical = ask at tier boundary, Autopilot = auto-escalate to iterate.

### Q: Retrospective vs forward-declared — which is the primary design target?

**Answer:** The agent should **infer the mode automatically** — fresh session with no prior relevant activity → forward-declared (drive Q&A from requirements); session already has recent agent activity relevant to testing → retrospective (synthesize what just happened into a script).

**Insights:**
- **No "which mode?" question** — that's UX noise. Mode detection is the skill's responsibility and happens silently at the start.
- Detection heuristics the skill should check:
  - Is there a recent tool-use history in the session that resembles a verification/test step? (curl calls, CLI runs, DB queries, browser actions via qa-use, etc.)
  - Did the user just finish a back-and-forth where they manually ran commands and verified something?
  - Is the user's invocation message itself narrative ("we just figured out how to test Y, turn it into a script") vs intent-framed ("I want to test Z")?
- If the session is **fresh / ambiguous**, fall back to forward-declared Q&A. Never guess retrospectively from stale context.
- Retrospective mode's first move: **summarize back to the user** what it thinks it saw ("I see you just ran X, Y, Z to validate the auth flow — is that the flow to preserve?") — gives user a chance to correct before generating.
- Forward mode's first move: **requirements Q&A** — what am I testing, what's the success signal, what's the failure signal, inputs/outputs.
- The two modes converge at the same "draft the script" step once enough context is gathered.

### Q: Should generated scripts conform to a standard shape/contract?

**Answer:** Light convention — NOT strict. But with one strong default: **context-optimal output**. Minimal stdout by default, full verbose output redirected to a `/tmp` file that agents can grep into when they need detail.

**Insights:**
- Default stdout shape (convention, not enforced at type level):
  - Success: one line (`PASS: <brief summary>`) + path to full log
  - Failure: one line (`FAIL: <brief summary>`) + path to full log + optionally last N error lines
- Full output goes to something like `/tmp/<script-name>-<YYYYMMDD-HHMMSS>.log` (or `$TMPDIR`-aware path).
- Why this matters: when `/qa` or another agent skill runs the script, it dumps a PASS line into the conversation instead of 10k lines of curl dumps. Huge context savings.
- **This is THE most important default the skill enforces.** Every template should wire this in.
- Exit codes: 0 = pass, non-zero = fail. `--help`, `--verbose` (streams the full log to stdout), `--json` optional.
- Header comment in the script: what it tests, when to run it, required env vars, example invocations. Redundant with CLAUDE.md, but scripts in `scripts/` must be understandable standalone.
- The convention is a **template, not a validator** — if a specific script needs a different shape (e.g., streaming output), the skill bends. But templates default to the convention.

### Q: How aggressive should the skill be about updating target project's CLAUDE.md / AGENTS.md?

**Answer:** Auto-edit, then show diff.

**Insights:**
- Skill edits both `CLAUDE.md` and `AGENTS.md` (if both exist) with an `<important if="...">` block describing when to reach for the script.
- Shows the diff after, so user can `git diff` / revert if needed. Low-friction but not invisible.
- Block template (following agent-swarm's pattern):
  ```markdown
  <important if="you are [testing X / validating Y / running E2E against Z]">

  ## [Feature/area] testing

  Run `scripts/<script-name>` to [what it does]. Requires [env / deps]. Example:

  \`\`\`bash
  <invocation>
  \`\`\`

  Full log at `/tmp/<script-name>-*.log`. See `scripts/<script-name>` header for full details.

  </important>
  ```
- **Placement heuristic**: skill should find the existing testing/validation section in CLAUDE.md and append there; if no such section, add under a new `## Scripts for testing & validation` section near the end (but before any license/meta sections).
- **Idempotency**: if the block already exists (same script path), update it in place rather than appending a duplicate.
- **Both files**: if only `CLAUDE.md` exists, edit only that. If both, edit both. If only `AGENTS.md` (rare), edit only that. Never create a new CLAUDE.md/AGENTS.md just for this.
- Diff is shown via `git diff` (or equivalent) after the edit — agent prints a short summary; user is free to revert.

### Q: How should the skill pick a language — auto-detect, or always ask?

**Answer:** Auto-detect → show the detected choice → allow override.

**Insights:**
- **Detection signals** (in rough priority order):
  - `package.json` + `tsconfig.json` present → **TypeScript** (prefer Bun if `bun.lock` or `bunfig.toml` exists, else Node)
  - `pyproject.toml` / `uv.lock` / `requirements.txt` → **Python** (prefer `uv` if `uv.lock` or `pyproject.toml` with uv config)
  - Both present → pick by *dominant directory structure* (more source files of X = X wins), with a tiebreaker question
  - `Cargo.toml`, `go.mod`, etc. → default to **bash** (rust/go scripts are awkward for one-offs); user can override
  - Nothing detected → **bash**
- **UX**: after detection, show a one-liner like `Detected TypeScript (Bun). Go with that, or choose another?` via AskUserQuestion with 2-3 lang options. Default is the detected one so Enter proceeds.
- **Runner preferences by language**:
  - TS: Bun if available (`bunfig.toml`/`bun.lock`), else `tsx`, else compiled `node`
  - Python: `uv run` if uv-configured, else `python3` with a `requirements.txt` sibling
  - Bash: `#!/usr/bin/env bash` + `set -euo pipefail`
- **Task-driven override**: if the task is clearly shell-y (e.g., "check that these 3 docker containers respond"), the skill should *propose* bash even in a TS project. User can accept/reject.
- **Cross-language calls**: if generating TS script that shells out heavily, flag that bash might be simpler. Don't force.

### Q: What does "iterate" actually do in the escalated tier?

**Answer:** Run → report → ask. One failure surfaced to the human at a time, with a suggested fix they approve before applying.

**Insights:**
- **No blind auto-fix loops.** Agents iterating without human approval often chase the wrong failure, mutate scripts into unrecognizable shapes, or paper over real bugs.
- Flow per iteration:
  1. Run the script, capture exit code + tail of `/tmp` log.
  2. If pass → done, report PASS.
  3. If fail → summarize the failure in 1–3 lines (error class + likely cause based on log).
  4. Propose a concrete diff (the edit the skill would apply to the script).
  5. **AskUserQuestion**: apply this fix / investigate differently / stop.
  6. If "apply", make the edit, loop back to step 1.
- **Bound**: implicitly, the human is the bound — they'll stop it when they've had enough. No hardcoded N-retries limit.
- **Failure summaries should be grep-friendly**: the skill should reach into the `/tmp` log with targeted grep, not dump the whole file into context.
- This maps well to `file-review` integration later — if the skill updates the script 3+ times, offer a file-review pass on the final version.

### Q: Should the skill check existing `scripts/` for overlap before generating a new one?

**Answer:** Yes — always check + offer reuse.

**Insights:**
- **First step of every invocation**: scan the configured scripts directory, read headers (or a `.script-builder-index.md` / CLAUDE.md `<important if="...">` blocks), fuzzy-match against the current intent.
- If a likely match exists, present it: "Looks like `scripts/e2e-auth-flow.ts` already covers this. Options: reuse as-is, extend it, or generate a new one anyway."
- **Matching signals**:
  - Header comment keywords
  - CLAUDE.md `<important if="...">` trigger phrases
  - File name tokens (`e2e-auth` vs intent "test the auth flow")
  - Could use `fuzzy-match` from code-mode stdlib helpers
- **Extend-in-place flow**: if user picks "extend", the skill appends a new sub-command / flag / case to the existing script rather than creating a new file. Keeps the registry small.
- **Anti-pattern to avoid**: silently skipping dedup when the fuzzy match is borderline — better to surface and let user decide. A false-negative (creating a duplicate) is worse than a false-positive (one extra question).
- This effectively acts as a catalog view too — listing matches doubles as showing the user what's already there.

### Q: Should sibling skills (planning, qa, verifying) reference script-builder?

**Answer:** All three reference it.

**Insights:**
- **`planning` integration**: when generating "Automated Verification" sections, if a referenced command/script doesn't yet exist, suggest invoking `desplega:script-builder` as a sub-skill during implementation. Plan writes `[ ] Run scripts/foo.ts (generate via /script-builder if missing)`.
- **`qa` integration**: when QA identifies a validation case that needs automation (e.g., "verify user can log in end-to-end") and no script exists, offer `desplega:script-builder` as a sub-skill. Script gets created, used for the test case, and committed for future QA runs.
- **`verifying` integration**: when re-running "Automated Verification" checks from a plan and a check is missing a script, offer script-builder to close the gap. Also: if a verification command is flaky or verbose, verifying can propose converting it into a /tmp-log-backed script via script-builder.
- These sibling-skill edits should follow the existing pattern (e.g., `**OPTIONAL SUB-SKILL:**` callouts in the skill markdown), not hard-coded branches.
- **Discoverability for agents**: in target projects, the auto-edited CLAUDE.md scripts section should mention `/script-builder` itself as the tool that creates these — so future agents know how new entries appear.
- **Ordering of edits for the deliverable PR**:
  1. Create `cc-plugin/base/skills/script-builder/`
  2. Add the skill + templates
  3. Edit `planning`, `qa`, `verifying` SKILL.md files to add the sub-skill reference
  4. Bump `cc-plugin/base/.claude-plugin/plugin.json` version (minor — new feature)
  5. Add a slash command: `cc-plugin/base/commands/script-builder.md` (mirrors `/brainstorm` wrapper pattern)
  6. Update root `CLAUDE.md` plugin list if applicable

## Synthesis

### Key Decisions

- **Home**: `cc-plugin/base/skills/script-builder/` (SKILL.md + `templates/` subdir with per-language stubs). Wrapped by a `/script-builder` slash command under `cc-plugin/base/commands/`.
- **Caller model**: human-first (80%), sub-skill-capable (20%). Same Socratic loop; sub-skill entry skips redundant questions when context is pre-filled.
- **Scope tiers**: Draft by default (generate + syntax/type-check + show). Opt-in escalation to run + report + ask (human-in-the-loop iteration, no blind auto-fix).
- **Input mode**: auto-detected (retrospective if session has relevant prior activity, forward-declared otherwise). No "which mode?" question.
- **Language**: auto-detect by repo signals (tsconfig/pyproject/bun.lock/...), show the choice, allow override. Fall back to bash.
- **Script shape**: light convention, **context-optimal output required** — stdout = 1-line PASS/FAIL + `/tmp` log path; full output redirected to `/tmp/<script>-<timestamp>.log`. Exit 0/1. Header comment with usage + when-to-run.
- **Storage**: configurable, default `scripts/` at repo root. First invocation detects or asks; decision is persisted (e.g., in the auto-inserted CLAUDE.md block or a small config file).
- **Documentation update**: auto-edit `CLAUDE.md` and `AGENTS.md` (if present) with `<important if="...">` blocks, show the diff. Idempotent per script path.
- **Dedup / catalog**: scan `scripts/` first, fuzzy-match against intent, propose reuse/extend before generating new. Never silently skip — surface and let the user decide.
- **Iteration mode**: run → report → ask; propose a concrete diff on each failure; human approves before applying. No hardcoded retry cap.
- **Sibling integration**: `planning`, `qa`, `verifying` all gain optional `**OPTIONAL SUB-SKILL:** desplega:script-builder` callouts at the right points in their flows.

### Core Requirements (pre-PRD)

1. **Entry points**
   - `/script-builder [intent]` direct invocation
   - `desplega:script-builder` as a sub-skill (with structured args: intent, lang hint, target dir)

2. **Process (Verbose mode, default)**
   1. Parse autonomy + detect mode (retrospective vs forward)
   2. Scan existing `scripts/` for overlapping scripts → propose reuse/extend if matched
   3. Gather intent (Q&A for forward mode; summary-back-for-confirmation for retrospective mode)
   4. Detect language + runner → confirm with user
   5. Draft script from template (context-optimal output, /tmp log, header comment)
   6. Syntax/type-check (tsc/ruff/shellcheck as available)
   7. Auto-edit `CLAUDE.md` / `AGENTS.md` with `<important if="...">` block; show diff
   8. Offer escalation: "Want me to run it now?"
   9. On escalation: run → report → (on fail) propose diff → AskUserQuestion → iterate
   10. Handoff: back to calling skill / `/qa` / `/verify-plan` / done

3. **Templates** (`cc-plugin/base/skills/script-builder/templates/`)
   - `typescript.ts.tmpl` (Bun & Node variants)
   - `python.py.tmpl` (uv & vanilla variants)
   - `bash.sh.tmpl` (with set -euo pipefail + trap)
   - Each template includes: header comment, arg parsing, /tmp log redirection, PASS/FAIL summary.

4. **Target-project CLAUDE.md block template** (inserted per script)
   ```markdown
   <important if="[TRIGGER: e.g., you are testing the auth flow]">

   ## [Area] validation

   Run `scripts/<name>` to [one-liner]. Requires [env/deps]. Example: `<cmd>`. Full log at `/tmp/<name>-*.log`.

   Generated/maintained via `/script-builder`.

   </important>
   ```

5. **Sibling-skill edits**
   - `planning/SKILL.md`: in the "Automated Verification" guidance, note that missing scripts can be generated via `desplega:script-builder` during implementation.
   - `qa/SKILL.md`: in Step 3 (Execute Tests), note that ad-hoc CLI validation gaps can be automated by invoking `desplega:script-builder`.
   - `verifying/SKILL.md`: in Step 5 (Success Criteria Re-run), note that flaky/verbose commands can be wrapped into re-runnable scripts via `desplega:script-builder`.

6. **Root-repo updates**
   - Bump `cc-plugin/base/.claude-plugin/plugin.json` version (minor).
   - Update `cc-plugin/base/README.md` (if it lists skills) to include script-builder.
   - No marketplace manifest change — this is a new skill inside an existing plugin, not a new plugin.

### Constraints Identified

- Must not break the sibling skills (`qa`, `planning`, `verifying`) — edits are additive callouts only.
- Scripts must be understandable standalone (CLAUDE.md discovery augments, doesn't replace, the script header).
- Dedup scan must be cheap (`glob` + head-of-file reads), not a full LLM pass over every script.
- Language detection must have sane fallback when repo is polyglot or empty.
- Context-optimal output is non-negotiable — that's the single biggest value-add for agent callers.

### Open Questions

- **Storage-path config persistence**: where lives the per-project override — a dedicated `.script-builder.json`, a CLAUDE.md `<!-- script-builder:dir=... -->` marker, or just ask every time until it's stable? (Gut: CLAUDE.md marker, because it naturally lives with the docs that already guide agents.)
- **Do we need a registry file** (`scripts/INDEX.md`) separate from CLAUDE.md blocks, to support cross-project `/script-builder --list`? Probably no, but worth deciding in plan phase.
- **CI integration**: should the skill offer to add new scripts to a CI job? (Probably out of scope for v1; note as future work.)
- **Git commit behavior**: do we auto-`git add` the new script + CLAUDE.md edit, or leave staging to the user? (Lean: leave unstaged, show diff, user commits.)
- **Naming conventions**: is there value in enforcing `e2e-*` / `check-*` / `smoke-*` prefixes, or let names be free-form? (Agent-swarm uses prefixes meaningfully. Worth a light convention.)

## Next Steps

- **Recommended**: `/desplega:create-plan` using this brainstorm as the input. The requirements are concrete enough that planning can now lay out phases (skill scaffold → templates → sibling edits → CLAUDE.md auto-edit logic → dedup → iterate mode → docs).
- Alternative: `/desplega:research` first if Taras wants to investigate the `agent-swarm`/`cope`/`qa-use` script patterns more systematically before planning.

