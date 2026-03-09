import { marked } from 'marked';
import { slugify } from './markdown-preview';

export interface TocEntry {
  text: string;
  depth: number;
  id: string;
  sourcePos: number;
}

export function extractTocEntries(content: string): TocEntry[] {
  const tokens = marked.lexer(content, { gfm: true, breaks: true });
  const entries: TocEntry[] = [];
  const slugCounts = new Map<string, number>();
  let cursor = 0;

  for (const token of tokens) {
    const raw = token.raw ?? '';
    const tokenStart = cursor;
    cursor += raw.length;

    if (token.type === 'heading') {
      const text = token.text;
      let slug = slugify(text);
      const count = slugCounts.get(slug) ?? 0;
      slugCounts.set(slug, count + 1);
      if (count > 0) slug = `${slug}-${count}`;
      entries.push({ text, depth: token.depth, id: slug, sourcePos: tokenStart });
    }
  }

  return entries;
}

let tocSearchWired = false;

export function renderToc(
  entries: TocEntry[],
  onEntryClick: (entry: TocEntry) => void
) {
  const tocList = document.getElementById('toc-list');
  if (!tocList) return;

  tocList.innerHTML = '';

  if (entries.length === 0) {
    tocList.innerHTML = '<div class="no-toc">No headings found</div>';
    return;
  }

  for (const entry of entries) {
    const el = document.createElement('div');
    el.className = `toc-entry toc-h${entry.depth}`;
    el.textContent = entry.text;
    el.title = entry.text;
    el.dataset.tocText = entry.text.toLowerCase();
    el.addEventListener('click', () => onEntryClick(entry));
    tocList.appendChild(el);
  }

  if (!tocSearchWired) {
    wireTocSearch();
    tocSearchWired = true;
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
}
