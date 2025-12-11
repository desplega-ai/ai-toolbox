# hn-sql

Fetch Hacker News data into local Parquet files and query with SQL.

## Features

- **Async fetching** - Fast concurrent downloads from HN Firebase API
- **Incremental sync** - Only fetches new items on subsequent runs
- **Time-partitioned Parquet** - Optimized for DuckDB with zstd compression
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
hn-sql stats        # Show data coverage and storage info
hn-sql stats -t     # Include partition tree
```

### reset
```bash
hn-sql reset            # Delete checkpoint only
hn-sql reset --data     # Delete checkpoint and all data
hn-sql reset --data -y  # Skip confirmation
```

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
| year, month | int | Partition columns |
