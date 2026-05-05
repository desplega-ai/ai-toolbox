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
import ruby from 'highlight.js/lib/languages/ruby';
import go from 'highlight.js/lib/languages/go';
import java from 'highlight.js/lib/languages/java';
import c from 'highlight.js/lib/languages/c';
import cpp from 'highlight.js/lib/languages/cpp';
import diff from 'highlight.js/lib/languages/diff';
import dockerfile from 'highlight.js/lib/languages/dockerfile';
import ini from 'highlight.js/lib/languages/ini';
import kotlin from 'highlight.js/lib/languages/kotlin';
import swift from 'highlight.js/lib/languages/swift';
import php from 'highlight.js/lib/languages/php';
import plaintext from 'highlight.js/lib/languages/plaintext';
import type { ReviewComment } from './comments';
import type { Tab } from './tabs';
import { renderMermaidBlocks, resetMermaidProcessed } from './mermaid';

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
hljs.registerLanguage('ruby', ruby);
hljs.registerLanguage('go', go);
hljs.registerLanguage('java', java);
hljs.registerLanguage('c', c);
hljs.registerLanguage('cpp', cpp);
hljs.registerLanguage('diff', diff);
hljs.registerLanguage('dockerfile', dockerfile);
hljs.registerLanguage('ini', ini);
hljs.registerLanguage('kotlin', kotlin);
hljs.registerLanguage('swift', swift);
hljs.registerLanguage('php', php);
hljs.registerLanguage('plaintext', plaintext);

// Register common aliases
hljs.registerAliases(['js', 'jsx'], { languageName: 'javascript' });
hljs.registerAliases(['ts', 'tsx'], { languageName: 'typescript' });
hljs.registerAliases(['py'], { languageName: 'python' });
hljs.registerAliases(['sh', 'shell', 'zsh'], { languageName: 'bash' });
hljs.registerAliases(['html', 'htm', 'svg'], { languageName: 'xml' });
hljs.registerAliases(['yml'], { languageName: 'yaml' });
hljs.registerAliases(['md'], { languageName: 'markdown' });
hljs.registerAliases(['rs'], { languageName: 'rust' });
hljs.registerAliases(['rb'], { languageName: 'ruby' });
hljs.registerAliases(['golang'], { languageName: 'go' });
hljs.registerAliases(['c++', 'cc', 'h', 'hpp'], { languageName: 'cpp' });
hljs.registerAliases(['patch'], { languageName: 'diff' });
hljs.registerAliases(['docker'], { languageName: 'dockerfile' });
hljs.registerAliases(['toml', 'conf', 'cfg', 'properties'], { languageName: 'ini' });
hljs.registerAliases(['kt', 'kts'], { languageName: 'kotlin' });
hljs.registerAliases(['text', 'txt'], { languageName: 'plaintext' });

// Mermaid integration: rewrite ` ```mermaid ` code tokens into `html` tokens
// so marked's default code renderer (and downstream hljs) never sees them.
// The original source is stashed in `data-src` (URI-encoded) so theme switches
// can restore + re-render the diagrams.
//
// We can't use `marked.use({ walkTokens })` here because we render via
// `marked.lexer` + `marked.parser`, and `marked.parser(tokens, opts)` does NOT
// invoke registered walkTokens (only `marked.parse` does). Instead we walk the
// tokens manually in `preprocessTokens` between lex and parse.
function mutateMermaidToken(token: Token): void {
  if (token.type === 'code' && (token as Tokens.Code).lang === 'mermaid') {
    const codeToken = token as Tokens.Code;
    const source = codeToken.text ?? '';
    const mutable = codeToken as unknown as {
      type: string;
      pre: boolean;
      text: string;
      block?: boolean;
    };
    mutable.type = 'html';
    mutable.pre = false;
    mutable.block = true;
    mutable.text = `<pre class="mermaid" data-src="${encodeURIComponent(source)}">${escapeHtml(source)}</pre>`;
  }
}

function walkAllTokens(tokens: Token[], visit: (t: Token) => void): void {
  for (const t of tokens) {
    visit(t);
    // Recurse into nested token containers so mermaid blocks nested inside
    // list items / blockquotes also get mutated.
    const anyT = t as unknown as { tokens?: Token[]; items?: Tokens.ListItem[] };
    if (anyT.tokens) walkAllTokens(anyT.tokens, visit);
    if (anyT.items) {
      for (const item of anyT.items) {
        walkAllTokens(item.tokens, visit);
      }
    }
  }
}

let previewContainer: HTMLElement | null = null;
let hoverButton: HTMLElement | null = null;
let currentHoverElement: HTMLElement | null = null;
let addCommentCallback: ((sourceStart: number, sourceEnd: number, element: HTMLElement) => void) | null = null;
let hoverListenersAttached = false;
let hideTimeout: ReturnType<typeof setTimeout> | null = null;
// Reserved for step-2/3: lets the preview module read active-tab state
// (path, comments, etc.) without re-threading them through every call. Passed
// in once at startup via `initPreview`.
let getActiveTab: () => Tab | null = () => null;

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
  | 'tr'
  | 'p-line'
  | 'li-line'
  | 'bq-line'
  | 'code-line';

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

export function initPreview(
  container: HTMLElement,
  activeTabAccessor: () => Tab | null = () => null
) {
  previewContainer = container;
  getActiveTab = activeTabAccessor;
}

// Forward-compat hook for step-2/3.
export function getActiveTabFromPreview(): Tab | null {
  return getActiveTab();
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
    tagName === 'tr' ||
    tagName === 'p-line' ||
    tagName === 'li-line' ||
    tagName === 'bq-line' ||
    tagName === 'code-line'
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

interface LineCollectOpts {
  // For ```code``` — drop opening/closing fence lines from the emitted ranges.
  skipFenceLines?: boolean;
  // For blockquotes — strip the leading "> " (or ">") from each line so the
  // emitted range starts at user-meaningful content.
  stripBlockquoteMarker?: boolean;
  // For loose-list paragraphs / list-item content — strip the list marker
  // ("- ", "* ", "1. ", …) on the line that contains it.
  stripListMarker?: boolean;
  // For list items — strip leading whitespace on continuation lines so the
  // range starts at visible content (the indent is structural in markdown).
  // Code blocks should NOT use this since indentation is meaningful.
  stripLeadingWhitespace?: boolean;
  // For code blocks — emit a (zero-length) range for blank source lines too,
  // so wrapCodeLines's parts/ranges counts stay aligned across the entire
  // block. Without this, a code block with internal blank lines would skip
  // wrapping and become uncommentable.
  keepEmptyLines?: boolean;
  // Skip lines whose source position falls inside any of these spans (offsets
  // are relative to `raw`). Used to exclude nested-list lines from a list
  // item's per-line ranges since they're emitted via recursion.
  skipSpans?: ReadonlyArray<readonly [number, number]>;
}

function isInsideAnySpan(
  spans: ReadonlyArray<readonly [number, number]> | undefined,
  start: number,
  end: number
): boolean {
  if (!spans || spans.length === 0) return false;
  for (const [s, e] of spans) {
    if (start >= s && end <= e) return true;
  }
  return false;
}

function stripLeadingListMarker(text: string): { stripped: string; consumed: number } {
  const m = text.match(/^(\s*(?:[-*+]|\d+[.)])\s+)/);
  if (!m) return { stripped: text, consumed: 0 };
  return { stripped: text.slice(m[0].length), consumed: m[0].length };
}

function stripBlockquoteMarker(text: string): { stripped: string; consumed: number } {
  // Tolerate leading list-item indent ("  > ...") so this works for both
  // top-level and nested-inside-li blockquotes.
  const m = text.match(/^[ \t]*>[ \t]?/);
  if (!m) return { stripped: text, consumed: 0 };
  return { stripped: text.slice(m[0].length), consumed: m[0].length };
}

function isFenceLine(text: string): boolean {
  const trimmed = text.trim();
  return /^```/.test(trimmed) || /^~~~/.test(trimmed);
}

function collectLineRanges(
  blockStart: number,
  raw: string,
  kind: CommentableKind,
  opts: LineCollectOpts = {}
): CommentableRange[] {
  const out: CommentableRange[] = [];
  const lines = splitRawLines(raw);
  let markerStripped = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (opts.skipFenceLines && (i === 0 || i === lines.length - 1) && isFenceLine(line.text)) {
      continue;
    }

    if (isInsideAnySpan(opts.skipSpans, line.start, line.end)) {
      continue;
    }

    let inner = line.text;
    let innerOffset = 0;

    if (opts.stripBlockquoteMarker) {
      const r = stripBlockquoteMarker(inner);
      inner = r.stripped;
      innerOffset += r.consumed;
    }

    if (opts.stripListMarker && !markerStripped) {
      const r = stripLeadingListMarker(inner);
      if (r.consumed > 0) {
        inner = r.stripped;
        innerOffset += r.consumed;
        markerStripped = true;
      }
    }

    if (opts.stripLeadingWhitespace && markerStripped) {
      // After the list marker is stripped (on this or a prior line), drop any
      // structural indent on continuation lines so the range starts at
      // visible content.
      const leading = inner.match(/^[ \t]+/);
      if (leading) {
        inner = inner.slice(leading[0].length);
        innerOffset += leading[0].length;
      }
    }

    if (inner.trim().length === 0) {
      // For code blocks we still need a per-line range so wrapCodeLines can
      // pair each rendered line (including blanks) with a source offset.
      if (opts.keepEmptyLines) {
        const at = blockStart + line.start + innerOffset;
        out.push({ start: at, end: at, kind });
      }
      continue;
    }

    const trimmedEnd = inner.trimEnd().length;
    const start = blockStart + line.start + innerOffset;
    const end = start + trimmedEnd;
    if (end > start) {
      out.push({ start, end, kind });
    }
  }

  return out;
}

export function splitAtTopLevelBreak(html: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let lastSplit = 0;
  let i = 0;

  while (i < html.length) {
    if (html[i] === '<') {
      // Check for <br> tag — treat as a split point (like \n)
      const brMatch = html.slice(i).match(/^<br\s*\/?>/i);
      if (brMatch) {
        if (depth === 0) {
          parts.push(html.slice(lastSplit, i));
          lastSplit = i + brMatch[0].length;
          i = lastSplit;
          continue;
        } else {
          // <br> inside an inline tag — bail out, return unsplit
          return [html];
        }
      }

      // Check for closing tag
      const closeMatch = html.slice(i).match(/^<\/\w+\s*>/);
      if (closeMatch) {
        depth--;
        i += closeMatch[0].length;
        continue;
      }

      // Check for self-closing tags (e.g. <img ... />, <hr>, <input>)
      const selfCloseMatch = html.slice(i).match(/^<(?:hr|img|input)\b[^>]*\/?>/i);
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

    // Literal \n — also treat as a split point for raw text
    if (html[i] === '\n') {
      if (depth === 0) {
        parts.push(html.slice(lastSplit, i));
        lastSplit = i + 1;
      } else {
        return [html];
      }
      i++;
      continue;
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
    // Single-line paragraph → kind 'p'. The renderer emits a bare <p> and
    // setCommentableAttributes maps it via the legacy 1:1 path.
    addRangeFromRaw(ranges, tokenStart, raw, 'p');
    return;
  }

  // Multi-line paragraph → kind 'p-line' per source line. The renderer emits
  // a <p class="preview-line"> per line with data-commentable already stamped,
  // so these ranges are intentionally OUTSIDE the legacy-mapped kinds — they
  // would otherwise collide with single-line <p> ranges in setCommentableAttributes.
  // Cross-line bold/italic renders as literal `**` per line (documented trade-off).
  for (const line of lines) {
    const trimmedEnd = line.text.trimEnd().length;
    addRangeFromBounds(
      ranges,
      tokenStart + line.start,
      tokenStart + line.start + trimmedEnd,
      'p-line'
    );
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

function isBlockChildToken(t: Token): boolean {
  return (
    t.type === 'list' ||
    t.type === 'code' ||
    t.type === 'blockquote' ||
    t.type === 'table' ||
    t.type === 'html' ||
    t.type === 'hr'
  );
}

/**
 * Locate a block-level child token's source span inside its parent list-item
 * `raw`. marked dedents nested code/blockquote/list raws relative to the parent
 * indent, so a literal `indexOf(child.raw)` fails for fenced code blocks. We
 * fall back to matching the child's first line as a suffix of an itemRaw line
 * (allowing arbitrary leading whitespace), then walk forward by the child's
 * newline count to find the span's end.
 */
function findBlockChildSpan(
  itemRaw: string,
  child: Token,
  fromIdx: number
): { lineStart: number; rawStart: number; rawEnd: number } | null {
  const childRaw = (child as { raw?: string }).raw ?? '';
  if (!childRaw) return null;

  // Fast path: exact substring match (works for tokens whose raw preserves the
  // parent's indentation — e.g. some text tokens, certain table tokens).
  const exact = itemRaw.indexOf(childRaw, fromIdx);
  if (exact >= 0) {
    const lineStart = itemRaw.lastIndexOf('\n', exact - 1) + 1;
    return { lineStart, rawStart: exact, rawEnd: exact + childRaw.length };
  }

  // Fuzzy path: find a line in itemRaw whose trim-start matches childRaw's
  // first line.
  const firstLine = childRaw.split('\n', 1)[0] ?? '';
  if (!firstLine) return null;
  const newlineCount = (childRaw.match(/\n/g) ?? []).length;
  const trailingNewline = childRaw.endsWith('\n');

  let i = fromIdx;
  while (i < itemRaw.length) {
    const lineStart = i;
    const nlIdx = itemRaw.indexOf('\n', i);
    const lineEnd = nlIdx < 0 ? itemRaw.length : nlIdx;
    const line = itemRaw.slice(lineStart, lineEnd);
    const trimIdx = line.search(/\S/);
    if (trimIdx >= 0 && line.slice(trimIdx) === firstLine) {
      const rawStart = lineStart + trimIdx;
      // Advance newlineCount newlines to find the end.
      let cursor = lineStart;
      for (let n = 0; n < newlineCount; n++) {
        const nl = itemRaw.indexOf('\n', cursor);
        if (nl < 0) { cursor = itemRaw.length; break; }
        cursor = nl + 1;
      }
      let rawEnd = cursor;
      if (!trailingNewline) {
        // Extend to end of the (newlineCount+1)th line, no trailing \n.
        const nl = itemRaw.indexOf('\n', rawEnd);
        rawEnd = nl < 0 ? itemRaw.length : nl;
      }
      return { lineStart, rawStart, rawEnd };
    }
    i = nlIdx < 0 ? itemRaw.length : nlIdx + 1;
  }
  return null;
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
    searchFrom = itemOffset + itemRaw.length;

    // Find every block-level child token (nested list, code block, blockquote,
    // table, raw HTML, hr) inside this item. Track each one's line-aligned
    // span so per-line `li-line` ranges skip those lines, AND its `raw`-aligned
    // offset so we can recurse and emit nested ranges of the right kind.
    type ChildSpan = { token: Token; lineStart: number; rawStart: number; rawEnd: number };
    const childSpans: ChildSpan[] = [];
    let childSearchFrom = 0;
    for (const child of item.tokens) {
      if (!isBlockChildToken(child)) continue;
      const span = findBlockChildSpan(itemRaw, child, childSearchFrom);
      if (!span) continue;
      childSpans.push({ token: child, ...span });
      childSearchFrom = span.rawEnd;
    }

    const skipSpans = childSpans.map((c) => [c.lineStart, c.rawEnd] as const);
    const lineRanges = collectLineRanges(itemStart, itemRaw, 'li-line', {
      stripListMarker: true,
      stripLeadingWhitespace: true,
      skipSpans,
    });
    ranges.push(...lineRanges);

    // Recurse to emit ranges for each block-level child. Use the ORIGINAL
    // (still-indented) source slice from itemRaw so child line offsets match
    // real source positions — `child.raw` is dedented by marked.
    for (const c of childSpans) {
      const blockStart = itemStart + c.rawStart;
      const sourceText = itemRaw.slice(c.rawStart, c.rawEnd);
      if (c.token.type === 'list') {
        collectListItemRanges(c.token as Tokens.List, blockStart, ranges);
      } else if (c.token.type === 'code') {
        ranges.push(
          ...collectLineRanges(blockStart, sourceText, 'code-line', { skipFenceLines: true, keepEmptyLines: true })
        );
      } else if (c.token.type === 'blockquote') {
        // stripBlockquoteMarker tolerates leading list-item indent.
        ranges.push(...collectLineRanges(blockStart, sourceText, 'bq-line', { stripBlockquoteMarker: true }));
      }
      // table/html/hr have no per-line ranges in the top-level collector either.
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
      ranges.push(...collectLineRanges(tokenStart, raw, 'bq-line', { stripBlockquoteMarker: true }));
    } else if (token.type === 'code') {
      ranges.push(
        ...collectLineRanges(tokenStart, raw, 'code-line', { skipFenceLines: true, keepEmptyLines: true })
      );
    } else if (isListToken(token)) {
      collectListItemRanges(token, tokenStart, ranges);
    } else if (isTableToken(token)) {
      collectTableRowRanges(token, tokenStart, ranges);
    }

    cursor = tokenEnd;
  }

  return ranges;
}

// Tags we still post-render-map via setCommentableAttributes. li/blockquote/pre
// are excluded because their content is now broken into per-line spans
// (li-line / bq-line / code-line) which are stamped by the renderers directly.
const LEGACY_MAPPED_TAGS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'tr']);
const LEGACY_MAPPED_KINDS = new Set<CommentableKind>([
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'tr',
]);

function getCommentableElements(root: ParentNode): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(COMMENTABLE_SELECTORS)).filter((el) => {
    // Renderer-stamped spans (preview-line, li-line, bq-line, code-line)
    // already carry the right offsets — don't re-map them.
    if (el.getAttribute('data-commentable') === 'true') return false;

    const tag = el.tagName.toLowerCase();
    if (!LEGACY_MAPPED_TAGS.has(tag)) return false;

    // A bare <p> or heading nested inside a list/quote isn't represented in
    // the legacy ranges array (the per-line spans cover its content), so leave
    // it alone to avoid spurious mismatches.
    if ((tag === 'p' || COMMENTABLE_HEADING_KINDS.has(tag)) &&
        (el.parentElement?.closest('blockquote') || el.parentElement?.closest('li'))) {
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
  // Drop renderer-stamped kinds — those elements were filtered out above and
  // already carry data-source-* attributes set during rendering.
  const legacyRanges = ranges.filter((r) => LEGACY_MAPPED_KINDS.has(r.kind));

  // Fast path: 1:1 count and kind match
  if (elements.length === legacyRanges.length) {
    let allMatch = true;
    for (let i = 0; i < elements.length; i++) {
      if (elements[i].tagName.toLowerCase() !== legacyRanges[i].kind) {
        allMatch = false;
        break;
      }
    }
    if (allMatch) {
      for (let i = 0; i < elements.length; i++) {
        assignCommentable(elements[i], legacyRanges[i]);
      }
      return;
    }
  }

  // Resilient path: greedy kind-based matching with optional text validation
  console.warn(
    `[preview] Commentable mapping mismatch (elements=${elements.length}, ranges=${legacyRanges.length}). ` +
    'Using resilient matching.'
  );

  let rangeIdx = 0;
  for (const el of elements) {
    const tag = el.tagName.toLowerCase();
    if (!isCommentableKind(tag)) continue;

    // Scan forward for next range with matching kind
    let matchIdx = rangeIdx;
    while (matchIdx < legacyRanges.length && legacyRanges[matchIdx].kind !== tag) {
      matchIdx++;
    }
    if (matchIdx >= legacyRanges.length) continue;

    const range = legacyRanges[matchIdx];
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
 * Walk the lexed token tree and stash `_sourceStart` (offset into the
 * ORIGINAL source, including any frontmatter `baseOffset`) on each block-level
 * token. Renderers read this to stamp `data-source-start/end` directly onto
 * per-line wrapper elements without a post-render mapping pass.
 */
function annotateSourceStart(tokens: Token[], baseOffset: number): void {
  let cursor = baseOffset;
  for (const t of tokens) {
    (t as unknown as { _sourceStart: number })._sourceStart = cursor;

    if (isListToken(t)) {
      let searchFrom = 0;
      for (const item of t.items) {
        const off = t.raw.indexOf(item.raw, searchFrom);
        if (off < 0) continue;
        const itemStart = cursor + off;
        (item as unknown as { _sourceStart: number })._sourceStart = itemStart;
        searchFrom = off + item.raw.length;

        // Annotate every block-level child token of this list item so the
        // renderers we dispatch to (code, blockquote, list) can read their
        // own offsets when invoked via `parser.parse([child])`. Use the
        // dedent-tolerant span finder since marked normalizes nested raws.
        let childSearch = 0;
        for (const child of item.tokens) {
          if (!isBlockChildToken(child)) continue;
          const span = findBlockChildSpan(item.raw, child, childSearch);
          if (!span) continue;
          // Stash the original-indent slice so the renderer/collector can
          // compute correct per-line source offsets for dedented child raws.
          (child as unknown as { _sourceText: string })._sourceText =
            item.raw.slice(span.rawStart, span.rawEnd);
          annotateSourceStart([child], itemStart + span.rawStart);
          childSearch = span.rawEnd;
        }
      }
    }

    cursor += (t.raw ?? '').length;
  }
}

function getTokenSourceStart(token: object): number | undefined {
  const v = (token as { _sourceStart?: unknown })._sourceStart;
  return typeof v === 'number' ? v : undefined;
}

/**
 * For tokens nested inside a list item, marked dedents `child.raw` relative
 * to the parent indent. The renderer needs the ORIGINAL (still-indented)
 * source slice to compute correct per-line offsets, so we stash it on the
 * token at annotation time. Top-level tokens always have `_sourceText === raw`.
 */
function getTokenSourceText(token: object, fallback: string): string {
  const v = (token as { _sourceText?: unknown })._sourceText;
  return typeof v === 'string' ? v : fallback;
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

  // Step 3: Lex → annotate source offsets → render with custom renderers.
  const slugCounts = new Map<string, number>();
  const renderer = new marked.Renderer();
  renderer.heading = function ({ tokens, depth }: Tokens.Heading) {
    const text = this.parser.parseInline(tokens);
    let slug = slugify(text);
    const count = slugCounts.get(slug) ?? 0;
    slugCounts.set(slug, count + 1);
    if (count > 0) slug = `${slug}-${count}`;
    return `<h${depth} id="${slug}">${text}</h${depth}>\n`;
  };

  renderer.blockquote = function (token: Tokens.Blockquote): string {
    const blockStart = getTokenSourceStart(token);

    if (blockStart === undefined) {
      const body = this.parser.parse(token.tokens);
      return `<blockquote>${body}</blockquote>\n`;
    }

    const sourceText = getTokenSourceText(token, token.raw ?? '');
    const lines = splitRawLines(sourceText);
    const out: string[] = [];
    for (const line of lines) {
      const t = line.text.trim();
      if (!t || /^[ \t]*>+\s*$/.test(line.text)) continue;
      const m = stripBlockquoteMarker(line.text);
      const stripped = m.stripped.trimEnd();
      if (!stripped) continue;
      const html = marked.parseInline(stripped, { gfm: true, breaks: true });
      const start = blockStart + line.start + m.consumed;
      const end = start + stripped.length;
      out.push(
        `<span class="bq-line" data-commentable="true" data-source-start="${start}" data-source-end="${end}">${html}</span>`
      );
    }

    return `<blockquote>${out.join('')}</blockquote>\n`;
  };

  renderer.listitem = function (item: Tokens.ListItem): string {
    const itemStart = getTokenSourceStart(item);
    const raw = item.raw;

    if (itemStart === undefined) {
      // Fall back to a default-ish rendering if annotation is missing.
      const body = this.parser.parse(item.tokens);
      return `<li>${body}</li>\n`;
    }

    // Block-level child tokens of THIS list item are rendered via the default
    // parser pipeline so their lines don't end up as literal text. Nested
    // lists, fenced code blocks, blockquotes, tables, raw HTML, and hrs all
    // qualify. The dedent-tolerant span finder handles marked's normalized
    // child raws (where parent indentation is stripped).
    type ChildBlock = { token: Token; start: number; end: number };
    const childBlocks: ChildBlock[] = [];
    let childSearchFrom = 0;
    for (const child of item.tokens) {
      if (!isBlockChildToken(child)) continue;
      const span = findBlockChildSpan(raw, child, childSearchFrom);
      if (!span) continue;
      childBlocks.push({ token: child, start: span.lineStart, end: span.rawEnd });
      childSearchFrom = span.rawEnd;
    }

    const out: string[] = [];
    const rendered = new Set<ChildBlock>();
    let markerStripped = false;
    let firstContentLine = true;

    const lines = splitRawLines(raw);
    for (const line of lines) {
      const matching = childBlocks.find((s) => line.start >= s.start && line.end <= s.end);
      if (matching) {
        if (!rendered.has(matching)) {
          out.push(this.parser.parse([matching.token]));
          rendered.add(matching);
        }
        continue;
      }

      let inner = line.text;
      let innerOffset = 0;

      if (!markerStripped) {
        const m = stripLeadingListMarker(inner);
        if (m.consumed > 0) {
          inner = m.stripped;
          innerOffset += m.consumed;
          markerStripped = true;
        }
      } else {
        const leading = inner.match(/^[ \t]+/);
        if (leading) {
          inner = inner.slice(leading[0].length);
          innerOffset += leading[0].length;
        }
      }

      if (inner.trim().length === 0) continue;

      let prefix = '';
      if (item.task && firstContentLine) {
        const taskMatch = inner.match(/^\[([ xX])\]\s+/);
        if (taskMatch) {
          const checked = taskMatch[1] === 'x' || taskMatch[1] === 'X';
          prefix = `<input disabled type="checkbox"${checked ? ' checked' : ''}> `;
          inner = inner.slice(taskMatch[0].length);
          innerOffset += taskMatch[0].length;
        }
      }

      const content = inner.trimEnd();
      if (!content) continue;
      const html = marked.parseInline(content, { gfm: true, breaks: true });
      const start = itemStart + line.start + innerOffset;
      const end = start + content.length;
      out.push(
        `<span class="li-line" data-commentable="true" data-source-start="${start}" data-source-end="${end}">${prefix}${html}</span>`
      );
      firstContentLine = false;
    }

    return `<li>${out.join('')}</li>\n`;
  };

  renderer.code = function (token: Tokens.Code): string {
    const blockStart = getTokenSourceStart(token);
    const langClass = token.lang ? ` class="language-${escapeHtml(token.lang)}"` : '';
    const langBadge = token.lang
      ? `<span class="code-lang" aria-hidden="true">${escapeHtml(token.lang)}</span>`
      : '';
    const inner = (token.escaped ? token.text : escapeHtml(token.text)) + '\n';

    if (blockStart === undefined) {
      return `<pre>${langBadge}<code${langClass}>${inner}</code></pre>\n`;
    }

    // For nested code blocks, marked dedents `token.raw`; use the original
    // source slice (with indent intact) so per-line offsets match real source
    // positions. The visible <span class="code-line"> still shows dedented
    // content (because hljs decorates `code.text`), but the source range
    // covers the indented line so comments anchor correctly in the file.
    const sourceText = getTokenSourceText(token, token.raw);
    const lineRanges = collectLineRanges(blockStart, sourceText, 'code-line', {
      skipFenceLines: true,
      keepEmptyLines: true,
    });
    const json = encodeURIComponent(JSON.stringify(lineRanges));
    return `<pre data-code-line-ranges="${json}">${langBadge}<code${langClass}>${inner}</code></pre>\n`;
  };

  renderer.paragraph = function (token: Tokens.Paragraph) {
    const raw = token.raw ?? '';
    const tokenStart = getTokenSourceStart(token);
    const lines = splitRawLines(raw).filter((line) => line.text.trim().length > 0);

    if (lines.length <= 1 || tokenStart === undefined) {
      const text = this.parser.parseInline(token.tokens);
      return `<p>${text}</p>\n`;
    }

    // Pre-split source lines and parseInline each independently. Cross-line
    // bold/italic renders as literal `**` / `*` per line — accepted trade-off
    // for per-line commenting + j/k navigation on every visible line.
    const inner = lines
      .map((line) => {
        const lineText = line.text.trimEnd();
        const html = marked.parseInline(lineText, { gfm: true, breaks: true });
        const start = tokenStart + line.start;
        const end = start + lineText.length;
        return `<p class="preview-line" data-commentable="true" data-source-start="${start}" data-source-end="${end}">${html}</p>`;
      })
      .join('\n');
    return `<div class="preview-paragraph">${inner}</div>\n`;
  };

  const tokens = marked.lexer(contentWithSpans, { gfm: true, breaks: true });
  // Manual walker pass — `marked.parser(tokens, opts)` does NOT invoke any
  // registered `walkTokens`, so we mutate mermaid tokens here. Running this
  // BEFORE `annotateSourceStart` keeps offsets aligned: type changes don't
  // affect `raw.length`.
  walkAllTokens(tokens, mutateMermaidToken);
  annotateSourceStart(tokens, frontmatter.consumedChars);
  const markdownHtml = marked.parser(tokens, {
    gfm: true,
    breaks: true,
    renderer,
  }) as unknown as string;

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

/**
 * After hljs has decorated each `<pre><code>` with syntax-highlight spans,
 * split the highlighted HTML on top-level `\n` boundaries and wrap each line
 * in a `<span class="code-line" data-commentable="true" data-source-*>` so
 * each visible code line is individually navigable and commentable.
 *
 * Reads the per-line source ranges from `pre[data-code-line-ranges]` (set by
 * renderer.code). If hljs spans straddle a newline (e.g. multi-line strings),
 * `splitAtTopLevelBreak` returns the original HTML unsplit; we log a warning
 * and skip wrapping for that block.
 */
export function wrapCodeLines(container: ParentNode): void {
  const pres = container.querySelectorAll<HTMLPreElement>('pre[data-code-line-ranges]');
  pres.forEach((pre) => {
    if (pre.classList.contains('mermaid')) return;
    const code = pre.querySelector('code');
    if (!code) return;

    let lineRanges: CommentableRange[];
    try {
      const json = decodeURIComponent(pre.getAttribute('data-code-line-ranges') ?? '');
      lineRanges = JSON.parse(json) as CommentableRange[];
    } catch {
      pre.removeAttribute('data-code-line-ranges');
      return;
    }

    const inner = code.innerHTML;
    const parts = splitAtTopLevelBreak(inner);

    // marked appends a trailing `\n` inside `<code>`, so an N-line code block
    // produces N+1 parts with the last one empty. Trim it so part counts match.
    while (parts.length > 0 && parts[parts.length - 1].trim() === '' && parts.length > lineRanges.length) {
      parts.pop();
    }

    if (parts.length !== lineRanges.length) {
      console.warn(
        `[preview] code-block line count mismatch (parts=${parts.length}, ranges=${lineRanges.length}). ` +
          'Skipping per-line wrap for this block.'
      );
      pre.removeAttribute('data-code-line-ranges');
      return;
    }

    // Join spans with NO separator — each .code-line is `display: block`, so
    // adding a `\n` between them inside `<pre>` (which preserves whitespace)
    // would compound into a double line break and stretch the code block out.
    const wrapped = parts
      .map((part, i) => {
        const r = lineRanges[i];
        return `<span class="code-line" data-commentable="true" data-source-start="${r.start}" data-source-end="${r.end}">${part}</span>`;
      })
      .join('');

    code.innerHTML = wrapped;
    pre.removeAttribute('data-code-line-ranges');
  });
}

function addCopyButtons() {
  if (!previewContainer) return;
  const pres = previewContainer.querySelectorAll<HTMLPreElement>('pre');
  pres.forEach((pre) => {
    if (pre.classList.contains('mermaid')) return;
    if (pre.querySelector(':scope > .code-copy-btn')) return;
    const code = pre.querySelector('code');
    if (!code) return;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'code-copy-btn';
    btn.textContent = 'Copy';
    btn.setAttribute('aria-label', 'Copy code to clipboard');
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        await navigator.clipboard.writeText(code.innerText);
        btn.textContent = 'Copied';
        btn.classList.add('copied');
        setTimeout(() => {
          btn.textContent = 'Copy';
          btn.classList.remove('copied');
        }, 1200);
      } catch {
        btn.textContent = 'Failed';
        setTimeout(() => { btn.textContent = 'Copy'; }, 1200);
      }
    });

    if (getComputedStyle(pre).position === 'static') {
      pre.style.position = 'relative';
    }
    pre.appendChild(btn);
  });
}

// Cancel any in-flight mermaid render whenever a fresh `updatePreview` runs —
// only the latest call's diagrams should land in the DOM.
let activeMermaidController: AbortController | null = null;

export function updatePreview(content: string, comments: ReviewComment[]) {
  if (!previewContainer) return;

  const { html, ranges } = renderMarkdown(content, comments);
  previewContainer.innerHTML = html;
  setCommentableAttributes(previewContainer, ranges, content);

  // hljs decorates `<pre><code>` first; `wrapCodeLines` then wraps each
  // highlighted line in a commentable span. Highlights are applied AFTER the
  // wrap so existing comments overlap the new per-line spans.
  // walkTokens already converted ```mermaid fences to html tokens, so there
  // are no `language-mermaid` blocks for hljs to mangle.
  highlightCodeBlocks();
  wrapCodeLines(previewContainer);
  applyCommentHighlights(previewContainer, comments);

  setupElementClickHandlers();
  setupHoverHandlers();

  // Mermaid renders out-of-band so `updatePreview` stays synchronous and
  // never blocks keystroke updates. The previous render (if any) is aborted
  // so its DOM mutations can't clobber the latest content.
  activeMermaidController?.abort();
  activeMermaidController = new AbortController();
  void renderMermaidBlocks(previewContainer, activeMermaidController.signal);

  addCopyButtons();
}

export function scrollPreviewToComment(commentId: string) {
  if (!previewContainer) return;

  const element = previewContainer.querySelector(`[data-comment-id="${commentId}"]`);
  element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

export function getPreviewContainer(): HTMLElement | null {
  return previewContainer;
}

/**
 * Re-render every mermaid diagram in the preview with the latest theme.
 * Call from the theme toggle handler in main.ts.
 */
export function refreshMermaidForTheme(): void {
  if (!previewContainer) return;
  resetMermaidProcessed(previewContainer);
  activeMermaidController?.abort();
  activeMermaidController = new AbortController();
  void renderMermaidBlocks(previewContainer, activeMermaidController.signal);
}
