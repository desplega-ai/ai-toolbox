---
description: Process review comments in a file using the process-review skill
argument-hint: [file_path...]
---

# Process Comments

Shortcut command for backward compatibility. Delegates to the unified `file-review:file-review` skill.

## Instructions

When the user invokes `/process-comments [path...]`:

1. Follow the **Process Comments** section of the `file-review:file-review` skill (now batch-aware per Phase 3: first collects & groups markers across the chosen file set (from discovery/batch review or explicit multi paths), supplies more surrounding line context in each AskUserQuestion, and for Apply shows unified diff preview + explicit confirmation before host edit).
2. Pass through the file path argument(s) (or fall back to last-reviewed batch context).
