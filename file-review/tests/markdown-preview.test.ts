import { describe, expect, it } from 'bun:test';
import { collectCommentableRanges, renderMarkdown } from '../src/markdown-preview';

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

  it('produces no ranges for raw HTML blocks', () => {
    const markdown = [
      '# Title',
      '',
      '<div><p>Raw HTML paragraph</p></div>',
      '',
      'Normal paragraph.',
      '',
    ].join('\n');

    const ranges = collectCommentableRanges(markdown);
    // Raw HTML block should not produce ranges — only heading and normal paragraph
    expect(ranges.map((r) => r.kind)).toEqual(['h1', 'p']);
    expect(markdown.slice(ranges[0].start, ranges[0].end)).toBe('# Title');
    expect(markdown.slice(ranges[1].start, ranges[1].end)).toBe('Normal paragraph.');
  });

  it('splits multi-line paragraphs into per-line ranges', () => {
    const markdown = [
      'First line',
      'Second line',
      'Third line',
      '',
    ].join('\n');

    const ranges = collectCommentableRanges(markdown);
    expect(ranges.length).toBe(3);
    expect(ranges.every((r) => r.kind === 'p')).toBe(true);
    expect(markdown.slice(ranges[0].start, ranges[0].end)).toBe('First line');
    expect(markdown.slice(ranges[1].start, ranges[1].end)).toBe('Second line');
    expect(markdown.slice(ranges[2].start, ranges[2].end)).toBe('Third line');
  });

  it('keeps single-line paragraphs as one range', () => {
    const markdown = [
      'Just one line.',
      '',
    ].join('\n');

    const ranges = collectCommentableRanges(markdown);
    expect(ranges.length).toBe(1);
    expect(ranges[0].kind).toBe('p');
    expect(markdown.slice(ranges[0].start, ranges[0].end)).toBe('Just one line.');
  });

  it('per-line ranges work correctly with frontmatter offset', () => {
    const markdown = [
      '---',
      'title: Test',
      '---',
      '',
      'Line one',
      'Line two',
      '',
    ].join('\n');

    const { ranges } = renderMarkdown(markdown, []);
    const pRanges = ranges.filter((r) => r.kind === 'p');
    expect(pRanges.length).toBe(2);
    expect(markdown.slice(pRanges[0].start, pRanges[0].end)).toBe('Line one');
    expect(markdown.slice(pRanges[1].start, pRanges[1].end)).toBe('Line two');
  });

  it('handles mixed raw HTML and markdown without breaking range collection', () => {
    const markdown = [
      '# Heading',
      '',
      '<details>',
      '<summary>Click me</summary>',
      '',
      'Hidden content.',
      '',
      '</details>',
      '',
      '## Subheading',
      '',
      'Final paragraph.',
      '',
    ].join('\n');

    const ranges = collectCommentableRanges(markdown);
    const kinds = ranges.map((r) => r.kind);
    // Should at least capture heading, subheading, and final paragraph
    expect(kinds).toContain('h1');
    expect(kinds).toContain('h2');
    expect(kinds).toContain('p');
  });
});

describe('renderMarkdown per-line paragraphs', () => {
  it('wraps multi-line paragraphs with preview-paragraph/preview-line', () => {
    const markdown = [
      'First line',
      'Second line',
      '',
    ].join('\n');

    const { html } = renderMarkdown(markdown, []);
    expect(html).toContain('class="preview-paragraph"');
    expect(html).toContain('class="preview-line"');
    expect(html).toContain('>First line</p>');
    expect(html).toContain('>Second line</p>');
  });

  it('renders single-line paragraphs without wrapping', () => {
    const markdown = [
      'Just one line.',
      '',
    ].join('\n');

    const { html } = renderMarkdown(markdown, []);
    expect(html).not.toContain('preview-paragraph');
    expect(html).not.toContain('preview-line');
    expect(html).toContain('<p>Just one line.</p>');
  });
});

describe('renderMarkdown frontmatter', () => {
  it('renders leading frontmatter as a metadata card and offsets ranges to original content', () => {
    const markdown = [
      '---',
      'date: 2026-01-30T12:00:00-08:00',
      'topic: "arewedoomedyet.dev"',
      'tags: [research, vercel, convex]',
      'last_updated_by: Claude',
      '---',
      '',
      '# Title',
      '',
      'Body paragraph.',
      '',
    ].join('\n');

    const { html, ranges } = renderMarkdown(markdown, []);

    expect(html).toContain('class="frontmatter-card"');
    expect(html).toContain('Metadata');
    expect(html).toContain('Date');
    expect(html).toContain('Last Updated By');
    expect(html).toContain('2026-01-30T12:00:00-08:00');
    expect(html).toContain('&quot;arewedoomedyet.dev&quot;');
    expect(html).toContain('class="frontmatter-chip">research</span>');
    expect(html).toContain('class="frontmatter-chip">vercel</span>');
    expect(html).toContain('class="frontmatter-chip">convex</span>');
    expect(html).not.toContain('date: 2026-01-30T12:00:00-08:00');
    expect(html).not.toContain('last_updated_by: Claude');

    const kinds = ranges.map((range) => range.kind);
    expect(kinds).toEqual(['h1', 'p']);
    expect(markdown.slice(ranges[0].start, ranges[0].end)).toBe('# Title');
    expect(markdown.slice(ranges[1].start, ranges[1].end)).toBe('Body paragraph.');
  });

  it('does not treat non-leading delimiter blocks as frontmatter', () => {
    const markdown = [
      '# Title',
      '',
      '---',
      'date: 2026-01-30T12:00:00-08:00',
      '---',
      '',
      'Body paragraph.',
      '',
    ].join('\n');

    const { html } = renderMarkdown(markdown, []);

    expect(html).not.toContain('class="frontmatter-card"');
    expect(html).toContain('date: 2026-01-30T12:00:00-08:00');
  });

  it('falls back to normal markdown rendering for malformed frontmatter', () => {
    const markdown = [
      '---',
      'date: 2026-01-30T12:00:00-08:00',
      'topic: "Missing closing delimiter"',
      '',
      '# Title',
      '',
    ].join('\n');

    const { html } = renderMarkdown(markdown, []);

    expect(html).not.toContain('class="frontmatter-card"');
    expect(html).toContain('date: 2026-01-30T12:00:00-08:00');
    expect(html).toContain('Missing closing delimiter');
  });
});
