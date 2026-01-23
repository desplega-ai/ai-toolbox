---
description: Manage todos with the brain CLI
argument-hint: [list|add|done|cancel|edit|rm] [args...]
allowed-tools: Bash
---

# Brain Todos Management

Manage todos using the `brain todo` command.

## Commands

### List todos

```bash
# List open todos
brain todo list

# Include completed/cancelled
brain todo list --all

# Filter by project
brain todo list -p myproject

# Combine filters
brain todo ls -a -p work
```

### Add todo

```bash
# Simple todo
brain todo add "Review PR #123"

# With project scope
brain todo add -p myproject "Ship the feature"

# With due date
brain todo add -d tomorrow "Deploy to prod"
brain todo add --due "2024-12-31" "Year-end review"
brain todo add -d "next week" "Plan sprint"

# Combine options
brain todo add -p work -d tomorrow "Finish report"
```

### Mark done

```bash
# Single todo
brain todo done 1

# Multiple todos
brain todo done 1 2 3
```

### Cancel todo

```bash
brain todo cancel 1
```

### Edit todo

Opens the todo text in your editor:

```bash
brain todo edit 1
```

### Delete todo

Permanently remove a todo:

```bash
brain todo rm 1
```

## Workflow

1. When user says "list todos" or "what are my todos" → `brain todo list`
2. When user says "add todo: X" → `brain todo add "X"`
3. When user says "done: X" → find the ID with `brain todo list`, then `brain todo done <id>`
4. When user says "cancel: X" → find the ID, then `brain todo cancel <id>`
