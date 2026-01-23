---
date: 2026-01-23T14:30:00-08:00
planner: Claude
topic: "Brain CLI - Todo Management"
tags: [plan, brain, todos, cli]
status: draft
research: thoughts/taras/research/2026-01-22-journal-cli-research.md
parent_plan: thoughts/taras/plans/2026-01-22-brain-cli-mvp.md
---

# Brain CLI - Todo Management (Phase 3)

## Overview

Add todo management to the brain CLI. Todos are stored in a dedicated SQLite table (not extracted from markdown). Full CRUD operations with project scoping.

Based on research spec from `thoughts/taras/research/2026-01-22-journal-cli-research.md` (lines 299-309, 342-348).

## Desired End State

```bash
# Global todos
brain todo add "Review PR #123"
brain todo add --due tomorrow "Deploy to prod"
brain t add "shorthand"

# Project-scoped todos
brain todo add --project ai-toolbox "Ship feature"
brain todo add -p brain "Add tests"

# List todos
brain todo list                          # All open todos
brain todo list --all                    # Include completed
brain todo list --project ai-toolbox     # Project filter
brain todo ls                            # Alias

# Complete/manage
brain todo done 3                        # Mark #3 complete
brain todo done 3 5 7                    # Mark multiple
brain todo cancel 4                      # Mark cancelled
brain todo edit 3                        # Edit in $EDITOR (temp file)
brain todo rm 3                          # Delete permanently
```

**Verification**:
```bash
brain todo add "Test todo"
brain todo list                # Shows the todo with ID
brain todo done 1
brain todo list                # Empty (no open todos)
brain todo list --all          # Shows completed todo
```

## Database Schema Addition

Add to `brain/src/db/schema.ts`:

```sql
CREATE TABLE IF NOT EXISTS todos (
  id INTEGER PRIMARY KEY,
  project TEXT,                    -- NULL = global, else project name
  text TEXT NOT NULL,
  status TEXT DEFAULT 'open',      -- open, done, cancelled
  due_date TEXT,                   -- ISO date (YYYY-MM-DD) or NULL
  created_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS todos_status_idx ON todos(status);
CREATE INDEX IF NOT EXISTS todos_project_idx ON todos(project);
```

Note: Simpler than research spec - no `entry_id` or `line_number` since todos are CLI-managed, not extracted from markdown.

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `brain/src/db/schema.ts` | Modify | Add todos table + indexes |
| `brain/src/db/todos.ts` | Create | Todo repository (CRUD) |
| `brain/src/commands/todo.ts` | Create | Todo command with subcommands |
| `brain/src/index.ts` | Modify | Register todo command |

## Implementation

### 1. Update Schema

**File**: `brain/src/db/schema.ts`

Add todos table to `CREATE_SCHEMA`:
- `id`, `project`, `text`, `status`, `due_date`, `created_at`, `completed_at`
- Indexes on `status` and `project`

Bump `SCHEMA_VERSION` to 2 (handle migration if needed).

### 2. Create Todo Repository

**File**: `brain/src/db/todos.ts`

```typescript
interface Todo {
  id: number;
  project: string | null;
  text: string;
  status: 'open' | 'done' | 'cancelled';
  due_date: string | null;
  created_at: string;
  completed_at: string | null;
}

interface CreateTodoInput {
  text: string;
  project?: string;
  due_date?: string;
}

interface ListTodosOptions {
  project?: string;
  status?: 'open' | 'done' | 'cancelled' | 'all';
}

// Functions:
// - createTodo(input: CreateTodoInput): Promise<Todo>
// - listTodos(options?: ListTodosOptions): Promise<Todo[]>
// - getTodo(id: number): Promise<Todo | null>
// - updateTodo(id: number, updates: Partial<Todo>): Promise<Todo | null>
// - completeTodo(id: number): Promise<Todo | null>
// - cancelTodo(id: number): Promise<Todo | null>
// - deleteTodo(id: number): Promise<boolean>
```

### 3. Create Todo Command

**File**: `brain/src/commands/todo.ts`

Subcommand structure using Commander:

```typescript
export const todoCommand = new Command("todo")
  .alias("t")
  .description("Manage todos");

// brain todo add "text" [--project/-p] [--due/-d]
todoCommand
  .command("add")
  .argument("<text>", "Todo text")
  .option("-p, --project <name>", "Project scope")
  .option("-d, --due <date>", "Due date (tomorrow, next week, YYYY-MM-DD)")
  .action(...)

// brain todo list [--project/-p] [--all/-a]
todoCommand
  .command("list")
  .alias("ls")
  .option("-p, --project <name>", "Filter by project")
  .option("-a, --all", "Include completed/cancelled")
  .action(...)

// brain todo done <id...>
todoCommand
  .command("done")
  .argument("<ids...>", "Todo IDs to complete")
  .action(...)

// brain todo cancel <id>
todoCommand
  .command("cancel")
  .argument("<id>", "Todo ID")
  .action(...)

// brain todo edit <id>
todoCommand
  .command("edit")
  .argument("<id>", "Todo ID")
  .action(...)

// brain todo rm <id>
todoCommand
  .command("rm")
  .argument("<id>", "Todo ID")
  .action(...)
```

### 4. Due Date Parsing

Support natural language dates:
- `today` → today's date
- `tomorrow` → tomorrow
- `next week` → +7 days
- `YYYY-MM-DD` → exact date

Simple implementation - no external library needed.

### 5. Output Formatting

List output:
```
#  Project      Due        Text
1  -            -          Review PR #123
2  ai-toolbox   2026-01-24 Ship feature
3  brain        tomorrow   Add tests
```

Use chalk for colors:
- Overdue: red
- Due today: yellow
- Project: cyan
- Completed: dim/strikethrough

### 6. Register Command

**File**: `brain/src/index.ts`

Import and register `todoCommand`.

## Success Criteria

### Automated
- [ ] `bun tsc --noEmit` passes
- [ ] `bun run lint` passes
- [ ] `bun test` passes (including new todo tests)

### Manual
- [ ] `brain todo add "test"` creates todo
- [ ] `brain todo list` shows todo with ID
- [ ] `brain todo add -p myproject "task"` creates project-scoped todo
- [ ] `brain todo list -p myproject` filters by project
- [ ] `brain todo done 1` marks complete
- [ ] `brain todo list --all` shows completed
- [ ] `brain todo cancel 2` marks cancelled
- [ ] `brain todo edit 1` opens in editor
- [ ] `brain todo rm 1` deletes

## Testing

Add test file: `brain/test/db/todos.test.ts`
- Create, list, complete, cancel, delete operations
- Project scoping
- Status filtering

## Out of Scope

- Todo extraction from markdown files (separate feature)
- Recurring todos
- Priority levels
- Tags on todos
- Due date reminders/notifications
