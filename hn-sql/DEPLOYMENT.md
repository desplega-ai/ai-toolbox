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

Set up cron for continuous updates.

**1. Create `/opt/hn-sql/sync.sh`:**
```bash
#!/bin/bash
set -e
cd /opt/hn-sql

# Run incremental sync for new items
~/.local/bin/uv run hn-sql fetch
```

**2. Create `/opt/hn-sql/refresh.sh`:**
```bash
#!/bin/bash
set -e
cd /opt/hn-sql

# Refresh recently changed items (scores, comments, etc.)
~/.local/bin/uv run hn-sql update
```

**3. Create `/opt/hn-sql/consolidate.sh`:**
```bash
#!/bin/bash
set -e
cd /opt/hn-sql

# Consolidate all data (items + updates) into single hn.parquet
~/.local/bin/uv run hn-sql migrate --swap -y
```

**4. Make executable:**
```bash
chmod +x /opt/hn-sql/sync.sh /opt/hn-sql/refresh.sh /opt/hn-sql/consolidate.sh
```

**5. Add to crontab:**
```bash
crontab -e
```
```cron
# Sync new items every minute
* * * * * flock -n /tmp/hn-sql.lock /opt/hn-sql/sync.sh >> /var/log/hn-sql.log 2>&1

# Refresh changed items every 15 minutes (scores, comments update)
*/15 * * * * flock -n /tmp/hn-sql-update.lock /opt/hn-sql/refresh.sh >> /var/log/hn-sql-update.log 2>&1

# Consolidate files daily at 3am (waits up to 2min for sync to finish)
0 3 * * * flock -w 120 /tmp/hn-sql.lock /opt/hn-sql/consolidate.sh >> /var/log/hn-sql-migrate.log 2>&1
```

The `flock` ensures:
- Syncs don't overlap with each other
- Daily consolidation waits for any running sync to finish
- No data loss or race conditions

**6. Verify:**
```bash
tail -f /var/log/hn-sql.log
tail -f /var/log/hn-sql-update.log
```

## How Incremental Sync Works

After `migrate --swap`, data lives in a single `hn.parquet` file:

```
data/items/
  hn.parquet          # Historical data (from last migrate)
  chunk-00000.parquet # New items from sync 1
  chunk-00001.parquet # New items from sync 2
  ...

data/updates/
  update-20241213-120000.parquet  # Refreshed items (scores, comments)
  update-20241213-121500.parquet  # More refreshed items
  ...
```

- **New items** (`fetch`): Checkpoint tracks `last_fetched_id`, syncs only fetch newer items
- **Changed items** (`update`): Polls `/updates.json` for recently modified items, re-fetches them
- **Auto-deduplication**: Queries automatically prefer updates over original data
- **Daily consolidation**: Merges items + updates into single `hn.parquet`, deletes updates dir

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
- Updates stored in `/opt/hn-sql/data/updates/` until consolidated
- Checkpoint in `checkpoint.json` tracks progress and partition style
- `partition_style: "flat"` after migration (optimal for incremental sync)
- Default concurrency of 100 works well with HN API
- DuckDB auto-configured based on system memory and CPU cores
- Query anytime: `uv run hn-sql query -i`
- API auto-reads new files + updates without restart
