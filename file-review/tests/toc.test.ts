import { describe, expect, it } from 'bun:test';
import { renderMarkdown } from '../src/markdown-preview';
import { extractTocEntries } from '../src/toc';

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
