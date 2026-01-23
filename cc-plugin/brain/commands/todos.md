---
description: Manage todos across your brain entries
argument-hint: [list|add|done] [args...]
allowed-tools: Bash, Grep, Read
---

# Brain Todos Management

Manage `- [ ]` style todos across your brain entries.

## Important

The brain CLI doesn't have a dedicated todo command yet. This skill uses grep/search to find and manage todos manually.

## Commands

### List todos

Find all open todos in your brain:

```bash
brain search --exact "- [ ]"
```

Or with grep for more context:

```bash
grep -rn "\- \[ \]" "$(brain config show | grep path | cut -d: -f2 | tr -d ' ')" --include="*.md"
```

### Add todo

Add a todo to today's file:

```bash
brain add "- [ ] <task description>"
```

Or to a specific file:

```bash
brain add --file projects/tasks.md "- [ ] <task description>"
```

### Mark done

1. First find the file containing the todo using search
2. Use `brain edit <path>` to open in editor
3. Change `- [ ]` to `- [x]`

Or provide the exact file if known and use sed:

```bash
# Example - mark first matching todo as done in a file
sed -i '' 's/- \[ \] <exact task text>/- [x] <exact task text>/' "<brain-path>/<file>.md"
```

## Workflow

1. When user says "list todos" or "what are my todos" → search for `- [ ]`
2. When user says "add todo: X" → use `brain add "- [ ] X"`
3. When user says "done: X" → find file, then edit to mark complete
