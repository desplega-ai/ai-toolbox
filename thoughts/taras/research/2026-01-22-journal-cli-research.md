---
date: 2026-01-22T14:30:00-08:00
researcher: Claude
git_commit: 5618bdf3ce0b639175d79d71dc97bb4dc8372020
branch: main
repository: ai-toolbox
topic: "Personal Journal CLI with Semantic Search and Claude Code Integration"
tags: [research, cli, typescript, bun, sqlite, embeddings, journal, memory, claude-code, skills]
status: complete
autonomy: verbose
last_updated: 2026-01-22
last_updated_by: Claude
---

# Research: Personal Journal CLI with Semantic Search and Claude Code Integration

**Date**: 2026-01-22
**Researcher**: Claude
**Git Commit**: 5618bdf3ce0b639175d79d71dc97bb4dc8372020
**Branch**: main

## Research Question

Design a TypeScript/Bun CLI tool that functions as a personal journal/brain dump with:
- S3-like hierarchical structure (directories + Markdown/TXT files)
- Semantic search using OpenAI embeddings + SQLite vector storage
- Easy structure visualization
- Claude Code skill integration (not MCP)
- Todo management and progress logging

## Summary

This research synthesizes findings across five areas to inform the design of a personal journal CLI. The key architectural decisions are:

1. **Storage**: Plain Markdown files on disk with SQLite for metadata + embeddings (following zk's proven pattern)
2. **Search**: libSQL with native vector types OR sqlite-vec with better-sqlite3 - both work well with Bun
3. **Embeddings**: `text-embedding-3-small` for quality/cost balance (~$0.01 for 1000 notes), with optional local fallback via Ollama
4. **CLI Framework**: Commander.js (proven in wts) with chalk for colors
5. **Skill Integration**: The "System Skill" pattern - CLI binary + SKILL.md tutorial + SQLite state

The existing `qmd` tool mentioned in your global CLAUDE.md provides fuzzy/semantic search already. This research informs either enhancing it or building a complementary tool with stronger hierarchical organization and Claude Code skill integration.

---

## Detailed Findings

### 1. Existing CLI Note-Taking Tools

| Tool | Language | Storage | Index | Search | Standout Feature |
|------|----------|---------|-------|--------|------------------|
| **nb** | Bash | Files | None | ripgrep | Git-backed, encrypted notes |
| **jrnl** | Python | Single file | None | In-memory | Timestamp-based entries |
| **zk** | Go | Files | SQLite FTS5 | Full-text | LSP server integration |
| **Dendron** | TypeScript | Files (dot-delimited) | In-memory FuseJS | Fuzzy | Hierarchical via `.` in filenames |

**Key Architectural Insights:**

1. **Plain text is king** - All successful tools use Markdown files for future-proofing and interoperability
2. **SQLite + FTS5** is the sweet spot for search without external dependencies (zk pattern)
3. **Dot-delimited hierarchy** (Dendron) allows files to act as both files and folders: `project.tasks.todo.md`
4. **Wiki links** (`[[note]]`) are the standard cross-referencing syntax

**Patterns to adopt:**
- Git-style subcommands with shorthand aliases (`nb a` = `nb add`)
- `#hashtags` with hierarchy support (`#topic/subtopic`)
- YAML frontmatter for metadata
- `[[wikilinks]]` for internal references

### 2. SQLite Vector Search Solutions

| Solution | Status 2025 | Bun/TS Support | ANN Index | Recommendation |
|----------|-------------|----------------|-----------|----------------|
| **sqlite-vec** | Active v0.1.6 | Yes (better-sqlite3) | No (brute-force) | Good for <500K vectors |
| **libSQL** | Active | Excellent (@libsql/client) | Yes (DiskANN) | Best for cloud-ready apps |
| sqlite-vss | Deprecated | Limited | Yes (Faiss) | Avoid |

**Recommended: libSQL** for this use case because:
- Native vector types (`F32_BLOB(1536)`) - no extension loading hassle
- Works locally (`file:local.db`) or with Turso cloud
- DiskANN index for larger datasets
- Better scaling path if the journal grows large

**Basic Usage:**
```typescript
import { createClient } from '@libsql/client';

const db = createClient({ url: 'file:journal.db' });

// Create table with vector column
await db.execute(`
  CREATE TABLE IF NOT EXISTS entries (
    id INTEGER PRIMARY KEY,
    path TEXT NOT NULL,
    content TEXT,
    embedding F32_BLOB(1536),
    created_at TEXT,
    updated_at TEXT
  )
`);

// Create vector index
await db.execute(`
  CREATE INDEX IF NOT EXISTS entries_vec_idx ON entries (
    libsql_vector_idx(embedding, 'metric=cosine')
  )
`);

// Semantic search
const results = await db.execute({
  sql: `SELECT path, content FROM vector_top_k('entries_vec_idx', vector(?), 5)
        JOIN entries ON entries.rowid = id`,
  args: [JSON.stringify(queryEmbedding)]
});
```

### 3. OpenAI Embeddings

**Recommended Model: `text-embedding-3-small`**

| Model | Dimensions | Price/1M tokens | Quality (MTEB) |
|-------|------------|-----------------|----------------|
| text-embedding-3-small | 1536 | $0.02 | ~62.3 |
| text-embedding-3-large | 3072 | $0.13 | 64.6 |
| text-embedding-ada-002 | 1536 | $0.10 | 61.0 |

**Cost for 1000 notes** (~500 tokens each): **~$0.01**

**Best Practices:**
1. **No chunking needed** - journal entries are typically <500 tokens
2. **Content-hash caching** - SHA-256 hash as key, skip re-embedding unchanged content
3. **Batch API** for initial indexing (50% discount, 24h SLA)
4. **Local fallback** - Ollama + `nomic-embed-text` for offline/private mode

```typescript
// Caching pattern
const contentHash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content));
const hashHex = Array.from(new Uint8Array(contentHash)).map(b => b.toString(16).padStart(2, '0')).join('');

// Check cache before API call
const cached = await db.execute({ sql: 'SELECT embedding FROM cache WHERE hash = ?', args: [hashHex] });
if (cached.rows.length > 0) return cached.rows[0].embedding;
```

### 4. TypeScript CLI Framework

**Recommended: Commander.js** (already proven in wts)

| Framework | Bun Support | Subcommands | Prompts | Bundle Size |
|-----------|-------------|-------------|---------|-------------|
| **Commander.js** | Excellent | Yes | External | ~45KB |
| cac | Good | Yes | External | ~15KB |
| citty (UnJS) | Good | Yes | External | ~45KB |
| Yargs | Broken | Yes | External | ~70KB |
| oclif | Limited | Yes | Built-in | ~200KB |

**Why Commander.js:**
- Already used in `wts` with proven Bun build pipeline
- Industry standard with excellent TypeScript support
- Commander 14+ requires Node 20+ (compatible with Bun)

**Supporting libraries:**
- `chalk` - Terminal colors (already in wts)
- `@inquirer/prompts` - Interactive prompts (if needed beyond basic)
- `cli-table3` - Table formatting
- `ora` - Spinners for async operations

**Package.json pattern from wts:**
```json
{
  "name": "@desplega.ai/journal",
  "type": "module",
  "bin": { "journal": "./dist/index.js" },
  "files": ["dist"],
  "scripts": {
    "build": "bun build src/index.ts --outdir dist --target node --format esm"
  }
}
```

### 5. AI Memory & Claude Code Skill Integration

**The System Skill Pattern** is the recommended approach for Claude Code integration:

1. **CLI Binary** - Self-contained, no runtime dependencies
2. **SKILL.md** - Operating tutorial for Claude
3. **SQLite Database** - Persistent state

This is better than MCP for this use case because:
- Skills are simpler to install and manage
- No server process to maintain
- Works offline
- Easier to version and distribute via cc-plugin

**Memory Structure Patterns (from Mem0, Zep, Letta):**

| Pattern | Description | Applicable Here |
|---------|-------------|-----------------|
| **Scopes** | user / project / session | Yes - global vs per-project journals |
| **Importance scoring** | Recency + frequency + explicit | Yes - for search ranking |
| **Contradiction resolution** | LLM decides ADD/UPDATE/DELETE | Optional - prompt user instead |
| **Episodic vs semantic** | Raw entries vs extracted facts | Yes - entries vs tags/summaries |

**Existing patterns in this repo:**
- `thoughts/` directory for research/plans (semantic archival)
- `context-handoff` agent for episode capture
- `qmd` CLI for knowledge storage/retrieval

---

## Suggested Architecture

### Directory Structure

```
~/.brain.json                # Config: path, API keys, preferences

~/Documents/brain/           # Default brain directory (configurable)
├── .brain.db                # SQLite: metadata, embeddings, FTS index
├── .git/                    # Git repo for version control
│
├── 2026/                    # Date-based entries (auto-created by `brain add`)
│   └── 01/
│       ├── 22.md            # Daily file with [YYYY-MM-DD-HHMMSS] timestamps
│       └── 23.md
│
├── ideas.md                 # Named entries in root
├── recipes/                 # Named subdirs (shown as tree in `brain list --tree`)
│   ├── pasta.md
│   └── soups/
│       └── ramen.md
├── projects/
│   └── ai-toolbox/
│       └── log.md
└── todos/
    └── global.md
```

**Design Decisions:**
- **Date-based entries**: `YYYY/MM/DD.md` for daily quick adds
- **Named entries**: Any `.md` file in root or subdirs (e.g., `recipes/pasta.md`)
- **Subdirs as trees**: `brain list --tree` shows named dirs hierarchically
- **Plain Markdown** files on disk (human-readable, git-friendly)
- **SQLite** for metadata + embeddings (hidden `.brain.db` in brain dir)
- **Git integration** for version history (auto-commit on changes)
- **Single config file** at `~/.brain.json`

### Database Schema

```sql
-- Metadata table (tracks embedding model for invalidation)
CREATE TABLE metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
-- Store: embedding_model = "text-embedding-3-small"
--        embedding_dimensions = "1536"

-- Core entries table (files)
CREATE TABLE entries (
  id INTEGER PRIMARY KEY,
  path TEXT NOT NULL UNIQUE,      -- Relative path from brain root
  title TEXT,                      -- Extracted from first H1 or filename
  content TEXT,                    -- Full text content
  content_hash TEXT,               -- SHA-256 for invalidation
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  indexed_at TEXT,                 -- Last chunk/embed update
  word_count INTEGER,
  tags TEXT                        -- JSON array extracted from #hashtags
);

-- Chunks table (embeddings per structural chunk)
CREATE TABLE chunks (
  id INTEGER PRIMARY KEY,
  entry_id INTEGER NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,    -- Order within entry
  chunk_type TEXT NOT NULL,        -- 'timestamp-block', 'header-section', 'whole-file'
  content TEXT NOT NULL,           -- Chunk text
  content_hash TEXT,               -- SHA-256 for invalidation
  embedding F32_BLOB(1536),        -- Vector embedding (libSQL native)
  embedding_model TEXT,            -- Model used for this embedding
  start_line INTEGER,              -- Line number in source file
  UNIQUE(entry_id, chunk_index)
);

-- Full-text search index (FTS5)
CREATE VIRTUAL TABLE entries_fts USING fts5(
  title, content, tags,
  content='entries',
  content_rowid='id'
);

-- Vector similarity index on chunks (libSQL DiskANN)
CREATE INDEX chunks_vec_idx ON chunks (
  libsql_vector_idx(embedding, 'metric=cosine')
);

-- Todos with project scope
CREATE TABLE todos (
  id INTEGER PRIMARY KEY,
  entry_id INTEGER REFERENCES entries(id),
  project TEXT,                    -- NULL = global, else project name
  line_number INTEGER,             -- Line in the markdown file
  text TEXT NOT NULL,
  status TEXT DEFAULT 'open',      -- open, done, cancelled
  due_date TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT
);
```

### CLI Interface

**Tool name: `brain`**

```bash
# Core operations - quick additions
brain add "Quick thought about the project"      # Append to today's file
brain add --file projects/ai-toolbox/log.md "Progress update"  # Specific file
brain new "Morning Reflection"                   # Create new entry in $EDITOR

# Entry format in daily file (e.g., 2026/01/22.md):
# [2026-01-22-143022]
# Quick thought about the project
#
# [2026-01-22-151045]
# Another thought later

# Search (semantic + full-text)
brain search "vector database options"           # Semantic search
brain search --exact "sqlite-vec"                # Full-text search
brain search --tags "project,ai"                 # Tag-based filter

# Browse and navigate
brain list                                       # Recent entries
brain list --tree                                # Show hierarchy
brain list --tags                                # List all tags
brain show 2026/01/22                            # Display entry
brain edit 2026/01/22                            # Open in $EDITOR

# Todos (global + project scoped)
brain todo add "Review PR #123"                  # Global todo
brain todo add --project ai-toolbox "Ship feature"  # Project-scoped
brain todo add --due tomorrow "Deploy"           # With due date
brain todo list                                  # Show all open todos
brain todo list --project ai-toolbox             # Project todos only
brain todo done 3                                # Mark todo #3 complete

# Sync (on-demand - files are source of truth)
brain sync                                       # Scan files → update DB (entries, chunks, embeddings)
brain sync --force                               # Force re-embed everything
brain sync --quiet                               # Minimal output (for cron)
brain export --format json                       # Export for backup

# Auto-sync via crontab
brain cron install                               # Add crontab entry (every 5 min)
brain cron install --interval 15                 # Custom interval in minutes
brain cron remove                                # Remove crontab entry
brain cron status                                # Check if cron is active

# Init & Config
brain init                                       # Create brain dir, .brain.db, git init
brain init ~/Documents/my-brain                  # Custom path
brain config set path ~/Documents/brain
brain config show
# Note: OpenAI key via OPENAI_API_KEY env var (not stored in config)
```

**Shorthand aliases:**
- `brain a` = `brain add`
- `brain s` = `brain search`
- `brain t` = `brain todo`
- `brain ls` = `brain list`

### Claude Code Skill Integration

**File: `cc-plugin/base/skills/brain/SKILL.md`**

```markdown
---
name: brain-expert
description: Store and retrieve personal knowledge using the brain CLI
---

# Brain Expert Skill

You have access to `brain`, a CLI for personal knowledge management.

## Quick Reference

| Action | Command |
|--------|---------|
| Quick note | `brain add "thought..."` |
| New entry | `brain new "Title"` |
| Search | `brain search "query"` |
| List recent | `brain list` |
| Global todo | `brain todo add "task"` |
| Project todo | `brain todo add --project <name> "task"` |
| Show todos | `brain todo list` |

## When to Use

### Store Knowledge
- User shares a preference or decision → `brain add "Taras prefers..."`
- Project pattern discovered → `brain add --file projects/<name>/patterns.md "..."`
- Session insight worth remembering → `brain add "Learned that..."`

### Retrieve Context
- Before starting a task → `brain search "<task context>"`
- Need historical context → `brain search --tags project "..."`
- Check previous decisions → `brain search "decided" | head -20`

### Todo Management
- User mentions a global task → `brain todo add "..."`
- Project-specific task → `brain todo add --project ai-toolbox "..."`
- Check open work → `brain todo list`
- Complete tasks → `brain todo done <id>`

## Best Practices

1. **Search before assuming** - Check brain for existing context
2. **Tag consistently** - Use lowercase, hierarchical tags (`#project/ai-toolbox`)
3. **Store decisions with rationale** - "Chose X because Y"
4. **Keep entries atomic** - One thought per quick add, longer reflections as new entries
```

**Integration with existing patterns:**

The brain CLI complements existing tools:
- `qmd` - For quick facts and memories (key-value oriented)
- `brain` - For timestamped entries, reflections, project logs (document oriented)
- `thoughts/` - For formal research and plans (skill-generated documents)

### Implementation Phases

**Phase 1: Core MVP**
- [ ] CLI structure with Commander.js (`init`, `add`, `new`, `list`, `show`, `edit`)
- [ ] File operations (create daily files, named entries)
- [ ] `~/.brain.json` config
- [ ] Git auto-commit (debounced)

**Phase 2: Search**
- [ ] SQLite setup with libSQL
- [ ] `brain sync` command - scan files → populate DB
- [ ] FTS5 full-text search
- [ ] OpenAI embeddings + vector search
- [ ] Structural chunking (timestamp blocks, headers, whole file)
- [ ] Content-hash invalidation

**Phase 3: Extras**
- [ ] Todo extraction and management (`brain todo`)
- [ ] Tag extraction and browsing (`brain list --tags`)
- [ ] Tree view (`brain list --tree`)
- [ ] Ollama fallback for embeddings
- [ ] Export/import

**Phase 4: Claude Code Integration**
- [ ] SKILL.md for cc-plugin
- [ ] Integration tests

**Phase 5: Auto-sync via crontab**
- [ ] `brain cron install` - adds crontab entry (e.g., `*/5 * * * * brain sync --quiet`)
- [ ] `brain cron remove` - removes crontab entry
- [ ] `brain cron status` - shows if cron is active
- [ ] `brain sync --quiet` flag for cron-friendly output

**Future (not MVP):**
- [ ] macOS LaunchAgent daemon (more responsive than cron)
- [ ] File watcher for real-time indexing

---

## Code References

| Component | Path | Description |
|-----------|------|-------------|
| wts CLI entry | `wts/src/index.ts` | Reference for CLI structure |
| wts commands | `wts/src/commands/*.ts` | Command definition pattern |
| wts config | `wts/src/config/` | Two-tier config pattern |
| wts package.json | `wts/package.json` | npm publishing setup |
| Global CLAUDE.md | `~/.claude/CLAUDE.md` | Existing memory patterns |
| Context handoff | `cc-plugin/base/agents/context-handoff.md` | Episode capture pattern |
| Researching skill | `cc-plugin/base/skills/researching/SKILL.md` | Skill structure reference |

---

## Historical Context (from thoughts/)

Related prior research in this repo:
- `thoughts/shared/research/2025-12-30-hive-context-summaries-research.md` - Context window and token tracking
- `thoughts/shared/research/2026-01-08-wts-cli-design.md` - CLI design patterns for wts

The existing `qmd` tool (mentioned in `~/.claude/CLAUDE.md`) provides store/retrieve/delete with fuzzy and semantic search. The `brain` CLI will be complementary - more structured for timestamped entries and hierarchical organization.

---

## Decisions (from review)

**Core:**
1. **Tool name**: `brain` (not journal)
2. **Relationship to qmd**: Separate tool completely - qmd for facts, brain for timestamped entries

**Config:**
3. **Config approach**: Single `~/.brain.json` file (not XDG, not two-tier)
4. **Multi-journal support**: Single brain directory, path defined in config

**Entry format:**
5. **Quick add format**: `[YYYY-MM-DD-HHMMSS]\n<text>` in daily files (`2026/01/22.md`)
6. **Named entries**: Any `.md` in root or subdirs (e.g., `ideas.md`, `recipes/pasta.md`)
7. **Tree view**: `brain list --tree` shows named subdirs hierarchically
8. **Editor**: Use `$EDITOR` for `brain new` command

**Embeddings:**
9. **Storage format**: `F32_BLOB(1536)` with libSQL (native vector type, DiskANN index)
10. **Invalidation**: Content SHA-256 hash + model name tracking (re-embed only when either changes)
11. **Chunking**: Structural chunking - timestamp blocks for daily files, `##` headers for long named files (>1500 tokens), whole file for short named files

**Features:**
12. **Local embedding model**: Include Ollama fallback when OpenAI API key (`OPENAI_API_KEY` env var) is not configured
13. **Git integration**: Yes - auto-commit on changes, debounced/batched to avoid commit spam
14. **Sync strategy**: On-demand (`brain sync`) + optional crontab auto-sync (`brain cron install`). Files are source of truth, DB is search index rebuilt on demand.
15. **Todos**: Support both global and project-scoped (`--project <name>`)
16. **Init command**: `brain init [path]` creates directory, .brain.db, and git repo

---

## Sources

### CLI Note-Taking Tools
- [GitHub - xwmx/nb](https://github.com/xwmx/nb)
- [GitHub - jrnl-org/jrnl](https://github.com/jrnl-org/jrnl)
- [GitHub - zk-org/zk](https://github.com/zk-org/zk)
- [Dendron Documentation](https://wiki.dendron.so/)

### SQLite Vector Search
- [sqlite-vec Documentation](https://alexgarcia.xyz/sqlite-vec/)
- [libSQL Vector Documentation](https://turso.tech/vector)
- [libsql-client-ts](https://github.com/tursodatabase/libsql-client-ts)

### OpenAI Embeddings
- [OpenAI API Pricing](https://openai.com/api/pricing/)
- [text-embedding-3-small Model](https://platform.openai.com/docs/models/text-embedding-3-small)
- [Ollama nomic-embed-text](https://ollama.com/library/nomic-embed-text)

### CLI Frameworks
- [Commander.js](https://www.npmjs.com/package/commander)
- [Better Stack Commander Guide](https://betterstack.com/community/guides/scaling-nodejs/commander-explained/)

### AI Memory Patterns
- [Mem0 Documentation](https://docs.mem0.ai/platform/overview)
- [Zep Research Paper](https://arxiv.org/abs/2501.13956)
- [Letta Memory Documentation](https://docs.letta.com/guides/agents/memory/)
- [The System Skill Pattern](https://www.shruggingface.com/blog/the-system-skill-pattern)
- [Claude Memory Tool](https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool)
