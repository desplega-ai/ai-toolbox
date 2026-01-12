# WTS Plugin for Claude Code

A Claude Code plugin that provides expert assistance for [@desplega.ai/wts](https://www.npmjs.com/package/@desplega.ai/wts), a Git worktree management CLI tool.

## What is WTS?

WTS (Worktree Switch) simplifies Git worktree management with:
- Organized worktree creation at `.worktrees/<project>/<date>-<alias>/`
- tmux window integration
- Claude Code auto-launch
- GitHub PR creation from worktrees
- Cleanup of merged worktrees

## Installation

### Install the WTS CLI

```bash
npm install -g @desplega.ai/wts
```

### Install the Plugin

```bash
# From marketplace
/plugin marketplace add desplega-ai/ai-toolbox

# Install the wts plugin
/plugin install wts@desplega-ai-toolbox
```

## Usage

Invoke the WTS expert with `/wts`:

```
/wts                              # Start interactive assistant
/wts create my-feature            # Get help creating a worktree
/wts how do I switch worktrees?   # Ask a question
/wts cleanup                      # Get help cleaning up
```

## What the Skill Can Do

- **Answer questions** about wts usage and workflows
- **Execute commands** like create, switch, delete, pr, cleanup
- **Troubleshoot** common issues
- **Guide setup** if wts isn't installed or initialized
- **Explain concepts** about Git worktrees and wts configuration

## Quick Command Reference

| Command | Description |
|---------|-------------|
| `wts init` | Initialize project for wts |
| `wts create <alias>` | Create a new worktree |
| `wts list` | List worktrees |
| `wts switch` | Switch worktree (fzf picker) |
| `wts delete <alias>` | Delete a worktree |
| `wts pr` | Create PR from worktree |
| `wts cleanup` | Clean up merged worktrees |

## Links

- [WTS on npm](https://www.npmjs.com/package/@desplega.ai/wts)
- [desplega.ai](https://desplega.ai)
