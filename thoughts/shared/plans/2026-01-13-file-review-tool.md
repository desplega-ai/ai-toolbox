# File Review Tool - Implementation Plan

## Overview

Build a Tauri-based GUI tool for reviewing markdown files with inline comments. The tool opens a file, allows adding comments to lines/text selections (Google Docs style), and saves comments as HTML comments embedded in the file. Integrates with Claude Code as a `/file-review` skill.

## Current State Analysis

- **Phase 1 & 2 completed** - Core app with comment system working
- **Hive app exists** (`hive/`) - Electron-based, has comment parsing for `hive-comment` format
- **Claude Code plugins** exist at `cc-plugin/` - patterns available for integration
- **Created `file-review/`** at repository root

### Key Discoveries:
- Existing comment parser in `hive/src/main/comment-parser.ts:12-47` uses `<!-- hive-comment(id): content -->` format
- Plugin structure pattern at `cc-plugin/base/.claude-plugin/plugin.json`
- Command pattern at `cc-plugin/base/commands/commit.md`
- Most projects in repo use **bun** as package manager

## Desired End State

A working Tauri application that:
1. Opens any markdown file with line numbers displayed
2. Allows selecting text and adding comments via sidebar input
3. Saves comments as `<!-- review(<uuid>): <text> -->` in the file
4. Responds to keyboard shortcuts with discoverable help
5. Supports vim mode and theme switching
6. Shows file opener when no file is loaded
7. Integrates with Claude Code via `/file-review <path>` command

### Verification:
- [x] `file-review path/to/file.md` launches the GUI
- [x] Can add a comment to a line, see it highlighted
- [x] Cmd+S saves the file with embedded comment
- [x] Cmd+Q closes the application
- [x] Cmd+K opens comment input in sidebar
- [x] Theme can be toggled (light/dark)
- [x] Vim mode can be enabled
- [x] File name in toolbar opens Finder on click
- [x] File picker shown when no file argument provided
- [x] Claude Code can invoke via `/file-review` skill

## What We're NOT Doing

- Multi-user collaboration or real-time sync
- Comment threading or replies
- Version history tracking
- Integration with Hive app (separate tool)
- Windows/Linux builds initially (macOS only for first version)

## Implementation Approach

Build incrementally in 4 phases:
1. **Core Foundation** - Tauri scaffold, file I/O, keyboard shortcuts ✅
2. **Comment System** - CodeMirror with highlighting, sidebar, add/delete comments ✅
3. **UX Enhancements** - Theme toggle, vim mode, shortcuts modal, file opener, sidebar comment input ✅
4. **Polish & Integration** - Claude Code plugin, build/distribution

---

## Phase 1: Core Foundation ✅ COMPLETED

### Overview
Set up the Tauri project scaffold with basic file operations and keyboard shortcuts.

### Success Criteria:

#### Automated Verification:
- [x] Tauri project compiles: `cd file-review && bun run tauri build`
- [x] TypeScript compiles: `cd file-review && bun run check`
- [x] App launches: `cd file-review && bun run tauri dev`

#### Manual Verification:
- [x] App opens with dark theme
- [x] Can open a file by passing path as argument
- [x] Cmd+S saves the file
- [x] Cmd+Q quits the application
- [x] Line numbers display correctly

---

## Phase 2: Comment System ✅ COMPLETED

### Overview
Implement comment parsing, highlighting, and the sidebar UI for managing comments.

### Success Criteria:

#### Automated Verification:
- [x] Project compiles: `cd file-review && bun run tauri build`
- [x] TypeScript compiles without errors: `cd file-review && bun run check`

#### Manual Verification:
- [x] Can select text in the editor
- [x] "Add Comment" button enables when text is selected
- [x] Can add a comment via popup
- [x] Comment appears in sidebar
- [x] Comment text is highlighted in editor (yellow background)
- [x] Clicking sidebar comment scrolls to that line
- [x] Can delete a comment via sidebar X button
- [x] Comments persist after save (Cmd+S) and reload

---

## Phase 3: UX Enhancements ✅ COMPLETED

### Overview
Improve the user experience with theme switching, vim mode, better keyboard shortcuts, file management, and redesigned comment input.

### Changes Required:

#### 1. Theme System
**File**: `file-review/src/theme.ts`

```typescript
import { EditorView } from "@codemirror/view";
import { Compartment } from "@codemirror/state";

export type Theme = "light" | "dark";

export const themeCompartment = new Compartment();

const darkTheme = EditorView.theme({
  "&": {
    backgroundColor: "#1e1e1e",
    color: "#d4d4d4",
    height: "100%",
  },
  ".cm-content": {
    caretColor: "#d4d4d4",
    padding: "10px 0",
  },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
    backgroundColor: "#264f78",
  },
  ".cm-scroller": {
    overflow: "auto",
  },
  ".cm-gutters": {
    backgroundColor: "#252526",
    borderRight: "1px solid #3c3c3c",
  },
  ".cm-lineNumbers .cm-gutterElement": {
    color: "#858585",
  },
});

const lightTheme = EditorView.theme({
  "&": {
    backgroundColor: "#ffffff",
    color: "#1e1e1e",
    height: "100%",
  },
  ".cm-content": {
    caretColor: "#1e1e1e",
    padding: "10px 0",
  },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
    backgroundColor: "#add6ff",
  },
  ".cm-scroller": {
    overflow: "auto",
  },
  ".cm-gutters": {
    backgroundColor: "#f3f3f3",
    borderRight: "1px solid #e0e0e0",
  },
  ".cm-lineNumbers .cm-gutterElement": {
    color: "#6e7681",
  },
});

export function getThemeExtension(theme: Theme) {
  return theme === "dark" ? darkTheme : lightTheme;
}

export function loadSavedTheme(): Theme {
  return (localStorage.getItem("file-review-theme") as Theme) || "dark";
}

export function saveTheme(theme: Theme) {
  localStorage.setItem("file-review-theme", theme);
}
```

**File**: `file-review/src/styles.css` (add light theme CSS variables)

```css
/* Theme variables */
:root {
  --bg-primary: #1e1e1e;
  --bg-secondary: #252526;
  --bg-tertiary: #2d2d2d;
  --bg-hover: #363636;
  --text-primary: #d4d4d4;
  --text-secondary: #858585;
  --border-color: #3c3c3c;
  --accent-color: #0e639c;
  --danger-color: #f48771;
  --highlight-bg: rgba(255, 213, 0, 0.25);
  --highlight-border: #ffd500;
}

body.light-theme {
  --bg-primary: #ffffff;
  --bg-secondary: #f3f3f3;
  --bg-tertiary: #e8e8e8;
  --bg-hover: #d4d4d4;
  --text-primary: #1e1e1e;
  --text-secondary: #6e7681;
  --border-color: #e0e0e0;
  --accent-color: #0066b8;
  --danger-color: #d73a49;
  --highlight-bg: rgba(255, 213, 0, 0.35);
  --highlight-border: #e6a700;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: var(--bg-primary);
  color: var(--text-primary);
  height: 100vh;
  overflow: hidden;
}

#toolbar {
  padding: 8px 16px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  gap: 12px;
}

#sidebar {
  background: var(--bg-secondary);
  border-left: 1px solid var(--border-color);
}

/* ... update other CSS to use variables */
```

#### 2. Vim Mode
**File**: `file-review/src/vim.ts`

```typescript
import { vim } from "@replit/codemirror-vim";
import { Compartment } from "@codemirror/state";

export const vimCompartment = new Compartment();

export function getVimExtension(enabled: boolean) {
  return enabled ? vim() : [];
}

export function loadVimSetting(): boolean {
  return localStorage.getItem("file-review-vim") === "true";
}

export function saveVimSetting(enabled: boolean) {
  localStorage.setItem("file-review-vim", enabled ? "true" : "false");
}
```

**File**: `file-review/package.json` (add dependency)

```json
{
  "dependencies": {
    "@replit/codemirror-vim": "^6.2.1"
  }
}
```

#### 3. Keyboard Shortcuts with Help Modal
**File**: `file-review/src/shortcuts.ts`

```typescript
export interface Shortcut {
  keys: string;
  description: string;
  action: () => void;
}

export const shortcuts: Shortcut[] = [
  { keys: "⌘K", description: "Add comment to selection", action: () => {} },
  { keys: "⌘S", description: "Save file", action: () => {} },
  { keys: "⌘Q", description: "Quit application", action: () => {} },
  { keys: "⌘/", description: "Toggle shortcuts help", action: () => {} },
  { keys: "⌘T", description: "Toggle theme (light/dark)", action: () => {} },
  { keys: "⌘V", description: "Toggle vim mode", action: () => {} },
  { keys: "⌘O", description: "Open file", action: () => {} },
];

let helpModalVisible = false;

export function showShortcutsHelp() {
  if (helpModalVisible) {
    hideShortcutsHelp();
    return;
  }

  const modal = document.createElement("div");
  modal.id = "shortcuts-modal";
  modal.className = "shortcuts-modal";
  modal.innerHTML = `
    <div class="shortcuts-content">
      <div class="shortcuts-header">
        <h3>Keyboard Shortcuts</h3>
        <button class="close-btn">×</button>
      </div>
      <div class="shortcuts-list">
        ${shortcuts.map(s => `
          <div class="shortcut-item">
            <kbd>${s.keys}</kbd>
            <span>${s.description}</span>
          </div>
        `).join("")}
      </div>
    </div>
  `;

  modal.querySelector(".close-btn")?.addEventListener("click", hideShortcutsHelp);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) hideShortcutsHelp();
  });

  document.body.appendChild(modal);
  helpModalVisible = true;
}

export function hideShortcutsHelp() {
  document.getElementById("shortcuts-modal")?.remove();
  helpModalVisible = false;
}

export function initShortcuts(handlers: Record<string, () => void>) {
  document.addEventListener("keydown", (e) => {
    const isMeta = e.metaKey || e.ctrlKey;

    if (isMeta && e.key === "k") {
      e.preventDefault();
      handlers.addComment?.();
    } else if (isMeta && e.key === "/") {
      e.preventDefault();
      showShortcutsHelp();
    } else if (isMeta && e.key === "t") {
      e.preventDefault();
      handlers.toggleTheme?.();
    } else if (isMeta && e.key.toLowerCase() === "v" && e.shiftKey) {
      e.preventDefault();
      handlers.toggleVim?.();
    } else if (isMeta && e.key === "o") {
      e.preventDefault();
      handlers.openFile?.();
    }
  });
}
```

**File**: `file-review/src/styles.css` (add modal styles)

```css
/* Shortcuts modal */
.shortcuts-modal {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}

.shortcuts-content {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  width: 400px;
  max-height: 80vh;
  overflow: auto;
}

.shortcuts-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid var(--border-color);
}

.shortcuts-header h3 {
  margin: 0;
  font-size: 16px;
}

.shortcuts-list {
  padding: 8px 16px;
}

.shortcut-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
}

.shortcut-item kbd {
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 4px 8px;
  font-family: 'SF Mono', Monaco, monospace;
  font-size: 12px;
}

.shortcut-item span {
  color: var(--text-secondary);
  font-size: 13px;
}
```

#### 4. File Name Display with Finder Integration
**File**: `file-review/src/toolbar.ts`

```typescript
import { invoke } from "@tauri-apps/api/core";

export function initToolbar(options: {
  onOpenFile: () => void;
  onToggleTheme: () => void;
  onToggleVim: () => void;
  onShowHelp: () => void;
}) {
  // Theme toggle button
  const themeBtn = document.getElementById("theme-toggle");
  themeBtn?.addEventListener("click", options.onToggleTheme);

  // Vim toggle button
  const vimBtn = document.getElementById("vim-toggle");
  vimBtn?.addEventListener("click", options.onToggleVim);

  // Help button
  const helpBtn = document.getElementById("help-btn");
  helpBtn?.addEventListener("click", options.onShowHelp);

  // Open file button (for when no file is loaded)
  const openBtn = document.getElementById("open-file-btn");
  openBtn?.addEventListener("click", options.onOpenFile);
}

export function updateFileName(filePath: string | null) {
  const fileNameEl = document.getElementById("file-name");
  const openFileBtn = document.getElementById("open-file-btn");

  if (filePath) {
    const fileName = filePath.split("/").pop() || filePath;
    if (fileNameEl) {
      fileNameEl.textContent = fileName;
      fileNameEl.title = filePath;
      fileNameEl.style.display = "flex";
      fileNameEl.onclick = () => revealInFinder(filePath);
    }
    if (openFileBtn) openFileBtn.style.display = "none";
  } else {
    if (fileNameEl) fileNameEl.style.display = "none";
    if (openFileBtn) openFileBtn.style.display = "flex";
  }
}

async function revealInFinder(filePath: string) {
  try {
    await invoke("reveal_in_finder", { path: filePath });
  } catch (error) {
    console.error("Failed to reveal in Finder:", error);
  }
}
```

**File**: `file-review/src-tauri/src/file_ops.rs` (add reveal command)

```rust
#[tauri::command]
pub fn reveal_in_finder(path: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .args(["-R", &path])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}
```

#### 5. File Opener (when no file provided)
**File**: `file-review/src/file-picker.ts`

```typescript
import { open } from "@tauri-apps/plugin-dialog";

export async function showFilePicker(): Promise<string | null> {
  const selected = await open({
    multiple: false,
    filters: [
      { name: "Markdown", extensions: ["md", "markdown"] },
      { name: "All Files", extensions: ["*"] },
    ],
  });

  if (typeof selected === "string") {
    return selected;
  }
  return null;
}
```

#### 6. Redesigned Comment Input (Sidebar)
**File**: `file-review/src/sidebar.ts` (replace)

```typescript
import type { ReviewComment } from "./comments";

type CommentDeleteHandler = (commentId: string) => void;
type CommentClickHandler = (comment: ReviewComment) => void;
type CommentSubmitHandler = (text: string, lineNumber: number) => void;

let deleteHandler: CommentDeleteHandler | null = null;
let clickHandler: CommentClickHandler | null = null;
let submitHandler: CommentSubmitHandler | null = null;
let pendingLineNumber: number | null = null;

export function initSidebar(
  onDelete: CommentDeleteHandler,
  onClick: CommentClickHandler,
  onSubmit: CommentSubmitHandler
) {
  deleteHandler = onDelete;
  clickHandler = onClick;
  submitHandler = onSubmit;
}

export function showCommentInput(lineNumber: number) {
  pendingLineNumber = lineNumber;
  const inputArea = document.getElementById("comment-input-area")!;
  const lineLabel = document.getElementById("comment-line-label")!;
  const textarea = document.getElementById("comment-textarea") as HTMLTextAreaElement;

  lineLabel.textContent = `Line ${lineNumber}`;
  inputArea.style.display = "block";
  textarea.value = "";
  textarea.focus();
}

export function hideCommentInput() {
  const inputArea = document.getElementById("comment-input-area")!;
  inputArea.style.display = "none";
  pendingLineNumber = null;
}

export function setupCommentInput() {
  const textarea = document.getElementById("comment-textarea") as HTMLTextAreaElement;
  const submitBtn = document.getElementById("comment-submit-btn");
  const cancelBtn = document.getElementById("comment-cancel-btn");

  submitBtn?.addEventListener("click", () => {
    const text = textarea.value.trim();
    if (text && pendingLineNumber !== null) {
      submitHandler?.(text, pendingLineNumber);
      hideCommentInput();
    }
  });

  cancelBtn?.addEventListener("click", hideCommentInput);

  textarea?.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      hideCommentInput();
    } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      submitBtn?.click();
    }
  });
}

export function renderComments(comments: ReviewComment[]) {
  const container = document.getElementById("comments-list")!;
  container.innerHTML = "";

  if (comments.length === 0) {
    container.innerHTML = '<div class="no-comments">No comments yet</div>';
    return;
  }

  comments.forEach((comment) => {
    const card = createCommentCard(comment);
    container.appendChild(card);
  });
}

function createCommentCard(comment: ReviewComment): HTMLElement {
  const card = document.createElement("div");
  card.className = "comment-card";
  card.dataset.commentId = comment.id;

  card.innerHTML = `
    <div class="comment-header">
      <span class="comment-line">Line ${comment.line_start}</span>
      <button class="delete-btn" title="Delete comment">×</button>
    </div>
    <div class="comment-text">${escapeHtml(comment.text)}</div>
  `;

  card.addEventListener("click", (e) => {
    if (!(e.target as HTMLElement).classList.contains("delete-btn")) {
      clickHandler?.(comment);
    }
  });

  card.querySelector(".delete-btn")?.addEventListener("click", (e) => {
    e.stopPropagation();
    deleteHandler?.(comment.id);
  });

  return card;
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
```

#### 7. Updated HTML Layout
**File**: `file-review/index.html` (replace)

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>File Review</title>
  <link rel="stylesheet" href="/src/styles.css" />
</head>
<body>
  <div id="app">
    <div id="toolbar">
      <div id="toolbar-left">
        <button id="open-file-btn" class="toolbar-btn" title="Open file (⌘O)">
          <span class="icon">📂</span> Open File
        </button>
        <div id="file-name" class="file-name" style="display: none;">
          <span class="icon">📄</span>
          <span class="name"></span>
        </div>
      </div>
      <div id="toolbar-right">
        <button id="vim-toggle" class="toolbar-btn icon-btn" title="Toggle Vim mode (⌘⇧V)">
          <span>VIM</span>
        </button>
        <button id="theme-toggle" class="toolbar-btn icon-btn" title="Toggle theme (⌘T)">
          <span>🌙</span>
        </button>
        <button id="help-btn" class="toolbar-btn icon-btn" title="Shortcuts (⌘/)">
          <span>?</span>
        </button>
      </div>
    </div>
    <div id="main-container">
      <div id="editor-container"></div>
      <div id="sidebar">
        <div id="sidebar-header">Comments</div>

        <!-- Comment input area (hidden by default) -->
        <div id="comment-input-area" style="display: none;">
          <div class="input-header">
            <span id="comment-line-label">Line 0</span>
          </div>
          <textarea
            id="comment-textarea"
            placeholder="Enter your comment... (⌘↵ to submit)"
            rows="4"
          ></textarea>
          <div class="input-actions">
            <button id="comment-cancel-btn" class="cancel-btn">Cancel</button>
            <button id="comment-submit-btn" class="submit-btn">Add Comment</button>
          </div>
        </div>

        <div id="comments-list"></div>
      </div>
    </div>

    <!-- Empty state when no file is open -->
    <div id="empty-state" style="display: none;">
      <div class="empty-content">
        <div class="empty-icon">📝</div>
        <h2>No file open</h2>
        <p>Open a markdown file to start reviewing</p>
        <button id="empty-open-btn" class="primary-btn">Open File</button>
        <div class="shortcut-hint">or press ⌘O</div>
      </div>
    </div>
  </div>
  <script type="module" src="/src/main.ts"></script>
</body>
</html>
```

#### 8. Updated Styles
**File**: `file-review/src/styles.css` (replace with full file)

```css
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

/* Theme variables */
:root {
  --bg-primary: #1e1e1e;
  --bg-secondary: #252526;
  --bg-tertiary: #2d2d2d;
  --bg-hover: #363636;
  --text-primary: #d4d4d4;
  --text-secondary: #858585;
  --border-color: #3c3c3c;
  --accent-color: #0e639c;
  --accent-hover: #1177bb;
  --danger-color: #f48771;
  --highlight-bg: rgba(255, 213, 0, 0.25);
  --highlight-border: #ffd500;
}

body.light-theme {
  --bg-primary: #ffffff;
  --bg-secondary: #f3f3f3;
  --bg-tertiary: #e8e8e8;
  --bg-hover: #d4d4d4;
  --text-primary: #1e1e1e;
  --text-secondary: #6e7681;
  --border-color: #e0e0e0;
  --accent-color: #0066b8;
  --accent-hover: #0055a0;
  --danger-color: #d73a49;
  --highlight-bg: rgba(255, 213, 0, 0.35);
  --highlight-border: #e6a700;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: var(--bg-primary);
  color: var(--text-primary);
  height: 100vh;
  overflow: hidden;
}

#app {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

/* Toolbar */
#toolbar {
  padding: 8px 16px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  min-height: 48px;
}

#toolbar-left, #toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.toolbar-btn {
  padding: 6px 12px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: background 0.15s;
}

.toolbar-btn:hover {
  background: var(--bg-hover);
}

.toolbar-btn.icon-btn {
  padding: 6px 10px;
  font-weight: 600;
}

.toolbar-btn.active {
  background: var(--accent-color);
  border-color: var(--accent-color);
  color: white;
}

.file-name {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  transition: background 0.15s;
}

.file-name:hover {
  background: var(--bg-hover);
}

.file-name .icon {
  font-size: 14px;
}

/* Main container */
#main-container {
  display: flex;
  flex: 1;
  overflow: hidden;
}

#editor-container {
  flex: 7;
  overflow: auto;
}

/* Sidebar */
#sidebar {
  flex: 3;
  min-width: 280px;
  max-width: 400px;
  background: var(--bg-secondary);
  border-left: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
}

#sidebar-header {
  padding: 12px 16px;
  font-weight: 600;
  border-bottom: 1px solid var(--border-color);
  font-size: 14px;
}

/* Comment input area */
#comment-input-area {
  padding: 12px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-tertiary);
}

.input-header {
  margin-bottom: 8px;
  font-size: 12px;
  color: var(--text-secondary);
  font-weight: 500;
}

#comment-textarea {
  width: 100%;
  min-height: 80px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  color: var(--text-primary);
  padding: 10px;
  resize: vertical;
  font-family: inherit;
  font-size: 13px;
  line-height: 1.5;
}

#comment-textarea:focus {
  outline: none;
  border-color: var(--accent-color);
}

#comment-textarea::placeholder {
  color: var(--text-secondary);
}

.input-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 10px;
}

.input-actions button {
  padding: 6px 14px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
}

.cancel-btn {
  background: var(--bg-secondary);
  color: var(--text-primary);
  border: 1px solid var(--border-color) !important;
}

.cancel-btn:hover {
  background: var(--bg-hover);
}

.submit-btn {
  background: var(--accent-color);
  color: white;
}

.submit-btn:hover {
  background: var(--accent-hover);
}

/* Comments list */
#comments-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.comment-card {
  background: var(--bg-tertiary);
  border-radius: 6px;
  padding: 12px;
  margin-bottom: 8px;
  cursor: pointer;
  transition: background 0.15s;
  border: 1px solid transparent;
}

.comment-card:hover {
  background: var(--bg-hover);
  border-color: var(--border-color);
}

.comment-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.comment-line {
  font-size: 11px;
  color: var(--text-secondary);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.delete-btn {
  background: none;
  border: none;
  color: var(--text-secondary);
  font-size: 18px;
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
  opacity: 0.6;
  transition: opacity 0.15s, color 0.15s;
}

.delete-btn:hover {
  color: var(--danger-color);
  opacity: 1;
}

.comment-text {
  font-size: 13px;
  line-height: 1.5;
  white-space: pre-wrap;
  color: var(--text-primary);
}

.no-comments {
  color: var(--text-secondary);
  text-align: center;
  padding: 40px 20px;
  font-size: 13px;
}

/* Comment highlight in editor */
.cm-comment-highlight {
  background: var(--highlight-bg);
  border-bottom: 2px solid var(--highlight-border);
}

/* Empty state */
#empty-state {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-primary);
  z-index: 100;
}

.empty-content {
  text-align: center;
  padding: 40px;
}

.empty-icon {
  font-size: 64px;
  margin-bottom: 16px;
}

.empty-content h2 {
  font-size: 20px;
  font-weight: 600;
  margin-bottom: 8px;
}

.empty-content p {
  color: var(--text-secondary);
  margin-bottom: 24px;
}

.primary-btn {
  padding: 10px 24px;
  background: var(--accent-color);
  border: none;
  color: white;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
}

.primary-btn:hover {
  background: var(--accent-hover);
}

.shortcut-hint {
  margin-top: 12px;
  font-size: 12px;
  color: var(--text-secondary);
}

/* Shortcuts modal */
.shortcuts-modal {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}

.shortcuts-content {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  width: 400px;
  max-height: 80vh;
  overflow: auto;
}

.shortcuts-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid var(--border-color);
}

.shortcuts-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.shortcuts-header .close-btn {
  background: none;
  border: none;
  color: var(--text-secondary);
  font-size: 20px;
  cursor: pointer;
  padding: 4px;
}

.shortcuts-list {
  padding: 12px 16px;
}

.shortcut-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 0;
  border-bottom: 1px solid var(--border-color);
}

.shortcut-item:last-child {
  border-bottom: none;
}

.shortcut-item kbd {
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 4px 10px;
  font-family: 'SF Mono', Monaco, monospace;
  font-size: 12px;
  min-width: 50px;
  text-align: center;
}

.shortcut-item span {
  color: var(--text-secondary);
  font-size: 13px;
}

/* CodeMirror overrides */
.cm-editor {
  height: 100%;
}

.cm-scroller {
  overflow: auto;
}

.cm-editor .cm-content {
  font-family: 'SF Mono', Monaco, Consolas, monospace;
  font-size: 14px;
}
```

#### 9. Updated Main Entry
**File**: `file-review/src/main.ts` (replace)

```typescript
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  initEditor,
  getEditorContent,
  setEditorContent,
  getEditorView,
  getSelection,
  scrollToLine,
  updateTheme,
  updateVimMode,
} from "./editor";
import {
  parseComments,
  insertComment,
  removeComment,
  addHighlight,
  clearHighlights,
  type ReviewComment,
} from "./comments";
import {
  initSidebar,
  renderComments,
  showCommentInput,
  hideCommentInput,
  setupCommentInput,
} from "./sidebar";
import { showFilePicker } from "./file-picker";
import { initShortcuts, showShortcutsHelp } from "./shortcuts";
import {
  loadSavedTheme,
  saveTheme,
  type Theme,
} from "./theme";
import { loadVimSetting, saveVimSetting } from "./vim";

let currentFilePath: string | null = null;
let comments: ReviewComment[] = [];
let currentTheme: Theme = "dark";
let vimEnabled = false;

async function init() {
  // Load saved preferences
  currentTheme = loadSavedTheme();
  vimEnabled = loadVimSetting();

  // Apply theme to body
  document.body.classList.toggle("light-theme", currentTheme === "light");
  updateThemeButton();
  updateVimButton();

  // Initialize sidebar handlers
  initSidebar(handleDeleteComment, handleCommentClick, handleCommentSubmit);
  setupCommentInput();

  // Initialize keyboard shortcuts
  initShortcuts({
    addComment: handleAddCommentShortcut,
    toggleTheme,
    toggleVim,
    openFile: showFilePickerAndLoad,
  });

  // Get file path from Rust state (set from CLI args)
  const filePath = await invoke<string | null>("get_current_file");

  if (filePath) {
    await loadFile(filePath);
    hideEmptyState();
  } else {
    showEmptyState();
  }

  // Listen for save command from menu
  await listen("menu:save", async () => {
    await saveFile();
  });

  // Set up empty state open button
  document.getElementById("empty-open-btn")?.addEventListener("click", showFilePickerAndLoad);
  document.getElementById("open-file-btn")?.addEventListener("click", showFilePickerAndLoad);

  // Set up toolbar buttons
  document.getElementById("theme-toggle")?.addEventListener("click", toggleTheme);
  document.getElementById("vim-toggle")?.addEventListener("click", toggleVim);
  document.getElementById("help-btn")?.addEventListener("click", showShortcutsHelp);
}

function showEmptyState() {
  const emptyState = document.getElementById("empty-state");
  const mainContainer = document.getElementById("main-container");
  if (emptyState) emptyState.style.display = "flex";
  if (mainContainer) mainContainer.style.display = "none";
}

function hideEmptyState() {
  const emptyState = document.getElementById("empty-state");
  const mainContainer = document.getElementById("main-container");
  if (emptyState) emptyState.style.display = "none";
  if (mainContainer) mainContainer.style.display = "flex";
}

async function showFilePickerAndLoad() {
  const filePath = await showFilePicker();
  if (filePath) {
    await loadFile(filePath);
    hideEmptyState();
  }
}

function toggleTheme() {
  currentTheme = currentTheme === "dark" ? "light" : "dark";
  saveTheme(currentTheme);
  document.body.classList.toggle("light-theme", currentTheme === "light");
  updateTheme(currentTheme);
  updateThemeButton();
}

function updateThemeButton() {
  const btn = document.getElementById("theme-toggle");
  if (btn) {
    btn.querySelector("span")!.textContent = currentTheme === "dark" ? "🌙" : "☀️";
  }
}

function toggleVim() {
  vimEnabled = !vimEnabled;
  saveVimSetting(vimEnabled);
  updateVimMode(vimEnabled);
  updateVimButton();
}

function updateVimButton() {
  const btn = document.getElementById("vim-toggle");
  if (btn) {
    btn.classList.toggle("active", vimEnabled);
  }
}

function handleAddCommentShortcut() {
  const selection = getSelection();
  if (!selection || selection.from === selection.to) return;

  const view = getEditorView();
  const line = view.state.doc.lineAt(selection.from);
  showCommentInput(line.number);
}

async function handleCommentSubmit(text: string, lineNumber: number) {
  const content = getEditorContent();
  const [newContent] = await insertComment(content, lineNumber, text);
  setEditorContent(newContent);
  await refreshComments();
}

async function loadFile(path: string) {
  try {
    const content = await invoke<string>("read_file", { path });
    currentFilePath = path;
    await invoke("set_current_file", { path });
    setEditorContent(content);

    // Update file name display
    const fileName = path.split("/").pop() || path;
    document.title = `File Review - ${fileName}`;
    updateFileNameDisplay(path);

    // Parse and display existing comments
    await refreshComments();
  } catch (error) {
    console.error("Failed to load file:", error);
  }
}

function updateFileNameDisplay(path: string) {
  const fileNameEl = document.getElementById("file-name");
  const openBtn = document.getElementById("open-file-btn");

  if (fileNameEl) {
    const nameSpan = fileNameEl.querySelector(".name");
    if (nameSpan) nameSpan.textContent = path.split("/").pop() || path;
    fileNameEl.title = `Click to reveal in Finder: ${path}`;
    fileNameEl.style.display = "flex";
    fileNameEl.onclick = () => revealInFinder(path);
  }
  if (openBtn) openBtn.style.display = "none";
}

async function revealInFinder(path: string) {
  try {
    await invoke("reveal_in_finder", { path });
  } catch (error) {
    console.error("Failed to reveal in Finder:", error);
  }
}

async function saveFile() {
  if (!currentFilePath) return;

  try {
    const content = getEditorContent();
    await invoke("write_file", { path: currentFilePath, content });
    console.log("File saved");
  } catch (error) {
    console.error("Failed to save file:", error);
  }
}

async function refreshComments() {
  const content = getEditorContent();
  comments = await parseComments(content);
  renderComments(comments);

  // Clear and re-add highlights
  const view = getEditorView();
  view.dispatch({ effects: clearHighlights.of() });

  // Add highlights for each comment
  for (const comment of comments) {
    const line = view.state.doc.line(comment.line_start);
    view.dispatch({
      effects: addHighlight.of({
        from: line.from + comment.char_start,
        to: line.from + comment.char_end,
        commentId: comment.id,
      }),
    });
  }
}

function handleDeleteComment(commentId: string) {
  const content = getEditorContent();
  removeComment(content, commentId).then((newContent) => {
    setEditorContent(newContent);
    refreshComments();
  });
}

function handleCommentClick(comment: ReviewComment) {
  scrollToLine(comment.line_start);
}

// Initialize the app
document.addEventListener("DOMContentLoaded", () => {
  initEditor(document.getElementById("editor-container")!);
  init();
});
```

#### 10. Updated Editor with Theme and Vim Support
**File**: `file-review/src/editor.ts` (replace)

```typescript
import {
  EditorView,
  lineNumbers,
  highlightActiveLine,
  keymap,
} from "@codemirror/view";
import { EditorState, Compartment } from "@codemirror/state";
import { markdown } from "@codemirror/lang-markdown";
import { defaultKeymap } from "@codemirror/commands";
import { vim } from "@replit/codemirror-vim";
import { commentHighlightField } from "./comments";
import { getThemeExtension, type Theme } from "./theme";

let editorView: EditorView;
const themeCompartment = new Compartment();
const vimCompartment = new Compartment();

export function initEditor(container: HTMLElement) {
  const startState = EditorState.create({
    doc: "",
    extensions: [
      lineNumbers(),
      highlightActiveLine(),
      markdown(),
      commentHighlightField,
      keymap.of(defaultKeymap),
      themeCompartment.of(getThemeExtension("dark")),
      vimCompartment.of([]),
    ],
  });

  editorView = new EditorView({
    state: startState,
    parent: container,
  });
}

export function updateTheme(theme: Theme) {
  editorView.dispatch({
    effects: themeCompartment.reconfigure(getThemeExtension(theme)),
  });
}

export function updateVimMode(enabled: boolean) {
  editorView.dispatch({
    effects: vimCompartment.reconfigure(enabled ? vim() : []),
  });
}

export function getEditorContent(): string {
  return editorView.state.doc.toString();
}

export function setEditorContent(content: string) {
  editorView.dispatch({
    changes: {
      from: 0,
      to: editorView.state.doc.length,
      insert: content,
    },
  });
}

export function getEditorView(): EditorView {
  return editorView;
}

export function getSelection(): { from: number; to: number } | null {
  const { from, to } = editorView.state.selection.main;
  return { from, to };
}

export function scrollToLine(lineNumber: number) {
  const line = editorView.state.doc.line(lineNumber);
  editorView.dispatch({
    effects: EditorView.scrollIntoView(line.from, { y: "center" }),
  });
}
```

### Success Criteria:

#### Automated Verification:
- [x] Project compiles: `cd file-review && bun run tauri build`
- [x] TypeScript compiles without errors: `cd file-review && bun run check`

#### Manual Verification:
- [x] Theme toggle works (⌘T switches light/dark)
- [x] Theme persists across app restarts
- [x] Vim mode toggle works (⌘⇧V)
- [x] Vim mode persists across app restarts
- [x] ⌘K opens comment input in sidebar when text selected
- [x] ⌘/ shows shortcuts help modal
- [x] ⌘O opens file picker
- [x] File name in toolbar shows current file
- [x] Clicking file name reveals in Finder
- [x] Empty state shown when no file provided
- [x] Empty state "Open File" button works
- [x] Comment input in sidebar works (multiline textarea)
- [x] Ctrl+Enter / Cmd+Enter submits comment from textarea

**Additional Enhancements**:
- Vim visual block mode uses Ctrl+Q instead of Ctrl+V (Ctrl+V is captured by OS for paste)
- Vim statusline shows at bottom of editor when vim mode is enabled
- ⌘K without selection defaults to commenting the current line
- Canceling comment input re-focuses the editor

**Implementation Note**: Phase 3 completed. Proceed to Phase 4.

---

## Phase 4: Polish & Integration

### Overview
Add Claude Code plugin integration and finalize the build/distribution.

### Changes Required:

#### 1. Update Rust Commands
**File**: `file-review/src-tauri/src/lib.rs` (add reveal_in_finder to handler)

```rust
.invoke_handler(tauri::generate_handler![
    file_ops::read_file,
    file_ops::write_file,
    file_ops::set_current_file,
    file_ops::get_current_file,
    file_ops::reveal_in_finder,
    comments::parse_comments,
    comments::insert_comment,
    comments::remove_comment,
])
```

#### 2. Tauri Configuration
**File**: `file-review/src-tauri/tauri.conf.json`

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "file-review",
  "version": "1.0.0",
  "identifier": "com.desplega.file-review",
  "build": {
    "beforeDevCommand": "bun run dev",
    "devUrl": "http://localhost:1420",
    "beforeBuildCommand": "bun run build",
    "frontendDist": "../dist"
  },
  "app": {
    "windows": [
      {
        "title": "File Review",
        "width": 1200,
        "height": 800,
        "minWidth": 800,
        "minHeight": 600
      }
    ],
    "security": {
      "csp": null
    }
  },
  "bundle": {
    "active": true,
    "targets": ["app", "dmg"],
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ]
  }
}
```

#### 3. Create Claude Code Plugin
**Directory**: `cc-plugin/file-review/`

**File**: `cc-plugin/file-review/.claude-plugin/plugin.json`
```json
{
  "name": "file-review",
  "description": "Launch file-review GUI for reviewing markdown files with inline comments",
  "version": "1.0.0",
  "author": {
    "name": "desplega.ai"
  }
}
```

**File**: `cc-plugin/file-review/commands/file-review.md`
```markdown
---
description: Open a file in the file-review GUI for adding inline comments
argument-hint: <file_path>
---

# File Review

Launch the file-review tool to add inline review comments to a markdown file.

## Instructions

When the user invokes `/file-review <path>`:

1. **Verify the file exists**:
   - Check that the file path is valid
   - Ensure it's a markdown file (.md)

2. **Launch the file-review GUI**:
   ```bash
   file-review "<absolute_path>" &
   ```

   Note: The `&` runs it in the background so Claude can continue.

3. **Inform the user**:
   Tell the user: "I've opened the file-review tool. Use ⌘K to add comments, ⌘S to save, and ⌘Q to quit when done."

4. **Wait for user confirmation**:
   Ask the user to let you know when they're done reviewing.

5. **Parse the comments**:
   Once the user confirms, read the file and extract all `<!-- review(...) -->` comments.

6. **Present the comments**:
   Display the extracted comments to the user in a readable format.

## Keyboard Shortcuts Reference

- ⌘K - Add comment to selection
- ⌘S - Save file
- ⌘Q - Quit application
- ⌘/ - Show all shortcuts
- ⌘T - Toggle theme
- ⌘⇧V - Toggle vim mode
- ⌘O - Open file

## Example

User: `/file-review thoughts/shared/research/my-doc.md`

Claude:
1. Launches: `file-review "/path/to/thoughts/shared/research/my-doc.md" &`
2. Says: "I've opened the file-review tool for my-doc.md. Use ⌘K to add comments to selected text, ⌘S to save, and ⌘Q to quit. Let me know when you're finished!"
3. After user confirms: Reads file, extracts comments, displays them
```

### Success Criteria:

#### Automated Verification:
- [x] Build succeeds: `cd file-review && bun run tauri build`
- [x] Binary exists: `ls file-review/src-tauri/target/release/file-review`
- [x] Binary runs: `./file-review/src-tauri/target/release/file-review`

#### Manual Verification:
- [x] `file-review path/to/file.md` opens the GUI with the file loaded
- [x] `file-review` (no args) shows empty state with file picker
- [x] Full workflow works: open file, add comment, save, quit, reopen to verify comment persists
- [x] Claude Code plugin installs correctly
- [x] `/file-review` command works in Claude Code

**Implementation Note**: After completing this phase, the file-review tool is ready for use.

---

## Testing Strategy

### Unit Tests:
- Comment parsing regex handles edge cases (multiline, nested brackets)
- UUID generation produces valid 8-character IDs
- File operations handle errors gracefully
- Theme persistence works correctly
- Vim mode persistence works correctly

### Integration Tests:
- Full workflow: open file → add comment → save → reopen → comment persists
- Multiple comments on same file
- Comment deletion removes from both file and UI
- Theme switching updates all UI elements
- Vim mode enables/disables correctly

### Manual Testing Steps:
1. Build and launch app without arguments → empty state appears
2. Click "Open File" → file picker opens
3. Select a markdown file → file loads, empty state hides
4. Select text on line 5, press ⌘K → comment input appears in sidebar
5. Type comment, press ⌘↵ → comment added, appears in list
6. Verify yellow highlight appears in editor
7. Press ⌘/ → shortcuts modal appears
8. Press ⌘T → theme toggles
9. Press ⌘S to save
10. Press ⌘Q to quit
11. Reopen same file, verify comment persists
12. Click file name → Finder opens with file selected
13. Click comment in sidebar → editor scrolls to line
14. Delete comment → removed from both sidebar and file

## Performance Considerations

- CodeMirror handles large files efficiently
- Comment parsing only runs on file load and save
- No real-time sync or network operations
- Theme/vim preferences loaded from localStorage

## References

- Research document: `thoughts/shared/research/2026-01-13-file-review-tool-implementation-plan.md`
- Tauri v2 docs: https://v2.tauri.app/
- CodeMirror 6 docs: https://codemirror.net/docs/
- CodeMirror Vim extension: https://github.com/replit/codemirror-vim
- Existing Hive comment parser: `hive/src/main/comment-parser.ts`
