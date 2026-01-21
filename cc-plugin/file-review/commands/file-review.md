---
description: Open a file in the file-review GUI for adding inline comments
argument-hint: [file_path] [--bg] [--silent] [--json]
---

# File Review

Launch the file-review tool to add inline review comments to a markdown file.

## CLI Flags

| Flag | Description |
|------|-------------|
| `--bg` | Run in background mode (don't wait for app to close) |
| `--silent` | Suppress comment output when app closes |
| `--json` | Output comments as JSON when app closes (default: human-readable) |

## Instructions

When the user invokes `/file-review [path]`:

### If no path provided

Check for recently created or modified files in the current session that would benefit from review:
- Plan files in `thoughts/<username|shared>/plans/`
- Research documents in `thoughts/<username|shared>/research/`
- Any markdown files created or significantly updated during the conversation

Propose these files to the user:
```
I found these files from our session that might benefit from review:
1. thoughts/<username|shared>/plans/2026-01-13-feature-plan.md (created today)
2. thoughts/<username|shared>/research/2026-01-13-analysis.md (updated recently)

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
   The file-review tool is not installed. Install via Homebrew:

   brew tap desplega-ai/tap && brew install file-review

   Or invoke the `file-review:install` skill for manual installation from source.
   ```

3. **Launch the file-review GUI:**

   **Default (foreground)** - no `--bg` flag:
   ```bash
   file-review "<absolute_path>" [--silent] [--json]
   ```
   Wait for the process to complete. When user quits the app, comments are printed to stdout (unless `--silent`). Continue to step 4.

   **Background mode** - with `--bg` flag:
   ```bash
   file-review "<absolute_path>" [--silent] [--json] &
   ```
   Runs in background. Inform user and wait for them to confirm when done.

4. **Inform the user:**
   ```
   I've opened file-review for <filename>.

   Shortcuts: ⌘K (add comment), ⌘S (save), ⌘Q (quit), ⌘/ (help)
   ```

   If running in foreground: proceed to step 5 automatically when app closes.
   If running in background: add "Let me know when you're done reviewing!"

5. **After review is complete:**

   When the app closes, it outputs review comments to stdout in this format:
   ```
   === Review Comments (N) ===

   [abc123] Line 15 (inline):
       "highlighted code"
       → Comment text here

   [def456] Lines 20-25 (line):
       "multi-line"
       "content"
       → Another comment
   ```

   Or with `--json`:
   ```json
   [{"id": "abc123", "comment": "...", "type": "inline", "start_line": 15, "end_line": 15, "content": "..."}]
   ```

   - Present the comment output to the user
   - Invoke the **file-review:process-review** skill: for each comment, use AskUserQuestion to offer options (Apply edit / Acknowledge / Skip)
   - After addressing each comment, remove its markers from the file
   - Show a final summary of changes made

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
