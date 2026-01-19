---
date: 2026-01-19T12:00:00Z
topic: "File-Review Markdown Pretty-Print"
status: draft
---

# File-Review Markdown Pretty-Print Implementation Plan

## Overview

Add automatic markdown pretty-printing (rendered HTML view) to file-review when viewing `.md` files, with the ability to toggle between raw and rendered modes. The user's preferred mode will be persisted in config.

## Current State Analysis

- **Editor**: CodeMirror 6 with `@codemirror/lang-markdown` for syntax highlighting
- **Config**: Stored in `~/.file-reviewer.json` with fields: `theme`, `vim_mode`, `font_size`, `window`
- **Comment System**: Review comments use HTML comment markers (`<!-- REVIEW:id:start -->...<!-- REVIEW:id:end:comment text -->`)
- **Modes**: Works in both Tauri (desktop) and web server modes

### Key Discoveries:
- Editor initialization: `file-review/src/editor.ts:35-56`
- Config structure: `file-review/src-tauri/src/config.rs:12-18`
- Main app flow: `file-review/src/main.ts:74-190`
- Comment parsing: `file-review/src/comments.ts` (uses Rust backend)

## Desired End State

1. When a `.md` file is opened, show rendered HTML by default (configurable)
2. User can toggle between raw (CodeMirror) and rendered (HTML) views via toolbar button
3. Review comments are highlighted in BOTH views
4. Preference (`markdown_raw: boolean`) persisted in config
5. Sidebar comment list works in both modes

## Quick Verification Reference

Common commands to verify the implementation:
- `bun run check` - TypeScript type checking
- `bun run dev` - Run in Tauri dev mode
- `bun run dev:web` - Run in web server mode

Key files to check:
- `file-review/src/markdown-preview.ts` (new file)
- `file-review/src/main.ts` (view toggle logic)
- `file-review/src/config.ts` (new config field)
- `file-review/src-tauri/src/config.rs` (Rust config)

## What We're NOT Doing

- Split-pane view (raw + rendered side-by-side)
- Live preview while typing (this is a review tool, not an editor)
- Custom markdown extensions beyond standard GFM
- Syntax highlighting for code blocks in rendered view (could be added later)

## Implementation Approach

Use `marked` library for markdown rendering. Create a new preview container that shows rendered HTML, hidden by default. Toggle between CodeMirror editor and preview container based on view mode. Parse review comments and inject highlight styling into rendered HTML.

## Phase 1: Add Config Support

### Overview
Add `markdown_raw` config option to persist the user's view mode preference.

### Changes Required:

#### 1. TypeScript Config Interface
**File**: `file-review/src/config.ts`
**Changes**: Add `markdown_raw` field to `AppConfig` interface

```typescript
export interface AppConfig {
  theme: "dark" | "light";
  vim_mode: boolean;
  font_size: number;
  markdown_raw: boolean;  // NEW: true = raw CodeMirror, false = rendered
  window: WindowConfig;
}
```

#### 2. Rust Config Struct
**File**: `file-review/src-tauri/src/config.rs`
**Changes**: Add `markdown_raw` field with default `false`

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub theme: String,
    pub vim_mode: bool,
    #[serde(default = "default_font_size")]
    pub font_size: u32,
    #[serde(default)]  // defaults to false
    pub markdown_raw: bool,
    pub window: WindowConfig,
}
```

### Success Criteria:

#### Automated Verification:
- [ ] `bun run check` passes (TypeScript types)
- [ ] `cargo check --manifest-path file-review/src-tauri/Cargo.toml` passes

#### Manual Verification:
- [ ] App loads without errors
- [ ] Existing config files load correctly (new field defaults to `false`)

**Implementation Note**: After completing this phase, pause for manual confirmation.

---

## Phase 2: Add Marked Library & Preview Component

### Overview
Install `marked` and create the markdown preview rendering component.

### Changes Required:

#### 1. Install marked
**File**: `file-review/package.json`
**Changes**: Add `marked` dependency

```bash
cd file-review && bun add marked && bun add -d @types/marked
```

#### 2. Create Preview Module
**File**: `file-review/src/markdown-preview.ts` (NEW)
**Changes**: Create markdown rendering module with comment highlighting

```typescript
import { marked } from 'marked';
import type { ReviewComment } from './comments';

let previewContainer: HTMLElement | null = null;

export function initPreview(container: HTMLElement) {
  previewContainer = container;
}

export function renderMarkdown(content: string, comments: ReviewComment[]): string {
  // Pre-process: Replace review comment markers with styled spans
  let processedContent = content;

  for (const comment of comments) {
    // Extract the highlighted text section and wrap it
    // This needs to handle both inline and block comments
  }

  // Render markdown to HTML
  const html = marked.parse(processedContent, {
    gfm: true,
    breaks: true,
  });

  return html;
}

export function updatePreview(content: string, comments: ReviewComment[]) {
  if (!previewContainer) return;

  const html = renderMarkdown(content, comments);
  previewContainer.innerHTML = html;
}

export function scrollPreviewToComment(commentId: string) {
  if (!previewContainer) return;

  const element = previewContainer.querySelector(`[data-comment-id="${commentId}"]`);
  element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
```

#### 3. Add Preview Container to HTML
**File**: `file-review/index.html`
**Changes**: Add preview container next to editor container

```html
<div id="main-container">
  <div id="editor-container"></div>
  <div id="preview-container" style="display: none;"></div>
  <div id="sidebar">
    <!-- existing sidebar content -->
  </div>
</div>
```

#### 4. Add Preview Styles
**File**: `file-review/src/styles.css`
**Changes**: Add styles for preview container and comment highlights

```css
#preview-container {
  flex: 1;
  overflow-y: auto;
  padding: 20px 40px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  line-height: 1.6;
}

#preview-container h1, #preview-container h2, #preview-container h3 {
  margin-top: 1.5em;
  margin-bottom: 0.5em;
}

#preview-container code {
  background: var(--bg-secondary);
  padding: 0.2em 0.4em;
  border-radius: 3px;
  font-family: monospace;
}

#preview-container pre {
  background: var(--bg-secondary);
  padding: 1em;
  border-radius: 6px;
  overflow-x: auto;
}

/* Comment highlights in preview */
.review-comment-highlight {
  background: rgba(255, 200, 0, 0.2);
  border-left: 3px solid #ffc800;
  padding-left: 8px;
  cursor: pointer;
}

.review-comment-highlight:hover {
  background: rgba(255, 200, 0, 0.3);
}

/* Light theme adjustments */
.light-theme #preview-container {
  color: #333;
}
```

### Success Criteria:

#### Automated Verification:
- [ ] `bun run check` passes
- [ ] `bun run build` completes

#### Manual Verification:
- [ ] Preview module imports without errors

**Implementation Note**: After completing this phase, pause for manual confirmation.

---

## Phase 3: Implement View Toggle Logic

### Overview
Add toolbar button and logic to toggle between raw and preview modes.

### Changes Required:

#### 1. Add Toggle Button to HTML
**File**: `file-review/index.html`
**Changes**: Add markdown view toggle button in toolbar

```html
<button id="markdown-toggle" class="toolbar-btn icon-btn" title="Toggle markdown view (Cmd+M)" style="display: none;">
  <span>MD</span>
</button>
```

#### 2. Update Main Module
**File**: `file-review/src/main.ts`
**Changes**:
- Import preview module
- Add view mode state
- Implement toggle logic
- Update file load to check for `.md` extension
- Wire up toolbar button

Key additions:
```typescript
import { initPreview, updatePreview, scrollPreviewToComment } from './markdown-preview';

let isMarkdownFile = false;
let isRawMode = false;  // false = pretty, true = raw

// In init():
initPreview(document.getElementById('preview-container')!);

// Toggle function:
async function toggleMarkdownView() {
  if (!isMarkdownFile) return;

  isRawMode = !isRawMode;
  appConfig.markdown_raw = isRawMode;
  await saveConfig(appConfig);

  updateViewMode();
}

function updateViewMode() {
  const editorContainer = document.getElementById('editor-container')!;
  const previewContainer = document.getElementById('preview-container')!;
  const toggleBtn = document.getElementById('markdown-toggle');

  if (isRawMode) {
    editorContainer.style.display = 'block';
    previewContainer.style.display = 'none';
    toggleBtn?.classList.remove('active');
  } else {
    editorContainer.style.display = 'none';
    previewContainer.style.display = 'block';
    toggleBtn?.classList.add('active');
    updatePreview(getEditorContent(), comments);
  }
}

// In loadFile():
isMarkdownFile = path.endsWith('.md');
const toggleBtn = document.getElementById('markdown-toggle');
if (toggleBtn) {
  toggleBtn.style.display = isMarkdownFile ? 'flex' : 'none';
}

if (isMarkdownFile) {
  isRawMode = appConfig.markdown_raw;
  updateViewMode();
}
```

#### 3. Update Shortcuts
**File**: `file-review/src/shortcuts.ts`
**Changes**: Add Cmd+M shortcut for toggle

### Success Criteria:

#### Automated Verification:
- [ ] `bun run check` passes

#### Manual Verification:
- [ ] Opening `.md` file shows rendered view by default
- [ ] MD toggle button appears for `.md` files
- [ ] Clicking toggle switches between raw and rendered
- [ ] Preference persists after reload

**Implementation Note**: After completing this phase, pause for manual confirmation.

---

## Phase 4: Comment Highlighting in Preview

### Overview
Ensure review comments are visible and interactive in the rendered preview.

### Changes Required:

#### 1. Comment Processing in Preview
**File**: `file-review/src/markdown-preview.ts`
**Changes**: Process review comment markers before rendering

The challenge: Review comments use HTML comment markers which are stripped by markdown rendering. We need to:
1. Parse comments from raw content
2. Track their positions relative to the text
3. Inject highlight markers into the rendered HTML

Strategy:
- Use the parsed `ReviewComment[]` which includes `highlight_start` and `highlight_end` positions
- Before rendering, replace the comment regions with special markers
- After rendering, the markers become clickable highlighted regions

#### 2. Connect Sidebar to Preview
**File**: `file-review/src/main.ts`
**Changes**: Update `handleCommentClick` to work with preview mode

```typescript
function handleCommentClick(comment: ReviewComment) {
  if (isRawMode || !isMarkdownFile) {
    scrollToPosition(comment.highlight_start);
  } else {
    scrollPreviewToComment(comment.id);
  }
}
```

#### 3. Sync Preview After Comment Changes
**File**: `file-review/src/main.ts`
**Changes**: Update `refreshComments` to also update preview

```typescript
async function refreshComments() {
  const content = getEditorContent();
  comments = await parseComments(content);
  renderComments(comments);

  // Update preview if in pretty mode
  if (isMarkdownFile && !isRawMode) {
    updatePreview(content, comments);
  }

  // ... existing highlight logic for raw mode
}
```

### Success Criteria:

#### Automated Verification:
- [ ] `bun run check` passes

#### Manual Verification:
- [ ] Comments visible as highlighted regions in preview
- [ ] Clicking sidebar comment scrolls to highlight in preview
- [ ] Adding comment in raw mode, switching to preview shows highlight
- [ ] Works in both Tauri and web modes

**Implementation Note**: After completing this phase, pause for manual confirmation.

---

## Testing Strategy

### Unit Tests
- None required (no test framework currently in place)

### Manual Testing Checklist

1. **Basic Toggle**
   - [ ] Open a `.md` file - should show rendered view
   - [ ] Click MD button - switches to raw
   - [ ] Click again - back to rendered
   - [ ] Cmd+M shortcut works

2. **Persistence**
   - [ ] Set to raw mode, close and reopen - stays raw
   - [ ] Check `~/.file-reviewer.json` contains `markdown_raw: true`

3. **Comments in Both Modes**
   - [ ] Add comment in raw mode - visible in sidebar
   - [ ] Switch to rendered - comment highlighted
   - [ ] Click sidebar comment - scrolls to highlight in preview
   - [ ] Delete comment - highlight removed in both views

4. **Non-Markdown Files**
   - [ ] Open `.ts` file - no MD toggle button
   - [ ] Should use raw CodeMirror only

5. **Edge Cases**
   - [ ] Empty markdown file
   - [ ] Markdown with only comments (no prose)
   - [ ] Very long files (scroll performance)
   - [ ] Web mode (`--web` flag)

## References

- Current implementation: `file-review/src/main.ts`
- Config system: `file-review/src-tauri/src/config.rs`
- Comment system: `file-review/src/comments.ts`
- Marked library docs: https://marked.js.org/
