---
description: Create a DAG-structured implementation plan for parallel execution
model: inherit
argument-hint: [--autonomy=MODE] [file_or_task]
---

# v-plan

A thin wrapper that invokes the `desplega:v-planning` skill with autonomy controls. Produces a plan **directory** with `root.md` + one `step-<n>.md` per DAG node, so independent steps can be fanned out by `/v-implement`.

## When Invoked

1. **Parse autonomy mode from arguments:**
   - Check for `--autonomy=autopilot|critical|verbose`
   - If a provided file has `autonomy:` in frontmatter, use that as default
   - Otherwise, ask via AskUserQuestion:
     - Autopilot: research and write the plan dir independently, present for final review
     - Critical (Recommended): ask only for major design decisions and DAG-shape confirmation
     - Verbose: check in at each step, validate approach throughout

2. **ALWAYS invoke the `desplega:v-planning` skill:**
   - Pass any file paths or task descriptions
   - Pass the autonomy mode determined above
   - Let the skill handle all planning logic

3. **If no input provided:**
   ```
   I'll help you create a DAG-structured plan. Please provide:
   1. The task description (ideally one that fans out into independent slices)
   2. Any relevant context, constraints, or requirements
   3. Links to related research or brainstorms
   ```

## Example Usage

```
/v-plan @thoughts/<username|shared>/research/multi-entity-feature.md
/v-plan --autonomy=autopilot add three new admin pages in parallel
/v-plan --autonomy=verbose extract billing/notifications/audit into independent modules
```
