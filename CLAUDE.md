# AI Toolbox

Monorepo of AI and developer tools by desplega.ai. Each subdirectory is a standalone tool with its own README.

## Repository Structure

| Tool | Description | Stack |
|------|-------------|-------|
| `ai-tracker/` | Track AI vs human code contributions | Python, uv, SQLite |
| `brain/` | Personal knowledge management with semantic search | TypeScript, Bun, SQLite |
| `cc-hooks/` | macOS notifications for Claude Code | Bash |
| `cc-notch/` | Menu bar cost tracker (SwiftBar) | Shell |
| `cc-plugin/` | Claude Code plugins (base, swarm, wts, teams) | YAML/Markdown |
| `dokcli/` | CLI tool for Dokploy (auto-generated from OpenAPI) | TypeScript, Bun |
| `dns/` | DNS TXT record query utility | - |
| `file-review/` | File review tool | - |
| `hive/` | macOS app for Claude Code sessions | TypeScript, Electron, Vite |
| `hn-sql/` | HN data with Parquet + SQL | - |
| `invoice-cli/` | Invoice email fetcher | - |
| `thoughts/` | Research notes & plans (via /desplega:*) | Markdown |
| `willitfront.page/` | HN analysis with natural language | - |
| `wts/` | Git worktree manager | TypeScript, Bun |

## Claude Plugins

Install from marketplace:
```bash
/plugin marketplace add desplega-ai/ai-toolbox
/plugin install desplega@desplega-ai-toolbox      # Base agentic patterns
/plugin install agent-swarm@desplega-ai-toolbox   # Agent swarm
/plugin install wts@desplega-ai-toolbox           # Worktree manager
```

Plugin structure: `cc-plugin/{base,swarm,wts,teams}/` with hooks, skills, and agents.

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

## file-review Release Process

After making changes to `file-review/`, follow this sequence:

1. **Bump version** in all three files (keep in sync):
   - `file-review/package.json`
   - `file-review/src-tauri/tauri.conf.json`
   - `file-review/src-tauri/Cargo.toml`
2. **Commit & push**: `git add ... && git commit && git push origin main`
3. **Build & install**: `cd file-review && bun run install:web`
4. **Commit Cargo.lock**: The build updates `file-review/src-tauri/Cargo.lock` — commit and push it separately

Use `bun run dev -- /path/to/file.md` for E2E testing before release.
