---
date: 2026-01-09T12:00:00-08:00
researcher: Taras
git_commit: e616532d713c40f206a01f26e6ae3f25c1edff27
branch: main
repository: ai-toolbox
topic: "Tracking AI vs Human Code Changes in Git Repositories"
tags: [research, claude-code, git-hooks, code-tracking, ai-authorship]
status: complete
last_updated: 2026-01-09
last_updated_by: Taras
---

# Research: Tracking AI vs Human Code Changes in Git Repositories

**Date**: 2026-01-09
**Git Commit**: e616532
**Branch**: main
**Repository**: ai-toolbox

## Research Question

How to build a tool that tracks what percentage of code changes in git repos are AI-generated (via Claude Code) vs human-made (via neovim or other editors)?

## Summary

This is achievable using a two-pronged approach:

1. **Claude Code Hooks** - Track AI-made edits in real-time using `PostToolUse` hooks on `Edit|Write` tools
2. **Git Hooks** - Track commits and correlate with logged AI edits to determine authorship

The core idea: Log every file edit Claude makes, then at commit time compare which committed files were recently edited by Claude vs edited outside of Claude.

---

## Detailed Findings

### 1. Claude Code Hooks System

Claude Code provides 9 hook events. For tracking edits, the relevant ones are:

| Hook Event | Purpose for Tracking |
|------------|---------------------|
| `PostToolUse` | Log edits AFTER they happen (most useful) |
| `PreToolUse` | Could intercept edits BEFORE (for validation) |

#### Hook Input Data Available

When `Edit` or `Write` tools are used, hooks receive this JSON on stdin:

```json
{
  "session_id": "abc123",
  "tool_name": "Edit",
  "tool_input": {
    "file_path": "/path/to/file.ts",
    "old_string": "original code",
    "new_string": "modified code"
  },
  "tool_response": {
    "filePath": "/path/to/file.ts",
    "success": true
  },
  "cwd": "/project/root",
  "transcript_path": "/path/to/conversation.jsonl"
}
```

#### Configuration Location

Hooks can be configured in:
- `~/.claude/settings.json` - Global (all projects)
- `.claude/settings.json` - Per-project (committed)
- `.claude/settings.local.json` - Per-project (not committed)

#### Example: Track All Claude Code Edits

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "python3 ~/.config/ai-tracker/log-claude-edit.py"
          }
        ]
      }
    ]
  }
}
```

The Python script would:
```python
#!/usr/bin/env python3
import json, sys, os
from datetime import datetime

data = json.load(sys.stdin)
log_entry = {
    "timestamp": datetime.utcnow().isoformat(),
    "source": "claude",
    "file": data["tool_input"]["file_path"],
    "tool": data["tool_name"],
    "session_id": data["session_id"],
    "cwd": data["cwd"]
}

log_file = os.path.expanduser("~/.config/ai-tracker/edits.jsonl")
os.makedirs(os.path.dirname(log_file), exist_ok=True)
with open(log_file, "a") as f:
    f.write(json.dumps(log_entry) + "\n")
```

---

### 2. Git Hooks for Human Changes

Git hooks can track commits and determine which changes weren't made by Claude.

#### Relevant Git Hooks

| Hook | Trigger | Parameters |
|------|---------|------------|
| `pre-commit` | Before commit message editor | None (access staged files) |
| `post-commit` | After commit completes | None (access commit SHA) |

#### Accessing Changed Files

```bash
# In pre-commit: get staged files
git diff --cached --name-only --diff-filter=ACMR

# In pre-commit: get line statistics
git diff --cached --numstat  # Returns: added<tab>removed<tab>filename

# In post-commit: get files in last commit
git diff-tree --no-commit-id --name-only -r HEAD
```

#### Example: Log Commits with File Details

`.git/hooks/post-commit`:
```bash
#!/bin/bash

LOG_FILE="$HOME/.config/ai-tracker/commits.jsonl"
TIMESTAMP=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
COMMIT_SHA=$(git rev-parse HEAD)
REPO_ROOT=$(git rev-parse --show-toplevel)
REPO_NAME=$(basename "$REPO_ROOT")

# Get files changed
FILES=$(git diff-tree --no-commit-id --name-only -r HEAD | jq -R -s -c 'split("\n") | map(select(length > 0))')

# Get stats
read -r FILES_COUNT INSERTIONS DELETIONS <<< $(git show --stat --format="" HEAD | tail -1 | awk '{gsub(/[^0-9 ]/,""); print $1, $2, $3}')

cat >> "$LOG_FILE" << EOF
{"timestamp":"$TIMESTAMP","commit":"$COMMIT_SHA","repo":"$REPO_NAME","files":$FILES,"insertions":${INSERTIONS:-0},"deletions":${DELETIONS:-0}}
EOF
```

---

### 3. Correlating AI vs Human Changes

The key insight: **Track at edit time, analyze at commit time.**

#### Data Flow

```
┌─────────────────────┐     ┌──────────────────────┐
│   Claude Code       │     │   Neovim/Editor      │
│   Edit/Write tools  │     │   Manual edits       │
└──────────┬──────────┘     └──────────┬───────────┘
           │                           │
           ▼                           │
┌─────────────────────┐                │
│  PostToolUse Hook   │                │
│  → logs to edits.jsonl              │
└──────────┬──────────┘                │
           │                           │
           ▼                           ▼
┌─────────────────────────────────────────────────┐
│                  git add + commit               │
└──────────────────────┬──────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────┐
│              post-commit hook                   │
│  1. Get list of committed files                 │
│  2. Check edits.jsonl for recent Claude edits   │
│  3. Files in both = AI-authored                 │
│  4. Files not in edits.jsonl = human-authored   │
│  5. Log attribution to stats.jsonl              │
└─────────────────────────────────────────────────┘
```

#### Attribution Logic

```python
def attribute_changes(committed_files, claude_edits_log, time_window_minutes=30):
    """
    For each committed file, check if Claude edited it recently.
    """
    attribution = {"ai": [], "human": []}
    cutoff = datetime.utcnow() - timedelta(minutes=time_window_minutes)

    # Load recent Claude edits
    recent_claude_files = set()
    for edit in claude_edits_log:
        if edit["timestamp"] > cutoff:
            recent_claude_files.add(edit["file"])

    for file in committed_files:
        if file in recent_claude_files:
            attribution["ai"].append(file)
        else:
            attribution["human"].append(file)

    return attribution
```

---

### 4. Alternative Approaches Discovered

#### A. Git Notes (git-ai approach)

The [git-ai](https://github.com/acunniffe/git-ai) project uses git notes to mark AI-authored lines:

```bash
# After AI generates code, mark it
git notes add -m "ai-authored: lines 10-50" HEAD

# Query later
git notes show HEAD
```

**Pros**: Built into git, survives rebases with `--notes`
**Cons**: Requires explicit marking, line numbers can shift

#### B. Co-Authored-By Trailers

Add trailers to commit messages:

```
Implement feature X

Co-authored-by: Claude <claude@anthropic.com>
```

**Pros**: Standard git convention, visible in git log
**Cons**: Marks entire commit, not individual files/lines

#### C. File Fingerprinting

Track file hashes after Claude edits:

```python
# After Claude edit
file_hash = hashlib.sha256(open(file).read().encode()).hexdigest()
log_entry = {"file": file, "hash_after_claude": file_hash}

# At commit time
current_hash = hashlib.sha256(open(file).read().encode()).hexdigest()
if current_hash == logged_hash:
    # File unchanged since Claude edit → AI-authored
```

**Pros**: Handles the case where human edits after Claude
**Cons**: Any human modification marks entire file as human

---

### 5. Recommended Architecture

For your use case (tracking across all repos on laptop):

```
~/.config/ai-tracker/
├── log-claude-edit.py      # Called by Claude hook
├── log-git-commit.sh       # Git hook template
├── analyze.py              # Query/report tool
├── edits.jsonl             # Claude edit log
├── commits.jsonl           # Git commit log
└── stats.jsonl             # Aggregated statistics
```

#### Global Claude Hook (~/.claude/settings.json)

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "python3 ~/.config/ai-tracker/log-claude-edit.py"
          }
        ]
      }
    ]
  }
}
```

#### Git Hook Installation

Create a global git hook or use `git config --global core.hooksPath`:

```bash
# Set global hooks directory
git config --global core.hooksPath ~/.config/git-hooks

# Create post-commit hook
mkdir -p ~/.config/git-hooks
cat > ~/.config/git-hooks/post-commit << 'EOF'
#!/bin/bash
~/.config/ai-tracker/log-git-commit.sh
EOF
chmod +x ~/.config/git-hooks/post-commit
```

---

## Code References

- Claude Code hooks documentation: https://docs.claude.com/en/docs/claude-code/hooks
- Git hooks documentation: https://git-scm.com/docs/githooks
- git-ai project: https://github.com/acunniffe/git-ai

## Related Research

The following supplementary research documents provide deeper dives into specific topics:

1. **[Existing Claude Hooks Audit](./2026-01-09-existing-claude-hooks-audit.md)** - Documents current hooks in `~/.claude/settings.json` (wakatime, mac-notify) and how to merge new ai-tracker hooks without conflicts

2. **[Global Git Hooks Compatibility](./2026-01-09-global-git-hooks-compatibility.md)** - Investigates how `core.hooksPath` affects local hooks (husky, pre-commit, lint-staged) and recommends delegation pattern to support both

3. **[Line Counting Accuracy](./2026-01-09-line-counting-accuracy.md)** - Details how to accurately count lines for Edit vs Write tools, handle edge cases (binary files, empty files), and use PreToolUse hooks for Write operations

4. **[Stats Visualization Options](./2026-01-09-stats-visualization-options.md)** - Compares CLI output options (Rich, Plotext), TUI frameworks (Textual), and web dashboards (Dash, Plotly) for displaying statistics

## Architecture Summary

| Component | Purpose | Location |
|-----------|---------|----------|
| Claude PostToolUse hook | Log AI edits | `~/.claude/settings.json` |
| Git post-commit hook | Log commits, attribute changes | `~/.config/git-hooks/` |
| Central log files | Store all events | `~/.config/ai-tracker/` |
| Analysis tool | Query and report | CLI script |

## Design Decisions

1. **Attribution trigger**: Any Edit command from Claude marks those lines as AI-authored (no time window - track by edit event)
2. **Granularity**: Line-level tracking - count number of lines added/removed by each source
3. **Mixed edits**: If both Claude and human edit the same file, count both contributions separately
4. **Cross-repo**: Global aggregation across all repos on laptop

## Implementation Plan

### Data Model

Each Claude edit logs:
```json
{
  "timestamp": "2026-01-09T12:00:00Z",
  "file": "/absolute/path/to/file.ts",
  "lines_added": 15,
  "lines_removed": 3,
  "old_string": "original",
  "new_string": "replacement"
}
```

Each commit logs per-file stats:
```json
{
  "timestamp": "2026-01-09T12:05:00Z",
  "commit": "abc123",
  "repo": "ai-toolbox",
  "files": [
    {"file": "src/app.ts", "added": 20, "removed": 5, "ai_added": 15, "ai_removed": 3, "human_added": 5, "human_removed": 2}
  ],
  "totals": {"ai_added": 15, "ai_removed": 3, "human_added": 5, "human_removed": 2}
}
```

### Attribution Algorithm

1. **On Claude Edit**: Log file path + lines changed (count newlines in old_string vs new_string)
2. **On git commit**:
   - Get per-file line stats from `git diff --numstat`
   - For each file, check if it was edited by Claude since last commit
   - If yes: attribute those lines to AI
   - Remaining lines (or files not in Claude log): attribute to human
3. **After commit**: Clear the Claude edit log for committed files (reset for next cycle)
