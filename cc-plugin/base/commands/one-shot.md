---
description: Plan and implement a small task in one session with a lightweight yolo plan
model: inherit
argument-hint: "[task]"
---

# One-Shot

A thin wrapper that invokes the `desplega:one-shot` skill: small-scope plan+implement in one session.

## When Invoked

1. **ALWAYS invoke the `desplega:one-shot` skill:**
   - Pass the task description (the full argument string)
   - Let the skill assess ceremony, maintain the yolo plan, implement, verify, review, commit

2. **If no task provided:**
   - Use AskUserQuestion: "What should I build? (Keep it small — ≤ ~3 phases, one subsystem. Bigger work goes through /create-plan.)"

3. **Scope reminder:** the skill's HARD escalation rule applies — if the work grows past ~3 phases or a second subsystem, it stops and hands off to `/desplega:create-plan`.

## Example Usage

```
/one-shot add a --json flag to the stats command
/one-shot fix the off-by-one in the pagination cursor and add a regression test
/one-shot rename the `sync` config key to `mirror` across the CLI
```
