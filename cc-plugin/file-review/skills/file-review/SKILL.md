---
name: file-review
description: "File review tool: launch GUI, process comments, or install. Use when user mentions file-review, reviewing files, leaving comments, or processing review comments."
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

> The Homebrew build is **native-only**. It does not include web mode. For `--web`/`--tunnel` you must **build from source** with `bun run install:web` (see **Advanced: Web / tunnel mode**).

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

- `bun run install:app` builds the native (Tauri) binary. It does **not** include web mode. Passing `--web` to it exits with an error.
- `bun run install:web` builds the `web`-feature binary required for `--web`/`--tunnel`.
- Maintainers cutting a release bump the version in `package.json`, `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`, then run `bun run release`. It tags `file-review-v<version>` and pushes the tag to trigger the GitHub Actions build. A bare `install:*` only installs locally.

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

**Pending review batches:** also surface files that still contain *active* `review-(start|line-start)` markers (leftover review sessions whose comments were never processed):
```bash
grep -rlE '<!-- *review-(start|line-start)\(' thoughts/taras/ thoughts/shared/ --include="*.md" 2>/dev/null | head -20
```
Re-verify each hit against the **Extraction Patterns** regexes (Process Comments below) before proposing. A bare `grep` also matches files that merely quote the marker syntax (like this skill), so only offer files with a full parseable match.

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
   - The launch may pass **0–N absolute paths**. Each positional path opens in its own tab (`main` in `main.rs`, `run` in `lib.rs`): one path → a single tab; multiple files → one tab per path.
   - Additional files can also be opened **in-session**: `Cmd+T` / `Cmd+O` (the file picker is multi-select) or drag-and-drop onto the window.
   - Use the Bash tool with `run_in_background: true` and `timeout: 600000` (max allowed: 10 minutes)
   - Do **NOT** append `&` to the command. The process must block until the user closes the GUI
   - Do **NOT** use `--bg`. Let the Bash tool handle backgrounding
   - When the background task completes, Claude is automatically notified and receives stdout (review comments)

   See **Binary / CLI Reference** below for all flags (`--silent`, `--json`, web mode, …) and the exact output formats.

4. **Inform the user:**
   ```
   I've opened file-review for <file(s)>.

   Shortcuts: Cmd+K (add comment), Cmd+T (new tab), Cmd+S (save), Cmd+Q (quit), Cmd+/ (help)
   ```
   No need to ask the user to notify you when done. You are notified automatically when the GUI closes.

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

The in-app `Cmd+/` modal lists every shortcut in groups. Source of truth: `src/shortcuts.ts` (`shortcutGroups`). Cmd and Ctrl are interchangeable.

| Group | Shortcut | Action |
|-------|----------|--------|
| Comments | Cmd+K | Comment on the preview selection, else the active block (preview) or the current line/selection (source) |
| Comments | Cmd+click | Comment on a preview block (also on a link, instead of following it) |
| Comments | Cmd+Enter | Submit the comment composer, or save a comment edit |
| Comments | Esc | Cancel the composer or edit, clear the selected comment, hide the selection pill |
| Navigation | Cmd+F | Search the preview |
| Navigation | Enter / Shift+Enter | Next / previous match (in the search box) |
| Navigation | Esc | Close search |
| View | Cmd+M | Toggle preview / source |
| View | Cmd+B | Toggle the outline rail (left) |
| View | Cmd+Option+B | Toggle the comments rail (right) |
| View | Left / Right arrow | Resize the focused rail divider (16px steps) |
| View | Cmd+Shift+E | Toggle reading width (narrow / full) |
| View | Cmd+Shift+T | Toggle theme (light / dark) |
| View | Cmd++ / Cmd+- | Zoom in / out |
| View | Cmd+/ | Toggle the shortcuts help |
| Tabs | Cmd+T | New tab (open file) |
| Tabs | Cmd+W | Close active tab |
| Tabs | Cmd+1…9 | Switch to Nth tab |
| Tabs | Cmd+N / Cmd+P | Next / previous tab |
| File | Cmd+O | Open file (multi-select picker) |
| File | Cmd+S | Save file |
| File | Cmd+Z / Cmd+Shift+Z | Undo / redo |
| File | Cmd+Q | Quit application |
| File | S / Q / C / Esc | Unsaved-changes dialog: save, quit anyway, close tab anyway, cancel |
| Lightbox | + / - | Zoom in / out |
| Lightbox | 0 | Fit to screen |
| Lightbox | Left / Right arrow | Previous / next image |
| Lightbox | Double-click | Toggle fit and 100% |
| Lightbox | Esc | Close the viewer |
| Vim | Cmd+Shift+V | Toggle vim mode |
| Vim | j / k | Preview: next / previous block |
| Vim | gg / G | Preview: first / last block |
| Vim | Ctrl+D / Ctrl+U | Page down / up (preview and editor) |
| Vim | / | Preview: search |
| Vim | n / N | Preview: next / previous match |
| Vim | Esc | Preview: clear the active block |
| Vim | Ctrl+Q | Editor: visual block mode (Ctrl+V is paste) |

Cmd+S, Cmd+W, Cmd+T, Cmd+1…9, Cmd+N/P, Cmd+B, Cmd+Option+B and Cmd+Shift+E also work while the source editor has focus. The vim preview keys work only when vim mode is on and the preview is visible.

### Preview Features

- **Comments from the preview.** Hover a block and click `+`, or Cmd+click it. Select text to get a floating **Comment** pill (or press Cmd+K). A selection inside one block becomes an **inline** comment on the exact source text. A selection across blocks becomes a **line** comment. If the selection cannot be mapped to source, the comment covers the whole block.
- **Comment composer.** A floating composer opens next to the target. The target is marked as pending until you submit or cancel.
- **Highlights.** Inline comments highlight only their text. Line comments highlight their blocks. Overlapping comments get a stronger style. Click a passage to select its card. Click it again to cycle through overlapping comments.
- **Links.** `#heading` links scroll to the heading. Links to `.md`, `.markdown`, `.mdx` and `.txt` files open as tabs (then scroll to the `#fragment`). Other local files open in their default app (native only; web mode shows an info toast). `http`, `https` and `mailto` links open in the system browser. Broken local links are marked. External links get an icon.
- **Local images.** Relative and absolute image paths resolve against the file. Missing images show an "Image not found" placeholder. Click an image to open the **lightbox**: zoom (wheel, pinch, buttons, keys), drag to pan, copy path, reveal in Finder (native only).
- **Diagram tools.** Each rendered mermaid diagram has a hover toolbar: **Expand** (opens the lightbox), **Copy source**, **Download SVG** (save dialog natively, browser download in web mode). Syntax errors show the message with a "Show source" disclosure.
- **Callouts.** GitHub alerts `> [!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]` and `[!CAUTION]` render as colored callouts.
- **Footnotes.** `[^id]` references become numbered superscript links to their `[^id]:` definitions, with back-links.
- **Heading links.** Hover a heading and click `#` to copy `<file name>#<slug>`.

### Layout and Rails

- **Left rail** (Cmd+B) has two tabs. **Outline** lists the headings with scroll-spy and a filter box. In source mode the active entry follows the cursor. **Links** lists what the file links to (Documents, Files, Images, External) and **Referenced by**: markdown files that link to this file. Backlinks are searched under the nearest ancestor with `.git` (else the file's folder), skipping hidden folders, `node_modules`, `target` and `dist`. Rows route like preview links. Image rows open the lightbox.
- **Right rail** (Cmd+Option+B) holds the comment cards: line chip (click to scroll to the passage), Inline/Line label, quote excerpt, edit and delete actions. Delete shows an Undo toast. Hovering a card highlights its passage, and hovering a passage highlights its card.
- **Resize** a rail by dragging its divider or with the arrow keys when the divider has focus. Double-click the divider to collapse the rail. A collapsed rail becomes a thin strip with a reopen button. The comments strip shows a count badge.
- **Reading width** (Cmd+Shift+E or the button at the top right of the preview) switches between a centered 80ch column and the full width.
- Below 1000px the outline rail collapses. Below 760px both rails collapse. These automatic collapses are not saved.

### Binary / CLI Reference

`file-review [OPTIONS] [FILE]...` mirrors `file-review --help` (`print_help` in `src-tauri/src/main.rs`).

| Flag | Meaning |
|------|---------|
| `-h`, `--help` | Show help (includes the config path and current contents) |
| `-v`, `--version` | Show version |
| `-s`, `--silent` | Suppress comment output on close |
| `-j`, `--json` | Emit JSON on close |
| `-w`, `--web` | Start in web-server mode (requires the `web`-feature build) |
| `-o`, `--open` | Auto-open the browser (requires `--web`) |
| `-t`, `--tunnel` | Enable localtunnel for remote access (requires `--web`) |
| `--subdomain NAME` | Request a specific tunnel subdomain (requires `--tunnel`) |
| `--port PORT` | HTTP server port (default: **3456**) |
| `[FILE]...` | 0 to N file paths. One tab per path |
| `-` / piped stdin | `file-review -` or `cat content.md \| file-review` reads stdin into a temp file |

**Output formats** (printed to stdout on close, unless `--silent`):

- **Native, single tab: flat** (`format_comments_readable` in `comments.rs`):
  ```
  === Review Comments (N) ===

  [abc123] Line 15 (inline):
      "highlighted code"
      → Comment text here
  ```
  Multi-line spans print `Lines 12-14`. An empty span prints `(empty selection)`.
- **Native, multiple tabs: grouped.** Each file's block gets a `## <path>` header. Blocks are joined by blank lines. Tabs with no comments are omitted (`run` in `lib.rs`):
  ```
  ## /tmp/a.md

  === Review Comments (1) ===
  …

  ## /tmp/b.md

  === Review Comments (1) ===
  …
  ```
- **JSON (`--json`).** Each comment is `{ "id", "comment", "type", "start_line", "end_line", "content" }`. Single tab: a **bare array** of comments. Multiple tabs: an array of `{ "path", "comments": [...] }` groups. Tabs with no comments are omitted.
- **stdin mode** (`format_stdin_output_readable` / `format_stdin_output_json` in `comments.rs`): a combined block with `=== File ===`, `=== Content ===` and `=== Review Comments ===` sections. The comments header becomes `=== Review Comments (content modified) ===` when the piped content was edited. JSON is `{ "file", "content", "comments", "modified" }`.

### Advanced: Web / tunnel mode

Web mode serves the reviewer over HTTP instead of the native window. Use it for remote review. It is **single-file**: `run_web_mode` takes only the first path, so multi-file tabs are native-only.

```bash
file-review --web "<path>"                          # serve on http://127.0.0.1:3456
file-review --web --open "<path>"                   # also auto-open the browser
file-review --web --tunnel "<path>"                 # expose via localtunnel for remote access
file-review --web --tunnel --subdomain myname "<path>"
file-review --web --port 8080 "<path>"              # custom port (default 3456)
```

- `--open` and `--tunnel` require `--web`. `--subdomain` requires `--tunnel`.
- Comments come back like the native close. When the page's Quit button is clicked, the server re-reads the file, prints the comment block to stdout and shuts down (`quit` in `web_server.rs`). Feed that into **Process Comments** below.
- Local images are served through `GET /api/asset` (image extensions only). Backlinks work through `POST /api/find-backlinks`. Opening non-document local files, reveal in Finder and "Edit Config" are native-only.

**Install caveat:** web mode needs the `web`-feature build. A plain `bun run install:app` binary, and the Homebrew build, are **native-only** and **reject `--web`** with `Error: Web mode requires the 'web' feature`. Build the web binary from source:

```bash
cd ai-toolbox/file-review && bun run install:web
```

### Config

Persistent settings live in `~/.file-reviewer.json` (`AppConfig` in `src-tauri/src/config.rs`, `AppConfig` in `src/config.ts`):

| Key | Type | Meaning |
|-----|------|---------|
| `theme` | string | `"dark"` / `"light"` |
| `vim_mode` | bool | Vim keybindings in the editor and the preview |
| `font_size` | number | Editor font size (default 14) |
| `markdown_raw` | bool | Default to source view instead of the rendered preview |
| `save_on_quit` | bool | When **true**, edits and markers persist on quit **without** an explicit `Cmd+S` |
| `window` | object | `{ "width", "height" }` |
| `layout` | object | Rails and reading width (optional, see below) |

`layout` fields (each invalid field falls back to its own default):

| Field | Type | Default | Meaning |
|-------|------|---------|---------|
| `left_open` | bool | `true` | Outline rail open |
| `left_width` | number | `240` | Outline rail width, clamped to 180..440 |
| `right_open` | bool | `true` | Comments rail open |
| `right_width` | number | `340` | Comments rail width, clamped to 260..560 |
| `reading_width` | string | `"narrow"` | `"narrow"` (80ch column) or `"full"` |

The app saves `layout` when you resize or toggle a rail or the reading width. `file-review --help` prints the config path and current contents. The in-app `Cmd+/` modal shows the current settings with **Edit Config** and **Reload** buttons.

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

The close-output (stdout returned when the GUI closes) is the **source of truth** for which files were reviewed and what the comments are. **Consume that output directly; re-read a file from disk only if needed**: when the run used `--silent`, when stdout was truncated, or when you need the exact on-disk spans to strip markers (apply the **Extraction Patterns** to the file content in that case).

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

- **Apply edit**: draft the change for the highlighted span addressing the feedback, apply after confirmation, then strip the markers. (You may show a short before/after or 2-line unified diff first. Keep it terse, not a ceremony.)
- **Acknowledge**: strip the markers, preserve content unchanged. Recommend for praise/FYI.
- **Skip**: leave marker and content as-is.

**Step 3: Strip markers (on the on-disk file)**

Edit each touched file directly, matching the captured full marker:
- Inline: replace `<!-- review-start(ID) -->text<!-- review-end(ID): feedback -->` with `text`.
- Line: replace the full block with just the inner content lines.

Process files sequentially (read → edit → next file). Never concurrent writes to one file.

**Step 4: Final summary (per-file + totals)**

```
Processing complete (2 files):

thoughts/taras/plans/…plan.md: Applied 1, Acknowledged 2, Skipped 0
thoughts/taras/research/…md:   Applied 0, Acknowledged 1, Skipped 0

Totals: Applied 1, Acknowledged 3, Skipped 0
All markers stripped from touched files; files saved.
```

For a single reviewed file, collapse to one flat block (Applied / Acknowledged / Skipped).

### Special Cases

- **FYI/Praise** ("LGTM", "Nice work"): Recommend Acknowledge as default.
- **Empty feedback**: Ask if the user wants to remove the markers.
- **Unclear feedback**: Use AskUserQuestion to clarify reviewer intent before applying.
- **Batch hint**: when comments came from a multi-file batch, note "X of N markers from the same review session" in the per-comment prompt.
