# AI Toolbox

Monorepo of AI and developer tools by [desplega.ai](https://desplega.ai). Each subdirectory is a standalone tool with its own README.

## Repository Structure

| Tool | Description | Stack |
|------|-------------|-------|
| [ai-tracker](./ai-tracker) | Track AI vs human code contributions | Python, uv, SQLite |
| [brain](./brain) | Personal knowledge management with semantic search | TypeScript, Bun, SQLite |
| [cc-hooks](./cc-hooks) | macOS notifications for Claude Code | Bash |
| [cc-notch](./cc-notch) | Menu bar cost tracker (SwiftBar) | Shell |
| [cc-plugin](./cc-plugin) | Claude Code plugins | YAML/Markdown |
| [cc-what](./cc-what) | SDK & CLI for analyzing Claude Code usage data | TypeScript, Bun |
| [dns](./dns) | DNS TXT record query utility | - |
| [file-review](./file-review) | File review tool | - |
| [hive](./hive) | macOS app for Claude Code sessions | TypeScript, Electron, Vite |
| [hn-sql](./hn-sql) | HN data with Parquet + SQL | - |
| [invoice-cli](./invoice-cli) | Invoice email fetcher | - |
| [thoughts](./thoughts) | Research notes & plans (via /desplega:\*) | Markdown |
| [willitfront.page](./willitfront.page) | HN analysis with natural language | - |
| [wts](./wts) | Git worktree manager | TypeScript, Bun |

## Thoughts

The [thoughts](./thoughts) directory contains research notes and implementation plans generated via Claude Code skills from the [base plugin](./cc-plugin/base):

- `/desplega:research` - Document codebase state with research notes
- `/desplega:create-plan` - Create detailed implementation plans
- `/desplega:implement-plan` - Execute plans from a plan file

## Claude Plugins

### Installation

From inside Claude Code:

```bash
/plugin marketplace add desplega-ai/ai-toolbox
```

Or from the terminal:

```bash
claude plugin marketplace add desplega-ai/ai-toolbox
```

### Available Plugins

| Plugin | Description |
|--------|-------------|
| `desplega` | Base agentic coding patterns (research, planning, implementation) |
| `agent-swarm` | Multi-agent coordination |
| `wts` | Git worktree manager |
| `brain` | Personal knowledge management integration |
| `file-review` | File review with inline comments |
| `remarkable` | reMarkable tablet integration (get, put, ls) |

```bash
/plugin install desplega@desplega-ai-toolbox
/plugin install agent-swarm@desplega-ai-toolbox
/plugin install wts@desplega-ai-toolbox
/plugin install brain@desplega-ai-toolbox
/plugin install file-review@desplega-ai-toolbox
/plugin install remarkable@desplega-ai-toolbox
```

### Bash Install

You can also install from the terminal:
```bash
# Scope can be 'user' (default), 'project' or 'local'
claude plugin install desplega@desplega-ai-toolbox --scope user
claude plugin install agent-swarm@desplega-ai-toolbox --scope user
claude plugin install wts@desplega-ai-toolbox --scope user
claude plugin install brain@desplega-ai-toolbox --scope user
claude plugin install file-review@desplega-ai-toolbox --scope user
claude plugin install remarkable@desplega-ai-toolbox --scope user
```

Plugin structure: `cc-plugin/{base,swarm,wts,brain,file-review,remarkable}/` with hooks, skills, and agents.

## Key Tools

**ai-tracker** (Python):
```bash
uvx cc-ai-tracker install   # Install hooks
uvx cc-ai-tracker stats     # View AI/human contribution stats
```

**brain** (TypeScript/Bun):
```bash
npm install -g @desplega.ai/brain
brain init && brain add "My first note"
brain search "ideas"        # Semantic search
```

**cc-what** (TypeScript/Bun):
```bash
npm install -g @desplega.ai/cc-what
cc-what                     # Summary of Claude Code usage
cc-what stats --daily       # Daily activity stats
cc-what costs --models      # Cost breakdown by model
```

**wts** (TypeScript/Bun):
```bash
npm install -g @desplega.ai/wts
wts init && wts create feature --new-branch
```

## Development

Each tool is independent - check its README for specific setup. General pattern:
- Python tools: `uv` or `uvx`
- TypeScript tools: `bun` or `pnpm`
- Plugins: YAML/Markdown configs in `cc-plugin/`

New tools: Create folder with minimal slug, add README.md.
