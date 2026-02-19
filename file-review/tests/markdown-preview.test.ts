import { describe, expect, it } from 'bun:test';
import { collectCommentableRanges } from '../src/markdown-preview';

describe('collectCommentableRanges', () => {
  it('maps table rows to full source rows', () => {
    const markdown = [
      '| Name | Score |',
      '| ---- | ----- |',
      '| Alice | 10 |',
      '| Bob | 20 |',
      '',
    ].join('\n');

    const ranges = collectCommentableRanges(markdown).filter((range) => range.kind === 'tr');
    expect(ranges.length).toBe(3);
    expect(markdown.slice(ranges[0].start, ranges[0].end)).toBe('| Name | Score |');
    expect(markdown.slice(ranges[1].start, ranges[1].end)).toBe('| Alice | 10 |');
    expect(markdown.slice(ranges[2].start, ranges[2].end)).toBe('| Bob | 20 |');
  });

  it('maps headings, paragraphs, list items and code blocks in order', () => {
    const markdown = [
      '# Title',
      '',
      'Paragraph text with **bold**.',
      '',
      '- First item',
      '- Second item',
      '',
      '```ts',
      'const x = 1;',
      '```',
      '',
    ].join('\n');

    const ranges = collectCommentableRanges(markdown);
    expect(ranges.map((range) => range.kind)).toEqual(['h1', 'p', 'li', 'li', 'pre']);

    expect(markdown.slice(ranges[0].start, ranges[0].end)).toBe('# Title');
    expect(markdown.slice(ranges[1].start, ranges[1].end)).toContain('Paragraph text');
    expect(markdown.slice(ranges[2].start, ranges[2].end)).toBe('- First item');
    expect(markdown.slice(ranges[3].start, ranges[3].end)).toBe('- Second item');
    expect(markdown.slice(ranges[4].start, ranges[4].end)).toContain('const x = 1;');
  });

  it('includes nested list item ranges in document order', () => {
    const markdown = [
      '- Parent',
      '  - Child',
      '- Sibling',
      '',
    ].join('\n');

    const ranges = collectCommentableRanges(markdown).filter((range) => range.kind === 'li');
    expect(ranges.length).toBe(3);
    expect(markdown.slice(ranges[0].start, ranges[0].end)).toContain('- Parent');
    expect(markdown.slice(ranges[1].start, ranges[1].end)).toContain('- Child');
    expect(markdown.slice(ranges[2].start, ranges[2].end)).toContain('- Sibling');
  });
});
