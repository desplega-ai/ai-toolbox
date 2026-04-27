---
description: Implement a DAG plan in parallel — topologically schedules ready steps and fans them out as sub-agents
model: inherit
argument-hint: [--autonomy=MODE] [plan_dir]
---

# v-implement

A thin wrapper that invokes the `desplega:v-implementing` skill with autonomy controls. Reads a plan directory produced by `/v-plan`, topologically schedules steps whose dependencies are done, and fans them out as parallel sub-agents.

## When Invoked

1. **Parse autonomy mode from arguments:**
   - Check for `--autonomy=autopilot|critical|verbose`
   - If `root.md` has `autonomy:` in frontmatter, use that as default
   - Otherwise, default to **Critical** (pauses between waves for verification)

2. **ALWAYS invoke the `desplega:v-implementing` skill:**
   - Pass the plan directory path
   - Pass the autonomy mode determined above
   - Let the skill handle the topological scheduling and fan-out

3. **If no plan path provided:**
   - Respond with: "I need a plan directory to proceed. Please provide the path to a `/v-plan` plan directory (containing `root.md` and `step-<n>.md` files)."

4. **If the path is a single `.md` file (linear plan):**
   - Suggest `/implement-plan` instead — `v-implementing` is for DAG plans.

## Example Usage

```
/v-implement thoughts/<username|shared>/plans/2026-04-27-multi-entity-feature/
/v-implement --autonomy=autopilot @plans/feature-dag/
/v-implement --autonomy=verbose @current-plan-dir/
```
