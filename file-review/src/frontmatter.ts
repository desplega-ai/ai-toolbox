import { icons } from './icons';

// Leading YAML frontmatter: a small line-based parser (no YAML dependency)
// and the collapsible "Properties" card the preview shows above the body.

export interface FrontmatterEntry {
  key: string;
  label: string;
  value: string | string[];
  isArray: boolean;
}

export interface FrontmatterParseResult {
  entries: FrontmatterEntry[];
  bodyMarkdown: string;
  consumedChars: number;
}

function toFrontmatterLabel(key: string): string {
  return key
    .split(/[_-]+/)
    .filter((part) => part.length > 0)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(' ');
}

/** Strip one pair of matching surrounding quotes. */
function unquote(value: string): string {
  const quote = value[0];
  if ((quote === '"' || quote === "'") && value.length >= 2 && value[value.length - 1] === quote) {
    return value.slice(1, -1);
  }
  return value;
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
    .map(unquote);
}

const BLOCK_LIST_ITEM = /^\s*-\s+/;

export function parseLeadingFrontmatter(content: string): FrontmatterParseResult {
  const bomOffset = content.startsWith('﻿') ? 1 : 0;
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

  const lines = working.slice(afterOpening, cursor).split(/\r?\n/);
  const entries: FrontmatterEntry[] = [];

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    // Comments, blank lines, and indented or list lines that no key claimed.
    if (!rawLine.trim() || rawLine.trim().startsWith('#') || /^[\s-]/.test(rawLine)) {
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

    const label = toFrontmatterLabel(key);
    const rawValue = rawLine.slice(separatorIndex + 1).trim();

    // Block list: "key:" followed by "- item" lines.
    if (!rawValue && BLOCK_LIST_ITEM.test(lines[i + 1] ?? '')) {
      const items: string[] = [];
      while (BLOCK_LIST_ITEM.test(lines[i + 1] ?? '')) {
        i++;
        items.push(unquote(lines[i].replace(BLOCK_LIST_ITEM, '').trim()));
      }
      entries.push({ key, label, value: items, isArray: true });
      continue;
    }

    const isArray = rawValue.startsWith('[') && rawValue.endsWith(']');
    entries.push({
      key,
      label,
      value: isArray ? parseArrayValue(rawValue) : unquote(rawValue),
      isArray,
    });
  }

  const consumedChars = bomOffset + closingLineEnd;
  const bodyMarkdown = content.slice(consumedChars);

  return { entries, bodyMarkdown, consumedChars };
}

export type FrontmatterValueKind = 'status' | 'date' | 'commit' | 'url' | 'path' | 'text';
export type StatusTone = 'success' | 'progress' | 'danger' | 'neutral';

const DATE_VALUE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;

/** How a scalar value should be shown, from its key and shape. */
export function classifyFrontmatterValue(key: string, value: string): FrontmatterValueKind {
  const k = key.toLowerCase();
  if (k === 'status' || k === 'state') return 'status';
  if (DATE_VALUE.test(value)) return 'date';
  if (/^[0-9a-f]{7,40}$/i.test(value) && (/commit|sha|hash|rev/.test(k) || value.length === 40)) {
    return 'commit';
  }
  if (/^https?:\/\/\S+$/i.test(value)) return 'url';
  if (!/\s/.test(value) && /\.[a-z0-9]{1,8}$/i.test(value) && (value.includes('/') || /\.(md|markdown|mdx)$/i.test(value))) {
    return 'path';
  }
  return 'text';
}

const STATUS_TONES: Record<Exclude<StatusTone, 'neutral'>, string[]> = {
  success: ['complete', 'completed', 'done', 'approved', 'merged', 'shipped', 'resolved', 'accepted', 'final', 'implemented', 'published'],
  progress: ['in-progress', 'in_progress', 'in progress', 'wip', 'active', 'implementing', 'ongoing', 'review', 'in-review', 'in review', 'reviewing'],
  danger: ['blocked', 'failed', 'rejected', 'abandoned', 'cancelled', 'canceled', 'deprecated'],
};

export function statusTone(value: string): StatusTone {
  const v = value.trim().toLowerCase();
  for (const [tone, words] of Object.entries(STATUS_TONES)) {
    if (words.includes(v)) return tone as StatusTone;
  }
  return 'neutral';
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * "2026-03-17" -> "Mar 17, 2026"; with a time, "Mar 17, 2026 12:00". Read
 * from the text as written, so the shown day never shifts with the timezone.
 */
export function formatFrontmatterDate(value: string): string {
  const m = DATE_VALUE.exec(value);
  if (!m) return value;
  const month = MONTHS[Number(m[2]) - 1];
  if (!month) return value;
  const date = `${month} ${Number(m[3])}, ${m[1]}`;
  return m[4] ? `${date} ${m[4]}:${m[5]}` : date;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderScalar(key: string, value: string): string {
  if (!value) return '<span class="frontmatter-empty">-</span>';
  const v = escapeHtml(value);
  switch (classifyFrontmatterValue(key, value)) {
    case 'status':
      return `<span class="fm-status fm-status-${statusTone(value)}">${v}</span>`;
    case 'date':
      return `<time class="fm-date" datetime="${v}" title="${v}">${escapeHtml(formatFrontmatterDate(value))}</time>`;
    case 'commit':
      return `<button type="button" class="fm-commit" data-copy="${v}" title="Copy ${v}">${escapeHtml(value.slice(0, 7))}</button>`;
    case 'url':
      return `<a href="${v}">${escapeHtml(value.replace(/^https?:\/\//i, ''))}</a>`;
    case 'path':
      // links.ts resolves it (file-relative, else from an ancestor folder).
      return `<a class="fm-path" href="${v}" data-fm-path="${v}">${v}</a>`;
    default:
      return `<span class="frontmatter-text">${v}</span>`;
  }
}

function renderChips(items: string[]): string {
  if (items.length === 0) return '<span class="frontmatter-empty">-</span>';
  const chips = items.map((item) => `<span class="frontmatter-chip">${escapeHtml(item)}</span>`).join('');
  return `<span class="frontmatter-chip-list">${chips}</span>`;
}

const GLANCE_TAGS = 3;

/** Status, date and the first tags, shown on the collapsed card. */
function renderGlance(entries: FrontmatterEntry[]): string {
  const parts: string[] = [];
  const scalar = (e: FrontmatterEntry) => (!e.isArray && e.value ? (e.value as string) : null);

  const status = entries.find((e) => scalar(e) && classifyFrontmatterValue(e.key, e.value as string) === 'status');
  if (status) parts.push(renderScalar(status.key, status.value as string));

  const dates = entries.filter((e) => scalar(e) && classifyFrontmatterValue(e.key, e.value as string) === 'date');
  const date = dates.find((e) => e.key.toLowerCase() === 'date') ?? dates[0];
  if (date) parts.push(renderScalar(date.key, date.value as string));

  const tags = entries.find((e) => e.isArray && e.key.toLowerCase() === 'tags') ?? entries.find((e) => e.isArray);
  const items = (tags?.value as string[] | undefined) ?? [];
  if (items.length > 0) {
    const shown = items.slice(0, GLANCE_TAGS).map((t) => `<span class="frontmatter-chip">${escapeHtml(t)}</span>`);
    if (items.length > GLANCE_TAGS) shown.push(`<span class="fm-more">+${items.length - GLANCE_TAGS}</span>`);
    parts.push(`<span class="frontmatter-chip-list">${shown.join('')}</span>`);
  }

  return parts.length > 0 ? `<span class="frontmatter-glance">${parts.join('')}</span>` : '';
}

// Collapsed by default; main.ts restores the saved state at startup.
let propertiesOpen = false;

export function setPropertiesOpen(open: boolean): void {
  propertiesOpen = open;
}

export function renderFrontmatterHtml(entries: FrontmatterEntry[], open = propertiesOpen): string {
  if (entries.length === 0) {
    return '';
  }

  const rows = entries
    .map((entry) => {
      const value = entry.isArray
        ? renderChips(entry.value as string[])
        : renderScalar(entry.key, entry.value as string);
      return (
        '<div class="frontmatter-row">' +
        `<span class="frontmatter-label">${escapeHtml(entry.label)}</span>` +
        `<span class="frontmatter-value">${value}</span>` +
        '</div>'
      );
    })
    .join('');

  return [
    `<details class="frontmatter-card" data-frontmatter="true"${open ? ' open' : ''}>`,
    '<summary class="frontmatter-summary">',
    `<span class="frontmatter-chevron">${icons['chevron-right']}</span>`,
    '<span class="frontmatter-title">Properties</span>',
    renderGlance(entries),
    `<span class="frontmatter-count" title="${entries.length} properties">${entries.length}</span>`,
    '</summary>',
    `<div class="frontmatter-grid">${rows}</div>`,
    '</details>',
  ].join('');
}

/**
 * Remember the card's open state across re-renders (the preview re-renders on
 * every edit) and copy commit hashes on click.
 */
export function initFrontmatter(
  container: HTMLElement,
  deps: {
    onToggle: (open: boolean) => void;
    toast: (message: string, type?: 'success' | 'info' | 'error') => void;
  }
): void {
  // `toggle` does not bubble; listen in the capture phase.
  container.addEventListener(
    'toggle',
    (e) => {
      const card = e.target as HTMLElement;
      if (!(card instanceof HTMLDetailsElement) || !card.classList.contains('frontmatter-card')) return;
      if (card.open === propertiesOpen) return;
      propertiesOpen = card.open;
      deps.onToggle(card.open);
    },
    true
  );

  container.addEventListener('click', (e) => {
    const button = (e.target as HTMLElement).closest<HTMLElement>('.fm-commit');
    if (!button || !container.contains(button)) return;
    e.preventDefault();
    void navigator.clipboard
      .writeText(button.dataset.copy ?? '')
      .then(() => deps.toast('Commit hash copied', 'success'))
      .catch(() => deps.toast('Could not copy the commit hash', 'error'));
  });
}
