---
description: Generate durable validation scripts from testing intent
model: inherit
argument-hint: [--autonomy=MODE] [intent]
---

# Script Builder

A thin wrapper that invokes the `desplega:script-builder` skill with autonomy controls.

## When Invoked

1. **Parse autonomy mode from arguments:**
   - Check for `--autonomy=autopilot|critical|verbose` flag
   - Otherwise, default to **Critical**

2. **ALWAYS invoke the `desplega:script-builder` skill:**
   - Pass the intent (everything after the flag) as the script topic
   - Pass the autonomy mode determined above
   - Let the skill handle all script generation logic (mode detection, dedup scan, drafting, syntax check, doc edit, optional escalation)

3. **If no intent provided:**
   - Use **AskUserQuestion**: "What do you want to validate or test? Describe the scenario, success signal, and any inputs/env."

## Example Usage

```
/script-builder test the /api/health endpoint
/script-builder --autonomy=autopilot validate the ingestion pipeline writes to the right table
/script-builder --autonomy=verbose smoke-check the prod API after deploy
/script-builder turn this into a script   # retrospective mode — uses recent session activity
```
