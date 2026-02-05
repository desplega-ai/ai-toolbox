---
name: file-review
description: "File review tool \u2014 launch GUI, process comments, or install. Use when user mentions file-review, reviewing files, leaving comments, or processing review comments."
---

# File Review

Unified skill for the file-review plugin. Routes to the correct workflow based on user intent.

> **Note:** The `/file-review` and `/process-comments` commands are simple shortcuts for backward compatibility. They trigger the Review and Process workflows below. This skill is the canonical entry point.

## Intent Router

Match the user's request to one of three workflows:

| Intent signals | Workflow |
|----------------|----------|
| "install file-review", "set up file-review", "file-review not found" | **Install** |
| "review this file", "file-review `<path>`", "open for review", "let's review" | **Review a File** |
| "I left comments", "process comments", "done reviewing", "address feedback" | **Process Comments** |

If the intent is ambiguous, use AskUserQuestion:

| Question | Options |
|----------|---------|
| "What would you like to do with file-review?" | 1. Review a file (open GUI), 2. Process existing review comments, 3. Install file-review |

---

## Install

### Quick Install (Homebrew)

```bash
brew tap desplega-ai/tap
brew install file-review
```

Verify: `which file-review`

### Manual Install (from source)

Prerequisites: **bun**, **Rust**

```bash
git clone https://github.com/desplega-ai/ai-toolbox.git
cd ai-toolbox/file-review
bun install
bun run install:app
```

This symlinks to `~/.local/bin/file-review`. Ensure that's in PATH.

### Troubleshooting

- **Command not found**: Ensure `~/.local/bin` in PATH, restart terminal
- **Rust not found**: Restart terminal after installing Rust
- **Build fails on macOS**: `xcode-select --install`

### Uninstall

```bash
cd ai-toolbox/file-review && bun run uninstall:app
```

---

## Review a File

### If no path provided

Check for recently created or modified files in the current session:
- Plan files in `thoughts/<username|shared>/plans/`
- Research documents in `thoughts/<username|shared>/research/`
- Any markdown files created or updated during the conversation

Propose candidates to the user via AskUserQuestion.

### If path provided

1. **Verify the file exists** and is readable.

2. **Check if file-review is installed:**
   ```bash
   which file-review
   ```
   If not found, jump to the **Install** section above.

3. **Launch the GUI:**
   ```bash
   file-review "<absolute_path>"
   ```
   Wait for the process to complete.

   CLI flags: `--bg` (background), `--silent` (no comment output), `--json` (JSON output).

4. **Inform the user:**
   ```
   I've opened file-review for <filename>.

   Shortcuts: Cmd+K (add comment), Cmd+S (save), Cmd+Q (quit), Cmd+/ (help)
   ```

5. **After the app closes**, it outputs review comments to stdout:
   ```
   === Review Comments (N) ===

   [abc123] Line 15 (inline):
       "highlighted code"
       -> Comment text here
   ```

   Present the output, then proceed to **Process Comments** below.

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Cmd+K | Add comment to selection |
| Cmd+S | Save file |
| Cmd+Q | Quit application |
| Cmd+/ | Show all shortcuts |
| Cmd+T | Toggle theme |
| Cmd+Shift+V | Toggle vim mode |
| Cmd+O | Open file |

---

## Process Comments

### Comment Format

The file-review tool embeds comments as HTML markers:

**Inline comments:**
```html
<!-- review-start(ID) -->highlighted text<!-- review-end(ID): reviewer feedback -->
```

**Line comments:**
```html
<!-- review-line-start(ID) -->
content spanning
multiple lines
<!-- review-line-end(ID): reviewer feedback -->
```

`ID` is an 8-character alphanumeric identifier.

### Extraction Patterns

```javascript
// Inline - captures: [full, id, highlighted, feedback]
/<!--\s*review-start\(([a-zA-Z0-9-]+)\)\s*-->([\s\S]*?)<!--\s*review-end\(\1\):\s*([\s\S]*?)\s*-->/g

// Line - captures: [full, id, highlighted, feedback]
/<!--\s*review-line-start\(([a-zA-Z0-9-]+)\)\s*-->\n?([\s\S]*?)\n?<!--\s*review-line-end\(\1\):\s*([\s\S]*?)\s*-->/g
```

### Workflow

**Step 1: Read and Parse**

Read the file, extract all comments, present a summary:

```
Found 3 review comments in <filename>:

1. [inline] "implement caching" -> "Consider using Redis"
2. [line] "function fetchData()..." -> "Add error handling"
3. [inline] "TODO" -> "Please complete this"
```

**Step 2: Process Each Comment**

For each comment, show context and use AskUserQuestion:

| Question | Options |
|----------|---------|
| "Comment N of M: <feedback summary>" | 1. Apply edit, 2. Acknowledge (remove markers only), 3. Skip |

- **Apply edit**: Propose changes, apply after confirmation, remove markers.
- **Acknowledge**: Remove markers, preserve content. Recommend this for praise/FYI.
- **Skip**: Leave as-is, move on.

**Step 3: Remove Markers**

- Inline: replace `<!-- review-start(ID) -->text<!-- review-end(ID): feedback -->` with `text`
- Line: replace the full block with just the content lines

**Step 4: Final Summary**

```
Processing complete!

- Applied edits: 2
- Acknowledged: 1
- Skipped: 0

File saved.
```

### Special Cases

- **FYI/Praise** ("LGTM", "Nice work"): Recommend Acknowledge as default
- **Empty feedback**: Ask if user wants to remove markers
- **Unclear feedback**: Use AskUserQuestion to clarify reviewer intent
