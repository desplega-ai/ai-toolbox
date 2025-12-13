#!/bin/bash
set -e
cd /root/ai-toolbox/hn-sql

# Refresh recently changed items (scores, comments, etc.)
~/.local/bin/uv run hn-sql update
