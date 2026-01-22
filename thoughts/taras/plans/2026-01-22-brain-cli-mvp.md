---
date: 2026-01-22T15:00:00-08:00
planner: Claude
topic: "Brain CLI MVP Implementation"
tags: [plan, cli, typescript, bun, sqlite, embeddings, brain]
status: ready
research: thoughts/taras/research/2026-01-22-journal-cli-research.md
---

# Brain CLI MVP Implementation Plan

## Overview

Create a TypeScript/Bun CLI tool (`brain`) for personal knowledge management with hierarchical Markdown files, SQLite metadata/embeddings storage, and semantic search. This plan covers MVP functionality (Phases 1-2 from the research document).

## Current State Analysis

### Repository Context
- **Location**: `/Users/taras/Documents/code/ai-toolbox/brain/` (new directory)
- **Reference CLI**: `wts/` provides the exact pattern (Commander.js, chalk, Bun build)
- **Research**: `thoughts/taras/research/2026-01-22-journal-cli-research.md`

### Key Patterns to Follow (from `wts/`)
- CLI framework: Commander.js with command modules in `src/commands/`
- Colors: chalk for terminal output
- Config I/O: `Bun.file()` API with JSON
- Build: `bun build src/index.ts --outdir dist --target node --format esm`
- Entry point: `#!/usr/bin/env bun` shebang

### Key Discoveries:
- wts command pattern: `wts/src/commands/*.ts` each export a `Command` instance (`wts/src/commands/init.ts:10-56`)
- Config loading: Single JSON file with `Bun.file(path).exists()` + `.json()` (`wts/src/config/global.ts:12-31`)
- Error pattern: `chalk.red("Error: ...")` + `process.exit(1)` (`wts/src/commands/create.ts:42-47`)
- Git operations: `Bun.$` shell syntax with `.cwd()` and `.quiet()` (`wts/src/utils/git.ts:8-15`)

## Desired End State

A working `brain` CLI installable via `bun link` or `npm install -g @desplega.ai/brain` with:

```bash
# Core operations
brain init [path]                    # Initialize brain directory (interactive, --yes for headless)
brain add "Quick thought"            # Append to today's file (fzf picker if no target)
brain add --file path.md "text"      # Append to specific file
brain add --ref /path/to/file "note" # Add note referencing external file
brain new "notes/ideas"              # Create new entry (S3-style path, opens in editor)
brain list                           # Recent entries
brain list --search "query"          # Fuzzy filter on filenames
brain list --tree                    # Hierarchical view
brain show 2026/01/22                # Display entry (works with any path)
brain show ideas/startup             # Display named entry
brain edit 2026/01/22                # Open in editor (uses config.editor or $EDITOR)

# Search
brain search "query"                 # Semantic search
brain search --exact "term"          # Full-text search (FTS5)
brain search --fuzzy "query"         # Interactive fzf selection of results
brain sync                           # Scan files → update DB
brain sync --force                   # Re-embed everything

# Config
brain config show                    # Display config
brain config set key value           # Update config
```

**Verification**:
```bash
cd /Users/taras/Documents/code/ai-toolbox/brain
bun install && bun link
brain init ~/Documents/brain
brain add "First thought"
cat ~/Documents/brain/2026/01/22.md  # Shows timestamped entry
brain sync
brain search "first"                  # Returns the entry
```

## Quick Verification Reference

Common commands to verify the implementation:
- `bun tsc --noEmit` - Type checking
- `bun run lint` - Biome linting
- `bun run format` - Biome formatting
- `bun test` - Run tests
- `bun run build` - Build to dist/

Key files to check:
- `brain/src/index.ts` - CLI entry point
- `brain/src/commands/*.ts` - Command implementations
- `brain/src/db/schema.ts` - Database schema
- `brain/src/embeddings/openai.ts` - Embedding provider

## What We're NOT Doing (MVP Scope)

- **No todo management** - Deferred to Phase 3
- **No tag extraction/browsing** - Deferred to Phase 3
- **No Ollama fallback** - OpenAI only (but architecture supports providers)
- **No crontab auto-sync** - Manual `brain sync` only
- **No export/import** - Deferred
- **No Claude Code skill** - Deferred to Phase 4

## Implementation Approach

1. **Phase 1**: Project setup + core file operations (add, new, list, show, edit)
2. **Phase 2**: SQLite database + sync + search (FTS5 + vector)

Architecture decisions:
- **Embedding provider interface** - Abstract `EmbeddingProvider` for future extensibility
- **Structural chunking** - Timestamp blocks for daily files, whole file for short named files
- **Content-hash invalidation** - SHA-256 hash to skip re-embedding unchanged content

---

## Phase 1: Project Foundation & Core Commands

### Overview
Set up project structure, configuration, and basic file operations (add, new, list, show, edit).

### Changes Required:

#### 1. Create directory structure
```
brain/
├── package.json
├── tsconfig.json
├── biome.json
└── src/
    ├── index.ts
    ├── commands/
    │   ├── init.ts
    │   ├── add.ts
    │   ├── new.ts
    │   ├── list.ts
    │   ├── show.ts
    │   ├── edit.ts
    │   └── config.ts
    ├── config/
    │   └── index.ts
    └── utils/
        ├── paths.ts
        ├── git.ts
        ├── editor.ts
        └── fzf.ts
```

#### 2. Create package.json
**File**: `brain/package.json`

```json
{
  "name": "@desplega.ai/brain",
  "version": "0.1.0",
  "description": "Personal knowledge management CLI with semantic search",
  "type": "module",
  "bin": { "brain": "./dist/index.js" },
  "files": ["dist"],
  "scripts": {
    "dev": "bun src/index.ts",
    "build": "bun build src/index.ts --outdir dist --target node --format esm",
    "prepublishOnly": "bun run build",
    "lint": "biome check src",
    "lint:fix": "biome check --write src",
    "format": "biome format --write src",
    "test": "bun test",
    "tsc": "bun tsc --noEmit"
  },
  "dependencies": {
    "commander": "^12.1.0",
    "chalk": "^5.4.1"
  },
  "devDependencies": {
    "@biomejs/biome": "^2.3.9",
    "@types/bun": "latest",
    "typescript": "^5.7.0"
  },
  "publishConfig": {
    "access": "public"
  }
}
```

#### 3. Create tsconfig.json
**File**: `brain/tsconfig.json`

Copy pattern from `wts/tsconfig.json`:
- `"module": "Preserve"`
- `"moduleResolution": "bundler"`
- `"strict": true`

#### 4. Create biome.json
**File**: `brain/biome.json`

Standard Biome config matching wts pattern.

#### 5. Create config module
**File**: `brain/src/config/index.ts`

Config stored at `~/.brain.json`:
```typescript
interface BrainConfig {
  path: string;              // Brain directory path
  editor?: string;           // Override $EDITOR env var
  embeddingModel?: string;   // Default: "text-embedding-3-small"
  embeddingDimensions?: number; // Default: 1536
}

// Functions:
// - loadConfig(): BrainConfig | undefined
// - saveConfig(config: BrainConfig): void
// - getBrainPath(): string | undefined
// - getConfigPath(): string
```

#### 6. Create path utilities
**File**: `brain/src/utils/paths.ts`

```typescript
// Functions:
// - expandPath(path: string): string  // Expand ~ to home dir
// - formatPath(path: string): string  // Replace home with ~
// - getTodayPath(): string            // Returns "YYYY/MM/DD.md"
// - ensureDir(path: string): Promise<void>
// - getTimestamp(): string            // Returns "YYYY-MM-DD-HHMMSS"
```

#### 7. Create git utilities
**File**: `brain/src/utils/git.ts`

```typescript
// Functions:
// - initGitRepo(path: string): Promise<void>
// - isGitRepo(path: string): Promise<boolean>
// - gitAdd(files: string[], cwd: string): Promise<void>
// - gitCommit(message: string, cwd: string): Promise<void>
// - autoCommit(message: string, cwd: string): Promise<void>  // Add + commit
```

#### 8. Create editor utility
**File**: `brain/src/utils/editor.ts`

```typescript
// Functions:
// - openInEditor(filePath: string): Promise<void>  // Opens file in editor
// - getEditor(): string  // Priority: config.editor > $EDITOR > "vim"
```

#### 8b. Create fzf utility
**File**: `brain/src/utils/fzf.ts`

```typescript
// Functions:
// - isFzfAvailable(): Promise<boolean>  // Check if fzf is installed
// - fzfSelect<T>(items: T[], opts?: FzfOptions): Promise<T | undefined>  // Generic fzf picker
// - fzfFilter(items: string[], query: string): Promise<string[]>  // Filter with fzf
// - selectFile(files: string[]): Promise<string | undefined>  // File picker
```

Pattern from `wts/src/integrations/fzf.ts` - pipe items to fzf stdin, capture selection.

#### 9. Create init command
**File**: `brain/src/commands/init.ts`

```bash
brain init [path]        # Interactive setup
brain init [path] --yes  # Headless with defaults
```

**Interactive mode** (default):
- Prompts for brain directory path (default: `~/Documents/brain`)
- Prompts for editor preference (default: $EDITOR)
- Confirms git initialization

**Headless mode** (`--yes` / `-y`):
- Uses provided path or default
- Skips all prompts, uses defaults

**Actions**:
- Creates brain directory
- Creates `.brain.db` SQLite database (empty for Phase 1)
- Initializes git repo with `.gitignore` (ignores `.brain.db`)
- Saves config to `~/.brain.json`

#### 10. Create add command
**File**: `brain/src/commands/add.ts`

```bash
brain add "Quick thought"                    # Append to today's file
brain add --file recipes/pasta.md "text"    # Append to specific file
brain add --where "Quick thought"           # fzf picker for target file
brain add --ref /path/to/code.ts "note"     # Add note referencing external file
brain a "shorthand"                          # Alias
```

**Target selection**:
- Default: today's file (`YYYY/MM/DD.md`)
- `--file` / `-f`: Specify target file
- `--where` / `-w`: Interactive fzf picker to select target

**File references** (`--ref`):
- Creates entry with reference to external file
- Format: `[YYYY-MM-DD-HHMMSS] ref:/path/to/file.ts\n<note text>\n\n`
- Referenced file content can be read during embedding for context

**Behavior**:
- Creates date directories if needed
- Format: `[YYYY-MM-DD-HHMMSS]\n<text>\n\n`
- Auto-commits immediately (MVP simplicity)

#### 11. Create new command
**File**: `brain/src/commands/new.ts`

```bash
brain new "notes/ideas"              # Creates notes/ideas.md
brain new "projects/ai-toolbox/log"  # Creates nested path
```

**S3-style path handling**:
- Input treated as path (not title)
- Creates parent directories as needed
- Validates path characters (no spaces, alphanumeric + `-_/` only)
- Adds `.md` extension if missing

**File creation**:
- Extracts title from last path segment (e.g., "log" → `# Log`)
- Opens in editor (config.editor > $EDITOR > vim)
- Auto-commits on save

#### 12. Create list command
**File**: `brain/src/commands/list.ts`

```bash
brain list                    # Recent entries (last 10)
brain list --tree             # Hierarchical view
brain list -n 20              # Last 20 entries
brain list --search "query"   # Fuzzy filter on filenames
brain list -s "query"         # Shorthand for --search
brain ls                      # Alias
```

- Scans brain directory for `.md` files
- Sorts by modification time (recent first)
- Tree view shows directory structure
- `--search` filters entries by fuzzy match on filename (uses simple substring or fzf if available)

#### 13. Create show command
**File**: `brain/src/commands/show.ts`

```bash
brain show 2026/01/22           # Show today's file
brain show ideas/startup        # Show named entry (.md optional)
```

- Prints file content with syntax highlighting (basic)
- Supports partial paths

#### 14. Create edit command
**File**: `brain/src/commands/edit.ts`

```bash
brain edit 2026/01/22
brain edit ideas/startup
```

- Opens file in `$EDITOR`
- Auto-commits on save (if changed)

#### 15. Create config command
**File**: `brain/src/commands/config.ts`

```bash
brain config show
brain config set path ~/my-brain
```

- Shows current config
- Updates config values

#### 16. Create CLI entry point
**File**: `brain/src/index.ts`

```typescript
#!/usr/bin/env bun
import { Command } from "commander";
import pkg from "../package.json";
// Import all commands
// Register with aliases (a=add, ls=list)
```

### Success Criteria:

#### Automated Verification:
- [ ] Directory exists: `ls brain/src/commands/*.ts`
- [ ] Dependencies install: `cd brain && bun install`
- [ ] Types check: `cd brain && bun tsc`
- [ ] Lint passes: `cd brain && bun run lint`
- [ ] CLI runs: `cd brain && bun src/index.ts --version`
- [ ] Help works: `cd brain && bun src/index.ts --help`

#### Manual Verification:
- [ ] `brain init ~/test-brain` creates directory with `.gitignore` and git repo
- [ ] `brain add "Test thought"` creates `2026/01/22.md` with timestamped entry
- [ ] `brain list` shows the entry
- [ ] `brain show 2026/01/22` displays the content
- [ ] `brain edit 2026/01/22` opens in editor
- [ ] Git log shows auto-commit after add

**Implementation Note**: After completing this phase, pause for manual confirmation before proceeding to Phase 2.

---

## Phase 2: Database & Search

### Overview
Add SQLite database with FTS5 full-text search and OpenAI embeddings for semantic search.

### Changes Required:

#### 1. Add database dependencies
**File**: `brain/package.json` (update)

Add:
```json
{
  "dependencies": {
    "@libsql/client": "^0.14.0",
    "openai": "^4.77.0"
  }
}
```

#### 2. Create database schema module
**File**: `brain/src/db/schema.ts`

SQL schema from research:
```sql
-- Metadata table
CREATE TABLE metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Core entries table (files)
CREATE TABLE entries (
  id INTEGER PRIMARY KEY,
  path TEXT NOT NULL UNIQUE,
  title TEXT,
  content TEXT,
  content_hash TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  indexed_at TEXT,
  word_count INTEGER,
  tags TEXT  -- JSON array
);

-- Chunks table (embeddings per structural chunk)
CREATE TABLE chunks (
  id INTEGER PRIMARY KEY,
  entry_id INTEGER NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  chunk_type TEXT NOT NULL,  -- 'timestamp-block', 'header-section', 'whole-file'
  content TEXT NOT NULL,
  content_hash TEXT,
  embedding F32_BLOB(1536),
  embedding_model TEXT,
  start_line INTEGER,
  UNIQUE(entry_id, chunk_index)
);

-- Full-text search index
CREATE VIRTUAL TABLE entries_fts USING fts5(
  title, content, tags,
  content='entries',
  content_rowid='id'
);

-- Vector similarity index
CREATE INDEX chunks_vec_idx ON chunks (
  libsql_vector_idx(embedding, 'metric=cosine')
);
```

#### 3. Create database client module
**File**: `brain/src/db/client.ts`

```typescript
import { createClient } from '@libsql/client';

// Functions:
// - getDb(): Client  // Singleton client
// - initDb(dbPath: string): Promise<void>  // Create tables
// - closeDb(): void
```

#### 4. Create entry repository
**File**: `brain/src/db/entries.ts`

```typescript
// Functions:
// - upsertEntry(entry: EntryInput): Promise<Entry>
// - getEntry(path: string): Promise<Entry | null>
// - listEntries(limit?: number): Promise<Entry[]>
// - deleteEntry(path: string): Promise<void>
// - searchFts(query: string, limit?: number): Promise<Entry[]>
```

#### 5. Create chunk repository
**File**: `brain/src/db/chunks.ts`

```typescript
// Functions:
// - upsertChunks(entryId: number, chunks: ChunkInput[]): Promise<void>
// - getChunksByEntry(entryId: number): Promise<Chunk[]>
// - searchSemantic(embedding: number[], limit?: number): Promise<SearchResult[]>
```

#### 6. Create embedding provider interface
**File**: `brain/src/embeddings/types.ts`

```typescript
interface EmbeddingProvider {
  name: string;
  dimensions: number;
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
}
```

#### 7. Create OpenAI embedding provider
**File**: `brain/src/embeddings/openai.ts`

```typescript
import OpenAI from 'openai';

class OpenAIEmbeddingProvider implements EmbeddingProvider {
  name = 'text-embedding-3-small';
  dimensions = 1536;

  async embed(text: string): Promise<number[]> {
    // Uses OPENAI_API_KEY env var
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    // Batch API call
  }
}

// Export singleton getter
export function getEmbeddingProvider(): EmbeddingProvider
```

#### 8. Create chunking utilities
**File**: `brain/src/sync/chunker.ts`

```typescript
interface Chunk {
  index: number;
  type: 'timestamp-block' | 'header-section' | 'whole-file';
  content: string;
  startLine: number;
}

// Functions:
// - chunkDailyFile(content: string): Chunk[]  // Split by [YYYY-MM-DD-HHMMSS] timestamps
// - chunkNamedFile(content: string): Chunk[]  // Split by ## headers or whole file
// - estimateTokens(text: string): number      // Simple word-based estimate
```

#### 9. Create content hasher
**File**: `brain/src/sync/hash.ts`

```typescript
// Functions:
// - hashContent(content: string): Promise<string>  // SHA-256 hex
```

#### 10. Create sync service
**File**: `brain/src/sync/index.ts`

```typescript
interface SyncOptions {
  force?: boolean;  // Re-embed everything
  quiet?: boolean;  // Minimal output
}

interface SyncResult {
  filesScanned: number;
  entriesUpdated: number;
  chunksEmbedded: number;
  errors: string[];
}

// Functions:
// - syncBrain(brainPath: string, options?: SyncOptions): Promise<SyncResult>
// - syncFile(filePath: string, brainPath: string, force?: boolean): Promise<void>
```

The sync process:
1. Scan brain directory for `.md` files
2. For each file:
   - Compute content hash
   - Skip if hash unchanged (unless force)
   - Upsert entry record
   - Chunk content based on file type (daily vs named)
   - For each chunk:
     - Check chunk hash
     - Skip embedding if unchanged
     - Generate embedding via provider
     - Upsert chunk record
3. Update FTS5 index
4. Report statistics

#### 11. Create sync command
**File**: `brain/src/commands/sync.ts`

```bash
brain sync              # Incremental sync
brain sync --force      # Re-embed everything
brain sync --quiet      # Minimal output (for cron)
```

#### 12. Create search command
**File**: `brain/src/commands/search.ts`

```bash
brain search "vector database"      # Semantic search (default)
brain search --exact "sqlite-vec"   # Full-text search (FTS5)
brain search --fuzzy "query"        # Interactive fzf selection of results
brain search -n 10 "query"          # Limit results
brain s "shorthand"                 # Alias
```

Search flow:
1. If `--exact`: Use FTS5 query
2. If `--fuzzy`: Run semantic search, pipe results to fzf for selection
3. Otherwise (default):
   - Generate embedding for query
   - Search `chunks` table using `vector_top_k`
   - Join with entries to get file paths
   - Deduplicate by entry
4. Display results with path, snippet, score

#### 13. Update init command
**File**: `brain/src/commands/init.ts` (update)

- Initialize `.brain.db` with schema
- Store embedding model metadata

#### 14. Update add/new commands
**File**: `brain/src/commands/add.ts`, `brain/src/commands/new.ts` (update)

- After writing file, trigger single-file sync (async, non-blocking)
- This keeps index up-to-date without requiring manual sync

### Success Criteria:

#### Automated Verification:
- [ ] Dependencies install: `cd brain && bun install`
- [ ] Types check: `cd brain && bun tsc`
- [ ] Lint passes: `cd brain && bun run lint`
- [ ] Database initializes: `brain init ~/test-brain && ls ~/test-brain/.brain.db`
- [ ] Sync completes: `OPENAI_API_KEY=sk-... brain sync`

#### Manual Verification:
- [ ] `brain add "Test semantic search"` adds entry and triggers sync
- [ ] `brain sync` shows statistics (files scanned, chunks embedded)
- [ ] `brain search "semantic"` returns the test entry with relevance score
- [ ] `brain search --exact "semantic"` returns via full-text search
- [ ] Re-running `brain sync` skips unchanged files (hash match)
- [ ] `brain sync --force` re-embeds everything
- [ ] Search results show file path and content snippet

**Implementation Note**: After completing this phase, pause for manual confirmation. MVP is complete at this point.

---

## Testing Strategy

### Unit Tests
- `brain/test/utils/paths.test.ts` - Path utilities (expandPath, getTodayPath)
- `brain/test/sync/chunker.test.ts` - Chunking logic for daily and named files
- `brain/test/sync/hash.test.ts` - Content hashing

### Integration Tests
- `brain/test/db/entries.test.ts` - Entry CRUD with temp database
- `brain/test/db/chunks.test.ts` - Chunk operations and vector search
- `brain/test/sync/index.test.ts` - Full sync flow with mock embedding provider

### Manual Testing
- Full workflow: init → add → sync → search
- Edge cases: empty files, large files, special characters
- Error handling: missing API key, network errors

---

## Files to Create

| File | Phase | Description |
|------|-------|-------------|
| `brain/package.json` | 1 | Package configuration |
| `brain/tsconfig.json` | 1 | TypeScript config |
| `brain/biome.json` | 1 | Linting config |
| `brain/src/index.ts` | 1 | CLI entry point |
| `brain/src/config/index.ts` | 1 | Config loading/saving |
| `brain/src/utils/paths.ts` | 1 | Path utilities |
| `brain/src/utils/git.ts` | 1 | Git operations |
| `brain/src/utils/editor.ts` | 1 | Editor integration |
| `brain/src/utils/fzf.ts` | 1 | fzf integration (picker, filter) |
| `brain/src/commands/init.ts` | 1 | Init command |
| `brain/src/commands/add.ts` | 1 | Add command |
| `brain/src/commands/new.ts` | 1 | New command |
| `brain/src/commands/list.ts` | 1 | List command |
| `brain/src/commands/show.ts` | 1 | Show command |
| `brain/src/commands/edit.ts` | 1 | Edit command |
| `brain/src/commands/config.ts` | 1 | Config command |
| `brain/src/db/schema.ts` | 2 | Database schema |
| `brain/src/db/client.ts` | 2 | Database client |
| `brain/src/db/entries.ts` | 2 | Entry repository |
| `brain/src/db/chunks.ts` | 2 | Chunk repository |
| `brain/src/embeddings/types.ts` | 2 | Provider interface |
| `brain/src/embeddings/openai.ts` | 2 | OpenAI provider |
| `brain/src/sync/chunker.ts` | 2 | Content chunking |
| `brain/src/sync/hash.ts` | 2 | Content hashing |
| `brain/src/sync/index.ts` | 2 | Sync service |
| `brain/src/commands/sync.ts` | 2 | Sync command |
| `brain/src/commands/search.ts` | 2 | Search command |

## References

- Research: `thoughts/taras/research/2026-01-22-journal-cli-research.md`
- Pattern reference: `wts/src/` (CLI structure, Commander.js, chalk)
- Database pattern: `hive/src/main/database.ts` (better-sqlite3 usage)
- libSQL docs: https://turso.tech/vector
- OpenAI embeddings: https://platform.openai.com/docs/models/text-embedding-3-small
