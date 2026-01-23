---
date: 2026-01-23T10:45:00Z
topic: "Brain CLI Delete Command"
author: Claude
status: approved
---

# Plan: Add Delete Functionality to Brain CLI

## Overview

Add a `delete` (alias: `rm`) command to the brain CLI that allows users to delete notes/entries from both the filesystem and database. The implementation will follow existing patterns from the todo delete command and entry operations.

## Current State

- **Entries are stored in:** Filesystem (markdown files) + SQLite database
- **Database delete exists:** `deleteEntry(path)` in `src/db/entries.ts` (only deletes DB record)
- **No CLI command:** No `delete` or `rm` command exists for entries
- **Related patterns:** Todo `rm` command, `edit` command path handling

## Design Decisions (Approved)

1. **Confirmation by default** - Yes, require `--force` to skip
2. **Git auto-commit** - Yes, same as other commands
3. **Alias** - `rm` (matches todo rm, unix convention)
4. **Chunks deletion** - Handled automatically via CASCADE delete in schema

## Implementation Plan

### Phase 1: Database Layer Enhancement

**File:** `src/db/entries.ts`

1. **Enhance `deleteEntry()` to return boolean**
   - Current: Returns `void`
   - New: Return `true` if deleted, `false` if not found
   - This matches the `deleteTodo()` pattern

```typescript
// Pattern to follow (from todos.ts)
export async function deleteEntry(path: string): Promise<boolean> {
  const db = await getDb();
  const existing = await getEntry(path);
  if (!existing) return false;

  await db.execute({
    sql: "DELETE FROM entries WHERE path = ?",
    args: [path],
  });
  return true;
}
```

### Phase 2: CLI Command Implementation

**New File:** `src/commands/delete.ts`

Create the delete command following these conventions:

```typescript
export const deleteCommand = new Command("delete")
  .alias("rm")
  .description("Delete an entry")
  .argument("<path>", "Entry path (e.g., 2026/01/22 or notes/project)")
  .option("-f, --force", "Skip confirmation prompt")
  .option("--db-only", "Only delete from database, keep file")
  .action(async (pathArg: string, options) => {
    // Implementation
  });
```

**Implementation Steps:**

1. Get brain path from config (exit if not initialized)
2. Normalize the entry path using `normalizeEntryPath()`
3. Check if file exists on filesystem
4. Check if entry exists in database
5. If neither exists, error and exit
6. Unless `--force`, prompt for confirmation showing:
   - File path
   - Whether file exists on disk
   - Whether entry exists in DB
7. Delete from filesystem (unless `--db-only`)
8. Delete from database
9. Auto-commit the deletion to git (if file was deleted)
10. Output success message

**Edge Cases:**

- File exists but not in DB → Delete file, warn about DB
- In DB but file missing → Delete from DB only
- Neither exists → Error
- Path is a directory → Error (only single files)

### Phase 3: Register Command

**File:** `src/index.ts`

1. Import the new command
2. Add to program with `program.addCommand(deleteCommand)`

### Phase 4: Interactive Selection (Enhancement)

**Optional flag:** `--interactive` or `-i`

If no path argument provided and `-i` flag set, use fzf to select entry:

```typescript
.option("-i, --interactive", "Select entry interactively")
```

This leverages existing `src/utils/fzf.ts` patterns.

---

## Detailed Implementation

### File 1: `src/db/entries.ts` (Modification)

**Change:** Modify `deleteEntry()` return type

```typescript
// Before (current implementation)
export async function deleteEntry(path: string): Promise<void> {
  const db = await getDb();
  await db.execute({
    sql: "DELETE FROM entries WHERE path = ?",
    args: [path],
  });
}

// After
export async function deleteEntry(path: string): Promise<boolean> {
  const db = await getDb();
  const existing = await getEntry(path);
  if (!existing) return false;

  await db.execute({
    sql: "DELETE FROM entries WHERE path = ?",
    args: [path],
  });
  return true;
}
```

### File 2: `src/commands/delete.ts` (New)

```typescript
import { Command } from "commander";
import chalk from "chalk";
import { existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { getConfig } from "../config/index.js";
import { deleteEntry, getEntry } from "../db/entries.js";
import { normalizeEntryPath, resolveBrainPath } from "../utils/paths.js";
import { autoCommit } from "../utils/git.js";
import { confirm } from "../utils/prompts.js";

export const deleteCommand = new Command("delete")
  .alias("rm")
  .description("Delete an entry from brain")
  .argument("<path>", "Entry path (e.g., 2026/01/22 or notes/project)")
  .option("-f, --force", "Skip confirmation prompt")
  .option("--db-only", "Only remove from database, keep file on disk")
  .action(async (pathArg: string, options: { force?: boolean; dbOnly?: boolean }) => {
    const config = await getConfig();
    const brainPath = config?.path;

    if (!brainPath) {
      console.error(chalk.red("Brain not initialized. Run: brain init"));
      process.exit(1);
    }

    const normalizedPath = normalizeEntryPath(pathArg);
    const fullPath = join(brainPath, normalizedPath);

    // Check existence
    const fileExists = existsSync(fullPath);
    const dbEntry = await getEntry(normalizedPath);

    if (!fileExists && !dbEntry) {
      console.error(chalk.red(`Entry not found: ${normalizedPath}`));
      process.exit(1);
    }

    // Show what will be deleted
    console.log(chalk.dim("Entry to delete:"));
    console.log(`  Path: ${chalk.cyan(normalizedPath)}`);
    console.log(`  File: ${fileExists ? chalk.green("exists") : chalk.dim("not on disk")}`);
    console.log(`  DB:   ${dbEntry ? chalk.green("indexed") : chalk.dim("not indexed")}`);
    console.log();

    // Confirm unless --force
    if (!options.force) {
      const confirmed = await confirm("Delete this entry?");
      if (!confirmed) {
        console.log(chalk.dim("Cancelled."));
        return;
      }
    }

    // Delete file (unless --db-only)
    let fileDeleted = false;
    if (fileExists && !options.dbOnly) {
      unlinkSync(fullPath);
      fileDeleted = true;
    }

    // Delete from DB
    const dbDeleted = await deleteEntry(normalizedPath);

    // Auto-commit if file was deleted
    if (fileDeleted) {
      await autoCommit(
        [normalizedPath],
        `brain: delete ${normalizedPath}`,
        brainPath
      );
    }

    // Output result
    if (fileDeleted && dbDeleted) {
      console.log(chalk.green(`✓ Deleted ${normalizedPath} (file + database)`));
    } else if (fileDeleted) {
      console.log(chalk.green(`✓ Deleted file: ${normalizedPath}`));
      console.log(chalk.dim("  (was not in database)"));
    } else if (dbDeleted) {
      console.log(chalk.green(`✓ Removed from database: ${normalizedPath}`));
      if (options.dbOnly) {
        console.log(chalk.dim("  (file kept on disk)"));
      } else {
        console.log(chalk.dim("  (file was already missing)"));
      }
    }
  });
```

### File 3: `src/index.ts` (Modification)

```typescript
// Add import
import { deleteCommand } from "./commands/delete.js";

// Add to program (alongside other commands)
program.addCommand(deleteCommand);
```

---

## Testing Plan

### Manual Tests

1. **Delete existing entry:**
   ```bash
   brain add "test note to delete"
   brain rm 2026/01/23  # Today's file
   # Should prompt, delete file + DB, git commit
   ```

2. **Delete with --force:**
   ```bash
   brain new test/delete-me
   brain rm --force test/delete-me
   # Should skip confirmation
   ```

3. **Delete --db-only:**
   ```bash
   brain rm --db-only 2026/01/22
   # Should remove from DB but keep file
   ```

4. **Delete non-existent:**
   ```bash
   brain rm nonexistent/path
   # Should error: Entry not found
   ```

5. **Delete file not in DB:**
   ```bash
   echo "# Test" > ~/brain/orphan.md
   brain rm orphan
   # Should delete file, warn about DB
   ```

6. **Delete DB entry without file:**
   ```bash
   # (manually delete file after sync)
   brain rm some-old-entry
   # Should remove from DB only
   ```

### Unit Tests (if test suite exists)

Add tests to `test/` directory following existing patterns.

---

## Rollout Checklist

- [ ] Modify `src/db/entries.ts` - update `deleteEntry()` return type
- [ ] Create `src/commands/delete.ts`
- [ ] Modify `src/index.ts` - register command
- [ ] Test all scenarios manually
- [ ] Update README.md with delete command documentation

---

## Dependencies

None new. Uses existing:
- `commander` (CLI)
- `chalk` (output)
- `node:fs` (file ops)
- `../utils/prompts.js` (confirm function)
- `../utils/git.js` (auto-commit)

---

## Estimated Scope

- **Files changed:** 3
- **Lines of code:** ~80 new, ~5 modified
- **Complexity:** Low (follows existing patterns exactly)
