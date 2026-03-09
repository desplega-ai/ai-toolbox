---
description: Structured critique of research, plan, and brainstorm documents
model: inherit
argument-hint: [--autonomy=MODE] [--output=append|separate] <path>
---

# Review Document

A thin wrapper that invokes the `desplega:reviewing` skill with autonomy controls.

## When Invoked

1. **Parse flags from arguments:**
   - Check for `--autonomy=autopilot|critical|verbose` flag
   - Check for `--output=append|separate` flag (sets output mode preference, skipping the preference question)
   - Otherwise, default to **Critical** autonomy

2. **ALWAYS invoke the `desplega:reviewing` skill:**
   - Pass the document path
   - Pass the autonomy mode determined above
   - Pass the output mode if specified
   - Let the skill handle all review logic

3. **If no path provided:**
   - Respond with: "I need a document to review. Please provide the path to the research, plan, or brainstorm document you'd like me to review."

## Example Usage

```
/review thoughts/taras/research/2026-03-09-new-base-skills.md
/review --autonomy=autopilot --output=append thoughts/taras/plans/2026-03-09-feature.md
/review --output=separate thoughts/shared/brainstorms/2026-03-09-idea.md
```
