# Deployment Guide (Ubuntu Server)

Deploy hn-sql for continuous Hacker News data sync with incremental updates.

## Server Setup

```bash
# Install uv
curl -LsSf https://astral.sh/uv/install.sh | sh

# Clone the project
git clone <your-repo> /opt/hn-sql
cd /opt/hn-sql

# Install dependencies
uv sync
```

## Initial Full Sync

Run in a screen/tmux session (takes many hours for full history):

```bash
cd /opt/hn-sql

# Full sync from the beginning (~42M items)
uv run hn-sql fetch --start 1

# Or start with recent items for faster setup
uv run hn-sql fetch --start -1000000  # last 1M items
```

Monitor progress in another terminal:
```bash
uv run hn-sql stats
```

If interrupted, just run `uv run hn-sql fetch` again - it resumes automatically.

## Consolidate After Initial Sync

After the initial sync completes, consolidate into a single optimized file:

```bash
uv run hn-sql migrate --swap -y
```

This:
- Consolidates all data into a single sorted `hn.parquet`
- Updates checkpoint to use `flat` partition style for future syncs
- Enables optimal DuckDB zonemap filtering for fast queries

## Cron for Incremental Sync

Set up cron for continuous updates (every minute).

**1. Create `/opt/hn-sql/sync.sh`:**
```bash
#!/bin/bash
set -e
cd /opt/hn-sql

# Run incremental sync (uses flock for safety)
~/.local/bin/uv run hn-sql fetch
```

**2. Create `/opt/hn-sql/consolidate.sh`:**
```bash
#!/bin/bash
set -e
cd /opt/hn-sql

# Consolidate chunk files into single hn.parquet
~/.local/bin/uv run hn-sql migrate --swap -y
```

**3. Make executable:**
```bash
chmod +x /opt/hn-sql/sync.sh /opt/hn-sql/consolidate.sh
```

**4. Add to crontab:**
```bash
crontab -e
```
```cron
# Sync new items every minute
* * * * * flock -n /tmp/hn-sql.lock /opt/hn-sql/sync.sh >> /var/log/hn-sql.log 2>&1

# Consolidate files daily at 3am (waits up to 2min for sync to finish)
0 3 * * * flock -w 120 /tmp/hn-sql.lock /opt/hn-sql/consolidate.sh >> /var/log/hn-sql-migrate.log 2>&1
```

The `flock` ensures:
- Syncs don't overlap with each other
- Daily consolidation waits for any running sync to finish
- No data loss or race conditions

**5. Verify:**
```bash
tail -f /var/log/hn-sql.log
```

## How Incremental Sync Works

After `migrate --swap`, data lives in a single `hn.parquet` file. Each sync adds new items as `chunk-*.parquet` files:

```
data/items/
  hn.parquet          # Historical data (from last migrate)
  chunk-00000.parquet # New items from sync 1
  chunk-00001.parquet # New items from sync 2
  ...
```

- **No duplicates**: Checkpoint tracks `last_fetched_id`, syncs only fetch newer items
- **Queries read all files**: DuckDB handles `hn.parquet` + chunks seamlessly
- **Daily consolidation**: Merges everything back into single `hn.parquet`

## Optional: API Server

**Start the built-in API:**
```bash
uv run hn-sql api --port 3123
```

The API automatically reads new data - no restart needed after syncs.

**Systemd service** (`/etc/systemd/system/hn-sql-api.service`):
```ini
[Unit]
Description=HN-SQL API Server
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/hn-sql
ExecStart=/home/ubuntu/.local/bin/uv run hn-sql api --port 3123
Restart=always

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable hn-sql-api
sudo systemctl start hn-sql-api
```

**Caddy reverse proxy** (`/etc/caddy/Caddyfile`):
```
api.willifront.page {
    reverse_proxy localhost:3123
}
```

```bash
sudo systemctl reload caddy
```

## Optional: S3 Backup

Add to `consolidate.sh` after the migrate command:
```bash
aws s3 sync data/items/ s3://your-bucket/hn-data/items/ --delete
```

## Key Points

- Data stored in `/opt/hn-sql/data/items/` as Parquet files
- Checkpoint in `checkpoint.json` tracks progress and partition style
- `partition_style: "flat"` after migration (optimal for incremental sync)
- Concurrency of 35 is optimal for HN API rate limits
- Query anytime: `uv run hn-sql query -i`
- API auto-reads new files without restart
