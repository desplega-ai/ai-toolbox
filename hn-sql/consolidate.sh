#!/bin/bash
set -e
cd /root/ai-toolbox/hn-sql

# Consolidate chunk files into single hn.parquet
~/.local/bin/uv run hn-sql migrate --swap -y
