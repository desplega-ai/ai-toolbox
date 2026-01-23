---
description: Manage automatic background sync for brain
argument-hint: [install|status|remove] [--interval N]
allowed-tools: Bash
---

# Brain Cron Management

Manage automatic background sync using crontab.

## Commands

### Install cron job

```bash
# Default: every 5 minutes
brain cron install

# Custom interval (1-60 minutes)
brain cron install --interval 15
brain cron install -i 10
```

### Check status

```bash
brain cron status
# Output: "Active (every 5 minutes)" or "Not active"
```

### Remove cron job

```bash
brain cron remove
```

## How It Works

The cron job runs `brain sync --quiet` at the specified interval. This keeps your brain database up-to-date in the background, so semantic search always has the latest content.

The crontab entry uses a marker comment (`# brain-autosync`) to identify and manage the entry safely.

## Workflow

1. When user says "set up auto-sync" → `brain cron install`
2. When user asks "is sync running?" → `brain cron status`
3. When user says "stop auto-sync" → `brain cron remove`
