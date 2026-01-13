---
description: Transfer your current context to a swarm worker agent
argument-hint: [target-agent-id or goal]
---

# Teleport Context to Worker

Hand off your current working context to a distributed worker agent.

## Process:

1. **Identify project context:**
   - Run `git rev-parse --show-toplevel` to get project root
   - Run `git remote get-url origin` to identify the repo
   - Run `git branch --show-current` for current branch
   - Run `git status --short` for uncommitted changes

2. **Gather session context:**
   - Summarize what you've been working on in this session
   - Identify the current goal or next step
   - List key files you've touched or that are relevant
   - Note any gotchas, context, or warnings for the worker

3. **Check swarm availability:**
   - Use `get-swarm` MCP tool to list agents
   - Identify available workers (status: idle, not lead)

4. **Ask for task type:**
   - Present options for what the worker should do:
     - **Plan** (`/desplega:create-plan`) - Worker creates implementation plan
     - **Implement** (`/desplega:implement-plan`) - Worker implements existing plan
     - **Research** (`/desplega:research`) - Worker researches and documents
     - **Custom** - Just hand off context, worker decides

5. **Show confirmation with preview:**
   Present the context package to user BEFORE sending:
   ```
   Ready to teleport context to swarm.

   Target: <agent-name or "pool">
   Task Type: <selected-type>

   Context Package:
   ────────────────
   Project: <repo-name>
   Branch: <branch>
   Working Dir: <relative-path>

   Current State:
   <summary of work done>

   Goal:
   <what needs to be accomplished>

   Relevant Files:
   - file1.ts - <why relevant>
   - file2.ts - <why relevant>

   Notes:
   <any gotchas or context>
   ────────────────

   Send this to the swarm? [y/n]
   ```

6. **On confirmation, send task:**
   - Use `send-task` MCP tool with:
     - `title`: Clear goal statement
     - `description`: Context package + command instruction
     - `toAgentId`: Target agent if specified, else omit for pool
     - `tags`: ["teleport", task-type, project-name]

7. **Confirm sent:**
   ```
   Context teleported to swarm.
   Task ID: <id>
   Target: <agent-name or "pool">
   Type: <task-type>

   The worker will run: /<command> <goal>

   Use `/swarm-status` to check progress.
   ```

## Context Package Format

Structure the task description as:

```
## Instructions

Run: `/<command> <goal>`

## Teleport Context

**Project:** <git-remote-url>
**Branch:** <current-branch>
**Working Directory:** <relative-path-from-root>

## Current State
<Summary of what's been done, current state of work>

## Goal
<What needs to be accomplished next>

## Relevant Files
- `path/to/file1.ts` - <why it's relevant>
- `path/to/file2.ts` - <why it's relevant>

## Notes & Gotchas
<Any warnings, context, or things to watch out for>

## Uncommitted Changes
<git status output if any>
```

## Task Types & Commands

| Type | Command | When to use |
|------|---------|-------------|
| Plan | `/desplega:create-plan <goal>` | Worker should design an approach first |
| Implement | `/desplega:implement-plan` | Plan exists, worker should execute it |
| Research | `/desplega:research <topic>` | Worker should investigate and document |
| Custom | (none) | Just hand off context, worker decides |

## Examples:
- `/agent-swarm:teleport` - Interactive: gather context, choose type, confirm
- `/agent-swarm:teleport worker-1` - Send to specific worker
- `/agent-swarm:teleport "finish the auth tests"` - Goal as argument

## Notes:
- Requires agent-swarm MCP server
- Must be joined to swarm (use `join-swarm` if not)
- Workers receive task via `poll-task`
