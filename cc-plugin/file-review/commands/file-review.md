---
description: Open a file in the file-review GUI for adding inline comments
argument-hint: [file_path] [--bg] [--silent] [--json]
---

# File Review

Shortcut command for backward compatibility. Delegates to the unified `file-review:file-review` skill.

## Instructions

When the user invokes `/file-review [path]`:

1. Follow the **Review a File** section of the `file-review:file-review` skill
2. Pass through any arguments and flags (`--bg`, `--silent`, `--json`)
3. After the GUI closes, follow the **Process Comments** section of the same skill
