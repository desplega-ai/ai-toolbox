---
date: 2026-01-23T10:00:00-08:00
planner: Claude
topic: "Brain CLI Cron Auto-Sync"
tags: [plan, cli, typescript, bun, cron, brain]
status: complete
research: thoughts/taras/research/2026-01-22-journal-cli-research.md
parent_plan: thoughts/taras/plans/2026-01-22-brain-cli-mvp.md
---

# Brain CLI Cron Auto-Sync Plan

## Overview

Implement Phase 5 from the research document: automatic background sync via crontab.

This adds a `brain cron` command with subcommands to manage a crontab entry that periodically runs `brain sync --quiet` in the background.

## Current State

- `brain sync` exists and works correctly
- `brain sync --quiet` flag is already implemented (suppresses output)
- Brain is installed at `/Users/taras/.bun/bin/brain` (via `bun link`)
- No crontab entries exist currently

## Desired End State

```bash
# Install cron job (default: every 5 minutes)
brain cron install                    # → adds crontab entry
brain cron install --interval 15      # → custom interval in minutes

# Check status
brain cron status                     # → shows if cron is active and interval

# Remove cron job
brain cron remove                     # → removes crontab entry
```

**Verification:**
```bash
brain cron install
crontab -l | grep brain              # Shows: */5 * * * * /path/to/brain sync --quiet
brain cron status                     # Shows: Active (every 5 minutes)
brain cron remove
crontab -l | grep brain              # No output
```

## What We're NOT Doing

- **No LaunchAgent/launchd**: macOS-specific, adds complexity. Crontab is simpler and cross-platform.
- **No file watcher**: Real-time indexing is future scope. Periodic cron is sufficient.
- **No log file management**: Errors go to /dev/null or user's mail. Keep it simple.
- **No lock file**: If sync is already running, libSQL handles concurrent access.

---

## Implementation

### File: `brain/src/commands/cron.ts`

**New file** following the pattern from `todo.ts` (subcommand structure).

```typescript
export const cronCommand = new Command("cron")
  .description("Manage automatic background sync");

// brain cron install [--interval/-i]
cronCommand.command("install")
  .option("-i, --interval <minutes>", "Sync interval in minutes", "5")
  .action(async (options) => { /* ... */ });

// brain cron status
cronCommand.command("status")
  .action(async () => { /* ... */ });

// brain cron remove
cronCommand.command("remove")
  .action(async () => { /* ... */ });
```

### Crontab Manipulation Logic

**Install:**
1. Get the full path to `brain` binary using `which brain` or `Bun.which("brain")`
2. Validate interval is a positive integer (1-60 reasonable range)
3. Read current crontab: `crontab -l 2>/dev/null`
4. Check if brain sync entry already exists (grep for marker comment)
5. If exists, update the interval; otherwise, append new entry
6. Format: `*/5 * * * * /full/path/to/brain sync --quiet 2>/dev/null # brain-autosync`
7. Write new crontab: `echo "$new_crontab" | crontab -`

**Status:**
1. Read crontab: `crontab -l 2>/dev/null`
2. Grep for `# brain-autosync` marker
3. If found, parse the interval from `*/N` and display "Active (every N minutes)"
4. If not found, display "Not active"

**Remove:**
1. Read current crontab: `crontab -l 2>/dev/null`
2. Filter out lines containing `# brain-autosync`
3. Write filtered crontab back
4. If crontab becomes empty, use `crontab -r` to remove entirely

### Marker Comment Pattern

Use `# brain-autosync` as a unique marker at the end of the crontab line. This allows:
- Safe identification of our entry among other crontab entries
- Easy parsing and removal
- Human-readable identification

### Error Handling

- If `brain` binary not found: Error with instructions to run `bun link` in brain directory
- If crontab command fails: Error with system message
- If interval is invalid: Error with valid range

---

## Changes Required

### 1. Create cron command
**File**: `brain/src/commands/cron.ts` (new)

Full implementation with:
- `install` subcommand with `--interval` option
- `status` subcommand
- `remove` subcommand
- Helper functions for crontab manipulation

### 2. Register cron command
**File**: `brain/src/index.ts` (update)

Add:
```typescript
import { cronCommand } from "./commands/cron.ts";
// ...
program.addCommand(cronCommand);
```

### 3. Add utility for binary path
**File**: `brain/src/utils/paths.ts` (update, optional)

Add function to get brain binary path:
```typescript
export async function getBrainBinaryPath(): Promise<string | undefined> {
  // Use Bun.which or shell which command
}
```

Alternatively, inline this in cron.ts to keep it simple.

---

## Success Criteria

### Automated Verification
- [ ] `cd brain && bun tsc` - Types check
- [ ] `cd brain && bun run lint` - Lint passes
- [ ] `brain cron --help` - Shows subcommands

### Manual Verification
- [ ] `brain cron install` - Adds crontab entry
- [ ] `crontab -l` - Shows `*/5 * * * * /path/to/brain sync --quiet 2>/dev/null # brain-autosync`
- [ ] `brain cron status` - Shows "Active (every 5 minutes)"
- [ ] `brain cron install --interval 10` - Updates to 10-minute interval
- [ ] `brain cron status` - Shows "Active (every 10 minutes)"
- [ ] `brain cron remove` - Removes entry
- [ ] `brain cron status` - Shows "Not active"
- [ ] Wait 5 minutes after install, verify `.brain.db` was updated (check mtime)

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `brain/src/commands/cron.ts` | Create | Cron management command |
| `brain/src/index.ts` | Modify | Register cron command |

---

## References

- Parent plan: `thoughts/taras/plans/2026-01-22-brain-cli-mvp.md`
- Research (Phase 5): `thoughts/taras/research/2026-01-22-journal-cli-research.md` (lines 461-466)
- Subcommand pattern: `brain/src/commands/todo.ts`
- Sync command: `brain/src/commands/sync.ts`
