---
description: Interactive exploration of ideas through Socratic Q&A
model: inherit
argument-hint: [--autonomy=MODE] [topic]
---

# Brainstorm

A thin wrapper that invokes the `desplega:brainstorming` skill with autonomy controls.

## When Invoked

1. **Parse autonomy mode from arguments:**
   - Check for `--autonomy=verbose|critical` flag
   - Only Verbose and Critical are valid — if Autopilot is requested, fall back to Critical with a note
   - Otherwise, default to **Verbose** (brainstorming is inherently interactive)

2. **ALWAYS invoke the `desplega:brainstorming` skill:**
   - Pass the topic (everything after the flag)
   - Pass the autonomy mode determined above
   - Let the skill handle all brainstorming logic

3. **If no topic provided:**
   - Use AskUserQuestion: "What would you like to explore?"

## Example Usage

```
/brainstorm how should we handle authentication
/brainstorm --autonomy=critical redesign the caching layer
/brainstorm should we use a monorepo or polyrepo
```
