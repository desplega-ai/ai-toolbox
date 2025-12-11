#!/bin/bash
set -e
cd /root/ai-toolbox/hn-sql

# Prevent overlapping runs
LOCKFILE="/tmp/hn-sql.lock"
if [ -f "$LOCKFILE" ]; then
    exit 0
fi
trap "rm -f $LOCKFILE" EXIT
touch "$LOCKFILE"

# Run incremental sync
~/.local/bin/uv run hn-sql fetch
