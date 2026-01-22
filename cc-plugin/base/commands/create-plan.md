---
description: Create detailed implementation plans through interactive research and iteration
model: inherit
argument-hint: [--autonomy=MODE] [file_or_task]
---

# Create Plan

A thin wrapper that invokes the `desplega:planning` skill with autonomy controls.

## When Invoked

1. **Parse autonomy mode from arguments:**
   - Check for `--autonomy=autopilot|critical|verbose` flag
   - If provided file has `autonomy:` in frontmatter, use that as default
   - Otherwise, ask the user via AskUserQuestion:

   ```
   How much should I check in with you during planning?
   - Autopilot: Research and create plan independently, present for final review
   - Critical questions (Recommended): Ask only for major design decisions
   - Verbose: Check in at each step, validate approach throughout
   ```

2. **ALWAYS invoke the `desplega:planning` skill:**
   - Pass any file paths or task descriptions
   - Pass the autonomy mode determined above
   - Let the skill handle all planning logic

3. **If no input provided:**
   - Respond with:
   ```
   I'll help you create a detailed implementation plan. Please provide:
   1. The task description
   2. Any relevant context, constraints, or specific requirements
   3. Links to related research or previous implementations
   ```

## Example Usage

```
/create-plan @thoughts/<username|shared>/research/my-feature.md
/create-plan --autonomy=autopilot implement user authentication
/create-plan --autonomy=verbose add caching layer
```
