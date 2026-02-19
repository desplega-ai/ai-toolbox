import { marked, type Token, type Tokens } from 'marked';
import type { ReviewComment } from './comments';

let previewContainer: HTMLElement | null = null;
let hoverButton: HTMLElement | null = null;
let currentHoverElement: HTMLElement | null = null;
let addCommentCallback: ((sourceStart: number, sourceEnd: number, element: HTMLElement) => void) | null = null;
let hoverListenersAttached = false;
let hideTimeout: ReturnType<typeof setTimeout> | null = null;

const COMMENTABLE_SELECTORS = 'p, h1, h2, h3, h4, h5, h6, li, blockquote, pre, tr';
const COMMENTABLE_HEADING_KINDS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

export type CommentableKind =
  | 'p'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'h4'
  | 'h5'
  | 'h6'
  | 'li'
  | 'blockquote'
  | 'pre'
  | 'tr';

export interface CommentableRange {
  start: number;
  end: number;
  kind: CommentableKind;
}

export interface RenderPreviewResult {
  html: string;
  ranges: CommentableRange[];
}

export function initPreview(container: HTMLElement) {
  previewContainer = container;
}

/**
 * Initialize interactive commenting for preview mode
 */
export function initInteractiveCommenting(
  onAddComment: (sourceStart: number, sourceEnd: number, element: HTMLElement) => void
) {
  addCommentCallback = onAddComment;

  if (!hoverButton) {
    hoverButton = document.createElement('button');
    hoverButton.className = 'preview-add-comment-btn';
    hoverButton.innerHTML = '+';
    hoverButton.title = 'Add comment to this section';
    hoverButton.style.display = 'none';
    document.body.appendChild(hoverButton);

    hoverButton.addEventListener('mouseenter', () => {
      if (hideTimeout) {
        clearTimeout(hideTimeout);
        hideTimeout = null;
      }
    });

    hoverButton.addEventListener('mouseleave', () => {
      scheduleHideButton();
    });

    hoverButton.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!currentHoverElement || !addCommentCallback) return;

      const sourceStart = parseInt(currentHoverElement.dataset.sourceStart ?? '0', 10);
      const sourceEnd = parseInt(currentHoverElement.dataset.sourceEnd ?? '0', 10);

      addCommentCallback(sourceStart, sourceEnd, currentHoverElement);
      hideHoverButtonNow();
    });
  }
}

function positionHoverButton(element: HTMLElement) {
  if (!hoverButton || !previewContainer) return;

  if (hideTimeout) {
    clearTimeout(hideTimeout);
    hideTimeout = null;
  }

  const rect = element.getBoundingClientRect();
  const containerRect = previewContainer.getBoundingClientRect();
  const leftPos = Math.max(8, containerRect.left - 32);

  hoverButton.style.display = 'flex';
  hoverButton.style.position = 'fixed';
  hoverButton.style.left = `${leftPos}px`;
  hoverButton.style.top = `${rect.top + Math.min(rect.height / 2, 20) - 12}px`;
}

function scheduleHideButton() {
  if (hideTimeout) return;
  hideTimeout = setTimeout(() => {
    hideHoverButtonNow();
  }, 150);
}

function hideHoverButtonNow() {
  if (hideTimeout) {
    clearTimeout(hideTimeout);
    hideTimeout = null;
  }
  if (hoverButton) {
    hoverButton.style.display = 'none';
  }
  currentHoverElement = null;
}

export function flashElement(element: HTMLElement) {
  element.classList.add('element-flash');
  setTimeout(() => element.classList.remove('element-flash'), 1000);
}

/**
 * Replace comment markers with HTML spans
 * Handles both inline and line comment formats:
 * - Inline: <!-- review-start(id) -->...<!-- review-end(id): text -->
 * - Line: <!-- review-line-start(id) -->...<!-- review-line-end(id): text -->
 */
function injectHighlightSpans(content: string, comments: ReviewComment[]): string {
  let result = content;

  // Sort by position (descending) to process from end to start
  const sortedComments = [...comments].sort((a, b) => b.marker_pos - a.marker_pos);

  for (const comment of sortedComments) {
    const isLine = comment.comment_type === 'line';

    // Build patterns based on comment type
    const startMarkerRegex = isLine
      ? new RegExp(`<!--\\s*review-line-start\\(${comment.id}\\)\\s*-->\\n?`)
      : new RegExp(`<!--\\s*review-start\\(${comment.id}\\)\\s*-->`);

    const endMarkerRegex = isLine
      ? new RegExp(`\\n?<!--\\s*review-line-end\\(${comment.id}\\):[^>]*-->`)
      : new RegExp(`<!--\\s*review-end\\(${comment.id}\\):[^>]*-->`);

    const startMatch = result.match(startMarkerRegex);
    if (!startMatch || startMatch.index === undefined) {
      continue;
    }

    const startIdx = startMatch.index;
    const afterStart = startIdx + startMatch[0].length;

    const endMatch = result.slice(afterStart).match(endMarkerRegex);
    if (!endMatch || endMatch.index === undefined) {
      continue;
    }

    const highlightedText = result.slice(afterStart, afterStart + endMatch.index);
    const endMarkerEnd = afterStart + endMatch.index + endMatch[0].length;

    // Replace with HTML span
    result =
      result.slice(0, startIdx) +
      `<span class="review-comment-highlight" data-comment-id="${comment.id}">` +
      highlightedText +
      '</span>' +
      result.slice(endMarkerEnd);
  }

  return result;
}

function trimTrailingLineBreaks(raw: string): number {
  let end = raw.length;
  while (end > 0) {
    const ch = raw[end - 1];
    if (ch === '\n' || ch === '\r') {
      end -= 1;
      continue;
    }
    break;
  }
  return end;
}

function addRangeFromRaw(
  ranges: CommentableRange[],
  start: number,
  raw: string,
  kind: CommentableKind
) {
  const length = trimTrailingLineBreaks(raw);
  const end = start + length;
  if (end > start) {
    ranges.push({ start, end, kind });
  }
}

function addRangeFromBounds(
  ranges: CommentableRange[],
  start: number,
  end: number,
  kind: CommentableKind
) {
  if (end > start) {
    ranges.push({ start, end, kind });
  }
}

function isListToken(token: Token): token is Tokens.List {
  return token.type === 'list' && Array.isArray((token as Tokens.List).items);
}

function isTableToken(token: Token): token is Tokens.Table {
  return token.type === 'table' && Array.isArray((token as Tokens.Table).rows);
}

function isCommentableKind(tagName: string): tagName is CommentableKind {
  return (
    tagName === 'p' ||
    COMMENTABLE_HEADING_KINDS.has(tagName) ||
    tagName === 'li' ||
    tagName === 'blockquote' ||
    tagName === 'pre' ||
    tagName === 'tr'
  );
}

function splitRawLines(raw: string): Array<{ text: string; start: number; end: number }> {
  const lines: Array<{ text: string; start: number; end: number }> = [];
  let idx = 0;

  while (idx < raw.length) {
    const nextNewline = raw.indexOf('\n', idx);
    if (nextNewline === -1) {
      lines.push({ text: raw.slice(idx), start: idx, end: raw.length });
      break;
    }

    lines.push({ text: raw.slice(idx, nextNewline), start: idx, end: nextNewline });
    idx = nextNewline + 1;
  }

  return lines;
}

function collectTableRowRanges(
  tableToken: Tokens.Table,
  tableStart: number,
  ranges: CommentableRange[]
) {
  const nonEmptyLines = splitRawLines(tableToken.raw).filter((line) => line.text.trim().length > 0);
  if (nonEmptyLines.length < 2) {
    return;
  }

  const headerLine = nonEmptyLines[0];
  addRangeFromBounds(ranges, tableStart + headerLine.start, tableStart + headerLine.end, 'tr');

  // Skip the separator line (---|---), keep only actual body rows.
  for (const rowLine of nonEmptyLines.slice(2)) {
    addRangeFromBounds(ranges, tableStart + rowLine.start, tableStart + rowLine.end, 'tr');
  }
}

function collectListItemRanges(listToken: Tokens.List, listStart: number, ranges: CommentableRange[]) {
  let searchFrom = 0;

  for (const item of listToken.items) {
    const itemRaw = item.raw;
    const itemOffset = listToken.raw.indexOf(itemRaw, searchFrom);
    if (itemOffset < 0) {
      continue;
    }

    const itemStart = listStart + itemOffset;
    addRangeFromRaw(ranges, itemStart, itemRaw, 'li');
    searchFrom = itemOffset + itemRaw.length;

    const nestedLists = item.tokens.filter(isListToken);
    if (nestedLists.length === 0) {
      continue;
    }

    let nestedSearchFrom = 0;
    for (const nestedList of nestedLists) {
      const nestedOffset = itemRaw.indexOf(nestedList.raw, nestedSearchFrom);
      if (nestedOffset < 0) {
        continue;
      }

      collectListItemRanges(nestedList, itemStart + nestedOffset, ranges);
      nestedSearchFrom = nestedOffset + nestedList.raw.length;
    }
  }
}

export function collectCommentableRanges(content: string): CommentableRange[] {
  const tokens = marked.lexer(content, { gfm: true, breaks: true });
  const ranges: CommentableRange[] = [];
  let cursor = 0;

  for (const token of tokens) {
    const raw = token.raw ?? '';
    const tokenStart = cursor;
    const tokenEnd = tokenStart + raw.length;

    if (token.type === 'heading') {
      addRangeFromRaw(ranges, tokenStart, raw, `h${token.depth}` as CommentableKind);
    } else if (token.type === 'paragraph') {
      addRangeFromRaw(ranges, tokenStart, raw, 'p');
    } else if (token.type === 'blockquote') {
      addRangeFromRaw(ranges, tokenStart, raw, 'blockquote');
    } else if (token.type === 'code') {
      addRangeFromRaw(ranges, tokenStart, raw, 'pre');
    } else if (isListToken(token)) {
      collectListItemRanges(token, tokenStart, ranges);
    } else if (isTableToken(token)) {
      collectTableRowRanges(token, tokenStart, ranges);
    }

    cursor = tokenEnd;
  }

  return ranges;
}

function getCommentableElements(root: ParentNode): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(COMMENTABLE_SELECTORS)).filter((el) => {
    const tag = el.tagName.toLowerCase();

    // Skip nested paragraph/heading/pre nodes that don't have deterministic source ranges yet.
    if ((tag === 'p' || tag === 'pre' || COMMENTABLE_HEADING_KINDS.has(tag))
      && (el.parentElement?.closest('blockquote') || el.parentElement?.closest('li'))) {
      return false;
    }

    // Skip nested blockquotes for now to avoid incorrect offset assignment.
    if (
      tag === 'blockquote' &&
      (el.parentElement?.closest('blockquote') || el.parentElement?.closest('li'))
    ) {
      return false;
    }

    return true;
  });
}

function setCommentableAttributes(root: ParentNode, ranges: CommentableRange[]) {
  const elements = getCommentableElements(root);

  if (elements.length !== ranges.length) {
    console.warn(
      `[preview] Commentable mapping mismatch (elements=${elements.length}, ranges=${ranges.length}). ` +
      'Disabling preview add-comment for this render.'
    );
    return;
  }

  for (let i = 0; i < elements.length; i += 1) {
    const el = elements[i];
    const range = ranges[i];
    const tagName = el.tagName.toLowerCase();

    if (!isCommentableKind(tagName) || tagName !== range.kind || range.end <= range.start) {
      console.warn(
        `[preview] Commentable tag mismatch at index ${i} (tag=${tagName}, kind=${range.kind}). ` +
        'Disabling preview add-comment for this render.'
      );
      return;
    }
  }

  for (let i = 0; i < elements.length; i += 1) {
    const el = elements[i];
    const range = ranges[i];
    el.setAttribute('data-commentable', 'true');
    el.setAttribute('data-source-start', String(range.start));
    el.setAttribute('data-source-end', String(range.end));
  }
}

function rangesOverlap(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number
): boolean {
  return aStart < bEnd && aEnd > bStart;
}

function applyCommentHighlights(root: ParentNode, comments: ReviewComment[]) {
  const elements = root.querySelectorAll<HTMLElement>('[data-commentable="true"]');

  elements.forEach((el) => {
    el.classList.remove('review-comment-highlight');
    el.removeAttribute('data-comment-id');

    const sourceStart = Number.parseInt(el.dataset.sourceStart ?? '', 10);
    const sourceEnd = Number.parseInt(el.dataset.sourceEnd ?? '', 10);
    if (!Number.isFinite(sourceStart) || !Number.isFinite(sourceEnd) || sourceEnd <= sourceStart) {
      return;
    }

    const matched = comments.find((comment) =>
      rangesOverlap(comment.highlight_start, comment.highlight_end, sourceStart, sourceEnd)
    );
    if (!matched) {
      return;
    }

    el.classList.add('review-comment-highlight');
    el.setAttribute('data-comment-id', matched.id);
  });
}

/**
 * Render markdown with highlights
 */
export function renderMarkdown(content: string, comments: ReviewComment[]): RenderPreviewResult {
  // Step 1: Replace comment markers with HTML spans BEFORE markdown parsing
  const contentWithSpans = injectHighlightSpans(content, comments);

  // Step 2: Compute exact source ranges from the original markdown content.
  const ranges = collectCommentableRanges(content);

  // Step 3: Parse markdown - marked preserves inline HTML by default.
  const html = marked.parse(contentWithSpans, {
    async: false,
    gfm: true,
    breaks: true,
  }) as string;

  return { html, ranges };
}

function setupElementClickHandlers() {
  if (!previewContainer) return;

  const commentables = previewContainer.querySelectorAll<HTMLElement>('[data-commentable="true"]');

  commentables.forEach((el) => {
    el.addEventListener('click', (e) => {
      const clicked = (e.target as HTMLElement).closest('[data-commentable="true"]');
      if (!clicked || clicked !== el) {
        return;
      }

      const commentId = el.getAttribute('data-comment-id');
      if (commentId) {
        window.dispatchEvent(new CustomEvent('preview-element-click', {
          detail: { commentId, element: el }
        }));
      }
    });
  });
}

function setupHoverHandlers() {
  if (!previewContainer || hoverListenersAttached) return;

  previewContainer.addEventListener('mousemove', (e) => {
    if (!addCommentCallback) return;

    const target = (e.target as HTMLElement).closest('[data-commentable="true"]') as HTMLElement;

    if (target && target !== currentHoverElement) {
      currentHoverElement = target;
      positionHoverButton(target);
    } else if (!target && currentHoverElement) {
      scheduleHideButton();
    }
  });

  previewContainer.addEventListener('mouseleave', () => {
    scheduleHideButton();
  });

  hoverListenersAttached = true;
}

export function updatePreview(content: string, comments: ReviewComment[]) {
  if (!previewContainer) return;

  const { html, ranges } = renderMarkdown(content, comments);
  previewContainer.innerHTML = html;
  setCommentableAttributes(previewContainer, ranges);
  applyCommentHighlights(previewContainer, comments);

  setupElementClickHandlers();
  setupHoverHandlers();
}

export function scrollPreviewToComment(commentId: string) {
  if (!previewContainer) return;

  const element = previewContainer.querySelector(`[data-comment-id="${commentId}"]`);
  element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

export function getPreviewContainer(): HTMLElement | null {
  return previewContainer;
}
