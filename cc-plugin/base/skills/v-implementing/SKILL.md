---
name: v-implementing
description: Parallel DAG-plan implementation skill. Reads a v-planning plan directory (root.md + step-<n>.md files), topologically schedules ready steps, and fans them out as parallel sub-agents. Use whenever the user invokes /v-implement, points at a plan directory produced by /v-plan, or asks to "run the parallel plan", "implement the DAG", or "fan out the steps" — even without those exact words. For linear plans (single .md file), use `implementing` instead.
hooks:
  PostToolUse:
    - matcher: "Edit|Write"
      hooks:
        - type: command
          command: "${CLAUDE_PLUGIN_ROOT}/hooks/plan_checkbox_reminder.py"
  Stop:
    - hooks:
        - type: command
          command: "${CLAUDE_PLUGIN_ROOT}/hooks/plan_checkbox_stop.py"
---

# v-implementing

You are implementing an approved DAG-structured plan produced by `v-planning`. The plan is a directory with `root.md` + one `step-<n>.md` per node. Your job is to act as a **topological scheduler**: at each tick, find steps whose dependencies are all done, fan them out as parallel sub-agents (one per ready step), wait, repeat — until the DAG is drained. Then run Global Verification.

This is the parallel sibling of `implementing`. The orchestration model is the same (sub-agents do the work, main session coordinates), only the scheduler is different.

## Working Agreement

1. **AskUserQuestion is your primary communication tool.**
2. **Establish preferences upfront.**
3. **Autonomy mode guides interaction level.**

### User Preferences

Before starting (unless Autopilot):

**Branch / Worktree Setup** — Same logic as `implementing`. Check `git branch --show-current`. If `wts` plugin is available, offer worktree as an option.

**Commit Strategy** — Use **AskUserQuestion**:

| Question | Options |
|----------|---------|
| "How would you like to handle commits during parallel implementation?" | 1. Commit after each step completes (Recommended), 2. Commit at the end (single commit), 3. Let me decide as I go |

**File Review Preference** — Same as `implementing` if `file-review` is installed.

## When to Use

- User invokes `/v-implement <plan-dir>`
- Plan path points at a **directory** containing `root.md`
- Another skill references `**REQUIRED SUB-SKILL:** Use desplega:v-implementing`

If pointed at a single `.md` file, hand off to `implementing` instead.

## Autonomy Mode

| Mode | Behavior |
|------|----------|
| **Autopilot** | Drain the DAG without pausing. Only stop on blocker / failed step. |
| **Critical** (Default) | Pause when each *wave* of parallel steps completes; wait for manual verification before unlocking the next wave. |
| **Verbose** | Pause after each individual step (even within a wave). |

## Getting Started

Given a plan directory path:

1. **Read `root.md` fully** (no `limit`/`offset`). Capture: Overview, Current State, Desired End State, Implementation Approach, Global Verification.
2. **Read every `step-<n>.md`'s frontmatter** to build the dependency graph (`id`, `depends_on`). You don't need to read step bodies up front — the sub-agents will do that.
3. **Validate the DAG:**
   - No cycles
   - Every `depends_on` ID exists as a step file
   - At least one step has `depends_on: []` (otherwise nothing can start)
4. **Set `root.md` frontmatter `status: in-progress`.**
5. **Build a TodoWrite list** with one entry per step, marked `pending`.
6. **Resume support:** if any step's body has `- [x]` boxes already (or its frontmatter says `status: completed` if the user added it), trust them and treat that step as `done`.

If no path given, ask via AskUserQuestion.

## The Scheduler Loop

```
while steps remain undone:
    ready = [step for step in undone if all(dep in done for dep in step.depends_on)]
    if not ready:
        break  # cycle or stuck — error
    fan out each step in `ready` as a parallel sub-agent (see below)
    wait for the wave to complete
    review reports; mark each step done | blocked | failed
    if Critical mode: pause for manual verification of completed steps
    if any failed: stop and ask user how to proceed
```

### Spawning a Step Sub-agent

For each ready step in the wave, use the `Agent` tool with `run_in_background: true`. Mirror the spawning pattern of `implementing` + `phase-running`, except the unit of work is a step, not a phase.

Each sub-agent receives:
- The plan directory path
- The step ID (`step-<n>`)
- A pointer to read `step-<n>.md` for changes-required and success criteria
- The plan-level context from `root.md` (Current State, Desired End State, Implementation Approach) — enough to act locally without reading sibling steps

The sub-agent's job:
1. Implement the changes in the step file.
2. Run the step's `#### Automated Verification:` checks. Tick the boxes on success.
3. Report back: `completed | blocked | failed`, list of changed files, results of automated checks, any QA spec status (`pending | passed | n/a`).

Do **not** ask the sub-agent to do manual verification — that's a human checkpoint owned by the main session.

### Wave Completion

When a wave finishes:
1. **Review each agent's report.** Mark steps `done` only if `completed` was reported.
2. **Handle QA pending** — for each step reporting `QA: pending`, present its QA scenarios and offer: execute via `desplega:qa`, or skip.
3. **Manual verification (if not Autopilot)** — present manual verification items from each completed step's body. Wait for user confirmation. Don't tick manual boxes until confirmed.
4. **Commits (if commit-per-step was selected)** — after a step's manual verification passes, create a commit: `[step-N] <step name>`.
5. **Loop** — recompute `ready` and start the next wave.

## Handling Failures and Mismatches

If a sub-agent reports `failed` or `blocked`, or you spot a mismatch between plan and reality:

| Question | Options |
|----------|---------|
| "[step-N] [issue]. How should I proceed?" | 1. Adapt step (edit step-N.md and retry), 2. Retry as-is, 3. Skip and continue (mark step blocked), 4. Stop the run |

In Autopilot mode, use best judgment, document the decision in the step file, and continue if non-fatal.

## After the DAG Drains

When every step is `done`:

1. Run **Global Verification** from `root.md`. Tick automated checks; surface manual checks to the user.
2. Set `root.md` frontmatter `status: completed`.
3. Offer post-implementation auditing: "Would you like me to run `/verify-plan` and `/review` on the plan directory?"
4. If commit-per-step was off, offer to create a single bundled commit now.

## Important Guidelines

1. **One step = one sub-agent.** Don't bundle steps into a single agent even if they're in the same wave — fan-out is the whole point.
2. **Plan-level context goes to every sub-agent.** Sibling step bodies do not.
3. **The DAG is canonical via step frontmatter** — if `root.md`'s table is out of sync, trust the frontmatter.
4. **Resume works step-granular.** If the user re-runs `/v-implement` mid-DAG, completed steps stay completed; only undone ones rerun.
5. **Don't tick manual checkboxes** until the user confirms — automated boxes can be ticked by the sub-agent or the orchestrator.

## Review Integration

If `file-review` is available and the user opted in:
- After each step's significant code changes, invoke `/file-review:file-review <changed-file>`.
- Process feedback with `file-review:process-review` before treating the step as done.
- Skip in Autopilot.
