---
description: Open a file in the file-review GUI for adding inline comments
argument-hint: [file_path] [--bg] [--silent] [--json]   (when omitted: proposes recent work + files containing review markers / pending batches)
---

# File Review

Shortcut command for backward compatibility. Delegates to the unified `file-review:file-review` skill.

## Instructions

When the user invokes `/file-review [path]`:

- When no path (omitted): delegates fully to **Review a File > If no path provided** in the skill, which now surfaces recent + (pending marker batches discovered live from Phase 2).
  Then always flows through the improved (Phase 3) **Process Comments** (collect-first batch presentation, higher context, diff-preview Apply).
- Otherwise: pass path and flags.

1. Follow the **Review a File** section of the `file-review:file-review` skill
2. Pass through any arguments and flags (`--bg`, `--silent`, `--json`)
3. After the GUI closes, follow the **Process Comments** section of the same skill
