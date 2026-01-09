# AI Tracker

Track what percentage of code changes in git repos are AI-generated (via Claude Code) vs human-made.

## Installation

```bash
cd ai-tracker
uv sync
```

## Setup

```bash
# Install Claude Code hooks
uv run ai-tracker setup

# Install global git hooks (works across all repos)
uv run ai-tracker git-install
```

## Usage

```bash
# Show stats for last 30 days
uv run ai-tracker stats

# Last 7 days
uv run ai-tracker stats --days 7

# Specific repo
uv run ai-tracker stats --repo my-project

# Include ASCII chart
uv run ai-tracker stats --chart
```

## How It Works

1. **Claude Code Hooks** (`PostToolUse`) - Logs every Edit/Write operation with line-level counts
2. **Git Post-commit Hook** - Attributes committed changes to AI or human based on the edit log
3. **CLI Stats** - Queries SQLite database and displays statistics with Rich formatting

## Architecture

```
~/.config/ai-tracker/
├── tracker.db          # SQLite database (WAL mode)
├── cache/              # Temporary cache for Write tool pre-capture
└── git-hooks/
    └── post-commit     # Global git hook (delegates to local hooks)
```

## Database

Data is stored in `~/.config/ai-tracker/tracker.db` using SQLite with WAL mode for concurrent access.

Query the database directly:
```bash
# View recent edits
sqlite3 ~/.config/ai-tracker/tracker.db "SELECT * FROM edits ORDER BY timestamp DESC LIMIT 10"

# View commits with attribution
sqlite3 ~/.config/ai-tracker/tracker.db "SELECT * FROM commits ORDER BY timestamp DESC LIMIT 10"
```

## Uninstall

```bash
# Remove git hooks
uv run ai-tracker git-uninstall
```
