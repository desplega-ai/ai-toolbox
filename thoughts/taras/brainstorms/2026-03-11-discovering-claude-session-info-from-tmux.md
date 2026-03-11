---
date: 2026-03-11T16:00:00Z
topic: "Discovering Claude Code Session Info from tmux Panes"
type: brainstorm
status: concluded
---

# Brainstorm: Discovering Claude Code Session Info from tmux Panes

## Problem

Given a set of tmux panes, how do you programmatically identify which ones are running Claude Code (`ccs`) instances, and then determine the session ID for each?

This is useful for building tooling that can introspect running Claude sessions — e.g., sending messages between sessions, monitoring activity, or building a "session manager" UI.

## Step 1: List All tmux Panes and Identify Claude Instances

```bash
tmux list-panes -a -F '#{session_name}:#{window_index}.#{pane_index} #{pane_title} #{pane_current_command} #{pane_pid}'
```

This gives each pane's **title**, **current command**, and **shell PID**. Claude Code panes are identifiable by:
- Pane title containing "Claude Code" (set by the TUI)
- Current command being `node` (Claude Code runs as a Node process)

**Caveat:** The pane title persists even after Claude exits, so title alone isn't sufficient. You need to verify an active `node` child process.

## Step 2: Verify Active Claude Processes

For each candidate pane, check for a `node ... ccs` child process:

```bash
# Get child processes of the pane's shell PID
ps ax -o pid,ppid,command | awk -v pp="$PANE_PID" '$2==pp && /node/'
```

This confirms the pane has an active Claude Code process (not just a stale title from a previous session).

## Step 3: Determine Session IDs

### What didn't work

1. **`lsof` on the node PID** — Claude Code (via `ccs`) does **not** keep session JSONL files open. It appends and closes. So `lsof -p <pid> | grep jsonl` returns nothing.

2. **`lsof +D` on the project directory** — Same reason. No file handles held open.

3. **Process arguments** — `ccs work --allow-dangerously-skip-permissions` doesn't include a session ID in the args. Even `--resume` doesn't show which session is being resumed.

4. **`~/.claude/projects/` directory** — Standard Claude Code stores sessions here, but `ccs` (a custom wrapper) uses a **different location**.

### What worked

**Key discovery:** `ccs` stores sessions in `~/.ccs/instances/work/projects/` instead of `~/.claude/projects/`.

Find active sessions by modification time:

```bash
find ~/.ccs -name '*.jsonl' -mmin -5
```

This returns JSONL files actively being written to. The filename is the session UUID:

```
~/.ccs/instances/work/projects/-Users-taras-Documents-code-agent-swarm-internal/da39e9f4-d1c2-46b8-ad62-f659c08947cc.jsonl
```

### Correlating sessions to panes

With N active sessions for a project and N panes running Claude on that project:
- **1 session, 1 pane** — trivial mapping
- **Multiple sessions** — sort by modification time and correlate with pane activity. The most recently modified session maps to the most recently active pane.

## Summary: The Recipe

```bash
# 1. Find panes running Claude
tmux list-panes -a -F '#{session_name}:#{window_index}.#{pane_index} #{pane_pid}' | while read pane pid; do
  if ps ax -o pid,ppid,command | awk -v pp="$pid" '$2==pp && /ccs/' | grep -q .; then
    echo "$pane"
  fi
done

# 2. Find active session IDs
find ~/.ccs -name '*.jsonl' -mmin -5 | sort -t/ -k8

# 3. Correlate by project path + modification time
```

## Limitations

- **`ccs` vs `claude`**: This approach is specific to `ccs` (which uses `~/.ccs/`). Stock `claude` CLI uses `~/.claude/projects/`. The discovery step needs to check both locations.
- **Multi-session correlation**: When multiple Claude instances run against the same project, correlating session-to-pane requires timestamp heuristics (not 100% reliable).
- **No direct PID-to-session mapping**: There's no lock file, PID file, or environment variable that directly links a node PID to its session UUID.

## Future Ideas

- A `ccs` or `claude` flag/API that exposes the current session ID (e.g., `claude --session-id`)
- A lock file written at session start: `~/.ccs/.../SESSION_UUID.lock` containing the PID
- An MCP tool that returns the session ID of the current conversation
- Integration with the tmux pane title to embed the session UUID
