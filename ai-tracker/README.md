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

# Install global git hooks
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

1. **Claude Code Hooks** - Logs every Edit/Write operation with line counts
2. **Git Post-commit Hook** - Attributes committed changes to AI or human
3. **CLI Stats** - Queries SQLite database and displays statistics

Data is stored in `~/.config/ai-tracker/tracker.db`.
