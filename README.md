A collection of AI and developer tools.

## Tools

| Tool | Description |
|------|-------------|
| [ai-tracker](./ai-tracker) | Track AI vs human code contributions in git repos |
| [cc-hooks](./cc-hooks) | macOS notifications for Claude Code |
| [cc-notch](./cc-notch) | Menu bar cost tracker for Claude Code (SwiftBar) |
| [dns](./dns) | DNS TXT record query utility |
| [hive](./hive) | macOS desktop app for managing Claude Code sessions |
| [hn-sql](./hn-sql) | Fetch Hacker News data into Parquet and query with SQL |
| [invoice-cli](./invoice-cli) | AI-powered invoice email fetcher and organizer |
| [willitfront.page](./willitfront.page) | HN data analysis with natural language queries |
| [wts](./wts) | Git worktree manager with tmux/Claude Code integration |

## Thoughts

The [thoughts](./thoughts) directory contains research notes and implementation plans generated via Claude Code skills from the [base plugin](./cc-plugin/base):

- `/desplega:research` - Document codebase state with research notes ([research.md](./cc-plugin/base/commands/research.md))
- `/desplega:create-plan` - Create detailed implementation plans ([create-plan.md](./cc-plugin/base/commands/create-plan.md))
- `/desplega:implement-plan` - Execute plans from a plan file ([implement-plan.md](./cc-plugin/base/commands/implement-plan.md))

## Claude Plugin

### Installation

From inside Claude Code, run:

```bash
/plugin marketplace add desplega-ai/ai-toolbox
```

or from the terminal

```bash
claude plugin marketplace add desplega-ai/ai-toolbox
```

Then install the plugins inside it with:

#### Base desplega.ai agentic coding patterns

```bash
/plugin install desplega@desplega-ai-toolbox
```

#### Agent Swarm plugin

```bash
/plugin install agent-swarm@desplega-ai-toolbox
```

#### `wts` worktree manager plugin

```bash
/plugin install wts@desplega-ai-toolbox
```

#### Bash install 

You can also install them from the terminal with:

```bash
# Scope can be 'user' (default), 'project' or 'local'
claude plugin install desplega@desplega-ai-toolbox --scope user
claude plugin install agent-swarm@desplega-ai-toolbox --scope user
claude plugin install wts@desplega-ai-toolbox --scope user
```

## Development

1. Create a new folder with a minimal slug
2. Add a README.md with a description
3. Toolchains: node, bash, bun, or python (pyproject.toml)
