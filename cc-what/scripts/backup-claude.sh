#!/bin/bash
# Backup ~/.claude/ directory daily
# Usage: Add to crontab with: crontab -e
#   0 3 * * * /path/to/backup-claude.sh

set -euo pipefail

CLAUDE_DIR="$HOME/.claude"
BACKUP_DIR="$HOME/.claude-backups"
DATE=$(date +%Y-%m-%d)
BACKUP_FILE="$BACKUP_DIR/claude-$DATE.tar.gz"

# Keep last N backups
KEEP_DAYS=7

# Create backup directory if needed
mkdir -p "$BACKUP_DIR"

# Skip if already backed up today
if [[ -f "$BACKUP_FILE" ]]; then
    echo "Backup already exists: $BACKUP_FILE"
    exit 0
fi

# Create compressed backup (exclude large/temp files)
tar -czf "$BACKUP_FILE" \
    --exclude='*.lockb' \
    --exclude='node_modules' \
    --exclude='__store.db-*' \
    -C "$HOME" .claude

# Get size for logging
SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo "Created backup: $BACKUP_FILE ($SIZE)"

# Clean old backups
find "$BACKUP_DIR" -name "claude-*.tar.gz" -mtime +$KEEP_DAYS -delete
echo "Cleaned backups older than $KEEP_DAYS days"
