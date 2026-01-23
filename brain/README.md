# @desplega.ai/brain

Personal knowledge management CLI with semantic search.

## Installation

```bash
npm install -g @desplega.ai/brain
```

Or with bun:

```bash
bun install -g @desplega.ai/brain
```

## Quick Start

```bash
# Initialize your brain directory
brain init

# Add entries
brain add "Just had a great idea for a new project"
brain add -f ideas/startup "Build an AI-powered todo app"

# Create named files
brain new projects/ai-toolbox

# Search your notes
brain search "project ideas"

# Manage todos
brain todo add "Review PR #123"
brain todo list
brain todo done 1
```

## Commands

### Core

| Command | Alias | Description |
|---------|-------|-------------|
| `brain init [path]` | | Initialize a brain directory |
| `brain add <text>` | `a` | Add a timestamped entry |
| `brain new <path>` | `n` | Create a new named file |
| `brain list` | `ls` | List recent entries |
| `brain show <path>` | | Show an entry's content |
| `brain edit <path>` | | Open an entry in your editor |
| `brain search <query>` | `s` | Search entries (full-text + semantic) |
| `brain sync` | | Sync files to database and generate embeddings |
| `brain config` | | View or update configuration |

### Todo Management

| Command | Description |
|---------|-------------|
| `brain todo add <text>` | Create a new todo |
| `brain todo list` | List open todos |
| `brain todo done <id...>` | Mark todos as complete |
| `brain todo cancel <id>` | Mark a todo as cancelled |
| `brain todo edit <id>` | Edit a todo in your editor |
| `brain todo rm <id>` | Delete a todo permanently |

#### Todo Options

```bash
# Add with project scope
brain todo add -p myproject "Ship the feature"
brain t add --project work "Finish report"

# Add with due date
brain todo add -d tomorrow "Deploy to prod"
brain todo add --due "2024-12-31" "Year-end review"
brain todo add -d "next week" "Plan sprint"

# List options
brain todo list                    # Open todos only
brain todo list --all              # Include completed/cancelled
brain todo list -p myproject       # Filter by project
brain todo ls -a -p work           # Combine filters
```

## Features

- **Timestamped entries**: Quick capture with automatic timestamps
- **Full-text search**: Fast FTS5-powered search across all notes
- **Semantic search**: Find conceptually related content using embeddings
- **Git integration**: Auto-commits changes to your brain repository
- **Todo management**: CLI-native task tracking with projects and due dates
- **Editor integration**: Opens files in your preferred `$EDITOR`

## Configuration

Configuration is stored in `~/.brain.json`:

```json
{
  "path": "/Users/you/Documents/brain",
  "editor": "vim"
}
```

The database (`.brain.db`) is stored inside your brain directory and is git-ignored by default.

## Requirements

- Node.js 18+ or Bun
- Optional: `fzf` for interactive file picking (`brain add --where`)

## License

MIT
