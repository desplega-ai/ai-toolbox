---
date: 2026-01-09T18:00:00-08:00
author: Claude
git_commit: e616532d713c40f206a01f26e6ae3f25c1edff27
branch: main
repository: ai-toolbox
topic: "AI Tracker Implementation Plan"
tags: [plan, ai-tracker, claude-code, git-hooks, code-tracking]
status: approved
last_updated: 2026-01-09
last_updated_by: Claude
---

# AI vs Human Code Tracking Tool - Implementation Plan

## Overview

Build a tool (`ai-tracker`) that tracks what percentage of code changes in git repos are AI-generated (via Claude Code) vs human-made (via neovim or other editors). This will be a new sub-project in the ai-toolbox monorepo following the existing patterns.

## Design Decisions (Confirmed)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Git hooks | **Global** with delegation | One-time setup, works across all repos |
| Tracking granularity | **Line-level** | More accurate attribution for mixed edits |
| Historical data | **Start fresh** | Clean slate, no backfill complexity |
| Storage | **SQLite** | Built into Python, handles millions of rows, fast queries |

## Current State Analysis

### Existing Infrastructure
- **cc-hooks/**: Python-based Claude Code hooks for macOS notifications (`mac-notify.py`, `setup.py`)
- **cc-notch/**: SwiftBar cost tracker using ccusage library
- **~/.claude/settings.json**: Already has hooks for WakaTime and mac-notify that must be preserved

### Research Completed
The following research documents provide the foundation:
1. `thoughts/shared/research/2026-01-09-ai-vs-human-code-tracking.md` - Core architecture
2. `thoughts/shared/research/2026-01-09-existing-claude-hooks-audit.md` - Current hooks setup
3. `thoughts/shared/research/2026-01-09-global-git-hooks-compatibility.md` - Git hooks compatibility
4. `thoughts/shared/research/2026-01-09-line-counting-accuracy.md` - Line counting algorithms
5. `thoughts/shared/research/2026-01-09-stats-visualization-options.md` - Visualization options

## Desired End State

A working system that:
1. Logs every Claude Code edit (Edit/Write tools) with **line-level counts**
2. Logs every git commit with per-file line statistics
3. Attributes lines to AI or human based on Claude edit log
4. Provides CLI stats visualization with Rich + Plotext
5. Works across **all repos globally** via `core.hooksPath` with delegation

### Verification Commands
```bash
# After full implementation:
ai-tracker stats              # Shows AI vs human stats
sqlite3 ~/.config/ai-tracker/tracker.db "SELECT * FROM edits LIMIT 5"   # Claude edit log
sqlite3 ~/.config/ai-tracker/tracker.db "SELECT * FROM commits LIMIT 5" # Commit log
```

## What We're NOT Doing

- Web dashboard (Phase 3+ in visualization research)
- Line-level git blame integration
- Integration with other AI tools (Copilot, Cursor, etc.)
- Real-time status line integration
- Historical backfill from git history

---

## Implementation Approach

The tool consists of three components:

1. **Claude Code Hook** (`PostToolUse`) - Logs Edit/Write operations with line counts
2. **Git Hook** (`post-commit`) - Logs commits and attributes changes
3. **CLI Stats Tool** - Queries database and displays statistics

Storage: SQLite database at `~/.config/ai-tracker/tracker.db`

### Database Schema

```sql
-- Claude Code edits (before commit)
CREATE TABLE edits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    session_id TEXT NOT NULL,
    tool TEXT NOT NULL,  -- 'Edit' or 'Write'
    file_path TEXT NOT NULL,
    lines_added INTEGER NOT NULL,
    lines_removed INTEGER NOT NULL,
    cwd TEXT NOT NULL,
    committed INTEGER DEFAULT 0  -- 0=pending, 1=committed
);

-- Git commits with attribution
CREATE TABLE commits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    commit_sha TEXT NOT NULL,
    repo_name TEXT NOT NULL,
    repo_path TEXT NOT NULL,
    ai_lines_added INTEGER NOT NULL,
    ai_lines_removed INTEGER NOT NULL,
    human_lines_added INTEGER NOT NULL,
    human_lines_removed INTEGER NOT NULL
);

-- Per-file breakdown within each commit
CREATE TABLE commit_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    commit_id INTEGER NOT NULL,
    file_path TEXT NOT NULL,
    lines_added INTEGER NOT NULL,
    lines_removed INTEGER NOT NULL,
    ai_lines_added INTEGER NOT NULL,
    ai_lines_removed INTEGER NOT NULL,
    FOREIGN KEY (commit_id) REFERENCES commits(id)
);

-- Indexes for fast queries
CREATE INDEX idx_edits_file ON edits(file_path);
CREATE INDEX idx_edits_timestamp ON edits(timestamp);
CREATE INDEX idx_edits_committed ON edits(committed);
CREATE INDEX idx_commits_timestamp ON commits(timestamp);
CREATE INDEX idx_commits_repo ON commits(repo_name);
```

---

## Phase 1: Project Setup

### Overview
Create the ai-tracker sub-project structure following existing patterns.

### Changes Required:

#### 1. Create Project Directory
**Directory**: `ai-tracker/`

```
ai-tracker/
├── README.md
├── pyproject.toml
├── src/
│   └── ai_tracker/
│       ├── __init__.py
│       ├── db.py                       # SQLite database module
│       ├── hooks/
│       │   ├── __init__.py
│       │   ├── log_claude_edit.py      # PostToolUse hook
│       │   └── capture_before_write.py  # PreToolUse hook (for Write)
│       ├── git/
│       │   ├── __init__.py
│       │   └── post_commit.py          # Git post-commit hook
│       ├── stats/
│       │   ├── __init__.py
│       │   ├── query.py                # Query/aggregate from SQLite
│       │   └── display.py              # Rich + Plotext visualization
│       ├── cli.py                      # Main CLI entry point
│       └── config.py                   # Configuration and paths
└── tests/
    └── __init__.py
```

### Success Criteria:

#### Automated Verification:
- [x] `uv sync` runs without errors
- [x] `uv run python -c "import ai_tracker"` works

---

## Phase 2: Claude Code Hooks

### Overview
Implement hooks to capture every Claude Code edit with line statistics.

### Changes Required:

#### 1. PostToolUse Hook for Edit/Write
**File**: `ai-tracker/src/ai_tracker/hooks/log_claude_edit.py`

Receives JSON from Claude Code:
```json
{
  "session_id": "abc123",
  "tool_name": "Edit",
  "tool_input": {
    "file_path": "/path/to/file.ts",
    "old_string": "original",
    "new_string": "replacement"
  },
  "cwd": "/project/root"
}
```

Inserts into SQLite `edits` table:
```sql
INSERT INTO edits (timestamp, session_id, tool, file_path, lines_added, lines_removed, cwd)
VALUES ('2026-01-09T12:00:00Z', 'abc123', 'Edit', '/absolute/path/to/file.ts', 15, 3, '/project/root');
```

#### 2. PreToolUse Hook for Write (capture original)
**File**: `ai-tracker/src/ai_tracker/hooks/capture_before_write.py`

Caches file content before Write operations for accurate diff calculation.

#### 3. Setup Script
**File**: `ai-tracker/src/ai_tracker/setup.py`

Adds hooks to `~/.claude/settings.json` following the pattern in `cc-hooks/setup.py`:
- Preserves existing WakaTime and mac-notify hooks
- Adds ai-tracker hooks to the hooks arrays

### Success Criteria:

#### Automated Verification:
- [x] `uv run python -m ai_tracker.setup` adds hooks to settings.json
- [x] Hooks don't break existing WakaTime/mac-notify hooks
- [x] After making a Claude Code edit, entry appears in `edits` table

#### Manual Verification:
- [x] Use Claude Code to make an Edit - verify log entry created
- [ ] Use Claude Code to Write a new file - verify log entry with correct line count

---

## Phase 3: Git Hooks

### Overview
Implement post-commit hook that attributes changes to AI or human.

### Changes Required:

#### 1. Post-commit Hook Script
**File**: `ai-tracker/src/ai_tracker/git/post_commit.py`

On each commit:
1. Get list of changed files from `git diff-tree --no-commit-id --name-only -r HEAD`
2. Get per-file line stats from `git show --numstat --format="" HEAD`
3. Query `edits` table for uncommitted Claude edits to those files
4. Attribute lines: if file was edited by Claude since last commit → AI, else → human
5. Insert into `commits` and `commit_files` tables
6. Mark processed edits as `committed=1`

Inserts into SQLite:
```sql
-- Insert commit summary
INSERT INTO commits (timestamp, commit_sha, repo_name, repo_path,
                     ai_lines_added, ai_lines_removed, human_lines_added, human_lines_removed)
VALUES ('2026-01-09T12:05:00Z', 'abc123def', 'ai-toolbox', '/path/to/repo', 15, 3, 5, 2);

-- Insert per-file breakdown
INSERT INTO commit_files (commit_id, file_path, lines_added, lines_removed, ai_lines_added, ai_lines_removed)
VALUES (1, 'src/app.ts', 20, 5, 15, 3);

-- Mark edits as committed
UPDATE edits SET committed = 1 WHERE file_path = '/path/to/src/app.ts' AND committed = 0;
```

#### 2. Global Git Hook Installation
**File**: `ai-tracker/src/ai_tracker/git/install.py`

Installs global hooks via `git config --global core.hooksPath ~/.config/ai-tracker/git-hooks/`

**Delegation to local hooks** (critical for Husky/pre-commit compatibility):
```bash
#!/bin/bash
# ~/.config/ai-tracker/git-hooks/post-commit

# === AI tracking logic ===
python3 ~/.config/ai-tracker/post-commit.py

# === Delegate to local hooks ===
for hook in .git/hooks/post-commit .husky/post-commit; do
    if [ -x "$hook" ]; then
        "$hook"
    fi
done
```

### Success Criteria:

#### Automated Verification:
- [x] `uv run python -m ai_tracker.git.install --global` sets up global hooks
- [x] After a commit, entry appears in `commits` table

#### Manual Verification:
- [x] Make a Claude Code edit, then commit - verify AI attribution
- [ ] Make a manual edit in neovim, then commit - verify human attribution
- [ ] Verify Husky/pre-commit hooks still work in repos that use them

---

## Phase 4: CLI Stats Tool

### Overview
Implement CLI for querying and displaying statistics.

### Changes Required:

#### 1. Query Engine
**File**: `ai-tracker/src/ai_tracker/stats/query.py`

Functions using SQLite:
- `get_stats(days=30, repo=None)` - Aggregate stats from commits table
- `get_per_repo_stats(days=30)` - Breakdown by repository
- `get_time_series(days=30, granularity='day')` - Daily/weekly trends

Example query:
```sql
SELECT
    SUM(ai_lines_added) as ai_added,
    SUM(ai_lines_removed) as ai_removed,
    SUM(human_lines_added) as human_added,
    SUM(human_lines_removed) as human_removed
FROM commits
WHERE timestamp >= datetime('now', '-30 days')
  AND repo_name = ?;
```

#### 2. Display Module
**File**: `ai-tracker/src/ai_tracker/stats/display.py`

Using Rich + Plotext:
- Summary table with AI/Human lines and percentages
- Per-repo breakdown table
- Optional ASCII bar chart

#### 3. CLI Entry Point
**File**: `ai-tracker/src/ai_tracker/cli.py`

Commands:
```bash
ai-tracker stats              # Show summary for last 30 days
ai-tracker stats --days 7     # Last 7 days
ai-tracker stats --repo ai-toolbox  # Specific repo
ai-tracker stats --chart      # Include ASCII chart
ai-tracker setup              # Install Claude Code hooks
ai-tracker git-install        # Install git hooks
```

### Success Criteria:

#### Automated Verification:
- [x] `uv run ai-tracker stats` displays table without error
- [x] `uv run ai-tracker stats --chart` shows ASCII chart
- [x] `uv run ai-tracker --help` shows all commands

#### Manual Verification:
- [x] Stats accurately reflect recent commits
- [x] Percentages add up to 100%
- [x] Output looks good in terminal

---

## Testing Strategy

### Unit Tests:
- Line counting functions (empty string, single line, multiple lines)
- Binary file detection
- Log parsing and aggregation

### Integration Tests:
- Hook receives correct JSON format
- Git hook extracts correct file stats
- Stats query returns expected format

### Manual Testing Steps:
1. Run setup to install hooks
2. Use Claude Code to edit a file
3. Verify `edits` table has entry: `sqlite3 ~/.config/ai-tracker/tracker.db "SELECT * FROM edits"`
4. Commit the change
5. Verify `commits` table has entry with AI attribution
6. Run `ai-tracker stats` and verify output

---

## Dependencies

```toml
[project]
name = "ai-tracker"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
    "rich>=13.0.0",
    "plotext>=5.0.0",
    "click>=8.0.0",
]

[project.scripts]
ai-tracker = "ai_tracker.cli:main"
```

---

## Critical Files to Modify/Create

| File | Action | Purpose |
|------|--------|---------|
| `ai-tracker/pyproject.toml` | Create | Project config with dependencies |
| `ai-tracker/src/ai_tracker/db.py` | Create | SQLite database module |
| `ai-tracker/src/ai_tracker/hooks/log_claude_edit.py` | Create | PostToolUse hook for Edit/Write |
| `ai-tracker/src/ai_tracker/hooks/capture_before_write.py` | Create | PreToolUse hook for Write |
| `ai-tracker/src/ai_tracker/setup.py` | Create | Claude hook installation |
| `ai-tracker/src/ai_tracker/git/post_commit.py` | Create | Git post-commit hook logic |
| `ai-tracker/src/ai_tracker/git/install.py` | Create | Global git hook installation |
| `ai-tracker/src/ai_tracker/stats/query.py` | Create | Log aggregation |
| `ai-tracker/src/ai_tracker/stats/display.py` | Create | Rich + Plotext output |
| `ai-tracker/src/ai_tracker/cli.py` | Create | Click CLI entry point |
| `~/.claude/settings.json` | Modify | Add ai-tracker hooks (preserve existing) |
| `~/.config/ai-tracker/git-hooks/post-commit` | Create | Global git hook with delegation |

## End-to-End Verification

After implementation is complete, run this sequence:

```bash
# 1. Install everything
cd ai-tracker
uv sync
uv run ai-tracker setup        # Install Claude hooks
uv run ai-tracker git-install  # Install global git hooks

# 2. Test Claude Code tracking
# (In Claude Code, make an Edit to any file)
sqlite3 ~/.config/ai-tracker/tracker.db "SELECT * FROM edits"  # Should show the edit

# 3. Test git commit tracking
git add -A && git commit -m "test commit"
sqlite3 ~/.config/ai-tracker/tracker.db "SELECT * FROM commits"  # Should show commit with AI attribution

# 4. View stats
uv run ai-tracker stats
uv run ai-tracker stats --chart
```
