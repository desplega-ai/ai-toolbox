---
date: 2026-01-13T21:30:00-08:00
researcher: claude
git_commit: e5b9a79
branch: main
repository: ai-toolbox
topic: "File Review Tool Implementation Plan"
tags: [research, implementation-plan, tauri, file-review, claude-code-skill]
status: complete
last_updated: 2026-01-13
last_updated_by: claude
---

# File Review Tool - Implementation Plan

**Date**: 2026-01-13
**Goal**: Build a Tauri-based GUI tool for reviewing markdown files with inline comments, integrated with Claude Code.

---

## Overview

A simple file review tool that:
1. Opens a markdown file with line numbers
2. Allows adding comments to lines/text selections (Google Docs style)
3. Saves comments as HTML comments: `<!-- review(<uuid>): <text> -->`
4. Works with Cmd/Ctrl+S (save) and Cmd/Ctrl+Q (quit)
5. Integrates with Claude Code as a `/file-review` skill

---

## Phase 1: Project Setup

### 1.1 Create Tauri Project
```bash
# In ai-toolbox root
mkdir tools/file-review
cd tools/file-review
npm create tauri-app@latest . -- --template vanilla-ts
```

**Configuration:**
- Project name: `file-review`
- Bundle ID: `com.desplega.file-review`
- Frontend: Vanilla TypeScript (lightest weight)

### 1.2 Add Dependencies

**Rust (src-tauri/Cargo.toml):**
```toml
[dependencies]
tauri = { version = "2", features = ["tray-icon"] }
tauri-plugin-dialog = "2"
tauri-plugin-fs = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
uuid = { version = "1", features = ["v4"] }
```

**Frontend (package.json):**
```json
{
  "dependencies": {
    "@tauri-apps/api": "^2",
    "@tauri-apps/plugin-dialog": "^2",
    "@tauri-apps/plugin-fs": "^2",
    "codemirror": "^6",
    "@codemirror/lang-markdown": "^6",
    "@codemirror/view": "^6",
    "@codemirror/state": "^6"
  }
}
```

### 1.3 Project Structure
```
tools/file-review/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── index.html
├── src/
│   ├── main.ts              # Entry point
│   ├── editor.ts            # CodeMirror setup
│   ├── comments.ts          # Comment management
│   ├── sidebar.ts           # Comment sidebar UI
│   └── styles.css           # Styling
└── src-tauri/
    ├── Cargo.toml
    ├── tauri.conf.json
    ├── capabilities/
    │   └── default.json
    └── src/
        ├── lib.rs            # Main Tauri code
        ├── main.rs           # Desktop entry
        ├── file_ops.rs       # File operations
        └── comments.rs       # Comment parsing
```

---

## Phase 2: Rust Backend

### 2.1 File Operations (src-tauri/src/file_ops.rs)

**Commands to implement:**
- `read_file(path: String) -> Result<String, String>` - Read file content
- `write_file(path: String, content: String) -> Result<(), String>` - Save file
- `get_file_path() -> Option<String>` - Get currently open file path

### 2.2 Keyboard Shortcuts (src-tauri/src/lib.rs)

**Menu with accelerators:**
```rust
let save_item = MenuItemBuilder::new("Save")
    .id("save")
    .accelerator("CmdOrCtrl+S")
    .build(app)?;

let quit_item = MenuItemBuilder::new("Quit")
    .id("quit")
    .accelerator("CmdOrCtrl+Q")
    .build(app)?;
```

**Event handling:**
- `save` → emit `menu:save` to frontend
- `quit` → close application

### 2.3 Comment Parsing (src-tauri/src/comments.rs)

**Data structures:**
```rust
#[derive(Serialize, Deserialize)]
pub struct ReviewComment {
    pub id: String,           // UUID (8 chars)
    pub text: String,         // Comment content
    pub line_start: usize,    // Starting line (1-indexed)
    pub line_end: usize,      // Ending line (1-indexed)
    pub char_start: usize,    // Character offset in line
    pub char_end: usize,      // Character offset end
}
```

**Commands:**
- `parse_comments(content: String) -> Vec<ReviewComment>` - Extract comments from file
- `insert_comment(content: String, comment: ReviewComment) -> String` - Add comment to file
- `remove_comment(content: String, comment_id: String) -> String` - Remove comment

---

## Phase 3: Frontend UI

### 3.1 Layout (index.html)
```html
<div id="app">
  <div id="editor-container">
    <!-- CodeMirror editor -->
  </div>
  <div id="sidebar">
    <div id="comments-list">
      <!-- Comment cards -->
    </div>
  </div>
</div>
```

**CSS Grid layout:**
- Editor: 70% width
- Sidebar: 30% width, scrollable
- Comments aligned vertically with their anchor lines

### 3.2 CodeMirror Setup (src/editor.ts)

**Extensions:**
```typescript
import { EditorView, lineNumbers, highlightActiveLine } from "@codemirror/view";
import { EditorState, StateField, StateEffect } from "@codemirror/state";
import { markdown } from "@codemirror/lang-markdown";

const extensions = [
  lineNumbers(),
  highlightActiveLine(),
  markdown(),
  commentHighlightExtension, // Custom: highlight commented text
  selectionListener,         // Custom: detect text selection for new comments
];
```

### 3.3 Comment Highlight Extension (src/comments.ts)

**StateEffect for adding highlights:**
```typescript
const addCommentHighlight = StateEffect.define<{
  from: number;
  to: number;
  commentId: string;
}>();

const commentHighlightField = StateField.define({
  create() { return Decoration.none; },
  update(value, tr) {
    value = value.map(tr.changes);
    for (let effect of tr.effects) {
      if (effect.is(addCommentHighlight)) {
        const deco = Decoration.mark({
          class: "cm-comment-highlight",
          attributes: { "data-comment-id": effect.value.commentId }
        });
        value = value.update({ add: [deco.range(effect.value.from, effect.value.to)] });
      }
    }
    return value;
  },
  provide: f => EditorView.decorations.from(f)
});
```

### 3.4 Sidebar (src/sidebar.ts)

**Comment card component:**
```typescript
function createCommentCard(comment: ReviewComment): HTMLElement {
  const card = document.createElement('div');
  card.className = 'comment-card';
  card.dataset.commentId = comment.id;
  card.innerHTML = `
    <div class="comment-header">Line ${comment.line_start}</div>
    <div class="comment-text">${comment.text}</div>
    <button class="delete-btn">Delete</button>
  `;
  return card;
}
```

**Positioning:** Use `getBoundingClientRect()` on highlighted spans to align sidebar cards.

### 3.5 Add Comment Flow

1. User selects text in editor
2. "Add Comment" button appears (floating near selection)
3. User clicks button → input popup opens
4. User types comment and confirms
5. Frontend:
   - Generates UUID (8 chars)
   - Calculates line/char positions
   - Calls `invoke('insert_comment', ...)` to update file content
   - Adds highlight decoration
   - Adds card to sidebar
6. File is NOT auto-saved (only on Cmd/Ctrl+S)

---

## Phase 4: Comment Format

### 4.1 HTML Comment Syntax
```
<!-- review(<id>): <text> -->
```

**Examples:**
```markdown
This is some text<!-- review(a1b2c3d4): This needs clarification --> that continues.

<!-- review(e5f6g7h8):
Multi-line comment
spanning several lines
-->
```

### 4.2 Parsing Regex
```rust
let re = Regex::new(r"<!--\s*review\(([a-zA-Z0-9]+)\):\s*([\s\S]*?)\s*-->")?;
```

### 4.3 Insertion Strategy
- Insert comment AFTER the selected text (inline)
- For line comments (no selection), insert at end of line

---

## Phase 5: Claude Code Integration

### 5.1 Create Plugin Structure
```
cc-plugin/file-review/
├── .claude-plugin/
│   └── plugin.json
├── commands/
│   └── file-review.md
└── README.md
```

### 5.2 plugin.json
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

### 5.3 file-review.md Command
```markdown
---
description: Open a file in the review GUI for adding comments
argument-hint: <file_path>
---

# File Review

Launch the file-review tool to add inline review comments to a file.

## Usage

/file-review path/to/file.md

## What Happens

1. Launch the file-review GUI tool in the background
2. Wait for the user to finish reviewing (the tool will close)
3. Read the updated file to extract <!-- review(...) --> comments
4. Present the comments to the user

## Implementation

1. **Launch the tool:**
   ```bash
   file-review "$ARGUMENTS" &
   ```

2. **Wait for file changes:** Use the notify crate or poll the file

3. **Parse comments:** When the file is saved, extract review comments

4. **Present to user:** Display the comments found in the file
```

### 5.4 Integration Workflow

```
User: /file-review thoughts/shared/my-doc.md

Claude:
1. Checks if file-review binary exists
2. Launches: file-review thoughts/shared/my-doc.md &
3. Informs user: "Opening file-review... Close the app when done."
4. Polls file for changes (or uses notify)
5. When file changes detected, reads and parses comments
6. Displays: "Found 3 review comments: ..."
```

---

## Phase 6: Build & Distribution

### 6.1 Build Commands
```bash
cd tools/file-review

# Development
npm run tauri dev

# Production build
npm run tauri build
```

### 6.2 Binary Location
After build: `tools/file-review/src-tauri/target/release/file-review`

### 6.3 Installation
Add to PATH or create symlink:
```bash
ln -s $(pwd)/tools/file-review/src-tauri/target/release/file-review ~/.local/bin/file-review
```

---

## Implementation Order

### Sprint 1: Core Foundation
- [ ] Create Tauri project scaffold
- [ ] Set up basic HTML/CSS layout
- [ ] Implement file read/write commands
- [ ] Add CodeMirror with line numbers
- [ ] Implement Cmd/Ctrl+S and Cmd/Ctrl+Q shortcuts

### Sprint 2: Comment System
- [ ] Implement comment parsing in Rust
- [ ] Create comment highlight decoration in CodeMirror
- [ ] Build sidebar UI component
- [ ] Implement "Add Comment" on text selection
- [ ] Implement comment insertion into file content

### Sprint 3: Polish & Integration
- [ ] Sidebar positioning aligned with editor lines
- [ ] Delete comment functionality
- [ ] Create Claude Code plugin files
- [ ] Test end-to-end workflow
- [ ] Build and distribute binary

---

## Technical Notes

### Cross-Platform Considerations
- Keyboard shortcuts: Use `CmdOrCtrl` prefix (Tauri handles this)
- File paths: Use `PathBuf` in Rust, handle both `/` and `\`
- Binary naming: `file-review` (Unix), `file-review.exe` (Windows)

### Performance
- Use `notify-debouncer-full` for file watching (avoids duplicate events)
- CodeMirror is efficient for large files
- Only parse comments on file load and save, not on every keystroke

### Error Handling
- File not found → Show error dialog
- Permission denied → Show error dialog
- Invalid comment syntax → Ignore malformed comments, log warning

---

## Success Criteria

1. **Opens file**: Can open any .md file with line numbers displayed
2. **Add comment**: Can select text and add a comment
3. **Save file**: Cmd/Ctrl+S saves file with embedded `<!-- review() -->` comments
4. **Close app**: Cmd/Ctrl+Q closes the application
5. **Claude integration**: `/file-review <path>` launches the tool and reports comments

---

## Research References

This plan is based on comprehensive research conducted on 2026-01-13:

### Tauri Framework
- Project structure: `src-tauri/` for Rust, root for frontend
- Plugins: `tauri-plugin-dialog`, `tauri-plugin-fs`
- Keyboard shortcuts: `MenuItemBuilder` with `accelerator("CmdOrCtrl+S")`
- IPC: `#[tauri::command]` + `invoke()` from frontend

### CodeMirror 6
- Line numbers: `lineNumbers()` extension
- Decorations: `StateField` + `StateEffect` + `Decoration.mark`
- Selection: `EditorView.updateListener` for detecting selection changes

### Comment Sidebar Patterns
- TipTap comment extension pattern for anchoring
- `getBoundingClientRect()` for positioning sidebar cards
- Remirror AnnotationExtension for reference

### File Watching
- `notify` crate (v8.2.0) for cross-platform file system events
- `notify-debouncer-full` for intelligent event debouncing
- `interprocess` crate for IPC between processes

### Claude Code Skills
- Plugin structure: `.claude-plugin/plugin.json` + `commands/*.md`
- Frontmatter: `description`, `argument-hint`, `allowed-tools`
- Launch external tools via Bash commands

---

## Resources

- [Tauri v2 Documentation](https://v2.tauri.app/)
- [CodeMirror 6 Documentation](https://codemirror.net/docs/)
- [Tauri Dialog Plugin](https://v2.tauri.app/plugin/dialog/)
- [Tauri FS Plugin](https://v2.tauri.app/plugin/file-system/)
- [notify crate](https://docs.rs/notify/)
- [TipTap Comment Extension](https://github.com/sereneinserenade/tiptap-comment-extension)
