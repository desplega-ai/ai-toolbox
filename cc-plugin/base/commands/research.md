---
description: Document codebase as-is with thoughts directory for historical context
model: opus
argument-hint: [--autonomy=MODE] [query]
allowed-tools: Read, Grep, Glob
---

# Research Codebase

A thin wrapper that invokes the `desplega:researching` skill with autonomy controls.

## When Invoked

1. **Parse autonomy mode from arguments:**
   - Check for `--autonomy=autopilot|critical|verbose` flag
   - If document frontmatter has `autonomy:` field, use that as default
   - Otherwise, ask the user via AskUserQuestion:

   ```
   How much should I check in with you during this research?
   - Autopilot: Work independently, only present final results
   - Critical questions (Recommended): Ask only when blocked or for major decisions
   - Verbose: Check in frequently, validate approach at each step
   ```

2. **ALWAYS invoke the `desplega:researching` skill:**
   - Pass the research query (everything after the flag)
   - Pass the autonomy mode determined above
   - Let the skill handle all research logic

3. **If no query provided:**
   - Respond with: "I'm ready to research the codebase. Please provide your research question or area of interest."

## Example Usage

```
/research how does the authentication system work
/research --autonomy=autopilot document all API endpoints
/research --autonomy=verbose analyze the database schema
```
