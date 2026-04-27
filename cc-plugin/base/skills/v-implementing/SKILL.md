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

**All user-facing questions go through `AskUserQuestion`** — see `desplega:ask-user` for conventions. Never ask in chat as plain bullets.

**All read/research/validation work goes through sub-agents** — keep raw tool output out of the main session. Default to `run_in_background: true`. The fan-out scheduler below is built on this.

The autonomy mode (below) controls how often you check in. AskUserQuestion is always the mechanism.

File-review is on by default — when significant changes land in a step (or wave), invoke `/file-review:file-review <path>` for inline feedback (skip only if Autopilot).

## Autonomy Mode

| Mode | Behavior |
|------|----------|
| **Autopilot** | Drain the DAG without pausing. Only stop on blocker / failed step. |
| **Critical** (Default) | Pause when each *wave* of parallel steps completes; wait for manual verification before unlocking the next wave. |
| **Verbose** | Pause after each individual step (even within a wave). |

## Initial Setup Questions

After understanding the plan and before the scheduler loop starts, gather implementation-specific details (skip in Autopilot):

### 1. Branch / Worktree Setup

Check the current branch: `git branch --show-current`. Then check if the `wts` plugin is installed (look for `wts:wts` in available skills).

**If wts is installed**, use **AskUserQuestion**:

| Question | Options |
|----------|---------|
| "You're on `<current-branch>`. Where would you like to implement?" | 1. Continue on current branch, 2. Create a new branch, 3. Create a wts worktree |

**If wts is not installed**, drop the worktree option.

### 2. Commit Strategy

Use **AskUserQuestion**:

| Question | Options |
|----------|---------|
| "How would you like to handle commits during parallel implementation?" | 1. Commit after each step completes (Recommended), 2. Commit at the end (single commit), 3. Let me decide as I go |

If "Commit after each step" is selected, after a step's manual verification passes, create a commit: `[step-N] <step name>`.

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

The scheduler reads each step's frontmatter `status` (`ready` | `claimed` | `done`) and `depends_on`. The frontmatter `status` field is the **single source of truth** — multiple orchestrator instances on the same plan dir coordinate through it (each `desplega:step-running` sub-agent atomically claims its step before doing work).

```
while any step has status != done:
    ready = [step for step in steps
             if step.status == "ready"
             and all(dep.status == "done" for dep in step.depends_on)]
    if not ready:
        # DAG drained, OR every remaining undone step is claimed by another worker
        if any step has status == claimed: wait for in-flight claims to resolve
        else: report stuck (likely cycle or unrecoverable failure)
        continue
    fan out each step in `ready` as a parallel `desplega:step-running` sub-agent
    wait for the wave to complete
    review reports; step-running has already updated frontmatter
        (status: done on success, status: ready on retry-able failure, status: claimed if held for investigation)
    if Critical mode: pause for manual verification of newly-completed steps
    if any failed: stop and ask user how to proceed
```

### Spawning a Step Sub-agent

Use the `Agent` tool with `run_in_background: true`, invoking `desplega:step-running`. Pass:

- **Step path**: full path to `step-<n>.md`
- **Plan dir**: full path to the parent plan directory
- **Agent ID**: unique ID for this sub-agent (e.g. orchestrator session ID + step ID + timestamp). step-running uses this for atomic claim + stale-claim detection.
- **Plan-level context** (optional): a quick brief from `root.md`. step-running re-reads `root.md` itself, so this is just to reduce round-trips.

`step-running` owns:
- Atomic claim (rewrite frontmatter `status: ready` → `status: claimed, assignee: <agent-id>, claimed_at: <ts>`)
- Three-bucket verification (Automated Verification, Automated QA, QA Doc identification)
- Terminal status transition (`status: done` on success, `status: ready` on retry-able failure)
- Reporting back

The orchestrator does NOT do step work itself — it delegates. See `desplega:step-running` for the full sub-agent contract.

### Wave Completion

When a wave finishes:
1. **Review each agent's report.** Mark steps `done` only if `completed` was reported.
2. **Handle `QA Doc: <path>`** — for each step that reported a QA doc, invoke `desplega:qa` against that path. The Automated QA bucket inside the step is already handled by the sub-agent; only the linked doc needs separate orchestration here. (`QA: n/a` → proceed normally.)
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
