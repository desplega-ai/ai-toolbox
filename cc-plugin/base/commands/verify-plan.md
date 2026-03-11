---
description: Post-implementation plan verification and audit
model: inherit
argument-hint: [--autonomy=MODE] [plan-path]
---

# Verify Plan

A thin wrapper that invokes the `desplega:verifying` skill with autonomy controls.

## When Invoked

1. **Parse autonomy mode from arguments:**
   - Check for `--autonomy=autopilot|critical|verbose` flag
   - If plan file has `autonomy:` in frontmatter, use that as default
   - Otherwise, default to **Critical**

2. **ALWAYS invoke the `desplega:verifying` skill:**
   - Pass the plan file path
   - Pass the autonomy mode determined above
   - Let the skill handle all verification logic

3. **If no plan path provided:**
   - Search for plans with `status: in-progress` or `status: completed` in `thoughts/*/plans/`
   - If multiple found, use **AskUserQuestion** to ask which plan to verify (list them as options)
   - If none found, respond with: "No active plans found. Please provide the path to the plan you'd like to verify."

## Example Usage

```
/verify-plan thoughts/taras/plans/2026-03-09-new-base-skills.md
/verify-plan --autonomy=autopilot thoughts/shared/plans/2026-03-09-feature.md
/verify-plan --autonomy=verbose
```
