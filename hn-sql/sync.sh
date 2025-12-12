#!/bin/bash
set -e
cd /root/ai-toolbox/hn-sql

# Run incremental sync (uses flock for safety)
~/.local/bin/uv run hn-sql fetch
