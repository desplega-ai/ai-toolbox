# wts CLI - Git Worktree Manager Implementation Plan

## Overview

Create a Bun CLI tool (`wts`) for managing git worktrees across projects with tmux integration, fzf fuzzy selection, Claude Code launcher support, and GitHub PR creation.

## Current State Analysis

### Repository Structure
- **Location**: `/Users/taras/Documents/code/ai-toolbox/` - monorepo with independent projects
- **Existing Bun CLI**: `cc-orch-mcp/` uses Bun, custom arg parsing, Ink/React TUI
- **Research doc**: `thoughts/shared/research/2026-01-08-wts-cli-design.md` (comprehensive)

### Key Patterns to Follow (from `cc-orch-mcp/`)
- Project structure: `src/` layout with `commands/`, `config/`, `utils/`
- Package manager: `bun`
- Entry point: `#!/usr/bin/env bun` with `"bin"` in package.json
- Shell commands: `Bun.$` for simple commands, `Bun.spawn()` for complex
- Config I/O: `Bun.file()` API
- Linting: Biome (not ESLint)
- TypeScript: `"module": "Preserve"`, `"moduleResolution": "bundler"`

## Desired End State

A working `wts` command installable via `bun link` with these commands:
- `wts init` - Register project in global config
- `wts list [-a]` - List worktrees (optionally across all projects)
- `wts create <alias>` - Create worktree with tmux/Claude support
- `wts delete <alias>` - Remove worktree
- `wts switch [alias]` - Switch between worktrees via fzf
- `wts cd <alias>` - Output path for shell integration
- `wts pr [alias]` - Create PR from worktree via `gh` CLI
- `wts cleanup` - Remove stale/merged worktrees

**Verification**:
```bash
cd /Users/taras/Documents/code/ai-toolbox/wts
bun install && bun link
cd /some/git/project
wts init
wts create feature-test --tmux
wts list
wts switch
wts pr feature-test --draft
wts delete feature-test
```

## What We're NOT Doing

- No Ink/React TUI (using Commander.js + fzf instead)
- No custom branch naming templates (use date-prefix pattern only)
- No git hook auto-installation (manual setup for users)
- No cross-platform tmux alternatives (macOS/Linux only)

## Implementation Approach

Use Commander.js for CLI argument parsing (cleaner subcommand API than manual parsing), fzf for interactive selection, and `Bun.$` for git operations since simple-git doesn't support worktrees.

---

## Phase 1: Project Foundation

### Overview
Set up project structure, configuration system, and core utilities.

### Changes Required:

#### 1. Create directory structure
```
wts/
├── package.json
├── tsconfig.json
├── biome.json
└── src/
    ├── index.ts
    ├── config/
    │   ├── types.ts
    │   ├── global.ts
    │   └── local.ts
    └── utils/
        ├── git.ts
        └── paths.ts
```

#### 2. Create package.json
**File**: `wts/package.json`

```json
{
  "name": "wts",
  "version": "0.1.0",
  "description": "Git worktree manager with tmux integration",
  "type": "module",
  "bin": { "wts": "./src/index.ts" },
  "scripts": {
    "dev": "bun src/index.ts",
    "lint": "biome check src",
    "lint:fix": "biome check --write src",
    "test": "bun test",
    "tsc:check": "bun tsc --noEmit"
  },
  "dependencies": {
    "commander": "^12.1.0",
    "chalk": "^5.4.1"
  },
  "devDependencies": {
    "@biomejs/biome": "^2.3.9",
    "@types/bun": "latest"
  },
  "peerDependencies": { "typescript": "^5" }
}
```

#### 3. Create tsconfig.json
**File**: `wts/tsconfig.json`

Copy from `cc-orch-mcp/tsconfig.json` - uses `"module": "Preserve"`, bundler resolution, path aliases.

#### 4. Create biome.json
**File**: `wts/biome.json`

Standard Biome config with recommended rules, tab indentation.

#### 5. Create type definitions
**File**: `wts/src/config/types.ts`

- `GlobalConfig` - Projects map + defaults
- `LocalConfig` - Per-project overrides
- `ResolvedConfig` - Merged runtime config
- `Worktree` - Worktree metadata

#### 6. Create global config module
**File**: `wts/src/config/global.ts`

- `loadGlobalConfig()` - Load from `~/.wts.json`
- `saveGlobalConfig()` - Save to `~/.wts.json`
- `registerProject()` - Add project to tracking
- `getTrackedProjects()` - List all projects

#### 7. Create local config module
**File**: `wts/src/config/local.ts`

- `loadLocalConfig()` - Load from `.wts-config.json`
- `resolveConfig()` - Merge global + local (local overrides)

#### 8. Create git utilities
**File**: `wts/src/utils/git.ts`

Key functions using `Bun.$`:
- `getGitRoot()` - Find repo root via `git rev-parse --show-toplevel`
- `getCurrentBranch()` - Get branch via `git rev-parse --abbrev-ref HEAD`
- `listWorktrees()` - Parse `git worktree list --porcelain`
- `createWorktree()` - `git worktree add`
- `removeWorktree()` - `git worktree remove`
- `listBranches()`, `listRemoteBranches()` - Branch listing
- `branchExists()`, `isBranchMerged()` - Branch checks
- `generateWorktreePath()` - Create `.worktrees/<project>/YYYY-MM-DD-<alias>/`
- `parseWorktreeAlias()` - Extract alias from date-prefixed path

#### 9. Create path utilities
**File**: `wts/src/utils/paths.ts`

- `getProjectName()` - Extract name from git root
- `formatPath()` - Replace $HOME with ~

#### 10. Create CLI entry point skeleton
**File**: `wts/src/index.ts`

```typescript
#!/usr/bin/env bun
import { Command } from "commander";
import pkg from "../package.json";

const program = new Command();
program
  .name("wts")
  .description("Git worktree manager with tmux integration")
  .version(pkg.version);

// Commands added in Phase 2
program.parse();
```

### Success Criteria:

#### Automated Verification:
- [x] `cd wts && bun install` completes without errors
- [x] `bun tsc:check` passes
- [x] `bun lint` passes
- [x] `bun src/index.ts --version` prints version
- [x] `bun src/index.ts --help` shows help

---

## Phase 2: Core Commands

### Overview
Implement init, list, create, delete, and cd commands.

### Changes Required:

#### 1. Create init command ✅
**File**: `wts/src/commands/init.ts`

Register current project in global config, optionally create `.wts-config.json`.

**Additional implementation**: Made init interactive with prompts for:
- Worktree directory
- Auto-tmux on create
- Tmux window template
- Auto-Claude launch
- Setup script path

Added `-y/--yes` flag to skip prompts. Created `src/utils/prompts.ts` with `prompt()`, `confirm()`, `select()` helpers.

#### 2. Create list command ✅
**File**: `wts/src/commands/list.ts`

- `wts list` - List worktrees for current project
- `wts list -a` - List across all tracked projects
- `wts list --json` - JSON output
- Pretty table output with alias, branch, path

#### 3. Create create command ✅
**File**: `wts/src/commands/create.ts`

- `wts create <alias>` - Create worktree
- Options: `-b/--branch`, `-n/--new-branch`, `--no-setup`
- Generate date-prefixed path
- Run setup script if present

**Note**: `autoTmux` and `autoClaude` config options are saved but not yet wired up (Phase 3).

#### 4. Create delete command ✅
**File**: `wts/src/commands/delete.ts`

- `wts delete <alias>` - Remove worktree
- Options: `-f/--force`

#### 5. Create cd command ✅
**File**: `wts/src/commands/cd.ts`

- `wts cd <alias>` - Print worktree path for shell integration
- Exit 1 if not found

#### 6. Create setup script runner ✅
**File**: `wts/src/setup/runner.ts`

- Detect `.wts-setup.ts` or `.wts-setup.sh`
- Execute with `bun` or `bash`
- Set `WTS_WORKTREE_PATH` env var

#### 7. Wire commands to entry point ✅
**File**: `wts/src/index.ts` (update)

Import and register all commands with program.

### Success Criteria:

#### Automated Verification:
- [x] `bun tsc:check` passes
- [x] `bun lint` passes
- [x] `wts init` in git repo creates global config entry
- [x] `wts create test-feature` creates worktree at `.worktrees/<project>/YYYY-MM-DD-test-feature/`
- [x] `wts list` shows created worktree
- [x] `wts cd test-feature` prints correct path
- [x] `wts delete test-feature` removes worktree

---

## Phase 3: Interactive Features

### Overview
Add fzf integration, tmux support, and switch command.

### Changes Required:

#### 1. Create fzf integration
**File**: `wts/src/integrations/fzf.ts`

- `isFzfAvailable()` - Check for fzf via `which fzf`
- `fzfSelect()` - Generic selection with pipe to stdin
- `selectBranch()` - Branch picker with `git log --oneline` preview
- `selectWorktree()` - Worktree picker with `ls -la` preview

#### 2. Create tmux integration
**File**: `wts/src/integrations/tmux.ts`

- `isInsideTmux()` - Check `TMUX` env var
- `getCurrentSession()` - Get session name via `tmux display-message -p '#S'`
- `createWindow()` - `tmux new-window -n <name> -c <path>`
- `createPane()` - `tmux split-window -c <path>`
- `switchToWindow()` - `tmux select-window -t <name>`
- `resolveWindowName()` - Template expansion `{project}-{alias}`

#### 3. Create switch command
**File**: `wts/src/commands/switch.ts`

- `wts switch` - fzf picker of worktrees
- `wts switch <alias>` - Direct switch
- Options: `--tmux` - Open in tmux window

#### 4. Update create command
**File**: `wts/src/commands/create.ts` (update)

- Add `--tmux` / `--no-tmux` flags
- Add `--claude` flag
- Auto-detect tmux and open window/pane
- Use fzf for branch selection when not specified

#### 5. Create fallback prompts
**File**: `wts/src/utils/prompts.ts`

Simple stdin prompts when fzf unavailable.

### Success Criteria:

#### Automated Verification:
- [x] `bun tsc:check` passes
- [x] `bun lint` passes

#### Manual Verification:
- [x] `wts switch` (with fzf) shows picker
- [x] fzf picker shows worktrees with preview
- [x] Branch selection works during create
- [x] `wts create test --tmux` creates tmux window (when in tmux)
- [x] Works gracefully when fzf not installed

---

## Phase 4: Advanced Features

### Overview
Implement PR creation, cleanup, and Claude Code integration.

### Changes Required:

#### 1. Create pr command
**File**: `wts/src/commands/pr.ts`

- `wts pr [alias]` - Create PR from worktree
- Options: `--draft`, `--web`, `-t/--title`, `-b/--body`
- Uses `gh pr create` under the hood
- Auto-detect alias from current directory if in worktree

#### 2. Create cleanup command
**File**: `wts/src/commands/cleanup.ts`

- `wts cleanup` - Remove merged/stale worktrees
- Options: `--dry-run`, `--force`, `--older-than <days>`, `--unmerged`
- Check if branch is merged before removal
- `--unmerged` flag to include all unmerged worktrees for removal

#### 3. Create Claude Code integration
**File**: `wts/src/integrations/claude.ts`

- `launchClaude()` - Start Claude Code via `tmux send-keys 'claude' Enter`
- Integrate with tmux window creation

#### 4. Create hooks support
**File**: `wts/src/integrations/hooks.ts`

- `installPostCheckoutHook()` - Install hook for setup
- `hasHook()` - Check if hook exists

### Success Criteria:

#### Automated Verification:
- [x] `bun tsc:check` passes
- [x] `bun lint` passes
- [x] `wts pr --help` shows options
- [x] `wts cleanup --dry-run` lists stale worktrees

#### Manual Verification:
- [x] `wts pr` creates draft PR on GitHub
- [x] `wts cleanup` removes only merged worktrees
- [x] Claude Code launches correctly in tmux

---

## Phase 5: Documentation & Tests

### Overview
Add README, tests, and shell integration helpers.

### Changes Required:

#### 1. Create README
**File**: `wts/README.md`

- Installation: `bun link`
- Command reference with examples
- Configuration guide (global + local)
- Shell integration snippet:
  ```bash
  wcd() { cd "$(wts cd "$1")" }
  ```

#### 2. Create unit tests
**File**: `wts/test/utils/git.test.ts`

Test git utility functions with mock `Bun.$`.

**File**: `wts/test/commands/create.test.ts`

Test create command logic with temp git repo.

### Success Criteria:

#### Automated Verification:
- [x] `bun test` passes all tests
- [x] `bun tsc:check` passes
- [x] `bun link` installs globally

#### Manual Verification:
- [ ] README is clear and complete
- [ ] Shell integration works (`wcd <alias>` changes directory)
- [ ] Full workflow: init -> create -> work -> pr -> cleanup

---

## Testing Strategy

### Unit Tests
- Git utility functions (mock `Bun.$`)
- Config loading/merging
- Path utilities

### Integration Tests
- Create temp git repo with `git init`
- Run commands
- Verify worktree state

### E2E Tests
- Full CLI invocation via `Bun.$`
- Real git operations
- tmux integration (if available)

---

## Files to Create/Modify

| File | Action |
|------|--------|
| `wts/package.json` | Create |
| `wts/tsconfig.json` | Create |
| `wts/biome.json` | Create |
| `wts/README.md` | Create |
| `wts/src/index.ts` | Create |
| `wts/src/config/types.ts` | Create |
| `wts/src/config/global.ts` | Create |
| `wts/src/config/local.ts` | Create |
| `wts/src/commands/init.ts` | Create |
| `wts/src/commands/list.ts` | Create |
| `wts/src/commands/create.ts` | Create |
| `wts/src/commands/delete.ts` | Create |
| `wts/src/commands/switch.ts` | Create |
| `wts/src/commands/cd.ts` | Create |
| `wts/src/commands/pr.ts` | Create |
| `wts/src/commands/cleanup.ts` | Create |
| `wts/src/integrations/tmux.ts` | Create |
| `wts/src/integrations/fzf.ts` | Create |
| `wts/src/integrations/claude.ts` | Create |
| `wts/src/integrations/hooks.ts` | Create |
| `wts/src/setup/runner.ts` | Create |
| `wts/src/utils/git.ts` | Create |
| `wts/src/utils/paths.ts` | Create |
| `wts/src/utils/prompts.ts` | Create |
| `wts/test/utils/git.test.ts` | Create |
| `wts/test/commands/create.test.ts` | Create |

## References

- Research: `thoughts/shared/research/2026-01-08-wts-cli-design.md`
- Pattern reference: `cc-orch-mcp/src/cli.tsx`, `cc-orch-mcp/package.json`
- Git service example: `hive/src/main/git-service.ts`
- Commander.js docs: https://github.com/tj/commander.js
