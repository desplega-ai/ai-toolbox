---
description: Execute a single plan phase as a background sub-agent
model: inherit
argument-hint: <plan-path> <phase-number>
---

# Run Phase

A thin wrapper that spawns a background Agent running the `desplega:phase-running` skill.

## When Invoked

1. **Validate arguments:**
   - Require both `<plan-path>` and `<phase-number>`
   - If either is missing, respond with: "Usage: `/run-phase <plan-path> <phase-number>`. Both the plan path and phase number are required."

2. **Spawn background Agent:**
   - Launch an Agent with `run_in_background: true`
   - Pass the `desplega:phase-running` skill with the plan path and phase number
   - Report to the user: "Phase [N] agent launched in background. You'll be notified when it completes."

3. **When agent completes:**
   - Present the agent's status report (completed/blocked/failed)
   - If completed, list the manual verification items that need user confirmation
   - If blocked/failed, present the details and suggested actions

## Example Usage

```
/run-phase thoughts/taras/plans/2026-03-09-new-base-skills.md 1
/run-phase thoughts/shared/plans/2026-03-09-feature.md 3
```
