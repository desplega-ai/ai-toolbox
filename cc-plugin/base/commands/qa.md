---
description: Functional validation with test evidence and QA reports
model: inherit
argument-hint: [--autonomy=MODE] [source-path]
---

# QA

A thin wrapper that invokes the `desplega:qa` skill with autonomy controls.

## When Invoked

1. **Parse flags from arguments:**
   - Check for `--autonomy=autopilot|critical|verbose` flag
   - Otherwise, default to **Critical** autonomy

2. **ALWAYS invoke the `desplega:qa` skill:**
   - Pass the source path (plan path, PR URL, or feature description)
   - Pass the autonomy mode determined above
   - Let the skill handle all QA logic

3. **If no input provided:**
   - Use **AskUserQuestion** to ask: "What would you like to QA? Please provide one of: a plan path, a PR URL, or a feature description."

## Example Usage

```
/qa thoughts/taras/plans/2026-03-16-my-feature.md
/qa --autonomy=autopilot thoughts/shared/plans/2026-03-16-feature.md
/qa --autonomy=verbose https://github.com/org/repo/pull/123
/qa "The new login flow with SSO"
```
