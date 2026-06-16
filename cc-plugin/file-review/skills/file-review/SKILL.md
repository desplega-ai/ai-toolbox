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

**Review batches (v1 live marker scan):** In addition (or "also check/use these too"), discover files that still contain *active `review-*` markers* — these are "pending review batches/sessions" from prior file-review invocations (markers written on save/close and only stripped by later Process Comments).

Run a tightly scoped discovery using grep -l on literal starts, then *re-filter in synthesis using the exact extraction regexes from the Process section below* so discovery emits ONLY files with currently-active parseable markers at proposal time (never includes e.g. this plan file which only quotes the pattern, or docs that don't fully match the capture groups).

Discovery command (auditable; used verbatim or as superset):
```bash
grep -rl '<!--\s*review-(start|line-start)' thoughts/taras/ thoughts/shared/ --include="*.md" 2>/dev/null | head -20
```
(Scope limited to `thoughts/taras/` + `thoughts/shared/` only; always combine with re-parse verification pass `node -e ' ... use the two /.../g regexes from 156-161; if ([...c.matchAll(re)].length >0 ) include'` or equiv bash+grep quick; | head -20; see also "Review batches v1" note later in this file.)

Present the pending-marker files (with count hints if feasible) alongside the recent plans list using multi-select AskUserQuestion ("use these too?" supported).

On selection (one or many), launch exactly as below: `file-review "abs-path1" "abs-path2" ...` under Bash `run_in_background: true` `timeout: 600000` (contract allows batch to the underlying binary which supports 0-N files) then immediately flow to **Process Comments** for the returned markers (per file or collected). Existing per-comment Apply/Ack/Skip/remove logic unchanged.

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
   - Use the Bash tool with `run_in_background: true` and `timeout: 600000` (max allowed — 10 minutes)
   - Do **NOT** append `&` to the command — the process must block until the user closes the GUI
   - Do **NOT** use `--bg` — let the Bash tool handle backgrounding
   - When the background task completes, Claude is automatically notified and receives stdout (review comments)

   Other CLI flags: `--silent` (no comment output), `--json` (JSON output).

4. **Inform the user:**
   ```
   I've opened file-review for <filename>.

   Shortcuts: Cmd+K (add comment), Cmd+S (save), Cmd+Q (quit), Cmd+/ (help)
   ```
   No need to ask the user to notify you when done — you will be automatically notified when the GUI closes.

5. **After the background task completes**, the notification includes stdout with review comments:
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

## Review batches (v1)

This extension (Phase 2 live marker scan) delivers the user-requested "review batches" as the set of files that currently contain active `review-(start|line-start)` markers (written by GUI, consumed only by Process Comments).

- No sidecar, no new Rust, no marker syntax change, no index.
- Discovery is on-demand + scope-limited live scan (see "If no path provided" block for the exact command; it runs a recheck using Extraction Patterns:156-161 so never proposes non-active).
- Re-invoking file-review on any discovered batch file re-uses the existing Tab load/append/multi + export + Process behavior fully.
- Optional helper paths (future): a `process-pending` alias could collect all such discovered + auto start Process flow without GUI reopen, but for v1 selection + normal launch + Process is sufficient.

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
