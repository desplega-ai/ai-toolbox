# wts - Git Worktree Manager

A CLI tool for managing git worktrees with tmux integration, fzf fuzzy selection, Claude Code launcher support, and GitHub PR creation.

## Installation

### From npm (recommended)

```bash
npm install -g @desplega.ai/wts
```

Or with other package managers:
```bash
yarn global add @desplega.ai/wts
pnpm add -g @desplega.ai/wts
bun add -g @desplega.ai/wts
```

### From source

```bash
cd wts
bun install
bun link
```

### Prerequisites

- [Bun](https://bun.sh) runtime
- Git 2.15+ (worktree support)
- Optional: [fzf](https://github.com/junegunn/fzf) for interactive selection
- Optional: [tmux](https://github.com/tmux/tmux) for window management
- Optional: [gh](https://cli.github.com/) CLI for PR creation

## Quick Start

```bash
# Register your project
cd /path/to/your/git/project
wts init

# Create a worktree for a feature
wts create my-feature --new-branch --tmux

# List worktrees
wts list

# Switch between worktrees (with fzf picker)
wts switch

# Create a PR from your worktree
wts pr my-feature --draft

# Clean up merged worktrees
wts cleanup
```

## Commands

### `wts init`

Register the current project for worktree management.

```bash
wts init        # Interactive setup
wts init -y     # Use defaults, skip prompts
```

Creates a global config entry at `~/.wts.json` and optionally a local `.wts-config.json` for project-specific settings.

### `wts create <alias>`

Create a new worktree.

```bash
wts create feature-auth                    # Interactive branch selection via fzf
wts create feature-auth -n                 # Create new branch named 'feature-auth'
wts create feature-auth -b existing-branch # Use existing branch
wts create feature-auth --base develop     # Base new branch on 'develop'
wts create feature-auth --tmux             # Open in tmux window
wts create feature-auth --tmux --claude    # Open tmux + launch Claude Code
wts create feature-auth --no-setup         # Skip setup script
```

Worktrees are created at `.worktrees/<project>/YYYY-MM-DD-<alias>/`.

### `wts list`

List worktrees for the current project.

```bash
wts list       # Current project only
wts list -a    # All tracked projects
wts list --json # JSON output
```

Aliases: `wts ls`

### `wts switch [alias]`

Switch to a worktree.

```bash
wts switch              # Interactive fzf picker
wts switch my-feature   # Switch directly
wts switch --tmux       # Open in new tmux window
```

### `wts delete <alias>`

Remove a worktree.

```bash
wts delete my-feature      # Remove worktree
wts delete my-feature -f   # Force remove (uncommitted changes)
```

Aliases: `wts rm`

### `wts cd <alias>`

Print the worktree path (for shell integration).

```bash
wts cd my-feature   # Prints path to stdout
```

### `wts pr [alias]`

Create a GitHub pull request from a worktree branch.

```bash
wts pr                          # Auto-detect from current worktree
wts pr my-feature               # Specify worktree
wts pr --draft                  # Create as draft PR
wts pr --web                    # Open in browser after creation
wts pr -t "My PR title"         # Set title
wts pr -b "Description here"    # Set body
```

Requires `gh` CLI to be installed and authenticated.

### `wts cleanup`

Remove merged or stale worktrees.

```bash
wts cleanup                    # Remove merged worktrees (interactive)
wts cleanup --dry-run          # Show what would be removed
wts cleanup -f                 # Force, no confirmation
wts cleanup --older-than 30    # Include worktrees older than 30 days
wts cleanup --unmerged         # Include unmerged worktrees
```

## Configuration

### Global Config (`~/.wts.json`)

Stores tracked projects and default settings.

```json
{
  "projects": {
    "my-project": {
      "path": "/Users/me/code/my-project",
      "registeredAt": "2024-01-08T12:00:00.000Z"
    }
  },
  "defaults": {
    "worktreeDir": ".worktrees",
    "tmuxWindowTemplate": "{project}-{alias}",
    "autoTmux": false,
    "autoClaude": false
  }
}
```

### Local Config (`.wts-config.json`)

Project-specific overrides (optional).

```json
{
  "worktreeDir": ".worktrees",
  "tmuxWindowTemplate": "{project}-{alias}",
  "autoTmux": true,
  "autoClaude": true,
  "setupScript": ".wts-setup.sh"
}
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `worktreeDir` | string | `.worktrees` | Base directory for worktrees (relative to git root) |
| `tmuxWindowTemplate` | string | `{project}-{alias}` | Template for tmux window names |
| `autoTmux` | boolean | `false` | Auto-open tmux window on create |
| `autoClaude` | boolean | `false` | Auto-launch Claude Code on create |
| `setupScript` | string | - | Script to run after worktree creation |

### Template Variables

- `{project}` - Project name (from git root folder)
- `{alias}` - Worktree alias

## Shell Integration

Add this function to your `.bashrc` or `.zshrc` for easy directory switching:

```bash
# Change to a worktree directory
wcd() {
  local path
  path=$(wts cd "$1" 2>/dev/null)
  if [ $? -eq 0 ] && [ -n "$path" ]; then
    cd "$path"
  else
    echo "Worktree '$1' not found"
    return 1
  fi
}
```

Usage:

```bash
wcd my-feature   # cd to the my-feature worktree
```

## Setup Scripts

You can configure a setup script to run automatically after worktree creation.

### Bash Script (`.wts-setup.sh`)

```bash
#!/bin/bash
echo "Setting up worktree at $WTS_WORKTREE_PATH"
cd "$WTS_WORKTREE_PATH"
bun install
cp .env.example .env
```

### TypeScript Script (`.wts-setup.ts`)

```typescript
const worktreePath = process.env.WTS_WORKTREE_PATH;
console.log(`Setting up worktree at ${worktreePath}`);
// Run setup logic...
```

The `WTS_WORKTREE_PATH` environment variable is set to the worktree path.

## Worktree Naming Convention

Worktrees are created with a date-prefixed path:

```
.worktrees/<project>/YYYY-MM-DD-<alias>/
```

Example: `.worktrees/my-project/2024-01-08-feature-auth/`

This enables:
- Easy sorting by creation date
- Automatic cleanup of old worktrees
- Clear visual organization

## License

MIT
