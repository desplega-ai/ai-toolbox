import { describe, expect, it } from 'bun:test';
import { collectLinks, groupLinks, relativeToFile } from '../src/relations';

const CURRENT = '/Users/me/docs/guide/intro.md';

describe('collectLinks', () => {
  it('finds links and images in paragraphs, lists, quotes and tables', () => {
    const md = [
      '---',
      'title: [not](a-link.md)',
      '---',
      'See [the **next** page](./next.md) and ![diagram](img/d.png).',
      '',
      '- [API](../api/ref.md#auth)',
      '',
      '> Quote with <https://example.com>',
      '',
      '| Col |',
      '|---|',
      '| [cell](data.csv) |',
      '',
      '```',
      '[not a link](x.md)',
      '```',
    ].join('\n');
    expect(collectLinks(md)).toEqual([
      { href: './next.md', text: 'the next page', image: false },
      { href: 'img/d.png', text: 'diagram', image: true },
      { href: '../api/ref.md#auth', text: 'API', image: false },
      { href: 'https://example.com', text: 'https://example.com', image: false },
      { href: 'data.csv', text: 'cell', image: false },
    ]);
  });
});

describe('groupLinks', () => {
  it('sorts targets into sections and drops anchors and duplicates', () => {
    const groups = groupLinks(
      [
        { href: './next.md', text: 'Next', image: false },
        { href: 'next.md', text: 'Again', image: false },
        { href: '#local', text: 'Anchor', image: false },
        { href: 'data.csv', text: '', image: false },
        { href: 'img/d.png', text: 'Diagram', image: true },
        { href: 'https://x.dev/a.png', text: '', image: true },
        { href: 'data:image/png;base64,AAA', text: 'inline', image: true },
        { href: 'https://example.com', text: 'Site', image: false },
        { href: 'ftp://old', text: 'Old', image: false },
      ],
      CURRENT
    );
    expect(groups.docs).toEqual([
      { label: 'Next', detail: '/Users/me/docs/guide/next.md', href: './next.md', path: '/Users/me/docs/guide/next.md' },
    ]);
    expect(groups.files).toEqual([
      { label: 'data.csv', detail: '/Users/me/docs/guide/data.csv', href: 'data.csv', path: '/Users/me/docs/guide/data.csv' },
    ]);
    expect(groups.images.map((r) => r.label)).toEqual(['Diagram', 'https://x.dev/a.png']);
    expect(groups.images[1].path).toBeUndefined();
    expect(groups.external.map((r) => r.detail)).toEqual(['https://example.com']);
  });
});

describe('relativeToFile', () => {
  it('shortens paths inside the current folder', () => {
    expect(relativeToFile('/Users/me/docs/guide/sub/a.md', CURRENT)).toBe('sub/a.md');
    expect(relativeToFile('/Users/me/other.md', CURRENT)).toBe('/Users/me/other.md');
    expect(relativeToFile('/x.md', null)).toBe('/x.md');
  });
});
