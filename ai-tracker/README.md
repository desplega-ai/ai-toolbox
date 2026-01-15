# AI Tracker

Track what percentage of code changes in git repos are AI-generated (via Claude Code) vs human-made.

## Installation

### Option 1: uvx (recommended)

No installation needed - runs directly from PyPI:

```bash
uvx cc-ai-tracker stats
```

### Option 2: Local install

Install globally with uv:

```bash
uv tool install cc-ai-tracker
```

Or install from source:

```bash
cd ai-tracker
uv tool install .
```

Then run directly:

```bash
ai-tracker stats
```

## Setup

After installation, set up the hooks to start tracking:

```bash
ai-tracker install    # Install all hooks (Claude Code + git)
```

Or with uvx:
```bash
uvx cc-ai-tracker install
```

## Usage

**With uvx:**
```bash
uvx cc-ai-tracker stats           # All-time stats
uvx cc-ai-tracker stats --graph   # Stats + chart for last 7 days
uvx cc-ai-tracker stats --chart --days 14  # Custom chart period
```

**With local install:**
```bash
ai-tracker stats           # All-time stats
ai-tracker stats --graph   # Stats + chart for last 7 days
ai-tracker stats --chart --days 14  # Custom chart period
ai-tracker stats --repo my-project  # Filter by repo
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

### Custom Database Path

For multi-agent deployments (e.g., agent-swarm workers), you can configure a custom database path:

```bash
export AI_TRACKER_DB_PATH="/path/to/custom/tracker.db"
```

This allows each agent to have its own isolated database file.

### Query the Database

```bash
# View recent edits
sqlite3 ~/.config/ai-tracker/tracker.db "SELECT * FROM edits ORDER BY timestamp DESC LIMIT 10"

# View commits with attribution
sqlite3 ~/.config/ai-tracker/tracker.db "SELECT * FROM commits ORDER BY timestamp DESC LIMIT 10"
```

## Uninstall

```bash
ai-tracker uninstall    # Remove all hooks (Claude Code + git)
```
