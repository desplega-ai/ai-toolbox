---
description: Implement technical plans from a predefined plan file
model: inherit
argument-hint: [--autonomy=MODE] [plan_path]
---

# Implement Plan

A thin wrapper that invokes the `desplega:implementing` skill with autonomy controls.

## When Invoked

1. **Parse autonomy mode from arguments:**
   - Check for `--autonomy=autopilot|critical|verbose` flag
   - If plan file has `autonomy:` in frontmatter, use that as default
   - Otherwise, default to **Critical** (don't prompt - implementation is more straightforward)

2. **Invoke the `desplega:implementing` skill:**
   - Pass the plan file path
   - Pass the autonomy mode determined above
   - Let the skill handle all implementation logic

3. **If no plan path provided:**
   - Respond with: "I need a plan file to proceed. Please provide the path to the plan you would like me to implement."

## Example Usage

```
/implement-plan thoughts/shared/plans/2026-01-14-my-feature.md
/implement-plan --autonomy=autopilot @plans/feature.md
/implement-plan --autonomy=verbose @current-plan.md
```
