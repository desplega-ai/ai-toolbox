---
description: Improve or bootstrap an AGENTS.md / CLAUDE.md file using conditional `<important if>` blocks
model: inherit
argument-hint: [path-or-hint]
---

# improve-agents-md

Thin wrapper that invokes the `desplega:improve-agents-md` skill.

## When Invoked

1. **Invoke the `desplega:improve-agents-md` skill**, passing any argument as a hint about which file or directory to target.

2. **If no argument is provided:**
   - Let the skill auto-detect `CLAUDE.md` / `AGENTS.md` in the current repo root.
   - If neither exists, the skill will ask (via **AskUserQuestion**) whether to bootstrap a new one from the codebase or abort.

3. **Let the skill drive the flow** — it uses **AskUserQuestion** at decision points (which cuts to confirm, proposed structure, symlink creation, follow-ups). Do not front-run its questions.

## Example Usage

```
/improve-agents-md
/improve-agents-md apps/web/CLAUDE.md
/improve-agents-md the one in the monorepo root is too long
```
