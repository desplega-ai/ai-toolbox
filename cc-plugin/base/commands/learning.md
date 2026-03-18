---
description: Capture, search, and promote institutional learnings across projects
model: inherit
argument-hint: [capture|recall|promote|review] [args...]
---

# Learning

A command that invokes the `desplega:learning` skill to manage institutional knowledge.

## When Invoked

1. **ALWAYS invoke the `desplega:learning` skill:**
   - Pass the full argument string (subcommand + any additional args)
   - Let the skill handle routing, backend selection, and all flows

2. **If no arguments provided:**
   - Let the skill handle the setup/status flow (no need to prompt here)

## Example Usage

```
/learning                          # Show setup wizard or status
/learning capture "always run qmd update after writing files"
/learning recall qmd indexing
/learning promote thoughts/taras/learnings/2026-03-18-qmd-update.md
/learning review
```
