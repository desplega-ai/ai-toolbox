# hn-sql

Fetch Hacker News data into local Parquet files and query with SQL.

## Features

- **Async fetching** - Fast concurrent downloads from HN Firebase API
- **Incremental sync** - Only fetches new items on subsequent runs
- **Sorted Parquet files** - Optimized for DuckDB with zstd compression and zonemap filtering
- **Built-in SQL shell** - Query data directly without external tools
- **Checkpoint/resume** - Interruption-safe, continues where it left off

## Quick Start

```bash
uv sync

# Fetch recent items (last 10,000)
uv run hn-sql fetch --start -10000

# Check status
uv run hn-sql stats

# Query the data
uv run hn-sql query "SELECT type, count(*) FROM hn GROUP BY type"

# Sync new items (run anytime)
uv run hn-sql fetch
```

## Commands

### fetch
```bash
hn-sql fetch                          # Sync from checkpoint (or start fresh)
hn-sql fetch --start -1000            # Start from last 1000 items
hn-sql fetch --start 1000 --end 2000  # Fetch specific range
hn-sql fetch -c 200 -b 5000           # Custom concurrency/batch size
```

### query
```bash
hn-sql query "SELECT count(*) FROM hn"
hn-sql query "SELECT title, score FROM hn WHERE type='story' ORDER BY score DESC LIMIT 10"
hn-sql query -i                       # Interactive SQL shell
```

In interactive mode: `.help`, `.schema`, `.tables`, `.quit`

### stats
```bash
hn-sql stats        # Show data coverage, storage info, and checkpoint status
hn-sql stats -t     # Include partition tree
```

Shows: item count, ID range, file stats, and checkpoint info (including `partition_style`).

### reset
```bash
hn-sql reset            # Delete checkpoint only
hn-sql reset --data     # Delete checkpoint and all data
hn-sql reset --data -y  # Skip confirmation
```

### migrate
Consolidates all data into a single sorted Parquet file for optimal query performance.

```bash
hn-sql migrate --dry-run    # Preview what will happen
hn-sql migrate              # Run migration (creates data/items_v2/)
hn-sql migrate --swap       # Migrate and swap directories
hn-sql migrate --swap -y    # Skip confirmation
```

**What it does:**
1. Reads all existing data (handles both hive-partitioned and flat chunk files)
2. Sorts by ID (correlates with time, enables DuckDB zonemap filtering)
3. Writes a single consolidated `hn.parquet` file to `data/items_v2/`
4. With `--swap`: moves old data to `data/items_old/`, new to `data/items/`
5. Updates checkpoint's `partition_style` to `"flat"`

**When to use:**
- After initial sync to consolidate into optimized format
- Periodically (e.g., daily) to merge accumulated chunk files
- To migrate from old hive-partitioned format (year/month directories)

**Directory layout after `--swap`:**
```
data/
  items/          # Active data (single hn.parquet)
  items_old/      # Backup of previous data (delete when verified)
```

**Incremental sync workflow:**
After migration, each `fetch` adds new items as `chunk-*.parquet` files. Queries read both `hn.parquet` and chunks seamlessly. Run `migrate --swap` periodically to reconsolidate.

### api
```bash
hn-sql api              # Start API server on port 8000
hn-sql api -p 8080      # Custom port
```

Browse http://localhost:8000/docs for interactive API documentation.

## Data Schema

The `hn` table contains all item types (story, comment, job, poll, pollopt):

| Column | Type | Description |
|--------|------|-------------|
| id | int64 | Item ID |
| type | string | story, comment, job, poll, pollopt |
| by | string | Author username (quote as `"by"` in SQL) |
| time | timestamp | Creation time (UTC) |
| title | string | Title (stories/jobs/polls) |
| url | string | External URL |
| text | string | Content (HTML) |
| score | int32 | Points |
| descendants | int32 | Comment count |
| parent | int64 | Parent item ID |
| kids | list | Child comment IDs |
| dead | bool | Dead/flagged item |
| deleted | bool | Deleted item |
| poll | int64 | Parent poll (for pollopts) |
| parts | list | Poll option IDs (for polls) |
