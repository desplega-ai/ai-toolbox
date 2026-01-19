---
date: 2026-01-19T16:00:00Z
topic: "File-Review Markdown Preview v2 - Fixes and Interactive Commenting"
status: draft
prior_work: thoughts/shared/plans/2026-01-19-file-review-markdown-pretty-print.md
---

# File-Review Markdown Preview v2 Implementation Plan

## Overview

This plan addresses three critical issues with the markdown preview feature implemented in v1:

1. **Comment highlights not visible in rendered mode** - The highlight spans are being injected but markdown parsing strips them in certain contexts
2. **Tables are broken** - Markdown tables fail to render properly when they contain comment markers
3. **Need interactive row/element commenting in preview mode** - Add hover-to-comment affordance and bidirectional scroll sync

## Prior Work Reference

The original implementation plan is at `thoughts/shared/plans/2026-01-19-file-review-markdown-pretty-print.md`. It successfully implemented:
- Toggle between raw CodeMirror and rendered HTML view
- Basic comment marker processing
- Sidebar comment list that works in both modes
- Config persistence for view mode preference

## Problem Analysis

### Issue 1: Comment Highlights Not Visible

**Root Cause Analysis:**

Looking at `/Users/taras/Documents/code/ai-toolbox/file-review/src/markdown-preview.ts` lines 24-50, the current approach:

```typescript
// Current approach - wraps highlighted text in span BEFORE markdown parsing
const replacement = `<span class="review-comment-highlight" data-comment-id="${comment.id}">${highlightedText}</span>`;
```

**Problem**: Markdown parsing treats inline HTML specially. When a `<span>` is inserted:
1. Inside a paragraph - works fine
2. Spanning across block elements - the span gets broken up or stripped
3. Inside table cells - can break table structure
4. Around list items - breaks list parsing

**Example failure cases:**
```markdown
<!-- REVIEW:abc:start -->| Cell 1 | Cell 2 |<!-- REVIEW:abc:end:comment -->
```
The span wrapping breaks the table pipe syntax.

```markdown
<!-- REVIEW:abc:start -->
## Heading

Paragraph text
<!-- REVIEW:abc:end:comment -->
```
The span cannot wrap block elements properly.

### Issue 2: Tables Are Broken

**Root Cause**: Comment markers inside table rows break the pipe-based syntax:

```markdown
| Col 1 | Col 2 |
|-------|-------|
| <!-- REVIEW:id:start -->Data<!-- REVIEW:id:end:text --> | More |
```

When we replace with `<span>...</span>`, the resulting:
```markdown
| Col 1 | Col 2 |
|-------|-------|
| <span class="...">Data</span> | More |
```
...is valid, BUT the issue is when the comment spans the entire row or multiple cells.

### Issue 3: No Interactive Commenting in Preview Mode

Currently:
- Users can only add comments in raw mode
- No way to click/hover on elements in preview to add comments
- Preview is read-only for commenting purposes

## Desired End State

1. **Visible highlights**: All comment highlights show correctly in rendered preview, regardless of whether they wrap inline text, block elements, or table content
2. **Working tables**: Tables render correctly even when containing comment markers
3. **Interactive preview commenting**:
   - Hover over any paragraph/heading/list-item/table-row shows "+" button
   - Click "+" opens comment input targeting that element
   - Comment is inserted at the correct position in raw markdown
4. **Bidirectional scroll sync**:
   - Clicking sidebar comment scrolls preview to highlight (existing)
   - Clicking highlight in preview highlights sidebar comment (existing)
   - NEW: All elements have data attributes for position mapping

## Quick Verification Reference

```bash
# TypeScript type checking
bun run check

# Development (Tauri)
bun run dev

# Development (web mode)
bun run dev:web
```

Key files:
- `file-review/src/markdown-preview.ts` - Main rendering logic
- `file-review/src/main.ts` - View mode and comment handling
- `file-review/src/styles.css` - Preview and highlight styles

---

## Phase 1: Fix Comment Highlight Rendering (Post-Render Injection)

### Overview

Instead of injecting highlight spans before markdown parsing (which breaks structure), we will:
1. Parse markdown first (clean, without comment markers)
2. Track source positions through the rendering
3. Inject highlights after rendering using DOM manipulation

### Technical Approach

Use `marked`'s token-based rendering with position tracking:

1. **Pre-process**: Extract comment regions and store them separately
2. **Clean render**: Render markdown without comment markers
3. **Post-process**: Traverse the rendered DOM, match text nodes to source positions, and wrap matched regions with highlight spans

### Changes Required

#### 1. Update markdown-preview.ts with Two-Pass Rendering

**File**: `/Users/taras/Documents/code/ai-toolbox/file-review/src/markdown-preview.ts`

```typescript
import { marked, Renderer, Tokenizer } from 'marked';
import type { ReviewComment } from './comments';

let previewContainer: HTMLElement | null = null;

// Store mapping from rendered elements to source positions
interface SourceMapping {
  element: HTMLElement;
  sourceStart: number;
  sourceEnd: number;
}

let sourceMappings: SourceMapping[] = [];

export function initPreview(container: HTMLElement) {
  previewContainer = container;
}

interface CommentRegion {
  id: string;
  text: string;
  sourceStart: number; // Position in ORIGINAL content (with markers)
  sourceEnd: number;
  cleanStart: number;  // Position in CLEAN content (without markers)
  cleanEnd: number;
}

/**
 * Extract comment regions and return clean content + region info
 */
function extractCommentRegions(content: string, comments: ReviewComment[]): {
  cleanContent: string;
  regions: CommentRegion[];
} {
  const regions: CommentRegion[] = [];
  let cleanContent = content;
  let offset = 0;  // Track how much we've removed

  // Sort by position (ascending) to process in order
  const sortedComments = [...comments].sort((a, b) => a.marker_pos - b.marker_pos);

  for (const comment of sortedComments) {
    // Find markers in the content
    const startMarkerPattern = `<!-- REVIEW:${comment.id}:start -->`;
    const endMarkerRegex = new RegExp(`<!-- REVIEW:${comment.id}:end:[^>]*-->`);

    const startIdx = cleanContent.indexOf(startMarkerPattern);
    if (startIdx === -1) continue;

    const afterStart = startIdx + startMarkerPattern.length;
    const endMatch = cleanContent.slice(afterStart).match(endMarkerRegex);
    if (!endMatch || endMatch.index === undefined) continue;

    const highlightedText = cleanContent.slice(afterStart, afterStart + endMatch.index);
    const endMarkerStart = afterStart + endMatch.index;
    const endMarkerEnd = endMarkerStart + endMatch[0].length;

    // Store region info BEFORE removing markers
    regions.push({
      id: comment.id,
      text: comment.text,
      sourceStart: startIdx + offset,
      sourceEnd: endMarkerEnd + offset,
      cleanStart: startIdx,
      cleanEnd: startIdx + highlightedText.length,
    });

    // Remove markers, keep highlighted text
    cleanContent =
      cleanContent.slice(0, startIdx) +
      highlightedText +
      cleanContent.slice(endMarkerEnd);

    // Update offset (we removed start marker + end marker)
    offset += startMarkerPattern.length + endMatch[0].length;
  }

  return { cleanContent, regions };
}

/**
 * Custom renderer that tracks source positions
 */
function createPositionTrackingRenderer(): Renderer {
  const renderer = new Renderer();

  // Track current position during rendering
  let currentPos = 0;

  // Override paragraph rendering to add data attributes
  const originalParagraph = renderer.paragraph.bind(renderer);
  renderer.paragraph = function(text: string) {
    const html = originalParagraph(text);
    // Add position data attribute
    return html.replace('<p>', `<p data-source-pos="${currentPos}">`);
  };

  // Similar overrides for other block elements...
  // (Full implementation in actual code)

  return renderer;
}

/**
 * Render markdown and inject highlights via DOM manipulation
 */
export function renderMarkdown(content: string, comments: ReviewComment[]): string {
  // Step 1: Extract comment regions and get clean content
  const { cleanContent, regions } = extractCommentRegions(content, comments);

  // Step 2: Render clean markdown
  marked.setOptions({
    gfm: true,
    breaks: true,
  });

  const html = marked.parse(cleanContent, { async: false }) as string;

  // Step 3: Create temporary container for DOM manipulation
  const temp = document.createElement('div');
  temp.innerHTML = html;

  // Step 4: Inject highlights by walking text nodes
  for (const region of regions) {
    injectHighlightInDOM(temp, region);
  }

  return temp.innerHTML;
}

/**
 * Walk DOM and inject highlight span at correct text position
 */
function injectHighlightInDOM(container: HTMLElement, region: CommentRegion) {
  const walker = document.createTreeWalker(
    container,
    NodeFilter.SHOW_TEXT,
    null
  );

  let currentPos = 0;
  let node: Text | null;

  while ((node = walker.nextNode() as Text | null)) {
    const nodeStart = currentPos;
    const nodeEnd = currentPos + node.textContent!.length;

    // Check if this text node overlaps with our region
    if (nodeEnd > region.cleanStart && nodeStart < region.cleanEnd) {
      // Calculate overlap within this node
      const overlapStart = Math.max(0, region.cleanStart - nodeStart);
      const overlapEnd = Math.min(node.textContent!.length, region.cleanEnd - nodeStart);

      // Split and wrap
      wrapTextRange(node, overlapStart, overlapEnd, region.id);
    }

    currentPos = nodeEnd;
  }
}

/**
 * Wrap a range of text within a text node with a highlight span
 */
function wrapTextRange(textNode: Text, start: number, end: number, commentId: string) {
  const text = textNode.textContent!;

  // Create the highlight span
  const span = document.createElement('span');
  span.className = 'review-comment-highlight';
  span.dataset.commentId = commentId;
  span.textContent = text.slice(start, end);

  // Split the text node and insert span
  const before = document.createTextNode(text.slice(0, start));
  const after = document.createTextNode(text.slice(end));

  const parent = textNode.parentNode!;
  parent.insertBefore(before, textNode);
  parent.insertBefore(span, textNode);
  parent.insertBefore(after, textNode);
  parent.removeChild(textNode);
}

export function updatePreview(content: string, comments: ReviewComment[]) {
  if (!previewContainer) return;

  const html = renderMarkdown(content, comments);
  previewContainer.innerHTML = html;

  // Add click handlers to highlighted regions
  const highlights = previewContainer.querySelectorAll('.review-comment-highlight');
  highlights.forEach((el) => {
    el.addEventListener('click', () => {
      const commentId = el.getAttribute('data-comment-id');
      if (commentId) {
        window.dispatchEvent(new CustomEvent('preview-comment-click', { detail: { commentId } }));
      }
    });
  });
}

export function scrollPreviewToComment(commentId: string) {
  if (!previewContainer) return;

  const element = previewContainer.querySelector(`[data-comment-id="${commentId}"]`);
  element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

export function getPreviewContainer(): HTMLElement | null {
  return previewContainer;
}
```

### Success Criteria

#### Automated Verification
- [ ] `bun run check` passes
- [ ] `bun run build` completes without errors

#### Manual Verification
- [ ] Open markdown file with inline comment (mid-paragraph) - highlight visible
- [ ] Open markdown file with block comment (entire paragraph) - highlight visible
- [ ] Clicking sidebar comment scrolls to highlight
- [ ] Clicking highlight flashes sidebar comment

**Implementation Note**: After completing this phase, pause for manual confirmation.

---

## Phase 2: Fix Table Rendering

### Overview

Tables break because comment markers interfere with the pipe-based table syntax. The fix from Phase 1 (extracting markers before rendering) should largely solve this, but we need to ensure tables render correctly in all cases.

### Additional Considerations

The Phase 1 approach of stripping markers before rendering should handle most table cases. However, we need to:

1. Ensure the text position tracking works correctly across table cells
2. Handle edge case: comment spanning multiple table cells

### Changes Required

#### 1. Enhanced Position Tracking for Tables

**File**: `/Users/taras/Documents/code/ai-toolbox/file-review/src/markdown-preview.ts`

Add special handling for table elements:

```typescript
/**
 * Walk DOM with special handling for tables
 * Tables need character-level position tracking within cells
 */
function injectHighlightInDOM(container: HTMLElement, region: CommentRegion) {
  // Build a flat list of text nodes with their character positions
  const textNodes: { node: Text; start: number; end: number }[] = [];
  let currentPos = 0;

  const walker = document.createTreeWalker(
    container,
    NodeFilter.SHOW_TEXT,
    null
  );

  let node: Text | null;
  while ((node = walker.nextNode() as Text | null)) {
    const len = node.textContent!.length;
    textNodes.push({
      node,
      start: currentPos,
      end: currentPos + len,
    });
    currentPos += len;
  }

  // Find nodes that overlap with our region
  const overlapping = textNodes.filter(
    ({ start, end }) => end > region.cleanStart && start < region.cleanEnd
  );

  // Wrap each overlapping segment
  for (const { node, start } of overlapping) {
    const overlapStart = Math.max(0, region.cleanStart - start);
    const overlapEnd = Math.min(node.textContent!.length, region.cleanEnd - start);

    if (overlapStart < overlapEnd) {
      wrapTextRange(node, overlapStart, overlapEnd, region.id);
    }
  }
}
```

#### 2. Update Styles for Table Cell Highlights

**File**: `/Users/taras/Documents/code/ai-toolbox/file-review/src/styles.css`

Add styles for highlights within table cells:

```css
/* Comment highlights in table cells */
#preview-container td .review-comment-highlight,
#preview-container th .review-comment-highlight {
  display: inline;
  padding: 2px 0;
}

/* Ensure highlight doesn't break table layout */
#preview-container table .review-comment-highlight {
  border-left: none;
  padding-left: 0;
  background: var(--highlight-bg);
}
```

### Success Criteria

#### Automated Verification
- [ ] `bun run check` passes

#### Manual Verification
- [ ] Table with comment in single cell renders correctly
- [ ] Table with comment spanning cell content renders correctly
- [ ] Table without comments renders correctly
- [ ] Clicking table cell highlight scrolls sidebar

**Test markdown:**
```markdown
| Header 1 | Header 2 |
|----------|----------|
| Normal | Data |
| <!-- REVIEW:test:start -->Highlighted<!-- REVIEW:test:end:comment --> | More |
```

**Implementation Note**: After completing this phase, pause for manual confirmation.

---

## Phase 3: Add Element-Level Position Tracking

### Overview

To support interactive commenting in preview mode, we need to know which source positions correspond to which rendered elements. This phase adds data attributes to all commentable elements.

### Technical Approach

1. Use marked's lexer to get tokens with source positions
2. Use a custom renderer that adds `data-source-start` and `data-source-end` attributes
3. Store mappings for reverse lookup (element -> source position)

### Changes Required

#### 1. Token-Based Rendering with Position Tracking

**File**: `/Users/taras/Documents/code/ai-toolbox/file-review/src/markdown-preview.ts`

```typescript
import { marked, Lexer, Token } from 'marked';

interface ElementPosition {
  element: HTMLElement;
  sourceStart: number;
  sourceEnd: number;
  type: 'paragraph' | 'heading' | 'list_item' | 'table_row' | 'blockquote';
}

let elementPositions: ElementPosition[] = [];

/**
 * Get element positions for interactive commenting
 */
export function getElementPositions(): ElementPosition[] {
  return elementPositions;
}

/**
 * Custom renderer that tracks source positions from tokens
 */
function renderWithPositions(cleanContent: string, regions: CommentRegion[]): string {
  // Use lexer to get tokens with positions
  const tokens = marked.lexer(cleanContent);

  let html = '';
  elementPositions = [];

  for (const token of tokens) {
    html += renderToken(token, regions);
  }

  return html;
}

function renderToken(token: Token, regions: CommentRegion[]): string {
  // Get token position (marked provides this in raw string offset)
  const sourceStart = (token as any).start ?? 0;
  const sourceEnd = sourceStart + ((token as any).raw?.length ?? 0);

  switch (token.type) {
    case 'paragraph': {
      const content = renderInlineTokens((token as any).tokens ?? [], regions);
      return `<p data-source-start="${sourceStart}" data-source-end="${sourceEnd}" data-commentable="true">${content}</p>\n`;
    }

    case 'heading': {
      const level = (token as any).depth;
      const content = renderInlineTokens((token as any).tokens ?? [], regions);
      return `<h${level} data-source-start="${sourceStart}" data-source-end="${sourceEnd}" data-commentable="true">${content}</h${level}>\n`;
    }

    case 'list': {
      const items = (token as any).items ?? [];
      let listHtml = `<${(token as any).ordered ? 'ol' : 'ul'}>\n`;
      for (const item of items) {
        const itemContent = renderToken(item, regions);
        listHtml += itemContent;
      }
      listHtml += `</${(token as any).ordered ? 'ol' : 'ul'}>\n`;
      return listHtml;
    }

    case 'list_item': {
      const content = renderInlineTokens((token as any).tokens ?? [], regions);
      return `<li data-source-start="${sourceStart}" data-source-end="${sourceEnd}" data-commentable="true">${content}</li>\n`;
    }

    case 'table': {
      return renderTable(token as any, regions);
    }

    case 'blockquote': {
      const content = (token as any).tokens?.map((t: Token) => renderToken(t, regions)).join('') ?? '';
      return `<blockquote data-source-start="${sourceStart}" data-source-end="${sourceEnd}" data-commentable="true">${content}</blockquote>\n`;
    }

    case 'code': {
      const code = escapeHtml((token as any).text ?? '');
      const lang = (token as any).lang ?? '';
      return `<pre data-source-start="${sourceStart}" data-source-end="${sourceEnd}" data-commentable="true"><code class="language-${lang}">${code}</code></pre>\n`;
    }

    case 'hr':
      return '<hr>\n';

    case 'space':
      return '';

    default:
      // Fallback: use marked's default rendering
      return marked.parser([token], { async: false }) as string;
  }
}

function renderTable(token: any, regions: CommentRegion[]): string {
  let html = '<table>\n<thead>\n<tr>\n';

  // Header row
  for (const cell of token.header ?? []) {
    const content = renderInlineTokens(cell.tokens ?? [], regions);
    html += `<th>${content}</th>\n`;
  }
  html += '</tr>\n</thead>\n<tbody>\n';

  // Body rows
  for (let rowIdx = 0; rowIdx < (token.rows?.length ?? 0); rowIdx++) {
    const row = token.rows[rowIdx];
    // Estimate row source position (this is approximate)
    const rowStart = token.start + (rowIdx + 2) * 10; // Rough estimate
    html += `<tr data-source-start="${rowStart}" data-commentable="true">\n`;

    for (const cell of row) {
      const content = renderInlineTokens(cell.tokens ?? [], regions);
      html += `<td>${content}</td>\n`;
    }
    html += '</tr>\n';
  }

  html += '</tbody>\n</table>\n';
  return html;
}

function renderInlineTokens(tokens: Token[], regions: CommentRegion[]): string {
  let html = '';

  for (const token of tokens) {
    switch (token.type) {
      case 'text':
        html += escapeHtml((token as any).text ?? '');
        break;
      case 'strong':
        html += `<strong>${renderInlineTokens((token as any).tokens ?? [], regions)}</strong>`;
        break;
      case 'em':
        html += `<em>${renderInlineTokens((token as any).tokens ?? [], regions)}</em>`;
        break;
      case 'code':
        html += `<code>${escapeHtml((token as any).text ?? '')}</code>`;
        break;
      case 'link':
        html += `<a href="${(token as any).href}">${renderInlineTokens((token as any).tokens ?? [], regions)}</a>`;
        break;
      case 'image':
        html += `<img src="${(token as any).href}" alt="${(token as any).text ?? ''}">`;
        break;
      case 'br':
        html += '<br>';
        break;
      default:
        html += (token as any).raw ?? '';
    }
  }

  return html;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
```

### Success Criteria

#### Automated Verification
- [ ] `bun run check` passes

#### Manual Verification
- [ ] Inspect rendered HTML - all p, h1-h6, li, tr, blockquote have data-source-start attributes
- [ ] Attributes have correct position values (verify by comparing to raw editor positions)

**Implementation Note**: After completing this phase, pause for manual confirmation.

---

## Phase 4: Interactive Commenting in Preview Mode

### Overview

Add the ability to hover over elements in preview mode and add comments by clicking a "+" button that appears.

### UI Design

1. **Hover affordance**: When hovering over a commentable element, show a floating "+" button to the left
2. **Click to add**: Clicking "+" opens the comment input (same as sidebar)
3. **Comment insertion**: Comment is inserted in raw markdown at the element's source position
4. **Automatic switch**: After adding comment, stay in preview mode but show the new highlight

### Changes Required

#### 1. Add Hover Comment Button

**File**: `/Users/taras/Documents/code/ai-toolbox/file-review/src/markdown-preview.ts`

```typescript
let hoverButton: HTMLElement | null = null;
let currentHoverElement: HTMLElement | null = null;

/**
 * Initialize interactive commenting for preview mode
 */
export function initInteractiveCommenting(
  onAddComment: (sourceStart: number, sourceEnd: number, element: HTMLElement) => void
) {
  if (!previewContainer) return;

  // Create hover button
  hoverButton = document.createElement('button');
  hoverButton.className = 'preview-add-comment-btn';
  hoverButton.innerHTML = '+';
  hoverButton.title = 'Add comment to this section';
  hoverButton.style.display = 'none';
  document.body.appendChild(hoverButton);

  // Position button on hover
  previewContainer.addEventListener('mousemove', (e) => {
    const target = (e.target as HTMLElement).closest('[data-commentable="true"]') as HTMLElement;

    if (target && target !== currentHoverElement) {
      currentHoverElement = target;
      positionHoverButton(target);
    } else if (!target) {
      hideHoverButton();
    }
  });

  previewContainer.addEventListener('mouseleave', hideHoverButton);

  // Handle button click
  hoverButton.addEventListener('click', () => {
    if (!currentHoverElement) return;

    const sourceStart = parseInt(currentHoverElement.dataset.sourceStart ?? '0', 10);
    const sourceEnd = parseInt(currentHoverElement.dataset.sourceEnd ?? '0', 10);

    onAddComment(sourceStart, sourceEnd, currentHoverElement);
    hideHoverButton();
  });
}

function positionHoverButton(element: HTMLElement) {
  if (!hoverButton || !previewContainer) return;

  const rect = element.getBoundingClientRect();
  const containerRect = previewContainer.getBoundingClientRect();

  hoverButton.style.display = 'flex';
  hoverButton.style.position = 'fixed';
  hoverButton.style.left = `${containerRect.left - 30}px`;
  hoverButton.style.top = `${rect.top + (rect.height / 2) - 12}px`;
}

function hideHoverButton() {
  if (hoverButton) {
    hoverButton.style.display = 'none';
  }
  currentHoverElement = null;
}

/**
 * Flash highlight on an element (for visual feedback)
 */
export function flashElement(element: HTMLElement) {
  element.classList.add('element-flash');
  setTimeout(() => element.classList.remove('element-flash'), 1000);
}
```

#### 2. Add Styles for Hover Button and Commentable Elements

**File**: `/Users/taras/Documents/code/ai-toolbox/file-review/src/styles.css`

```css
/* Commentable element hover effect */
#preview-container [data-commentable="true"] {
  position: relative;
  transition: background 0.15s;
}

#preview-container [data-commentable="true"]:hover {
  background: rgba(128, 128, 128, 0.05);
}

/* Hover add comment button */
.preview-add-comment-btn {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--accent-color);
  color: white;
  border: none;
  cursor: pointer;
  font-size: 18px;
  font-weight: bold;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  transition: transform 0.15s, background 0.15s;
}

.preview-add-comment-btn:hover {
  background: var(--accent-hover);
  transform: scale(1.1);
}

/* Element flash animation for feedback */
@keyframes element-flash {
  0%, 50% {
    background: var(--highlight-bg);
  }
  100% {
    background: transparent;
  }
}

.element-flash {
  animation: element-flash 1s ease-out;
}

/* Light theme adjustments */
.light-theme .preview-add-comment-btn {
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.15);
}
```

#### 3. Wire Up Interactive Commenting in Main

**File**: `/Users/taras/Documents/code/ai-toolbox/file-review/src/main.ts`

Add handler for preview mode commenting:

```typescript
import {
  initPreview,
  updatePreview,
  scrollPreviewToComment,
  initInteractiveCommenting,
  flashElement
} from './markdown-preview';

// In init():
initPreview(document.getElementById('preview-container')!);

// Set up interactive preview commenting
initInteractiveCommenting((sourceStart, sourceEnd, element) => {
  handlePreviewAddComment(sourceStart, sourceEnd, element);
});

/**
 * Handle adding comment from preview mode
 */
async function handlePreviewAddComment(
  sourceStart: number,
  sourceEnd: number,
  element: HTMLElement
) {
  // Switch to raw mode temporarily to use existing comment flow?
  // OR: Directly insert comment and refresh

  // Option 2: Direct insertion (better UX - stays in preview mode)
  // Show comment input in sidebar
  showCommentInput(0); // Line number will be calculated

  // Store pending preview comment info
  pendingPreviewComment = { sourceStart, sourceEnd, element };
}

let pendingPreviewComment: {
  sourceStart: number;
  sourceEnd: number;
  element: HTMLElement
} | null = null;

// Modify handleCommentSubmit to handle preview comments:
async function handleCommentSubmit(text: string, _lineNumber: number) {
  const content = getEditorContent();

  if (pendingPreviewComment) {
    // Handle preview mode comment
    const { sourceStart, sourceEnd, element } = pendingPreviewComment;
    pendingPreviewComment = null;

    // Use insertLineComment with the source positions
    const [newContent] = await insertLineComment(content, sourceStart, sourceEnd, text);
    setEditorContent(newContent);
    await refreshComments();

    // Flash the element for visual feedback
    flashElement(element);
    showToast('Comment added', 'success');
    return;
  }

  // ... existing selection-based logic
}
```

#### 4. Update Sidebar to Work Better with Preview Mode

**File**: `/Users/taras/Documents/code/ai-toolbox/file-review/src/sidebar.ts`

Update `showCommentInput` to accept optional context:

```typescript
export function showCommentInput(lineNumber: number, label?: string) {
  pendingLineNumber = lineNumber;
  const inputArea = document.getElementById("comment-input-area")!;
  const lineLabel = document.getElementById("comment-line-label")!;
  const textarea = document.getElementById("comment-textarea") as HTMLTextAreaElement;

  // Use custom label if provided (for preview mode)
  lineLabel.textContent = label ?? `Line ${lineNumber}`;
  inputArea.style.display = "block";
  textarea.value = "";
  textarea.focus();
}
```

### Success Criteria

#### Automated Verification
- [ ] `bun run check` passes

#### Manual Verification
- [ ] Hover over paragraph in preview - "+" button appears
- [ ] Hover over heading - "+" button appears
- [ ] Hover over list item - "+" button appears
- [ ] Hover over table row - "+" button appears
- [ ] Click "+" - comment input shows in sidebar
- [ ] Submit comment - element flashes, comment appears in sidebar
- [ ] Switch to raw mode - comment markers are in correct position
- [ ] Switch back to preview - highlight is visible on that element

**Implementation Note**: After completing this phase, pause for manual confirmation.

---

## Phase 5: Bidirectional Scroll Sync Refinement

### Overview

Ensure smooth bidirectional navigation between sidebar and preview:
1. Sidebar click -> preview scrolls to highlight (existing)
2. Preview highlight click -> sidebar card flashes (existing)
3. NEW: Preview element click -> if has comment, scroll sidebar to it

### Changes Required

#### 1. Enhance Preview Click Handling

**File**: `/Users/taras/Documents/code/ai-toolbox/file-review/src/markdown-preview.ts`

```typescript
/**
 * Set up click handlers for all commentable elements
 * Dispatches event with element info for main.ts to handle
 */
function setupElementClickHandlers() {
  if (!previewContainer) return;

  const commentables = previewContainer.querySelectorAll('[data-commentable="true"]');

  commentables.forEach((el) => {
    el.addEventListener('click', (e) => {
      // Don't trigger if clicking a highlight (that has its own handler)
      if ((e.target as HTMLElement).closest('.review-comment-highlight')) {
        return;
      }

      // Check if this element contains any comments
      const highlight = el.querySelector('.review-comment-highlight');
      if (highlight) {
        const commentId = highlight.getAttribute('data-comment-id');
        if (commentId) {
          window.dispatchEvent(new CustomEvent('preview-element-click', {
            detail: { commentId, element: el }
          }));
        }
      }
    });
  });
}
```

#### 2. Handle Element Click in Main

**File**: `/Users/taras/Documents/code/ai-toolbox/file-review/src/main.ts`

```typescript
// In init():
window.addEventListener('preview-element-click', ((e: CustomEvent<{ commentId: string; element: HTMLElement }>) => {
  const comment = comments.find(c => c.id === e.detail.commentId);
  if (comment) {
    // Scroll and highlight the comment card
    const card = document.querySelector(`[data-comment-id="${comment.id}"]`);
    if (card) {
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      card.classList.add('highlight-flash');
      setTimeout(() => card.classList.remove('highlight-flash'), 1000);
    }
  }
}) as EventListener);
```

### Success Criteria

#### Automated Verification
- [ ] `bun run check` passes

#### Manual Verification
- [ ] Click highlighted text in preview -> sidebar scrolls to comment
- [ ] Click comment card in sidebar -> preview scrolls to highlight
- [ ] Scroll sync works smoothly in both directions
- [ ] Works in both Tauri and web modes

**Implementation Note**: After completing this phase, pause for manual confirmation.

---

## Testing Strategy

### Manual Testing Checklist

1. **Comment Highlights in Preview**
   - [ ] Inline comment (mid-paragraph) visible
   - [ ] Block comment (whole paragraph) visible
   - [ ] Multi-paragraph comment visible
   - [ ] Comment in heading visible
   - [ ] Comment in list item visible
   - [ ] Comment in table cell visible
   - [ ] Comment in blockquote visible

2. **Table Rendering**
   - [ ] Simple table renders correctly
   - [ ] Table with header renders correctly
   - [ ] Table with comment in cell renders correctly
   - [ ] Table alignment preserved

3. **Interactive Preview Commenting**
   - [ ] "+" button appears on paragraph hover
   - [ ] "+" button appears on heading hover
   - [ ] "+" button appears on list item hover
   - [ ] "+" button appears on table row hover
   - [ ] "+" button positioned correctly (left margin)
   - [ ] Click adds comment at correct position
   - [ ] Element flashes after comment added

4. **Bidirectional Navigation**
   - [ ] Sidebar click scrolls preview
   - [ ] Preview highlight click flashes sidebar
   - [ ] Scroll positions preserved when switching modes

5. **Edge Cases**
   - [ ] Empty file
   - [ ] File with only comments
   - [ ] Very long file (performance)
   - [ ] Multiple comments on same element
   - [ ] Nested elements (list in blockquote)
   - [ ] Web mode (`--web` flag)

### Test Files to Create

Create these test markdown files in the repo for testing:

```markdown
<!-- test-highlights.md -->
# Test Heading

This is a <!-- REVIEW:t1:start -->highlighted inline<!-- REVIEW:t1:end:inline comment --> text.

<!-- REVIEW:t2:start -->
This entire paragraph is highlighted.
<!-- REVIEW:t2:end:block comment -->

| Col 1 | Col 2 |
|-------|-------|
| <!-- REVIEW:t3:start -->Table cell<!-- REVIEW:t3:end:table comment --> | Data |
```

---

## References

- Original plan: `thoughts/shared/plans/2026-01-19-file-review-markdown-pretty-print.md`
- Current implementation: `file-review/src/markdown-preview.ts`
- Marked library docs: https://marked.js.org/
- Marked lexer API: https://marked.js.org/using_advanced#lexer
