import { marked, type Token, type Tokens } from 'marked';
import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import python from 'highlight.js/lib/languages/python';
import bash from 'highlight.js/lib/languages/bash';
import json from 'highlight.js/lib/languages/json';
import css from 'highlight.js/lib/languages/css';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';
import rust from 'highlight.js/lib/languages/rust';
import sql from 'highlight.js/lib/languages/sql';
import markdown from 'highlight.js/lib/languages/markdown';
import type { ReviewComment } from './comments';

// Register languages with aliases
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('python', python);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('json', json);
hljs.registerLanguage('css', css);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('yaml', yaml);
hljs.registerLanguage('rust', rust);
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('markdown', markdown);

// Register common aliases
hljs.registerAliases(['js', 'jsx'], { languageName: 'javascript' });
hljs.registerAliases(['ts', 'tsx'], { languageName: 'typescript' });
hljs.registerAliases(['py'], { languageName: 'python' });
hljs.registerAliases(['sh', 'shell', 'zsh'], { languageName: 'bash' });
hljs.registerAliases(['html', 'htm', 'svg'], { languageName: 'xml' });
hljs.registerAliases(['yml'], { languageName: 'yaml' });
hljs.registerAliases(['md'], { languageName: 'markdown' });
hljs.registerAliases(['rs'], { languageName: 'rust' });

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

interface FrontmatterEntry {
  key: string;
  label: string;
  value: string | string[];
  isArray: boolean;
}

interface FrontmatterParseResult {
  entries: FrontmatterEntry[];
  bodyMarkdown: string;
  consumedChars: number;
}

export function slugify(text: string): string {
  return text
    .replace(/<[^>]*>/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-');
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
  }, 5000);
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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function toFrontmatterLabel(key: string): string {
  return key
    .split(/[_-]+/)
    .filter((part) => part.length > 0)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(' ');
}

function parseArrayValue(rawValue: string): string[] {
  const inner = rawValue.slice(1, -1).trim();
  if (!inner) {
    return [];
  }

  return inner
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => {
      const quote = part[0];
      if (
        (quote === '"' || quote === "'") &&
        part.length >= 2 &&
        part[part.length - 1] === quote
      ) {
        return part.slice(1, -1);
      }
      return part;
    });
}

function parseLeadingFrontmatter(content: string): FrontmatterParseResult {
  const bomOffset = content.startsWith('\uFEFF') ? 1 : 0;
  const working = content.slice(bomOffset);

  if (!(working.startsWith('---\n') || working.startsWith('---\r\n'))) {
    return { entries: [], bodyMarkdown: content, consumedChars: 0 };
  }

  const afterOpening = working.startsWith('---\r\n') ? 5 : 4;
  let cursor = afterOpening;
  let closingLineEnd = -1;

  while (cursor < working.length) {
    const nextNewline = working.indexOf('\n', cursor);
    const lineEnd = nextNewline === -1 ? working.length : nextNewline + 1;
    const line = working
      .slice(cursor, nextNewline === -1 ? working.length : nextNewline)
      .replace(/\r$/, '');

    if (/^---[ \t]*$/.test(line)) {
      closingLineEnd = lineEnd;
      break;
    }

    cursor = lineEnd;
  }

  if (closingLineEnd < 0) {
    return { entries: [], bodyMarkdown: content, consumedChars: 0 };
  }

  const rawFrontmatter = working.slice(afterOpening, cursor);
  const entries: FrontmatterEntry[] = [];

  for (const rawLine of rawFrontmatter.split(/\r?\n/)) {
    if (!rawLine.trim() || rawLine.trim().startsWith('#')) {
      continue;
    }

    const separatorIndex = rawLine.indexOf(':');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = rawLine.slice(0, separatorIndex).trim();
    if (!key) {
      continue;
    }

    const rawValue = rawLine.slice(separatorIndex + 1).trim();
    const isArray = rawValue.startsWith('[') && rawValue.endsWith(']');

    entries.push({
      key,
      label: toFrontmatterLabel(key),
      value: isArray ? parseArrayValue(rawValue) : rawValue,
      isArray,
    });
  }

  const consumedChars = bomOffset + closingLineEnd;
  const bodyMarkdown = content.slice(consumedChars);

  return { entries, bodyMarkdown, consumedChars };
}

function renderFrontmatterHtml(entries: FrontmatterEntry[]): string {
  if (entries.length === 0) {
    return '';
  }

  const rows = entries
    .map((entry) => {
      const renderedValue = entry.isArray
        ? (() => {
            const items = entry.value as string[];
            if (items.length === 0) {
              return '<span class="frontmatter-empty">-</span>';
            }

            const chips = items
              .map((item) => `<span class="frontmatter-chip">${escapeHtml(item)}</span>`)
              .join('');
            return `<span class="frontmatter-chip-list">${chips}</span>`;
          })()
        : (() => {
            const value = entry.value as string;
            if (!value) {
              return '<span class="frontmatter-empty">-</span>';
            }
            return `<span class="frontmatter-text">${escapeHtml(value)}</span>`;
          })();

      return [
        '<div class="frontmatter-row">',
        `<span class="frontmatter-label">${escapeHtml(entry.label)}</span>`,
        `<span class="frontmatter-value">${renderedValue}</span>`,
        '</div>',
      ].join('');
    })
    .join('');

  return [
    '<div class="frontmatter-card" data-frontmatter="true">',
    '<div class="frontmatter-title">Metadata</div>',
    `<div class="frontmatter-grid">${rows}</div>`,
    '</div>',
  ].join('');
}

function offsetRanges(ranges: CommentableRange[], offset: number): CommentableRange[] {
  if (offset === 0) {
    return ranges;
  }

  return ranges.map((range) => ({
    ...range,
    start: range.start + offset,
    end: range.end + offset,
  }));
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

function splitAtTopLevelNewline(html: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let lastSplit = 0;
  let i = 0;

  while (i < html.length) {
    if (html[i] === '\n') {
      if (depth === 0) {
        parts.push(html.slice(lastSplit, i));
        lastSplit = i + 1;
      } else {
        // Newline inside an inline tag — bail out, return unsplit
        return [html];
      }
      i++;
      continue;
    }

    if (html[i] === '<') {
      // Check for closing tag
      const closeMatch = html.slice(i).match(/^<\/\w+\s*>/);
      if (closeMatch) {
        depth--;
        i += closeMatch[0].length;
        continue;
      }

      // Check for self-closing tags (e.g. <br>, <img ... />)
      const selfCloseMatch = html.slice(i).match(/^<(?:br|hr|img|input)\b[^>]*\/?>/i);
      if (selfCloseMatch) {
        i += selfCloseMatch[0].length;
        continue;
      }

      // Check for opening tag
      const openMatch = html.slice(i).match(/^<\w+[^>]*>/);
      if (openMatch) {
        depth++;
        i += openMatch[0].length;
        continue;
      }
    }

    i++;
  }

  // Push the remaining part
  parts.push(html.slice(lastSplit));
  return parts;
}

function collectParagraphLineRanges(
  tokenStart: number,
  raw: string,
  ranges: CommentableRange[]
) {
  const lines = splitRawLines(raw).filter((line) => line.text.trim().length > 0);

  if (lines.length <= 1) {
    addRangeFromRaw(ranges, tokenStart, raw, 'p');
    return;
  }

  for (const line of lines) {
    const trimmedEnd = line.text.trimEnd().length;
    addRangeFromBounds(ranges, tokenStart + line.start, tokenStart + line.start + trimmedEnd, 'p');
  }
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
      collectParagraphLineRanges(tokenStart, raw, ranges);
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

    // Per-line paragraph elements are always commentable
    if (tag === 'p' && el.classList.contains('preview-line')) {
      return true;
    }

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

function assignCommentable(el: HTMLElement, range: CommentableRange) {
  if (range.end > range.start) {
    el.setAttribute('data-commentable', 'true');
    el.setAttribute('data-source-start', String(range.start));
    el.setAttribute('data-source-end', String(range.end));
  }
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

function textContentMatches(
  el: HTMLElement,
  source: string,
  range: CommentableRange
): boolean {
  const domText = normalizeText(el.textContent ?? '');
  const sourceText = normalizeText(source.slice(range.start, range.end));
  if (domText.length === 0 || sourceText.length === 0) return false;
  const shorter = domText.length < sourceText.length ? domText : sourceText;
  const longer = domText.length < sourceText.length ? sourceText : domText;
  return longer.includes(shorter) || shorter.includes(longer.slice(0, shorter.length));
}

function setCommentableAttributes(
  root: ParentNode,
  ranges: CommentableRange[],
  sourceContent?: string
) {
  const elements = getCommentableElements(root);

  // Fast path: 1:1 count and kind match
  if (elements.length === ranges.length) {
    let allMatch = true;
    for (let i = 0; i < elements.length; i++) {
      if (elements[i].tagName.toLowerCase() !== ranges[i].kind) {
        allMatch = false;
        break;
      }
    }
    if (allMatch) {
      for (let i = 0; i < elements.length; i++) {
        assignCommentable(elements[i], ranges[i]);
      }
      return;
    }
  }

  // Resilient path: greedy kind-based matching with optional text validation
  console.warn(
    `[preview] Commentable mapping mismatch (elements=${elements.length}, ranges=${ranges.length}). ` +
    'Using resilient matching.'
  );

  let rangeIdx = 0;
  for (const el of elements) {
    const tag = el.tagName.toLowerCase();
    if (!isCommentableKind(tag)) continue;

    // Scan forward for next range with matching kind
    let matchIdx = rangeIdx;
    while (matchIdx < ranges.length && ranges[matchIdx].kind !== tag) {
      matchIdx++;
    }
    if (matchIdx >= ranges.length) continue;

    const range = ranges[matchIdx];
    // Text validation when sourceContent is available
    if (sourceContent && !textContentMatches(el, sourceContent, range)) {
      continue;
    }

    assignCommentable(el, range);
    rangeIdx = matchIdx + 1;
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
  const frontmatter = parseLeadingFrontmatter(content);

  // Step 1: Replace comment markers with HTML spans BEFORE markdown parsing.
  const contentWithSpans = injectHighlightSpans(frontmatter.bodyMarkdown, comments);

  // Step 2: Compute exact source ranges from markdown body, then remap to original source offsets.
  const ranges = offsetRanges(
    collectCommentableRanges(frontmatter.bodyMarkdown),
    frontmatter.consumedChars
  );

  // Step 3: Parse markdown with custom heading renderer for IDs.
  const slugCounts = new Map<string, number>();
  const renderer = new marked.Renderer();
  renderer.heading = ({ text, depth }: { text: string; depth: number }) => {
    let slug = slugify(text);
    const count = slugCounts.get(slug) ?? 0;
    slugCounts.set(slug, count + 1);
    if (count > 0) slug = `${slug}-${count}`;
    return `<h${depth} id="${slug}">${text}</h${depth}>\n`;
  };

  renderer.paragraph = ({ text }: { text: string }) => {
    if (!text.includes('\n')) {
      return `<p>${text}</p>\n`;
    }

    const parts = splitAtTopLevelNewline(text);
    if (parts.length <= 1) {
      return `<p>${text.replace(/\n/g, '<br>')}</p>\n`;
    }

    const lines = parts
      .filter(p => p.trim())
      .map(p => `<p class="preview-line">${p}</p>`)
      .join('\n');
    return `<div class="preview-paragraph">${lines}</div>\n`;
  };

  const markdownHtml = marked.parse(contentWithSpans, {
    async: false,
    gfm: true,
    breaks: true,
    renderer,
  }) as string;

  const html = renderFrontmatterHtml(frontmatter.entries) + markdownHtml;

  return { html, ranges };
}

function setupElementClickHandlers() {
  if (!previewContainer) return;

  const commentables = previewContainer.querySelectorAll<HTMLElement>('[data-commentable="true"]');

  commentables.forEach((el) => {
    el.addEventListener('click', (e) => {
      if (e.metaKey || e.ctrlKey) return;

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

  previewContainer.addEventListener('click', (e) => {
    if (!(e.metaKey || e.ctrlKey)) return;
    if (!addCommentCallback) return;

    const target = (e.target as HTMLElement).closest('[data-commentable="true"]') as HTMLElement;
    if (!target) return;

    e.preventDefault();
    e.stopPropagation();

    const sourceStart = parseInt(target.dataset.sourceStart ?? '0', 10);
    const sourceEnd = parseInt(target.dataset.sourceEnd ?? '0', 10);
    addCommentCallback(sourceStart, sourceEnd, target);
    hideHoverButtonNow();
  });

  hoverListenersAttached = true;
}

function highlightCodeBlocks() {
  if (!previewContainer) return;
  const codeBlocks = previewContainer.querySelectorAll<HTMLElement>('pre code');
  codeBlocks.forEach((block) => {
    hljs.highlightElement(block);
  });
}

export function updatePreview(content: string, comments: ReviewComment[]) {
  if (!previewContainer) return;

  const { html, ranges } = renderMarkdown(content, comments);
  previewContainer.innerHTML = html;
  setCommentableAttributes(previewContainer, ranges, content);
  applyCommentHighlights(previewContainer, comments);

  setupElementClickHandlers();
  setupHoverHandlers();
  highlightCodeBlocks();
}

export function scrollPreviewToComment(commentId: string) {
  if (!previewContainer) return;

  const element = previewContainer.querySelector(`[data-comment-id="${commentId}"]`);
  element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

export function getPreviewContainer(): HTMLElement | null {
  return previewContainer;
}
