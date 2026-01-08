---
date: 2026-01-08T00:00:00-05:00
researcher: claude
git_commit: ca539f7
branch: main
repository: ai-toolbox
topic: "wts CLI - Git Worktree Manager Design"
tags: [research, cli, git, worktrees, bun, tmux]
status: complete
last_updated: 2026-01-08
last_updated_by: claude
---

# Research: wts CLI - Git Worktree Manager Design

**Date**: 2026-01-08
**Researcher**: claude
**Git Commit**: ca539f7
**Branch**: main
**Repository**: ai-toolbox

## Research Question
Design a simple CLI tool (using Bun) for managing git worktrees across projects, with tmux integration, setup scripts, and npm publishing capability.

## Summary
A comprehensive CLI tool design for `wts` (worktrees) that manages git worktrees across multiple projects with features including global tracking, tmux integration, Claude Code launcher, fzf fuzzy selection, automatic setup scripts, and GitHub PR creation.

## Detailed Findings

### Core Concepts

#### Worktree Path Structure
```
project/                           # Main git repository
├── .worktrees/                    # Worktrees directory
│   └── <project-name>/            # Named after git root dir
│       ├── 2026-01-08-auth/       # Date-prefixed alias
│       └── 2026-01-10-bugfix/
├── .wts-config.json               # Local project config
└── .wts-setup.sh                  # Setup script
```

The date prefix (`YYYY-MM-DD-<alias>`) enables:
- Natural sorting (newest/oldest first)
- Easy identification of stale worktrees
- Unique paths even with same alias reused

### Commands Design

| Command | Description |
|---------|-------------|
| `wts list` | List all worktrees across tracked projects |
| `wts create <alias>` | Create worktree with tmux/Claude support |
| `wts delete <alias>` | Remove worktree |
| `wts switch [alias]` | Switch between worktrees (fzf picker) |
| `wts pr [alias]` | Create PR from worktree via `gh` CLI |
| `wts cleanup` | Remove stale/merged worktrees |
| `wts cd <alias>` | Output path for shell integration |
| `wts init` | Register project in global config |

### Configuration Files

#### Global Config: `~/.wts.json`
```json
{
  "projects": {
    "/path/to/project": {
      "name": "project-name",
      "lastAccessed": "2026-01-08T..."
    }
  },
  "defaults": {
    "worktreeDir": ".worktrees",
    "tmuxEnabled": true,
    "claudeEnabled": false,
    "editor": "code"
  }
}
```

#### Local Config: `.wts-config.json`
```json
{
  "worktreeDir": ".worktrees",
  "defaultBranch": "main",
  "setupScript": ".wts-setup.sh",
  "tmux": {
    "enabled": true,
    "mode": "window",
    "windowNameTemplate": "{project}-{alias}",
    "claude": false
  }
}
```

### Setup Scripts

Two supported formats with detection order `.wts-setup.ts` > `.wts-setup.sh`:

**Bash** (`.wts-setup.sh`):
```bash
#!/bin/bash
npm install  # or bun install
```

**Bun TypeScript** (`.wts-setup.ts`):
```typescript
import { $ } from "bun";
await $`bun install`;
```

### Integrations

1. **tmux**: Window or pane mode for opening worktrees
2. **fzf**: Fuzzy selection for worktree switching
3. **Claude Code**: Auto-launch in new tmux window/pane
4. **GitHub CLI**: PR creation via `gh pr create`
5. **Git hooks**: Post-checkout hook support

### Project Structure
```
wts/
├── package.json
├── README.md
├── tsconfig.json
├── src/
│   ├── index.ts          # CLI entry (commander)
│   ├── commands/
│   │   ├── list.ts
│   │   ├── create.ts
│   │   ├── delete.ts
│   │   ├── switch.ts
│   │   ├── pr.ts
│   │   ├── cd.ts
│   │   ├── cleanup.ts
│   │   └── init.ts
│   ├── config/
│   │   ├── global.ts
│   │   └── local.ts
│   ├── integrations/
│   │   ├── tmux.ts
│   │   ├── fzf.ts
│   │   ├── claude.ts
│   │   └── hooks.ts
│   ├── setup/
│   │   └── runner.ts
│   └── utils/
│       ├── git.ts
│       ├── paths.ts
│       └── prompts.ts
└── bin/
    └── wts
```

### Dependencies
```json
{
  "dependencies": {
    "commander": "^12.0.0",
    "@inquirer/prompts": "^7.0.0",
    "chalk": "^5.3.0"
  },
  "devDependencies": {
    "@types/bun": "latest"
  }
}
```

## Key Design Decisions

1. **Date-prefixed worktree paths**: Enables natural sorting and uniqueness
2. **Branch logic**: Auto-use main if on main, otherwise prompt with fzf
3. **tmux modes**: Configurable window vs pane creation
4. **Setup script precedence**: TypeScript preferred over bash
5. **Global tracking**: All projects registered in `~/.wts.json` for cross-project listing

## Shell Integration

For `cd` support, users add to their shell config:
```bash
wcd() { cd "$(wts cd "$1")" }
```

## Verification Steps
1. `bun link` to install globally
2. `cd /some/git/project && wts init`
3. `wts create feature-test --tmux`
4. Verify worktree at `.worktrees/<project>/2026-01-08-feature-test/`
5. `wts list` shows worktree
6. `wts switch` opens fzf picker
7. `wts pr feature-test --draft --web` creates PR
8. `wts delete feature-test`
9. `wts cleanup --dry-run`

## Related Documents
- Implementation plan: `/Users/taras/.claude/plans/encapsulated-mixing-panda.md`

## Open Questions
- Should `wts` auto-detect if inside tmux and adjust behavior?
- Consider adding `wts status` for current worktree info?
- Support for custom branch naming templates?
