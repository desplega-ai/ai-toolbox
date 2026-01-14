---
description: Process review comments in a file using the process-review skill
argument-hint: [file_path]
---

# Process Comments

Process review comments that were added using the file-review GUI.

## Instructions

When the user invokes `/process-comments [path]`:

1. **If no path provided:**
   - Check for files with review comment markers in recently accessed files
   - Or ask the user which file to process

2. **If path provided:**
   - Verify the file exists
   - Read the file and check for review comment markers

3. **Invoke the `file-review:process-review` skill** to handle the comments:
   - Extract all comments using the documented regex patterns
   - Present a summary of comments found
   - For each comment, use AskUserQuestion to offer: Apply edit / Acknowledge / Skip
   - Remove markers after addressing each comment
   - Show final summary

If no review comments are found in the file, inform the user:
```
No review comments found in <filename>.

To add comments, use `/file-review:file-review <path>` to open the GUI.
```
