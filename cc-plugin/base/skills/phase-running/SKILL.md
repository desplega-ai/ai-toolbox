---
name: phase-running
description: Execute individual plan phases as background sub-agents for context-efficient implementation.
hooks:
  PostToolUse:
    - matcher: "Edit|Write"
      hooks:
        - type: command
          command: "${CLAUDE_PLUGIN_ROOT}/hooks/plan_checkbox_reminder.py"
---

# Phase Running

You are executing a single phase of an implementation plan as an atomic background sub-agent. You work autonomously to completion and report results — you do NOT interact with the user.

## Execution Model

This skill is designed to run inside a background `Agent` (sub-agent), NOT in the main session. The implementing skill (or user) spawns it via the Agent tool with `run_in_background: true`.

The phase agent receives:
- **Plan path**: Full path to the plan file
- **Phase number**: Which phase to execute
- **Relevant context**: Any additional context from the caller

## When to Use

This skill activates when:
- The implementing skill spawns a phase agent (default execution mode)
- User invokes `/run-phase` command for manual phase execution
- Another skill references `desplega:phase-running`

## Autonomy

Phase agents always run as **Autopilot** within the sub-agent. The calling context (implementing skill or user) controls the outer autonomy and handles human checkpoints.

**CRITICAL**: Phase agents do NOT use AskUserQuestion. If something is ambiguous, report `blocked` status with details. The caller handles all user interaction.

## Process Steps

### Step 1: Load Context

1. Read the full plan file
2. Extract the specific phase to execute (by phase number)
3. Read all files mentioned in the phase's "Changes Required" section
4. Understand the phase's success criteria

### Step 2: Pre-flight Check

Verify before executing:

| Check | Action if failed |
|-------|-----------------|
| Previous phases completed | Check that prior phases' automated verification items are checked. If not, report `blocked` |
| No merge conflicts | Check target files for conflict markers. If found, report `blocked` |
| Phase dependencies met | Verify files/directories from previous phases exist. If missing, report `blocked` |

### Step 3: Execute Phase

Implement all changes described in the phase:
1. Follow the plan's instructions precisely
2. Create/edit files as specified in "Changes Required"
3. Adapt to minor mismatches (file paths moved, code slightly different) without blocking
4. For significant mismatches, report `blocked` with details

### Step 4: Run Verification

Execute the automated verification commands from the phase's "Success Criteria" section:
1. Run each command listed under "Automated Verification"
2. Record pass/fail for each
3. If a check fails, attempt to fix the issue and re-run
4. If a check continues to fail after one fix attempt, include it in the report

### Step 5: Update Plan

- Check off (`- [x]`) automated verification items that passed
- Do **NOT** check off manual verification items — those require human confirmation
- Update the plan's `last_updated` and `last_updated_by` frontmatter fields

### Step 6: Report Results

The agent's return message MUST include:

**If completed:**
```
Status: completed
Phase: [N] - [Phase name]
Files changed: [list of files created/modified]
Automated checks: [N/M passed]
- [x] [Check 1] — passed
- [x] [Check 2] — passed
Manual verification needed:
- [ ] [Manual check 1]
- [ ] [Manual check 2]
```

**If blocked:**
```
Status: blocked
Phase: [N] - [Phase name]
Reason: [Clear description of what's blocking]
Partial progress: [What was completed before blocking]
Suggested action: [How the caller/user can unblock]
```

**If failed:**
```
Status: failed
Phase: [N] - [Phase name]
Error: [Error details]
Partial progress: [What was completed before failure]
Files modified: [List of files that were changed before failure]
```

## Atomicity Contract

Phase agents are atomic — they run to completion or stop:
- No interactive questions (no AskUserQuestion)
- No partial states left unexplained
- If blocked or failed, the report includes enough detail for the caller to decide next steps
- All file changes are documented in the report

## Context Handoff Pattern

| Direction | Data |
|-----------|------|
| **Caller → Phase Agent** | Plan path + phase number + autonomy mode |
| **Phase Agent reads** | Plan file + all source files referenced in the phase |
| **Phase Agent → Caller** | Status + changed files + verification results |
| **Caller handles** | Manual verification, cross-phase coordination, human checkpoints |
