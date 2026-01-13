---
description: Open a file in the file-review GUI for adding inline comments
argument-hint: [file_path]
---

# File Review

Launch the file-review tool to add inline review comments to a markdown file.

## Instructions

When the user invokes `/file-review [path]`:

### If no path provided

Check for recently created or modified files in the current session that would benefit from review:
- Plan files in `thoughts/shared/plans/`
- Research documents in `thoughts/shared/research/`
- Any markdown files created or significantly updated during the conversation

Propose these files to the user:
```
I found these files from our session that might benefit from review:
1. thoughts/shared/plans/2026-01-13-feature-plan.md (created today)
2. thoughts/shared/research/2026-01-13-analysis.md (updated recently)

Which would you like to review? Or provide a different path.
```

### If path provided

1. **Verify the file exists** and is readable

2. **Check if file-review is installed:**
   ```bash
   which file-review
   ```

   If not found, tell the user:
   ```
   The file-review tool is not installed. Use the `file-review-install` skill to set it up, or run:

   cd ai-toolbox/file-review && bun install && bun run install:app
   ```

3. **Launch the file-review GUI:**
   ```bash
   file-review "<absolute_path>" &
   ```

4. **Inform the user:**
   ```
   I've opened file-review for <filename>.

   Shortcuts: ⌘K (add comment), ⌘S (save), ⌘Q (quit), ⌘/ (help)

   Let me know when you're done reviewing!
   ```

5. **After user confirms they're done:**
   - Read the file
   - Extract all `<!-- review(...): ... -->` comments
   - Present them in a readable format
   - Offer to address any feedback

## Keyboard Shortcuts Reference

| Shortcut | Action |
|----------|--------|
| ⌘K | Add comment to selection |
| ⌘S | Save file |
| ⌘Q | Quit application |
| ⌘/ | Show all shortcuts |
| ⌘T | Toggle theme (light/dark) |
| ⌘⇧V | Toggle vim mode |
| ⌘O | Open file |
