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

## Cron for Incremental Sync

After initial sync completes, set up cron for continuous updates.

**1. Create `/opt/hn-sql/sync.sh`:**
```bash
#!/bin/bash
set -e
cd /opt/hn-sql

# Prevent overlapping runs
LOCKFILE="/tmp/hn-sql.lock"
if [ -f "$LOCKFILE" ]; then
    exit 0
fi
trap "rm -f $LOCKFILE" EXIT
touch "$LOCKFILE"

# Run incremental sync
~/.local/bin/uv run hn-sql fetch
```

**2. Make executable:**
```bash
chmod +x /opt/hn-sql/sync.sh
```

**3. Add to crontab:**
```bash
crontab -e
```
```
* * * * * /opt/hn-sql/sync.sh >> /var/log/hn-sql.log 2>&1
```

**4. Verify:**
```bash
tail -f /var/log/hn-sql.log
```

## Optional: S3 Backup

Add to `sync.sh` after the fetch command:
```bash
aws s3 sync data/items/ s3://your-bucket/hn-data/items/ --delete
```

## Optional: API with Caddy

**Using Datasette (quick setup):**
```bash
pip install datasette datasette-parquet
datasette /opt/hn-sql/data/items --port 8000
```

**Caddy config** (`/etc/caddy/Caddyfile`):
```
hn-api.yourdomain.com {
    reverse_proxy localhost:8000
}
```

```bash
sudo systemctl reload caddy
```

## Key Points

- Data stored in `/opt/hn-sql/data/items/` as year/month partitioned Parquet
- Checkpoint in `checkpoint.json` enables resume
- Concurrency of 35 is optimal for HN API
- Query anytime: `uv run hn-sql query -i`
