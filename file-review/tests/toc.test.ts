import { describe, expect, it } from 'bun:test';
import { renderMarkdown } from '../src/markdown-preview';
import { activeIndexForCursor, computeActiveHeadings, extractTocEntries } from '../src/toc';

function previewHeadingIds(markdown: string): string[] {
  const root = document.createElement('div');
  root.innerHTML = renderMarkdown(markdown, []).html;
  return Array.from(root.querySelectorAll('h1, h2, h3, h4, h5, h6')).map((h) => h.id);
}

describe('extractTocEntries', () => {
  const markdown = [
    '---',
    'title: Sample',
    'tags: [a, b]',
    '---',
    '# First Heading',
    '',
    'Some text.',
    '',
    '## Second & `code`',
    '',
    '## First Heading',
    '',
  ].join('\n');

  it('skips leading frontmatter', () => {
    const entries = extractTocEntries(markdown);
    expect(entries.map((e) => e.text)).toEqual([
      'First Heading',
      'Second & `code`',
      'First Heading',
    ]);
  });

  it('maps sourcePos to the original source offsets', () => {
    const entries = extractTocEntries(markdown);
    expect(entries[0].sourcePos).toBe(markdown.indexOf('# First Heading'));
    expect(markdown.slice(entries[1].sourcePos).startsWith('## Second')).toBe(true);
    expect(markdown.slice(entries[2].sourcePos).startsWith('## First Heading')).toBe(true);
  });

  it('produces slugs equal to the preview heading ids', () => {
    const entries = extractTocEntries(markdown);
    expect(entries.map((e) => e.id)).toEqual(previewHeadingIds(markdown));
  });

  it('handles CRLF frontmatter and a BOM', () => {
    const crlf = '﻿---\r\ntitle: x\r\n---\r\n# Heading\r\n';
    const entries = extractTocEntries(crlf);
    expect(entries.length).toBe(1);
    expect(entries[0].text).toBe('Heading');
    expect(entries[0].sourcePos).toBe(crlf.indexOf('# Heading'));
  });

  it('leaves documents without frontmatter unchanged', () => {
    const plain = '# One\n\ntext\n\n## Two\n';
    const entries = extractTocEntries(plain);
    expect(entries.map((e) => e.sourcePos)).toEqual([0, plain.indexOf('## Two')]);
    expect(entries.map((e) => e.id)).toEqual(previewHeadingIds(plain));
  });
});

describe('computeActiveHeadings', () => {
  // Scroller spans 100..600, so the activation line sits at 188.
  it('picks the last heading whose top passed the activation line', () => {
    const { active } = computeActiveHeadings([-400, 50, 180, 300, 900], 100, 600);
    expect(active).toBe(2);
  });

  it('has no active heading before the first one passes the line', () => {
    expect(computeActiveHeadings([250, 700], 100, 600).active).toBe(-1);
  });

  it('marks sections that intersect the viewport as visible', () => {
    const { visible } = computeActiveHeadings([-400, 50, 180, 300, 900], 100, 600);
    // Section 0 ends at 50 (above the view); section 4 starts below it.
    expect([...visible].sort()).toEqual([1, 2, 3]);
  });

  it('skips headings missing from the DOM', () => {
    const { active, visible } = computeActiveHeadings([120, Infinity, 400], 100, 600);
    expect(active).toBe(0);
    expect(visible.has(1)).toBe(false);
    expect(visible.has(2)).toBe(true);
  });
});

describe('activeIndexForCursor', () => {
  const entries = extractTocEntries('intro\n\n# One\n\ntext\n\n## Two\n\nmore\n');

  it('returns -1 before the first heading', () => {
    expect(activeIndexForCursor(entries, 0)).toBe(-1);
  });

  it('follows the last heading at or before the cursor', () => {
    expect(activeIndexForCursor(entries, entries[0].sourcePos)).toBe(0);
    expect(activeIndexForCursor(entries, entries[1].sourcePos - 1)).toBe(0);
    expect(activeIndexForCursor(entries, entries[1].sourcePos + 3)).toBe(1);
  });
});
