---
description: Open a file in the file-review GUI for adding inline comments
argument-hint: "[file_path...] [--silent] [--json]"
---

# File Review

Shortcut command for backward compatibility. Delegates to the unified `file-review:file-review` skill.

## Instructions

When the user invokes `/file-review [path...]`:

1. Follow the **Review a File** section of the `file-review:file-review` skill
2. Pass through every path (one tab each) and any flags (`--silent`, `--json`, or the web-mode flags listed in the skill's **Binary / CLI Reference**)
3. After the GUI closes, follow the **Process Comments** section of the same skill
