import { marked } from 'marked';
import { lexMarkdown, parseLeadingFrontmatter, slugify } from './markdown-preview';
import type { Tab } from './tabs';

export interface TocEntry {
  text: string;
  depth: number;
  id: string;
  sourcePos: number;
}

let getActiveTab: () => Tab | null = () => null;
let getScroller: () => HTMLElement | null = () => null;
let getCursor: () => number | null = () => null;

interface TocSources {
  /** The preview scroller whose headings drive the scroll-spy. */
  getScroller: () => HTMLElement | null;
  /** Editor cursor offset, used for the active entry in raw mode. */
  getCursor: () => number | null;
}

export function initToc(activeTabAccessor: () => Tab | null, sources?: TocSources) {
  getActiveTab = activeTabAccessor;
  if (sources) {
    getScroller = sources.getScroller;
    getCursor = sources.getCursor;
  }
  getScroller()?.addEventListener('scroll', scheduleTocActiveUpdate, { passive: true });
  window.addEventListener('resize', scheduleTocActiveUpdate);
}

// Forward-compat hook for step-2/3.
export function getActiveTabFromToc(): Tab | null {
  return getActiveTab();
}

/** A heading is "passed" once its top crosses this far below the scroller top. */
export const ACTIVATION_OFFSET = 88;

/**
 * Scroll-spy for the preview, ported from agent-fs `computeActiveHeadings`.
 * `tops` are viewport tops of each heading (non-finite when missing). The
 * active entry is the last heading whose top passed `viewTop + offset`; a
 * section [top, next top) is visible when it intersects the viewport.
 */
export function computeActiveHeadings(
  tops: number[],
  viewTop: number,
  viewBottom: number,
  offset = ACTIVATION_OFFSET
): { active: number; visible: Set<number> } {
  let active = -1;
  const visible = new Set<number>();
  for (let i = 0; i < tops.length; i++) {
    const top = tops[i];
    if (!Number.isFinite(top)) continue;
    const next = tops[i + 1];
    const sectionBottom = next !== undefined && Number.isFinite(next) ? next : viewBottom;
    if (sectionBottom >= viewTop && top <= viewBottom) visible.add(i);
    if (top <= viewTop + offset) active = i;
  }
  return { active, visible };
}

/** Raw mode: the last heading at or before the cursor, or -1 before the first. */
export function activeIndexForCursor(entries: TocEntry[], cursor: number): number {
  let active = -1;
  for (let i = 0; i < entries.length && entries[i].sourcePos <= cursor; i++) active = i;
  return active;
}

export function extractTocEntries(content: string): TocEntry[] {
  // Skip leading YAML frontmatter exactly like the preview does, otherwise its
  // closing `---` turns the frontmatter into a setext heading.
  const { bodyMarkdown, consumedChars } = parseLeadingFrontmatter(content);
  const tokens = lexMarkdown(bodyMarkdown);
  const entries: TocEntry[] = [];
  const slugCounts = new Map<string, number>();
  let cursor = consumedChars;

  for (const token of tokens) {
    const raw = token.raw ?? '';
    const tokenStart = cursor;
    cursor += raw.length;

    if (token.type === 'heading') {
      const text = token.text;
      // Slug the rendered inline HTML, same as the preview heading renderer,
      // so ids match for headings with markup or entities.
      let slug = slugify(marked.parseInline(text, { gfm: true, breaks: true }) as string);
      const count = slugCounts.get(slug) ?? 0;
      slugCounts.set(slug, count + 1);
      if (count > 0) slug = `${slug}-${count}`;
      entries.push({ text, depth: token.depth, id: slug, sourcePos: tokenStart });
    }
  }

  return entries;
}

let tocSearchWired = false;
let tocEntries: TocEntry[] = [];
let tocEntryEls: HTMLElement[] = [];
let tocIndicator: HTMLElement | null = null;
let tocActive = -1;
let tocVisible = new Set<number>();
let tocRaf = 0;

export function renderToc(
  entries: TocEntry[],
  onEntryClick: (entry: TocEntry) => void
) {
  const tocList = document.getElementById('toc-list');
  if (!tocList) return;

  tocList.innerHTML = '';
  tocEntries = entries;
  tocEntryEls = [];
  tocIndicator = null;
  tocActive = -1;
  tocVisible = new Set();

  if (entries.length === 0) {
    tocList.innerHTML = '<div class="no-toc">No headings found</div>';
    return;
  }

  tocIndicator = document.createElement('span');
  tocIndicator.className = 'toc-indicator';
  tocIndicator.setAttribute('aria-hidden', 'true');
  tocList.appendChild(tocIndicator);

  const minDepth = Math.min(...entries.map((e) => e.depth));
  const query = (document.getElementById('toc-search-input') as HTMLInputElement | null)?.value ?? '';
  for (const entry of entries) {
    const el = document.createElement('div');
    el.className = 'toc-entry';
    el.style.paddingLeft = `${(entry.depth - minDepth) * 12 + 10}px`;
    el.textContent = entry.text;
    el.title = entry.text;
    el.dataset.tocText = entry.text.toLowerCase();
    el.addEventListener('click', () => onEntryClick(entry));
    tocList.appendChild(el);
    tocEntryEls.push(el);
  }
  // Keep an open filter applied across re-renders (they run on every edit).
  if (query) filterTocEntries(query);

  if (!tocSearchWired) {
    wireTocSearch();
    tocSearchWired = true;
  }
  // Synchronous so re-renders on every edit don't flash the active entry.
  updateTocActive();
}

export function scheduleTocActiveUpdate() {
  if (tocRaf) return;
  tocRaf = requestAnimationFrame(() => {
    tocRaf = 0;
    updateTocActive();
  });
}

/** Recompute the active / visible outline entries for the current view. */
export function updateTocActive() {
  const tab = getActiveTab();
  if (!tab?.isMarkdownFile || tocEntries.length === 0) {
    setTocActive(-1, new Set());
    return;
  }
  if (tab.isRawMode) {
    const cursor = getCursor();
    setTocActive(cursor === null ? -1 : activeIndexForCursor(tocEntries, cursor), new Set());
    return;
  }
  const scroller = getScroller();
  if (!scroller) return;
  const rect = scroller.getBoundingClientRect();
  const tops = tocEntries.map((entry) => {
    const el = scroller.querySelector('#' + CSS.escape(entry.id));
    return el ? el.getBoundingClientRect().top : Number.POSITIVE_INFINITY;
  });
  const { active, visible } = computeActiveHeadings(tops, rect.top, rect.bottom);
  setTocActive(active, visible);
}

function setTocActive(active: number, visible: Set<number>) {
  const sameVisible =
    visible.size === tocVisible.size && [...visible].every((i) => tocVisible.has(i));
  if (active === tocActive && sameVisible) {
    positionTocIndicator();
    return;
  }
  tocActive = active;
  tocVisible = visible;
  tocEntryEls.forEach((el, i) => {
    el.classList.toggle('toc-active', i === active);
    el.classList.toggle('toc-visible', i !== active && visible.has(i));
  });
  positionTocIndicator();
}

function positionTocIndicator() {
  if (!tocIndicator) return;
  const el = tocEntryEls[tocActive];
  if (!el || el.classList.contains('toc-hidden')) {
    tocIndicator.hidden = true;
    return;
  }
  tocIndicator.hidden = false;
  // Only slide between entries; a freshly rendered list jumps into place.
  const firstPlacement = tocIndicator.dataset.placed !== 'true';
  if (firstPlacement) tocIndicator.style.transition = 'none';
  tocIndicator.style.transform = `translateY(${el.offsetTop}px)`;
  tocIndicator.style.height = `${el.offsetHeight}px`;
  if (firstPlacement) {
    void tocIndicator.offsetHeight;
    tocIndicator.style.transition = '';
    tocIndicator.dataset.placed = 'true';
  }
}

function wireTocSearch() {
  const searchBtn = document.getElementById('toc-search-btn');
  const searchContainer = document.getElementById('toc-search-container');
  const searchInput = document.getElementById('toc-search-input') as HTMLInputElement | null;

  if (!searchBtn || !searchContainer || !searchInput) return;

  searchBtn.addEventListener('click', () => {
    const visible = searchContainer.style.display !== 'none';
    if (visible) {
      searchContainer.style.display = 'none';
      searchInput.value = '';
      filterTocEntries('');
    } else {
      searchContainer.style.display = 'block';
      searchInput.focus();
    }
  });

  searchInput.addEventListener('input', () => {
    filterTocEntries(searchInput.value);
  });

  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      searchInput.value = '';
      filterTocEntries('');
      searchContainer.style.display = 'none';
    }
  });
}

function filterTocEntries(query: string) {
  const tocList = document.getElementById('toc-list');
  if (!tocList) return;

  const lowerQuery = query.toLowerCase().trim();
  const entries = tocList.querySelectorAll<HTMLElement>('.toc-entry');

  for (const entry of entries) {
    const text = entry.dataset.tocText || '';
    if (!lowerQuery || text.includes(lowerQuery)) {
      entry.classList.remove('toc-hidden');
    } else {
      entry.classList.add('toc-hidden');
    }
  }
  positionTocIndicator();
}
