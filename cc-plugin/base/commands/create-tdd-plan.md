---
description: Create TDD implementation plans with strict Red-Green-Commit/Rollback cycles
model: opus
argument-hint: [--autonomy=MODE] [file_or_task]
---

# Create TDD Plan

A thin wrapper that invokes the `desplega:tdd-planning` skill with autonomy controls.

## When Invoked

1. **Parse autonomy mode from arguments:**
   - Check for `--autonomy=autopilot|critical|verbose` flag
   - If provided file has `autonomy:` in frontmatter, use that as default
   - Otherwise, ask the user via AskUserQuestion:

   ```
   How much should I check in with you during TDD planning?
   - Autopilot: Research and create TDD plan independently, present for final review
   - Critical questions (Recommended): Ask only for major test strategy decisions
   - Verbose: Check in at each step, validate test approach throughout
   ```

2. **ALWAYS invoke the `desplega:tdd-planning` skill:**
   - Pass any file paths or task descriptions
   - Pass the autonomy mode determined above
   - Let the skill handle all TDD planning logic

3. **If no input provided:**
   - Respond with:
   ```
   I'll help you create a TDD implementation plan. Please provide:
   1. The task description
   2. Any relevant context, constraints, or specific requirements
   3. Links to related research or previous implementations

   Remember: TDD plans structure work as RED → GREEN → COMMIT cycles.
   Every implementation step starts with a failing test.
   ```

## Example Usage

```
/create-tdd-plan @thoughts/<username|shared>/research/my-feature.md
/create-tdd-plan --autonomy=autopilot implement user validation
/create-tdd-plan --autonomy=verbose add payment processing
```
