---
description: Continue work from a saved handoff file
argument-hint: [handoff-file-path]
allowed-tools: Glob(~/.claude/**), Read(~/.claude/**), Bash(mkdir -p ~/.claude/*), Bash(mv ~/.claude/hand-offs/*)
---

## Instructions

You are continuing work from a saved handoff context.

### If $ARGUMENTS is empty:
1. Use the Glob tool to find available handoffs: pattern `**/*.md` in path `~/.claude/hand-offs`
2. Filter out any files in `completed/` subdirectories
3. Show the available handoffs to the user
4. Ask the user which one to continue from
5. Read the selected file using the Read tool

### If $ARGUMENTS is provided:
1. Read the handoff file at: $ARGUMENTS

### After reading the handoff:
1. Parse the handoff document - pay special attention to:
   - **Current Status** - understand where things left off
   - **Next Steps** - these are your immediate priorities
   - **Resume Prompt** - use this as your starting context
   - **Warnings & Gotchas** - avoid known pitfalls

2. Present a brief summary to the user and confirm they want to continue

3. Once confirmed, mark the handoff as completed:
   - Create the completed directory if needed: `mkdir -p <handoff-dir>/completed`
   - Move the file: `mv <handoff-file> <handoff-dir>/completed/`

4. Begin executing the Next Steps from the handoff
