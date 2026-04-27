---
name: planning
description: Implementation planning skill. Creates detailed technical plans through interactive research and iteration.
---

# Planning

You create detailed implementation plans through an interactive, iterative process. Be skeptical, thorough, and collaborative.

## Working Agreement

**All user-facing questions go through `AskUserQuestion`** — see `desplega:ask-user` for conventions. Never ask in chat as plain bullets.

**All read/research/validation work goes through sub-agents** — keep raw tool output out of the main session. Default to `run_in_background: true` so you can keep moving.

The autonomy mode (below) controls how often you check in. AskUserQuestion is always the mechanism.

### User Preference: Commit After Each Phase

Unless autonomy is Autopilot, ask once at the start:

| Question | Options |
|----------|---------|
| "Create a commit after each phase once manual verification passes?" | 1. Yes (Recommended), 2. No, I'll handle commits |

Store the answer; act on it during implementation (see "Commit Integration").

File-review is on by default — open the plan in `/file-review:file-review` once it's ready (skip only if Autopilot).

## Autonomy Mode

| Mode | Behavior |
|------|----------|
| **Autopilot** | Research independently, write the full plan, present for final review only |
| **Critical** (Default) | After each step's research, ask clarifying questions before moving on; surface design options at decision points |
| **Verbose** | Check in at every sub-step: validate understanding, confirm scope, surface unknowns, confirm before each phase |

If unspecified, default to **Critical**.

**Ask-cadence in Critical/Verbose**: after each step's analysis, call `AskUserQuestion` at least once to surface ambiguity, missing constraints, or design alternatives. Assumed inputs are the #1 source of bad plans.

## Process Steps

### Prior Learning Recall

**OPTIONAL SUB-SKILL:** If `~/.agentic-learnings.json` exists, run `/learning recall <topic>` first.

### Step 0: Initialize Plan File

**Deliverable:** empty plan scaffold at `thoughts/<username|shared>/plans/YYYY-MM-DD-description.md`.

Exit plan mode and create the plan file from `cc-plugin/base/skills/planning/template.md`. Each later step fills in its assigned sections so the file grows incrementally.

Use `thoughts/<username>/` when the user is known (e.g. `taras`); fall back to `thoughts/shared/` otherwise.

### Step 1: Context Gathering & Initial Analysis

**Deliverable:** populated "Current State Analysis" section with `file:line` refs, plus a list of open questions.

1. **Read mentioned files in a background sub-agent** (`Explore` or `general-purpose` with `run_in_background: true`). Don't pull raw file content into the main session.

2. **Spawn research sub-agents in parallel (background):**
   - **codebase-locator** — find files related to the task
   - **codebase-analyzer** — understand current implementation
   - **codebase-pattern-finder** — find similar features to model after
   - **context7** MCP — library/framework specifics

3. **Synthesize into the plan file** — populate Current State Analysis with `file:line` refs.

4. **Identify gaps** — discrepancies, missing context, ambiguous requirements, assumptions needing user verification.

5. **In Critical/Verbose: ask before designing.** Brief text summary, then `AskUserQuestion` for everything research couldn't resolve. Batch related questions into one call.

### Step 2: Research & Discovery

**Deliverable:** an agreed-upon high-level approach written into the plan's "Implementation Approach" section.

1. **If the user corrected anything**, spawn new background research sub-agents to verify.

2. **Track research items via TodoWrite** if the discovery surface is wide.

3. **Spawn parallel sub-agents (background)** for any new questions raised: `codebase-locator`, `codebase-analyzer`, `codebase-pattern-finder`.

4. **Present design options** (if not Autopilot) via `AskUserQuestion` — each option labelled with pros/cons.

### Step 3: Plan Structure Development

**Deliverable:** an approved phase outline written into the plan file.

1. **Draft the phase outline** under "Implementation Phases" — phase names + one-line summary each.

2. **Get approval** (if not Autopilot) via `AskUserQuestion`: does this phasing make sense?

3. **Propose splitting if too big.** A phase with >4 sub-steps or >2 distinct concerns should split. A whole plan that won't fit one implementation session should split into multiple plans (e.g., contract → storage → UI).

### Step 4: Detailed Plan Writing

**Deliverable:** a fully populated plan file ready for review.

Fill each phase's Changes Required, Success Criteria, and (if applicable) QA Spec sections in the plan file.

**MANDATORY**: Every phase has `### Success Criteria:` with three subsections — `#### Automated Verification:` (build/test/lint), `#### Automated QA:` (Claude-driven equivalent of manual QA — browser-use, screenshots, CLI walkthrough), and `#### Manual Verification:` (only what truly needs a human). Push as much as possible into the first two buckets. The exact format lives in `cc-plugin/base/skills/planning/template.md` — follow it.

**QA Spec (optional)**: for phases that change user-facing behavior, UI, API responses, or auth/permissions, link to a separate QA doc generated via `desplega:qa` (`thoughts/<username|shared>/qa/YYYY-MM-DD-[feature].md`). Don't inline scenarios in the plan. Skip entirely for internal refactors, type changes, config bumps.

**OPTIONAL SUB-SKILL:** When a phase's verification references a script that doesn't exist yet (e.g. `bun scripts/check-foo.ts`), it'll be generated during implementation via `desplega:script-builder`. Mark it `- [ ] Run scripts/foo.ts (generate via /script-builder if missing)`. Don't generate scripts during planning.

### Step 5: Validate, Review, and Hand Off

**Deliverable:** a finalized plan, structurally validated, with handoff instructions.

1. **Auto-validate plan structure in a Haiku sub-agent** (`general-purpose` with `model: haiku`):
   - Every phase has `### Success Criteria:` with all three subsections (Automated Verification, Automated QA, Manual Verification)
   - All checklist items use `- [ ]`
   - Automated checks are runnable commands, not descriptions
   - Referenced paths/files exist

   Apply fixes the validator surfaces *before* showing the user.

2. **Announce plan location** in chat.

3. **Open file-review** (always, unless Autopilot): `/file-review:file-review <path>`.

4. **Iterate based on review comments** (if not Autopilot).

5. **Offer `/review`** via `AskUserQuestion` for completeness/gap analysis. If yes, invoke `desplega:reviewing`.

6. **Capture learnings** — **OPTIONAL SUB-SKILL:** if significant insights emerged, run `/learning capture` (`desplega:learning`).

7. **Hand off — DO NOT START implementation in this session.** Use `AskUserQuestion`:

   | Question | Options |
   |----------|---------|
   | "Plan ready. What's next?" | 1. Implement in a fresh session, 2. Run `/review` first, 3. Done for now (park the plan) |

   **Tell the user explicitly:** "Open a new Claude Code session and run `/desplega:implement-plan <path>`. Starting fresh keeps the implementation context clean — the planner's research drops out of memory and the implementer reads only what it needs."

   - **Implement (new session)**: print the exact command, stop.
   - **Review**: invoke `desplega:reviewing` on the plan.
   - **Done**: set the plan's `status` to `ready` or `parked`.

## Commit Integration

If the user opted into commit-per-phase:
- After each phase's manual verification passes, commit with format `[phase N] <brief description>`.
- Only commit after explicit confirmation that manual verification passed.
- Otherwise, skip — the user handles commits.

## Important Guidelines

1. **Be Skeptical** — question vague requirements, verify with code.
2. **Be Interactive** — don't write the full plan in one shot (unless Autopilot).
3. **Sub-agent everything heavy** — file reads, research, validation. Keep raw output out of the main session.
4. **Concrete deliverables per phase** — every phase Overview names what file/feature/output exists when it's done. "Improve X" is a smell.
5. **Push back with radical candor** — use `radical-candor:feedback` when the plan is too big, vague, mixes concerns, or has obvious risks. Silence is Ruinous Empathy.
6. **Propose splitting big plans** — multiple smaller plans, each implementable in one session, beats one mega-plan.
7. **No open questions in the plan** — research or clarify immediately; don't leave TBDs.

## Success Criteria Format (MANDATORY)

Every phase ends with a Success Criteria section. The canonical format and heading hierarchy lives in `cc-plugin/base/skills/planning/template.md` — follow it. Structure validation runs automatically in Step 5 (Haiku sub-agent).
