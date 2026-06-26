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

> The Homebrew build is **native-only** — it does not include web mode. For `--web`/`--tunnel` you must **build from source** with `bun run install:web` (see **Advanced: Web / tunnel mode**).

### Manual Install (from source)

Prerequisites: **bun**, **Rust**

```bash
git clone https://github.com/desplega-ai/ai-toolbox.git
cd ai-toolbox/file-review
bun install
bun run install:app   # native binary
# or, for web/tunnel mode:
bun run install:web   # web-feature binary
```

Both symlink to `~/.local/bin/file-review` (ensure that's in PATH).

- `bun run install:app` builds the native (Tauri) binary. It does **not** include web mode — passing `--web` to it errors out (`main.rs:101-105`).
- `bun run install:web` builds the `web`-feature binary required for `--web`/`--tunnel`.
- Maintainers cutting a release use `bun run release` (handles version sync across the three manifests + build), not a bare `install:*`.

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

**Pending review batches:** also surface files that still contain *active* `review-(start|line-start)` markers — leftover review sessions whose comments were never processed:
```bash
grep -rlE '<!-- *review-(start|line-start)\(' thoughts/taras/ thoughts/shared/ --include="*.md" 2>/dev/null | head -20
```
Re-verify each hit against the **Extraction Patterns** regexes (Process Comments below) before proposing — a bare `grep` also matches files that merely quote the marker syntax (like this plan), so only offer files with a full parseable match.

Propose all candidates (recent files + pending batches) via a single **multi-select AskUserQuestion**. On selection, launch `file-review "<p1>" "<p2>" …` (0–N absolute paths, one tab each) and flow into **Process Comments**.

### If path provided

1. **Verify the file(s) exist** and are readable.

2. **Check if file-review is installed:**
   ```bash
   which file-review
   ```
   If not found, jump to the **Install** section above.

3. **Launch the GUI** (one or more files):
   ```bash
   file-review "<p1>" "<p2>" …
   ```
   - The launch may pass **0–N absolute paths**. Each positional path opens in its own tab (`main.rs:50-56`, `lib.rs:23-48`): one path → a single tab; multiple files → one tab per path.
   - Additional files can also be opened **in-session**: `Cmd+T` / `Cmd+O` (the file picker is multi-select) or drag-and-drop onto the window.
   - Use the Bash tool with `run_in_background: true` and `timeout: 600000` (max allowed — 10 minutes)
   - Do **NOT** append `&` to the command — the process must block until the user closes the GUI
   - Do **NOT** use `--bg` — let the Bash tool handle backgrounding
   - When the background task completes, Claude is automatically notified and receives stdout (review comments)

   See **Binary / CLI Reference** below for all flags (`--silent`, `--json`, web mode, …) and the exact output formats.

4. **Inform the user:**
   ```
   I've opened file-review for <file(s)>.

   Shortcuts: Cmd+K (add comment), Cmd+T (new tab), Cmd+S (save), Cmd+Q (quit), Cmd+/ (help)
   ```
   No need to ask the user to notify you when done — you will be automatically notified when the GUI closes.

5. **After the background task completes**, the notification includes stdout with review comments:
   ```
   === Review Comments (N) ===

   [abc123] Line 15 (inline):
       "highlighted code"
       → Comment text here
   ```

   When multiple tabs were open, the output is grouped per file under `## <path>` headers (see **Binary / CLI Reference**).

   Present the output, then proceed to **Process Comments** below.

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Cmd+K | Add comment to selection |
| Cmd+S | Save file |
| Cmd+T | New tab (open file) |
| Cmd+O | Open file |
| Cmd+W | Close active tab |
| Cmd+1…9 | Switch to Nth tab |
| Cmd+N / Cmd+P | Next / previous tab |
| Cmd+M | Toggle markdown view (raw/pretty) |
| Cmd+Shift+T | Toggle theme (light/dark) |
| Cmd+Shift+V | Toggle vim mode |
| Cmd++ / Cmd+- | Zoom in / out |
| Cmd+Z / Cmd+Shift+Z | Undo / redo |
| Cmd+Q | Quit application |
| Cmd+/ | Show all shortcuts (incl. preview vim nav & search) |

Preview-mode vim navigation (`j`/`k` next/prev block, `gg`/`G` first/last, `Ctrl+D`/`Ctrl+U` page, `/` or `Cmd+F` search, `n`/`N` next/prev match) is listed in the in-app `Cmd+/` shortcuts modal.

### Binary / CLI Reference

`file-review [OPTIONS] [FILE]...` — mirrors `file-review --help` (`main.rs:280-318`).

| Flag | Meaning |
|------|---------|
| `-h`, `--help` | Show help (includes the config path + current contents) |
| `-v`, `--version` | Show version |
| `-s`, `--silent` | Suppress comment output on close |
| `-j`, `--json` | Emit JSON on close |
| `-w`, `--web` | Start in web-server mode (requires the `web`-feature build) |
| `-o`, `--open` | Auto-open the browser (requires `--web`) |
| `-t`, `--tunnel` | Enable localtunnel for remote access (requires `--web`) |
| `--subdomain NAME` | Request a specific tunnel subdomain (requires `--tunnel`) |
| `--port PORT` | HTTP server port (default: **3456**) |
| `[FILE]...` | 0–N file paths; one tab per path |
| `-` / piped stdin | `file-review -` or `cat content.md \| file-review` reads stdin into a temp file |

**Output formats** (printed to stdout on close, unless `--silent`):

- **Native, single tab — flat** (`comments.rs:151-179`):
  ```
  === Review Comments (N) ===

  [abc123] Line 15 (inline):
      "highlighted code"
      → Comment text here
  ```
- **Native, multiple tabs — grouped:** each file's block is prefixed with a `## <path>` header, blocks joined by blank lines (`lib.rs:254-271`):
  ```
  ## /tmp/a.md

  === Review Comments (1) ===
  …

  ## /tmp/b.md

  === Review Comments (1) ===
  …
  ```
- **JSON (`--json`)** (`lib.rs:223-253`): single tab → a **bare array** of comment objects; multiple tabs → an array of `{ "path", "comments": [...] }` groups. Tabs with no comments are omitted.
- **stdin mode** (`comments.rs:211-263`): a combined block with `=== File ===`, `=== Content ===`, and `=== Review Comments ===` sections (the comments header becomes `=== Review Comments (content modified) ===` when the piped content was edited).

### Advanced: Web / tunnel mode

Web mode serves the reviewer over HTTP instead of the native window — useful for remote review. It is **explicitly single-file**: `run_web_mode` takes one path (`main.rs:143-174`), so multi-file tabs are native-only.

```bash
file-review --web "<path>"                          # serve on http://127.0.0.1:3456
file-review --web --open "<path>"                   # also auto-open the browser
file-review --web --tunnel "<path>"                 # expose via localtunnel for remote access
file-review --web --tunnel --subdomain myname "<path>"
file-review --web --port 8080 "<path>"              # custom port (default 3456)
```

- `--open` and `--tunnel` require `--web`; `--subdomain` requires `--tunnel`.
- Comments come back exactly like the native close: when the page's Quit is triggered (browser/GUI close), the server re-reads the file, prints the comment block to stdout, and shuts down (`web_server.rs:279-356`). Feed that into **Process Comments** below.

**Install caveat:** web mode needs the `web`-feature build. A plain `bun run install:app` binary — and the Homebrew build — is **native-only** and **rejects `--web`** with `Error: Web mode requires the 'web' feature` (`main.rs:101-105`). Build the web binary from source:

```bash
cd ai-toolbox/file-review && bun run install:web
```

Because **Homebrew is native-only**, brew users who want web mode must build from source this way.

### Config

Persistent settings live in `~/.file-reviewer.json` (`config.rs:11-22,44-48`). Keys (must match the `AppConfig` struct):

| Key | Type | Meaning |
|-----|------|---------|
| `theme` | string | `"dark"` / `"light"` |
| `vim_mode` | bool | Vim keybindings in the editor |
| `font_size` | number | Editor font size (default 14) |
| `markdown_raw` | bool | Default to raw markdown vs. rendered preview |
| `save_on_quit` | bool | When **true**, edits/markers persist on quit **without** an explicit `Cmd+S` |
| `window` | object | `{ "width", "height" }` |

`file-review --help` prints the config path and current contents; the in-app `Cmd+/` shortcuts modal also exposes it.

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

**Step 1: Determine source and parse**

The close-output (stdout returned when the GUI closes) is the **source of truth** for which files were reviewed and what the comments are. **Consume that output directly; re-read a file from disk only if needed** — when the run used `--silent`, when stdout was truncated, or when you need the exact on-disk spans to strip markers (apply the **Extraction Patterns** to the file content in that case).

- **Single tab** → flat `=== Review Comments (N) ===` block → process that one file (the default path).
- **Multiple tabs** → output grouped under `## <path>` headers → parse each section into `{ path, comments }`.

Present a per-file summary:

```
Found 5 review comments across 2 files:

thoughts/taras/plans/…plan.md (3):
  1. [inline] "implement caching" → "Consider using Redis"
  2. [line]   "function fetchData()…" → "Add error handling"
  3. …
thoughts/taras/research/…md (2):
  …
```

For a single file, collapse to the flat `Found N review comments in <file>:` form.

**Step 2: Process each comment, grouped by file**

Work one file at a time. For each comment, show context and use AskUserQuestion:

| Question | Options |
|----------|---------|
| "Comment N of M in <file>: <feedback summary>" | 1. Apply edit, 2. Acknowledge (remove markers only), 3. Skip |

- **Apply edit**: draft the change for the highlighted span addressing the feedback, apply after confirmation, then strip the markers. (You may show a short before/after or 2-line unified diff first — keep it terse, not a ceremony.)
- **Acknowledge**: strip the markers, preserve content unchanged. Recommend for praise/FYI.
- **Skip**: leave marker and content as-is.

**Step 3: Strip markers (on the on-disk file)**

Edit each touched file directly, matching the captured full marker:
- Inline: replace `<!-- review-start(ID) -->text<!-- review-end(ID): feedback -->` with `text`.
- Line: replace the full block with just the inner content lines.

Process files sequentially (read → edit → next file) — never concurrent writes to one file.

**Step 4: Final summary (per-file + totals)**

```
Processing complete (2 files):

thoughts/taras/plans/…plan.md — Applied 1, Acknowledged 2, Skipped 0
thoughts/taras/research/…md   — Applied 0, Acknowledged 1, Skipped 0

Totals: Applied 1, Acknowledged 3, Skipped 0
All markers stripped from touched files; files saved.
```

For a single reviewed file, collapse to one flat block (Applied / Acknowledged / Skipped).

### Special Cases

- **FYI/Praise** ("LGTM", "Nice work"): Recommend Acknowledge as default.
- **Empty feedback**: Ask if the user wants to remove the markers.
- **Unclear feedback**: Use AskUserQuestion to clarify reviewer intent before applying.
- **Batch hint**: when comments came from a multi-file batch, note "X of N markers from the same review session" in the per-comment prompt.
