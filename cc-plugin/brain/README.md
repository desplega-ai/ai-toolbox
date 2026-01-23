# Brain Plugin for Claude Code

Personal knowledge management integration with the `brain` CLI.

## Installation

```bash
# First, install the brain CLI
cd ai-toolbox/brain && bun install && bun link

# Then install the Claude Code plugin
/plugin install brain@desplega-ai-toolbox
```

## Commands

| Command | Description |
|---------|-------------|
| `/brain:note` | Quickly capture a note to your brain |
| `/brain:todos` | Manage todos across your brain entries |

## Skill

The `brain-expert` skill provides Claude with knowledge about how to use the brain CLI for:
- Capturing timestamped notes
- Creating structured entries
- Searching via FTS5 or semantic search
- Syncing and managing the database

## Requirements

- `brain` CLI installed and linked (`bun link` in brain directory)
- Brain initialized (`brain init`)
- For semantic search: `OPENAI_API_KEY` environment variable
