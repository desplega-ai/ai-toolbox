---
date: 2026-01-15T10:30:00-08:00
researcher: claude
git_commit: cb3f757
branch: main
repository: ai-toolbox
topic: "File Review Web Mode Architecture Research"
tags: [research, file-review, web-mode, localtunnel, tauri]
status: complete
autonomy: critical
last_updated: 2026-01-15
last_updated_by: claude
---

# Research: File Review Web Mode Architecture

**Date**: 2026-01-15
**Researcher**: Claude
**Git Commit**: cb3f757
**Branch**: main

## Research Question

How to add `--web` and `--tunnel` flags to file-review to enable browser-based usage, with the web UI including a quit button that triggers the same behavior as closing the native app (showing the final report and exiting).

## Summary

The file-review tool is currently a Tauri application (Rust backend + TypeScript/Vite frontend) that runs as a native desktop app. To add web mode support, the architecture needs to:

1. Separate the web frontend from Tauri-specific APIs
2. Create a standalone HTTP server mode in Rust
3. Implement browser-compatible alternatives to Tauri APIs (file operations, dialogs, etc.)
4. Integrate localtunnel for optional public URL tunneling
5. Add a web-based quit mechanism that outputs the final review report

## Detailed Findings

### Current Architecture

#### Entry Point: `file-review/src-tauri/src/main.rs:1-134`

The CLI entry point handles:
- Command-line argument parsing: `--version/-v`, `--help/-h`, `--silent/-s`, `--json/-j`
- File path extraction (first non-flag argument)
- Stdin mode detection (piped input or explicit `-` argument)
- Calls `file_review_lib::run()` with parsed options

**Current flags:**
```
-h, --help       Show help
-v, --version    Show version
-s, --silent     Suppress output on close
-j, --json       Output as JSON on close
```

#### Application Bootstrap: `file-review/src-tauri/src/lib.rs:17-181`

The `run()` function:
1. Initializes Tauri with plugins (`tauri_plugin_dialog`, `tauri_plugin_fs`)
2. Sets up app state via `AppState` struct containing:
   - `current_file: Mutex<Option<PathBuf>>`
   - `silent: bool`
   - `json_output: bool`
   - `stdin_mode: bool`
   - `original_content: Mutex<Option<String>>`
3. Creates menu with Save (Cmd+S) and Quit (Cmd+Q) items
4. Registers window close handler for final report output

#### Final Report Generation: `file-review/src-tauri/src/lib.rs:84-147`

On window close (`CloseRequested` event):
1. Saves window size to config
2. If not silent mode:
   - Reads current file content
   - Parses comments via `parse_comments_for_output()`
   - In stdin mode: outputs file path + content + comments + modified flag
   - In normal mode: outputs just comments (if any)
3. Output format based on `json_output` flag

**Key output functions:** `file-review/src-tauri/src/comments.rs:150-263`
- `format_comments_readable()` - Human-readable format
- `format_comments_json()` - JSON format
- `format_stdin_output_readable()` / `format_stdin_output_json()` - Full output for stdin mode

#### Frontend Architecture: `file-review/src/`

| File | Purpose |
|------|---------|
| `main.ts` | App initialization, event handlers, state management |
| `editor.ts` | CodeMirror setup with Vim mode, themes |
| `comments.ts` | Comment parsing, highlighting, insertion/removal |
| `sidebar.ts` | Comment list UI and interactions |
| `file-picker.ts` | Tauri dialog-based file picker |
| `config.ts` | User preferences (theme, vim mode, font size) |
| `shortcuts.ts` | Keyboard shortcut handling |
| `theme.ts` | CodeMirror theme definitions |

**Tauri API Dependencies:**
- `@tauri-apps/api/core` - `invoke()` for IPC commands
- `@tauri-apps/api/event` - `listen()` for menu events
- `@tauri-apps/plugin-dialog` - File picker dialog
- `@tauri-apps/plugin-fs` - File system access

### Backend Commands: `file-review/src-tauri/src/file_ops.rs`

```rust
// File operations
read_file(path: String) -> Result<String, String>
write_file(path: String, content: String) -> Result<(), String>
set_current_file(path: String, state: State<'_, AppState>) -> Result<(), String>
get_current_file(state: State<'_, AppState>) -> Option<String>
reveal_in_finder(path: String) -> Result<(), String>
is_stdin_mode(state: State<'_, AppState>) -> bool
get_version() -> String
```

### Comment System: `file-review/src-tauri/src/comments.rs`

**Comment markers:**
- Inline: `<!-- review-start(ID) -->...content...<!-- review-end(ID): comment -->`
- Line: `<!-- review-line-start(ID) -->\n...lines...\n<!-- review-line-end(ID): comment -->`

**Key functions:**
- `parse_comments()` - Returns `Vec<ReviewComment>` for frontend highlighting
- `parse_comments_for_output()` - Returns `Vec<OutputComment>` with line numbers for CLI output
- `insert_wrapped_comment()` / `insert_nextline_comment()` - Add comments
- `remove_comment()` - Delete comments by ID

### Localtunnel Integration

**Library:** `@desplega.ai/localtunnel` (https://github.com/desplega-ai/localtunnel)

**Usage:**
```javascript
const localtunnel = require("@desplega.ai/localtunnel");
const tunnel = await localtunnel({ port: 3000 });
console.log(tunnel.url); // https://abcdefgjhij.lt.desplega.ai
tunnel.close(); // Cleanup
```

**Key features:**
- Automatic reconnection on server restart
- Custom subdomain support
- Password protection option
- HTTPS tunneling support

## Architecture Documentation

### Proposed Web Mode Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      file-review CLI                         │
├─────────────────────────────────────────────────────────────┤
│  --web flag detected?                                        │
│  ├── NO  → Tauri native app (current behavior)              │
│  └── YES → HTTP Server Mode                                  │
│            ├── Serve built frontend assets                   │
│            ├── REST API endpoints (replacing invoke())       │
│            ├── WebSocket for real-time updates (optional)   │
│            └── --tunnel flag?                                │
│                ├── NO  → Local only (http://localhost:PORT) │
│                └── YES → localtunnel public URL             │
└─────────────────────────────────────────────────────────────┘
```

### Key Components Needed

#### 1. HTTP Server (Rust)

New Rust dependency for HTTP server (e.g., `axum`, `actix-web`, or `warp`).

**Endpoints needed:**
```
GET  /                      Serve index.html
GET  /assets/*              Serve static assets
POST /api/read-file         Read file content
POST /api/write-file        Write file content
GET  /api/current-file      Get current file path
POST /api/set-current-file  Set current file path
GET  /api/config            Load config
POST /api/config            Save config
POST /api/parse-comments    Parse comments from content
POST /api/insert-comment    Insert comment
POST /api/remove-comment    Remove comment
POST /api/quit              Trigger quit (returns final report)
GET  /api/version           Get version
```

#### 2. Frontend Abstraction Layer

Create `api.ts` that abstracts Tauri vs HTTP:

```typescript
// api.ts
const API = {
  async invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
    if (window.__TAURI__) {
      return tauri.invoke(cmd, args);
    }
    const response = await fetch(`/api/${cmd}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    });
    return response.json();
  }
};
```

#### 3. Web-specific UI Changes

- **Quit button** in toolbar (web mode only)
- **No file picker dialog** - must pass file path via CLI
- **No Finder reveal** - disabled in web mode
- **Config location display** - server-side path

#### 4. Quit Flow (Web Mode)

1. User clicks "Quit" button or hits endpoint `/api/quit`
2. Server:
   - Reads current file content
   - Parses comments
   - Formats output (JSON or readable)
   - Writes to stdout
   - Closes tunnel (if active)
   - Initiates server shutdown
3. Response includes final report for browser display before close

### Build Configuration

**Vite config changes needed:**
- Output both Tauri dev/build and standalone web build
- Environment variable for mode detection

**Proposed build scripts:**
```json
{
  "scripts": {
    "dev": "vite",
    "dev:web": "vite --mode web",
    "build": "tsc && vite build",
    "build:web": "tsc && vite build --mode web",
    "tauri": "tauri",
    "tauri:dev": "tauri dev",
    "tauri:build": "tauri build"
  }
}
```

## Code References

| Component | File | Lines |
|-----------|------|-------|
| CLI entry point | `file-review/src-tauri/src/main.rs` | 1-134 |
| Application run function | `file-review/src-tauri/src/lib.rs` | 17-181 |
| Window close handler | `file-review/src-tauri/src/lib.rs` | 84-147 |
| AppState struct | `file-review/src-tauri/src/file_ops.rs` | 6-12 |
| File operations | `file-review/src-tauri/src/file_ops.rs` | 14-57 |
| Comment parsing | `file-review/src-tauri/src/comments.rs` | 66-148 |
| Output formatting | `file-review/src-tauri/src/comments.rs` | 150-263 |
| Frontend init | `file-review/src/main.ts` | 75-173 |
| Editor setup | `file-review/src/editor.ts` | 35-56 |
| Tauri invoke calls | `file-review/src/comments.ts` | 64-104 |
| File picker (Tauri) | `file-review/src/file-picker.ts` | 1-16 |
| Config management | `file-review/src/config.ts` | 1-52 |

## Historical Context (from thoughts/)

The file-review tool was planned and implemented in January 2026. The original implementation plan (`thoughts/shared/research/2026-01-13-file-review-tool-implementation-plan.md`) focused on:
- Native Tauri app for macOS
- CodeMirror 6 editor with markdown support
- HTML comment-based review annotations
- Claude Code plugin integration

The web mode feature was not part of the original scope.

## Related Research

- Original implementation plan: `thoughts/shared/research/2026-01-13-file-review-tool-implementation-plan.md`
- Original feature plan: `thoughts/shared/plans/2026-01-13-file-review-tool.md`

## Design Decisions

1. **HTTP framework choice**: Which Rust HTTP framework to use? (`axum` is modern and well-maintained, `actix-web` is mature)

The simplest to use

2. **Frontend build strategy**: Should there be two separate builds (Tauri + Web) or a single build with runtime detection?

It should be a single binary, the web will not be deployed, it's like a "serve" subcommand you know?

3. **File picker in web mode**: Without native dialog, should the file path be:
   - Required CLI argument only (current behavior)
   - Or should there be a basic file browser UI?

Just disable the features that are not ok fore web mode (you can leave the buttons and disable them, or just remove them -> whatever is easier)

4. **Session management**: For tunnel mode with multiple concurrent users, should sessions be supported or is single-user sufficient?

Let's not worry about that

5. **Security in tunnel mode**: Should there be optional password protection when exposing via tunnel?

Check how that localtunnel fork is done, there are ways to handle auth. I recommend to check how it's done in the qa-use repo if you search for tunnel stuff
