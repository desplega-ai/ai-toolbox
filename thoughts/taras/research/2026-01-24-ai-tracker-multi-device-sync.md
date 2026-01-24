---
date: 2026-01-24T13:15:00-08:00
researcher: Claude
git_commit: b210fc65784604a65ccb86f221eb23f85c3fd8f2
branch: main
repository: ai-toolbox
topic: "Centralizing ai-tracker Data Across Devices"
tags: [research, ai-tracker, sqlite, sync, turso, api, deployment, python]
status: complete
autonomy: critical
last_updated: 2026-01-24
last_updated_by: Claude
---

# Research: Centralizing ai-tracker Data Across Devices

**Date**: 2026-01-24
**Researcher**: Claude
**Git Commit**: b210fc6
**Branch**: main

## Research Question

How to centralize the data of the ai-tracker project across multiple Mac devices? Options include deploying an API or using SQLite sync solutions.

## Summary

The ai-tracker tool currently stores tracking data in a local SQLite database at `~/.config/ai-tracker/tracker.db`. To centralize this data across multiple Mac laptops/desktops, there are two main approaches:

1. **SQLite-native sync** (simpler) - Use tools like Turso or sqlite3_rsync to sync the existing SQLite database
2. **API-based sync** (more flexible) - Deploy a lightweight API that all devices push/pull from

**Recommendation:** Use **Turso (libSQL)** with embedded replicas. It's specifically designed for this use case, has a Python SDK, works offline, and has a generous free tier. The existing `brain` tool in this repo already uses libSQL, so there's familiarity with the stack.

---

## Current Architecture

### Data Storage (`ai-tracker/src/ai_tracker/db.py:11-56`)

The ai-tracker uses SQLite with three tables:

```sql
-- Claude Code edits (before commit)
CREATE TABLE edits (
    id INTEGER PRIMARY KEY,
    timestamp TEXT NOT NULL,
    session_id TEXT NOT NULL,
    tool TEXT NOT NULL,  -- 'Edit' or 'Write'
    file_path TEXT NOT NULL,
    lines_added INTEGER NOT NULL,
    lines_removed INTEGER NOT NULL,
    cwd TEXT NOT NULL,
    committed INTEGER DEFAULT 0  -- 0=pending, 1=committed
);

-- Git commits with attribution
CREATE TABLE commits (
    id INTEGER PRIMARY KEY,
    timestamp TEXT NOT NULL,
    commit_sha TEXT NOT NULL,
    repo_name TEXT NOT NULL,
    repo_path TEXT NOT NULL,
    ai_lines_added INTEGER NOT NULL,
    ai_lines_removed INTEGER NOT NULL,
    human_lines_added INTEGER NOT NULL,
    human_lines_removed INTEGER NOT NULL
);

-- Per-file breakdown within each commit
CREATE TABLE commit_files (
    id INTEGER PRIMARY KEY,
    commit_id INTEGER NOT NULL,
    file_path TEXT NOT NULL,
    lines_added INTEGER NOT NULL,
    lines_removed INTEGER NOT NULL,
    ai_lines_added INTEGER NOT NULL,
    ai_lines_removed INTEGER NOT NULL,
    FOREIGN KEY (commit_id) REFERENCES commits(id)
);
```

### Database Location (`ai-tracker/src/ai_tracker/config.py:14-26`)

```python
def get_db_path() -> Path:
    """Get the path to the SQLite database.

    Supports configurable path via AI_TRACKER_DB_PATH env var.
    """
    if custom_path := os.environ.get("AI_TRACKER_DB_PATH"):
        path = Path(custom_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        return path

    # Default: ~/.config/ai-tracker/tracker.db
    return get_config_dir() / "tracker.db"
```

The existing `AI_TRACKER_DB_PATH` environment variable allows custom database paths, which will be useful for Turso integration.

---

## Option 1: Turso (libSQL) - RECOMMENDED

### What It Is

Turso is an edge database based on libSQL (an open-source fork of SQLite). It offers:
- **Embedded replicas**: Local SQLite file that syncs with a cloud primary
- **Offline support**: Works without internet, syncs when connected
- **Python SDK**: `pip install libsql`

### How It Would Work

```
[Mac 1]                    [Turso Cloud]                    [Mac 2]
tracker.db  ← sync() →    Primary DB        ← sync() →     tracker.db
(embedded                 (source of                       (embedded
 replica)                  truth)                           replica)
```

Each machine maintains a local `tracker.db` file. When `sync()` is called:
1. Local changes are pushed to the Turso Cloud primary
2. Remote changes from other machines are pulled down
3. The local file becomes a consistent snapshot of all data

### Detailed Implementation

#### 1. Schema Changes for Multi-Device Support

Add a nullable `machine_id` column to track which device created each record. This is backward compatible with existing data:

```sql
-- Migration to add machine_id (nullable for backward compatibility)
ALTER TABLE edits ADD COLUMN machine_id TEXT;
ALTER TABLE commits ADD COLUMN machine_id TEXT;

-- Index for filtering by machine
CREATE INDEX IF NOT EXISTS idx_edits_machine ON edits(machine_id);
CREATE INDEX IF NOT EXISTS idx_commits_machine ON commits(machine_id);
```

The `machine_id` can be the hostname or a user-defined identifier:

```python
# ai_tracker/config.py
import socket

def get_machine_id() -> str:
    """Get machine identifier for multi-device tracking."""
    return os.environ.get("AI_TRACKER_MACHINE_ID", socket.gethostname())
```

#### 2. Database Connection Changes

Replace `sqlite3` with `libsql` in `db.py`:

```python
# ai_tracker/db.py
import os
from contextlib import contextmanager
from typing import Iterator
import libsql

from .config import get_db_path, get_machine_id

# Check if sync is enabled
def is_sync_enabled() -> bool:
    return bool(os.environ.get("TURSO_DATABASE_URL"))

@contextmanager
def get_connection() -> Iterator[libsql.Connection]:
    """Get a database connection, with optional Turso sync."""
    db_path = str(get_db_path())

    if is_sync_enabled():
        conn = libsql.connect(
            db_path,
            sync_url=os.environ.get("TURSO_DATABASE_URL"),
            auth_token=os.environ.get("TURSO_AUTH_TOKEN"),
        )
        # Pull latest changes on connection
        conn.sync()
    else:
        # Local-only mode (backward compatible)
        conn = libsql.connect(db_path)

    conn.row_factory = libsql.Row
    try:
        yield conn
    finally:
        if is_sync_enabled():
            # Push changes before closing
            conn.sync()
        conn.close()
```

#### 3. Update Write Functions

Modify `log_edit()` and `log_commit()` to include machine_id:

```python
def log_edit(
    session_id: str,
    tool: str,
    file_path: str,
    lines_added: int,
    lines_removed: int,
    cwd: str,
) -> int:
    """Log a Claude Code edit operation."""
    with get_connection() as conn:
        cursor = conn.execute(
            """
            INSERT INTO edits (timestamp, session_id, tool, file_path,
                              lines_added, lines_removed, cwd, machine_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                datetime.utcnow().isoformat() + "Z",
                session_id,
                tool,
                file_path,
                lines_added,
                lines_removed,
                cwd,
                get_machine_id(),  # New: track which machine
            ),
        )
        conn.commit()
        return cursor.lastrowid
```

#### 4. Update Query Functions for Machine Filtering

Add optional machine filtering to stats queries:

```python
def get_stats(
    days: int = 30,
    repo: str | None = None,
    machine: str | None = None,  # New parameter
) -> dict:
    """Get aggregate statistics with optional machine filter."""
    since = (datetime.utcnow() - timedelta(days=days)).isoformat() + "Z"

    conditions = ["timestamp >= ?"]
    params = [since]

    if repo:
        conditions.append("repo_name = ?")
        params.append(repo)

    if machine:
        conditions.append("machine_id = ?")
        params.append(machine)

    where_clause = " AND ".join(conditions)

    with get_connection() as conn:
        cursor = conn.execute(
            f"""
            SELECT
                COALESCE(SUM(ai_lines_added), 0) as ai_added,
                COALESCE(SUM(ai_lines_removed), 0) as ai_removed,
                COALESCE(SUM(human_lines_added), 0) as human_added,
                COALESCE(SUM(human_lines_removed), 0) as human_removed,
                COUNT(*) as total_commits
            FROM commits
            WHERE {where_clause}
            """,
            params,
        )
        # ... rest of function
```

#### 5. CLI Commands

Add sync and machine-related commands:

```python
# ai_tracker/cli.py

@main.command()
def sync() -> None:
    """Manually sync with Turso Cloud."""
    if not is_sync_enabled():
        print("Sync not enabled. Set TURSO_DATABASE_URL to enable.")
        return

    with get_connection() as conn:
        conn.sync()
    print("Synced successfully")

@main.command()
@click.option("--machine", default=None, help="Filter by machine ID")
def stats(days: int, repo: str | None, machine: str | None, ...):
    """Show AI vs human code statistics."""
    # Now supports --machine flag
    display_stats(days=days, repo=repo, machine=machine, ...)

@main.command()
def machines() -> None:
    """List all machines that have contributed data."""
    with get_connection() as conn:
        cursor = conn.execute(
            "SELECT DISTINCT machine_id, COUNT(*) as commits FROM commits GROUP BY machine_id"
        )
        for row in cursor:
            print(f"{row['machine_id']}: {row['commits']} commits")
```

### Sync Strategy

Since ai-tracker data is append-only (edits and commits are inserted, rarely updated), the sync strategy is straightforward:

| Operation | Sync Behavior |
|-----------|---------------|
| `ai-tracker stats` | `sync()` first to get latest data from all machines |
| `log_edit()` (hook) | Write locally, `sync()` to push |
| `log_commit()` (hook) | Write locally, `sync()` to push |
| `ai-tracker sync` | Manual sync for immediate consistency |

### Migration Path

1. **Create Turso database:**
   ```bash
   turso db create ai-tracker
   turso db tokens create ai-tracker
   ```

2. **Add environment variables to shell profile (~/.zshrc):**
   ```bash
   export TURSO_DATABASE_URL="libsql://ai-tracker-YOUR-ORG.turso.io"
   export TURSO_AUTH_TOKEN="eyJhbGciOiJFZERTQS..."
   export AI_TRACKER_MACHINE_ID="macbook-pro"  # Optional, defaults to hostname
   ```

3. **Update ai-tracker dependency:**
   ```bash
   cd ai-tracker
   uv add libsql
   ```

4. **Run migration to add machine_id columns:**
   ```bash
   ai-tracker migrate  # New command to run schema migrations
   ```

5. **Push existing data to Turso:**
   ```bash
   ai-tracker sync  # First sync uploads local data
   ```

6. **Repeat on other machines** (steps 2-4), then `ai-tracker sync` to pull data

### Pricing

| Plan | Price | Rows Read/mo | Rows Written/mo | Storage |
|------|-------|--------------|-----------------|---------|
| Free | $0 | 500M | 10M | 5GB |
| Developer | $4.99/mo | 2.5B | 50M | Unlimited DBs |

For personal use tracking commits across 2-3 machines, the free tier is more than sufficient. A typical day might have:
- ~100 edits logged
- ~20 commits logged
- ~10 stats queries

That's well under the 500M reads and 10M writes per month.

### Pros
- Built specifically for this use case
- Works offline, syncs when connected
- Python SDK available (`pip install libsql`)
- Generous free tier
- Already used in this repo (brain tool)
- Machine filtering for per-device stats
- Backward compatible (sync is optional)

### Cons
- Python offline writes still experimental (see Open Questions)
- Requires Turso Cloud account
- New dependency to maintain

---

## Option 2: sqlite3_rsync (Official SQLite Tool)

### What It Is

Official SQLite utility (v3.50.0+) that syncs databases over SSH with minimal bandwidth.

### How It Would Work

```
[Primary Mac]            ssh              [Secondary Mac]
tracker.db        ─────────────→         tracker.db
(source of truth)                         (replica)
```

### Usage

```bash
# Sync from primary Mac to secondary
sqlite3_rsync ~/.config/ai-tracker/tracker.db secondary-mac:~/.config/ai-tracker/tracker.db

# Automate with cron (on secondary Mac)
*/5 * * * * sqlite3_rsync primary-mac:~/.config/ai-tracker/tracker.db ~/.config/ai-tracker/tracker.db
```

### Requirements
- sqlite3_rsync installed on both machines
- SSH access between machines
- One machine designated as "primary"

### Pros
- Official SQLite tool - guaranteed compatibility
- Very efficient bandwidth (hashing algorithm)
- No cloud service required
- Free

### Cons
- **Not bidirectional** - must designate one machine as primary
- Manual or scheduled, not real-time
- Requires SSH setup

---

## Option 3: Simple API Deployment

If you want more control or to avoid cloud SQLite services, deploy a simple REST API.

### Recommended Stack: Cloudflare Workers + D1

**Why:** Most generous free tier (5M reads/day, 5GB storage), no cold starts, SQLite-based.

### API Design

```typescript
// Worker handling ai-tracker sync
import { Hono } from 'hono';

const app = new Hono();

// Push new edits from client
app.post('/edits', async (c) => {
  const edits = await c.req.json();
  // Insert into D1
  await c.env.DB.batch(
    edits.map(e => c.env.DB.prepare(
      'INSERT INTO edits (...) VALUES (...)'
    ).bind(...))
  );
  return c.json({ ok: true });
});

// Pull edits since last sync
app.get('/edits', async (c) => {
  const since = c.req.query('since');
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM edits WHERE timestamp > ?'
  ).bind(since).all();
  return c.json(results);
});

// Similar endpoints for commits, commit_files
```

### Client-Side Changes

Add sync functions to ai-tracker CLI:

```python
# ai_tracker/sync.py
import httpx

API_URL = os.environ.get("AI_TRACKER_API_URL")
API_KEY = os.environ.get("AI_TRACKER_API_KEY")

def push_edits():
    """Push local unsynced edits to API."""
    with get_connection() as conn:
        edits = conn.execute(
            "SELECT * FROM edits WHERE synced = 0"
        ).fetchall()

        httpx.post(f"{API_URL}/edits", json=edits, headers={"Authorization": API_KEY})

        # Mark as synced
        conn.execute("UPDATE edits SET synced = 1 WHERE synced = 0")

def pull_edits():
    """Pull edits from API that we don't have locally."""
    last_sync = get_last_sync_timestamp()
    response = httpx.get(f"{API_URL}/edits?since={last_sync}")
    # Insert into local DB
```

### Pricing Comparison

| Platform | Free Tier | Best For |
|----------|-----------|----------|
| Cloudflare D1 | 5M reads/day, 5GB | Most generous, SQLite |
| Vercel + Neon | 100 CU-hrs, 0.5GB | PostgreSQL, scale-to-zero |
| Railway | 30-day trial, then $5/mo | Best DX |
| Render | 15min sleep, 30-day DB expiry | Traditional apps |

### Pros
- Full control over sync logic
- Can add features (aggregation, dashboards)
- Platform-agnostic clients

### Cons
- More code to write and maintain
- Need to handle sync conflicts
- Additional infrastructure to manage

---

## Comparison Matrix

| Approach | Sync Type | Offline | Bidirectional | Free Tier | Complexity |
|----------|-----------|---------|---------------|-----------|------------|
| **Turso** | Real-time | ✅ | ✅ | ✅ Generous | Low |
| **sqlite3_rsync** | Manual/scheduled | ✅ | ❌ One-way | ✅ Free | Low |
| **Custom API** | Real-time | ⚠️ Manual | ✅ | ✅ Varies | Medium-High |

---

## Recommendation

**Use Turso (libSQL)** for these reasons:

1. **Designed for exactly this use case** - local-first SQLite with cloud sync
2. **Python SDK exists** - `pip install libsql`, drop-in replacement for sqlite3
3. **Offline-first** - Works without internet, syncs when connected
4. **Free tier is sufficient** - 500M reads, 10M writes, 5GB storage per month
5. **Already in your stack** - The `brain` tool in this repo uses libSQL

### Implementation Steps

1. **Create Turso database:**
   ```bash
   turso db create ai-tracker
   turso db tokens create ai-tracker
   ```

2. **Add to environment:**
   ```bash
   export TURSO_DATABASE_URL="libsql://ai-tracker-YOUR-ORG.turso.io"
   export TURSO_AUTH_TOKEN="..."
   ```

3. **Update dependencies:**
   ```toml
   # pyproject.toml
   dependencies = [
       "libsql>=0.1.0",  # Add this
       # ... existing deps
   ]
   ```

4. **Modify db.py:**
   - Replace `sqlite3` with `libsql`
   - Add `sync()` calls at appropriate points
   - Handle the sync URL being optional (for local-only use)

5. **Add CLI commands:**
   ```bash
   ai-tracker sync          # Manual sync
   ai-tracker sync --status # Check sync status
   ```

---

## Historical Context

The original ai-tracker research (`thoughts/shared/research/2026-01-09-ai-vs-human-code-tracking.md`) focused on local tracking using Claude Code hooks and git hooks. The data model was designed for single-machine use with no consideration for multi-device sync.

The `brain` tool (`thoughts/taras/research/2026-01-22-journal-cli-research.md`) already uses libSQL with Turso for cloud sync, establishing a pattern in this repo for SQLite sync.

---

## Code References

| File | Line | Description |
|------|------|-------------|
| `ai-tracker/src/ai_tracker/db.py` | 11-56 | Database schema definition |
| `ai-tracker/src/ai_tracker/db.py` | 71-88 | `get_connection()` context manager |
| `ai-tracker/src/ai_tracker/config.py` | 14-26 | `get_db_path()` with env var support |
| `ai-tracker/src/ai_tracker/stats/query.py` | 9-76 | Stats query functions |

---

## Sources

### SQLite Sync Solutions
- [Turso Documentation](https://docs.turso.tech/)
- [Turso Python SDK](https://docs.turso.tech/sdk/python/quickstart)
- [Turso Embedded Replicas](https://docs.turso.tech/features/embedded-replicas/introduction)
- [sqlite3_rsync Documentation](https://www.sqlite.org/rsync.html)
- [Litestream](https://litestream.io/) - Good for backup, not multi-device sync

### API Deployment
- [Cloudflare D1 Pricing](https://developers.cloudflare.com/d1/platform/pricing/)
- [Cloudflare Workers + Hono](https://hono.dev/docs/getting-started/cloudflare-workers)
- [Railway Pricing](https://railway.com/pricing)
- [Neon Serverless PostgreSQL](https://neon.com/docs/introduction/plans)

### Related Research
- `thoughts/shared/research/2026-01-09-ai-vs-human-code-tracking.md` - Original ai-tracker design
- `thoughts/taras/research/2026-01-22-journal-cli-research.md` - brain tool using libSQL

---

## Open Questions

1. **Conflict resolution**: With append-only data (edits, commits), conflicts are minimal. But what if the same commit is logged on two machines before sync?

   **Solution: Use `commit_sha` as unique constraint**

   The `commit_sha` is globally unique (it's a git hash). If the same commit is somehow logged on two machines before they sync, we can safely deduplicate:

   ```sql
   -- Add unique constraint on commit_sha
   CREATE UNIQUE INDEX IF NOT EXISTS idx_commits_sha ON commits(commit_sha);
   ```

   When inserting, use `INSERT OR IGNORE` to silently skip duplicates:

   ```python
   def log_commit(...):
       with get_connection() as conn:
           conn.execute(
               """
               INSERT OR IGNORE INTO commits (commit_sha, ...)
               VALUES (?, ...)
               """,
               (commit_sha, ...),
           )
   ```

   This means if Mac 1 and Mac 2 both log the same commit before syncing, whichever syncs first "wins" and the duplicate is ignored. Since the data is identical (same commit_sha = same commit), no data is lost.

   **Note:** This doesn't apply to `edits` table since the same edit could legitimately be logged on different machines (e.g., editing the same file in different branches). The `edits` table doesn't need deduplication - it's purely append-only.

2. **Migration**: How to migrate existing local data to Turso?
   - Turso supports importing existing SQLite databases
   - First `sync()` call with an existing local database will push all data to the cloud

3. **Offline writes in Python SDK**

   **Current state:** Turso's Python SDK (`libsql`) supports reading from the local replica when offline. However, writing while offline is experimental/limited.

   **What this means in practice:**

   | Scenario | Behavior |
   |----------|----------|
   | Online, `sync()` succeeds | Writes go to local + remote, all works |
   | Offline, trying to write | Write succeeds locally, but `sync()` will fail |
   | Come back online | Need to call `sync()` again to push pending changes |

   **For ai-tracker, this is acceptable because:**
   - Hooks run after Claude Code edits/git commits, which typically happen when online
   - If offline, writes are cached locally and pushed when connectivity returns
   - Stats queries work offline (reads from local replica)

   **Mitigation strategies:**
   - Wrap `sync()` in try/except, log failures but don't block
   - Add a `--force-local` flag to skip sync attempts when known offline
   - The `ai-tracker sync` command provides manual recovery
