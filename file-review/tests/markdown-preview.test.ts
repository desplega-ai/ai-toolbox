import { describe, expect, it } from 'bun:test';
import {
  collectCommentableRanges,
  initPreview,
  renderMarkdown,
  splitAtTopLevelBreak,
  updatePreview,
  wrapCodeLines,
} from '../src/markdown-preview';

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
    expect(ranges.map((range) => range.kind)).toEqual(['h1', 'p', 'li-line', 'li-line', 'code-line']);

    expect(markdown.slice(ranges[0].start, ranges[0].end)).toBe('# Title');
    expect(markdown.slice(ranges[1].start, ranges[1].end)).toContain('Paragraph text');
    // li-line ranges have the leading "- " marker stripped from `start`.
    expect(markdown.slice(ranges[2].start, ranges[2].end)).toBe('First item');
    expect(markdown.slice(ranges[3].start, ranges[3].end)).toBe('Second item');
    expect(markdown.slice(ranges[4].start, ranges[4].end)).toBe('const x = 1;');
  });

  it('includes nested list item ranges in document order', () => {
    const markdown = [
      '- Parent',
      '  - Child',
      '- Sibling',
      '',
    ].join('\n');

    const ranges = collectCommentableRanges(markdown).filter((range) => range.kind === 'li-line');
    expect(ranges.length).toBe(3);
    expect(markdown.slice(ranges[0].start, ranges[0].end)).toBe('Parent');
    expect(markdown.slice(ranges[1].start, ranges[1].end)).toBe('Child');
    expect(markdown.slice(ranges[2].start, ranges[2].end)).toBe('Sibling');
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

  it('splits multi-line paragraphs into per-line ranges (kind p-line)', () => {
    const markdown = [
      'First line',
      'Second line',
      'Third line',
      '',
    ].join('\n');

    const ranges = collectCommentableRanges(markdown);
    expect(ranges.length).toBe(3);
    expect(ranges.every((r) => r.kind === 'p-line')).toBe(true);
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
    const pLineRanges = ranges.filter((r) => r.kind === 'p-line');
    expect(pLineRanges.length).toBe(2);
    expect(markdown.slice(pLineRanges[0].start, pLineRanges[0].end)).toBe('Line one');
    expect(markdown.slice(pLineRanges[1].start, pLineRanges[1].end)).toBe('Line two');
  });

  it('emits per-line ranges for fenced code blocks (skipping fence lines)', () => {
    const markdown = [
      '```ts',
      'const a = 1;',
      'const b = 2;',
      'const c = 3;',
      '```',
      '',
    ].join('\n');

    const ranges = collectCommentableRanges(markdown).filter((r) => r.kind === 'code-line');
    expect(ranges.length).toBe(3);
    expect(markdown.slice(ranges[0].start, ranges[0].end)).toBe('const a = 1;');
    expect(markdown.slice(ranges[1].start, ranges[1].end)).toBe('const b = 2;');
    expect(markdown.slice(ranges[2].start, ranges[2].end)).toBe('const c = 3;');
  });

  it('emits per-line ranges for tilde-fenced code blocks too', () => {
    const markdown = [
      '~~~py',
      'print("hi")',
      'print("bye")',
      '~~~',
      '',
    ].join('\n');

    const ranges = collectCommentableRanges(markdown).filter((r) => r.kind === 'code-line');
    expect(ranges.length).toBe(2);
    expect(markdown.slice(ranges[0].start, ranges[0].end)).toBe('print("hi")');
    expect(markdown.slice(ranges[1].start, ranges[1].end)).toBe('print("bye")');
  });

  it('emits per-line ranges inside blockquotes with leading "> " stripped', () => {
    const markdown = [
      '> First quoted line.',
      '> Second quoted line.',
      '> Third quoted line.',
      '',
    ].join('\n');

    const ranges = collectCommentableRanges(markdown).filter((r) => r.kind === 'bq-line');
    expect(ranges.length).toBe(3);
    expect(markdown.slice(ranges[0].start, ranges[0].end)).toBe('First quoted line.');
    expect(markdown.slice(ranges[1].start, ranges[1].end)).toBe('Second quoted line.');
    expect(markdown.slice(ranges[2].start, ranges[2].end)).toBe('Third quoted line.');
  });

  it('emits per-line ranges inside list-item continuations', () => {
    const markdown = [
      '- First item with',
      '  a wrapped continuation',
      '  and a third line',
      '- Second item',
      '',
    ].join('\n');

    const ranges = collectCommentableRanges(markdown).filter((r) => r.kind === 'li-line');
    expect(ranges.length).toBe(4);
    expect(markdown.slice(ranges[0].start, ranges[0].end)).toBe('First item with');
    expect(markdown.slice(ranges[1].start, ranges[1].end)).toBe('a wrapped continuation');
    expect(markdown.slice(ranges[2].start, ranges[2].end)).toBe('and a third line');
    expect(markdown.slice(ranges[3].start, ranges[3].end)).toBe('Second item');
  });

  it('handles ordered list items with numeric markers', () => {
    const markdown = [
      '1. First',
      '2. Second',
      '10. Tenth',
      '',
    ].join('\n');

    const ranges = collectCommentableRanges(markdown).filter((r) => r.kind === 'li-line');
    expect(ranges.length).toBe(3);
    expect(markdown.slice(ranges[0].start, ranges[0].end)).toBe('First');
    expect(markdown.slice(ranges[1].start, ranges[1].end)).toBe('Second');
    expect(markdown.slice(ranges[2].start, ranges[2].end)).toBe('Tenth');
  });

  it('skips fence lines when they appear at first/last positions only', () => {
    const markdown = [
      '```',
      'line one',
      '```',
      '',
    ].join('\n');

    const ranges = collectCommentableRanges(markdown).filter((r) => r.kind === 'code-line');
    expect(ranges.length).toBe(1);
    expect(markdown.slice(ranges[0].start, ranges[0].end)).toBe('line one');
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

describe('mixed single-line + multi-line paragraphs (regression — full pipeline)', () => {
  function renderToContainer(markdown: string): HTMLElement {
    const container = document.createElement('div');
    container.id = 'preview-container';
    document.body.appendChild(container);
    initPreview(container);
    updatePreview(markdown, []);
    return container;
  }

  function commentableTexts(container: HTMLElement): string[] {
    return Array.from(container.querySelectorAll<HTMLElement>('[data-commentable="true"]'))
      .map((el) => (el.textContent ?? '').trim());
  }

  it('every visible line is stamped (blank-lines-test.md regression)', () => {
    // Before the p-line / single-p kind separation, j/k jumped from line 4
    // straight to "Section with code" because the single-line <p>s after the
    // multi-line paragraph never got data-commentable stamped.
    const markdown = [
      '# Test File for Blank Lines',
      '',
      'This is line 3.',
      'This is line 4.',
      '',
      'Line 6 after a blank line.',
      '',
      'Line 8 after another blank.',
      '',
      'More content on line 10.',
      '',
      '## Section with code',
      '',
    ].join('\n');

    const container = renderToContainer(markdown);
    const texts = commentableTexts(container);

    expect(texts).toEqual([
      'Test File for Blank Lines',
      'This is line 3.',
      'This is line 4.',
      'Line 6 after a blank line.',
      'Line 8 after another blank.',
      'More content on line 10.',
      'Section with code',
    ]);
  });

  it('every heading + paragraph + code line is stamped (README.md regression)', () => {
    // Section with multiple H3 + single-line <p> + code blocks. Before fix,
    // the "Via Homebrew" section appeared completely skipped during j/k.
    const markdown = [
      '# File Review',
      '',
      'A file review tool with CodeMirror.',
      '',
      '## Installation',
      '',
      '### Via Homebrew',
      '',
      '```bash',
      'brew tap desplega-ai/tap',
      'brew install file-review',
      '```',
      '',
      '### Manual Installation',
      '',
      '```bash',
      'bun run install:app',
      '```',
      '',
    ].join('\n');

    const container = renderToContainer(markdown);
    const texts = commentableTexts(container);

    // hljs decorates the bash code; assert presence of distinct visible lines.
    expect(texts).toContain('File Review');
    expect(texts).toContain('A file review tool with CodeMirror.');
    expect(texts).toContain('Installation');
    expect(texts).toContain('Via Homebrew');
    expect(texts).toContain('Manual Installation');
    expect(texts.some((t) => t.includes('brew tap desplega-ai/tap'))).toBe(true);
    expect(texts.some((t) => t.includes('brew install file-review'))).toBe(true);
    expect(texts.some((t) => t.includes('bun run install:app'))).toBe(true);
  });
});

describe('mermaid blocks (regression)', () => {
  it('rewrites ```mermaid fences into <pre class="mermaid"> via the manual walker', () => {
    const markdown = [
      '```mermaid',
      'graph TD;',
      '  A-->B;',
      '```',
      '',
    ].join('\n');

    const { html } = renderMarkdown(markdown, []);
    expect(html).toContain('<pre class="mermaid"');
    expect(html).toContain('data-src="');
    // The mermaid block must NOT go through renderer.code (no code-line spans
    // and no data-code-line-ranges on the mermaid <pre>).
    expect(html).not.toContain('class="code-line"');
    expect(html).not.toMatch(/<pre class="mermaid"[^>]*data-code-line-ranges/);
  });
});

describe('list items with nested block children (regression)', () => {
  it('renders a fenced code block inside a numbered list item', () => {
    const markdown = [
      '1. Install dependencies:',
      '   ```bash',
      '   uv sync',
      '   playwright install',
      '   ```',
      '',
    ].join('\n');

    const { html } = renderMarkdown(markdown, []);
    // The code block must end up as a real <pre> with the per-line wrap
    // marker — NOT as literal "```bash" lines inside li-line spans.
    expect(html).toMatch(/<li>[^]*<pre[^>]*data-code-line-ranges[^>]*>[^]*<\/pre>[^]*<\/li>/);
    expect(html).not.toMatch(/<span class="li-line"[^>]*>```bash<\/span>/);
    expect(html).toContain('uv sync');
  });

  it('renders a blockquote nested inside a list item', () => {
    const markdown = [
      '- note:',
      '  > quoted line one',
      '  > quoted line two',
      '',
    ].join('\n');

    const { html } = renderMarkdown(markdown, []);
    expect(html).toMatch(/<li>[^]*<blockquote>[^]*<span class="bq-line"[^>]*>quoted line one<\/span>[^]*<\/blockquote>[^]*<\/li>/);
    expect(html).not.toMatch(/<span class="li-line"[^>]*>&gt; quoted line one<\/span>/);
  });

  it('emits code-line ranges for code blocks nested inside list items', () => {
    const markdown = [
      '1. Step:',
      '   ```bash',
      '   uv sync',
      '   docker compose up',
      '   ```',
      '',
    ].join('\n');

    const ranges = collectCommentableRanges(markdown);
    const codeRanges = ranges.filter((r) => r.kind === 'code-line');
    expect(codeRanges.length).toBe(2);
    // Nested code-line ranges keep the leading list-item indent so the
    // comment marker wraps the original source line as-is.
    expect(markdown.slice(codeRanges[0].start, codeRanges[0].end)).toBe('   uv sync');
    expect(markdown.slice(codeRanges[1].start, codeRanges[1].end)).toBe('   docker compose up');
  });
});

describe('renderMarkdown per-line list items', () => {
  it('wraps each list-item content line in span.li-line with data-source-* and data-commentable', () => {
    const markdown = [
      '- one',
      '- two',
      '- three',
      '',
    ].join('\n');

    const { html } = renderMarkdown(markdown, []);
    const matches = html.match(/<span class="li-line" data-commentable="true" data-source-start="(\d+)" data-source-end="(\d+)">/g) ?? [];
    expect(matches.length).toBe(3);
    expect(html).toContain('>one</span>');
    expect(html).toContain('>two</span>');
    expect(html).toContain('>three</span>');
  });

  it('continuation lines of a wrapped list item produce one span per source line', () => {
    const markdown = [
      '- start of item',
      '  continued here',
      '  and again',
      '',
    ].join('\n');

    const { html } = renderMarkdown(markdown, []);
    const spans = html.match(/<span class="li-line"[^>]*>([^<]+)<\/span>/g) ?? [];
    // Use the textContent of each span by stripping the wrapping tag.
    const texts = spans.map((s) => s.replace(/^<span[^>]*>|<\/span>$/g, ''));
    expect(texts).toEqual(['start of item', 'continued here', 'and again']);
  });

  it('renders nested list items each as their own li-line', () => {
    const markdown = [
      '- outer',
      '  - inner',
      '- sibling',
      '',
    ].join('\n');

    const { html } = renderMarkdown(markdown, []);
    const spans = html.match(/<span class="li-line"[^>]*>([^<]+)<\/span>/g) ?? [];
    const texts = spans.map((s) => s.replace(/^<span[^>]*>|<\/span>$/g, ''));
    expect(texts).toEqual(['outer', 'inner', 'sibling']);
    // Nested list HTML should appear inside the outer <li>, not after it.
    expect(html).toMatch(/<li>[^]*outer[^]*<ul>[^]*inner[^]*<\/ul>\s*<\/li>/);
  });

  it('renders task-list checkboxes on the first li-line and strips the [ ] marker', () => {
    const markdown = [
      '- [ ] todo one',
      '- [x] done two',
      '',
    ].join('\n');

    const { html } = renderMarkdown(markdown, []);
    expect(html).toContain('<input disabled type="checkbox"> ');
    expect(html).toContain('<input disabled type="checkbox" checked> ');
    // The visible text should NOT contain "[ ]" / "[x]" — they were consumed.
    expect(html).not.toContain('>[ ] todo one</span>');
    expect(html).not.toContain('>[x] done two</span>');
    expect(html).toContain('todo one');
    expect(html).toContain('done two');
  });
});

describe('renderMarkdown per-line blockquotes', () => {
  it('wraps each blockquote line in span.bq-line with the leading "> " stripped from data-source-*', () => {
    const markdown = [
      '> alpha',
      '> beta',
      '',
    ].join('\n');

    const { html, ranges } = renderMarkdown(markdown, []);
    const matches = html.match(/<span class="bq-line"[^>]*>([^<]+)<\/span>/g) ?? [];
    expect(matches.length).toBe(2);

    const bqRanges = ranges.filter((r) => r.kind === 'bq-line');
    expect(bqRanges.length).toBe(2);
    expect(markdown.slice(bqRanges[0].start, bqRanges[0].end)).toBe('alpha');
    expect(markdown.slice(bqRanges[1].start, bqRanges[1].end)).toBe('beta');
  });

  it('skips empty `>` lines inside a blockquote', () => {
    const markdown = [
      '> first',
      '>',
      '> third',
      '',
    ].join('\n');

    const { html } = renderMarkdown(markdown, []);
    const spans = html.match(/<span class="bq-line"[^>]*>([^<]*)<\/span>/g) ?? [];
    expect(spans.length).toBe(2);
  });
});

describe('renderMarkdown code-block per-line plumbing', () => {
  it('renderer.code stamps <pre> with data-code-line-ranges JSON', () => {
    const markdown = [
      '```ts',
      'const x = 1;',
      'const y = 2;',
      '```',
      '',
    ].join('\n');

    const { html } = renderMarkdown(markdown, []);
    const m = html.match(/<pre data-code-line-ranges="([^"]+)"/);
    expect(m).not.toBeNull();
    const json = decodeURIComponent(m![1]);
    const parsed = JSON.parse(json) as Array<{ start: number; end: number; kind: string }>;
    expect(parsed.length).toBe(2);
    expect(parsed.every((r) => r.kind === 'code-line')).toBe(true);
    expect(markdown.slice(parsed[0].start, parsed[0].end)).toBe('const x = 1;');
    expect(markdown.slice(parsed[1].start, parsed[1].end)).toBe('const y = 2;');
  });

  it('emits a <span class="code-lang"> badge when the fence has a language', () => {
    const markdown = ['```ts', 'const x = 1;', '```', ''].join('\n');
    const { html } = renderMarkdown(markdown, []);
    expect(html).toContain('<span class="code-lang"');
    expect(html).toMatch(/<span class="code-lang"[^>]*>ts<\/span>/);
  });

  it('omits the language badge when the fence has no language', () => {
    const markdown = ['```', 'plain text', '```', ''].join('\n');
    const { html } = renderMarkdown(markdown, []);
    expect(html).not.toContain('class="code-lang"');
    // But still gets the per-line wrap marker so it stays commentable.
    expect(html).toMatch(/<pre data-code-line-ranges="[^"]+"/);
  });

  it('emits a range per source line including blanks so wrap counts match (regression)', () => {
    // The README's Ruby Homebrew formula has internal blank lines. Before
    // this fix, `collectLineRanges` skipped blanks, so ranges.length <
    // parts.length in `wrapCodeLines` and the entire <pre> was bailed —
    // making the Ruby block uncommentable.
    const markdown = [
      '```ruby',
      'class FileReview',
      '  def install',
      '    1',
      '  end',
      '',
      '  test do',
      '    2',
      '  end',
      'end',
      '```',
      '',
    ].join('\n');

    const ranges = collectCommentableRanges(markdown).filter((r) => r.kind === 'code-line');
    // 9 source lines (including 1 blank), all emitted.
    expect(ranges.length).toBe(9);
    // The blank line has start === end (zero-length range placeholder).
    const blank = ranges.find((r) => r.start === r.end);
    expect(blank).toBeDefined();
  });

  it('full pipeline: code block with blank lines is fully wrapped + commentable', () => {
    const markdown = [
      '# Title',
      '',
      '```ruby',
      'class A',
      '',
      '  def b',
      '    1',
      '  end',
      'end',
      '```',
      '',
      'After.',
      '',
    ].join('\n');

    const container = document.createElement('div');
    container.id = 'preview-container-blank';
    document.body.appendChild(container);
    initPreview(container);
    updatePreview(markdown, []);

    const codeSpans = container.querySelectorAll('span.code-line[data-commentable="true"]');
    // 6 source code lines (excluding fences). Blank line included.
    expect(codeSpans.length).toBe(6);
    // The "After." paragraph should also be stamped — i.e. j/k continues past
    // the code block, no bail.
    const allCommentable = container.querySelectorAll('[data-commentable="true"]');
    const lastTexts = Array.from(allCommentable).map((el) => (el.textContent ?? '').trim());
    expect(lastTexts).toContain('After.');
  });

  it('no-language code blocks still get per-line code-line ranges (regression)', () => {
    const markdown = [
      '# Title',
      '',
      '```',
      'brew tap desplega-ai/tap',
      'brew install file-review',
      '```',
      '',
      'Trailing paragraph.',
      '',
    ].join('\n');

    const ranges = collectCommentableRanges(markdown);
    const codeRanges = ranges.filter((r) => r.kind === 'code-line');
    expect(codeRanges.length).toBe(2);
    expect(markdown.slice(codeRanges[0].start, codeRanges[0].end)).toBe('brew tap desplega-ai/tap');
    expect(markdown.slice(codeRanges[1].start, codeRanges[1].end)).toBe('brew install file-review');
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

describe('inline formatting rendering', () => {
  it('renders **bold** as <strong> in split paragraphs', () => {
    const markdown = [
      '**bold** on first line',
      'plain second line',
      '',
    ].join('\n');

    const { html } = renderMarkdown(markdown, []);
    expect(html).toContain('class="preview-paragraph"');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).not.toContain('**bold**');
  });

  it('renders *italic* as <em> in split paragraphs', () => {
    const markdown = [
      '*italic* on first line',
      'plain second line',
      '',
    ].join('\n');

    const { html } = renderMarkdown(markdown, []);
    expect(html).toContain('<em>italic</em>');
    expect(html).not.toContain('*italic*');
  });

  it('renders inline code in split paragraphs', () => {
    const markdown = [
      'use `myFunc()` here',
      'and more text',
      '',
    ].join('\n');

    const { html } = renderMarkdown(markdown, []);
    expect(html).toContain('<code>myFunc()</code>');
  });

  it('renders inline formatting in headings', () => {
    const markdown = '# Title with **bold**\n';

    const { html } = renderMarkdown(markdown, []);
    expect(html).toContain('<strong>bold</strong>');
    expect(html).not.toContain('**bold**');
  });
});

describe('cross-line inline formatting', () => {
  it('splits ranges per source line when bold spans lines', () => {
    const markdown = [
      '**bold',
      'text**',
      '',
    ].join('\n');

    const ranges = collectCommentableRanges(markdown);
    expect(ranges.length).toBe(2);
    expect(ranges.every((r) => r.kind === 'p-line')).toBe(true);
    expect(markdown.slice(ranges[0].start, ranges[0].end)).toBe('**bold');
    expect(markdown.slice(ranges[1].start, ranges[1].end)).toBe('text**');
  });

  it('splits ranges per source line when italic spans lines', () => {
    const markdown = [
      '*italic',
      'text*',
      '',
    ].join('\n');

    const ranges = collectCommentableRanges(markdown);
    expect(ranges.length).toBe(2);
    expect(ranges.every((r) => r.kind === 'p-line')).toBe(true);
    expect(markdown.slice(ranges[0].start, ranges[0].end)).toBe('*italic');
    expect(markdown.slice(ranges[1].start, ranges[1].end)).toBe('text*');
  });

  it('still splits when formatting is contained per line', () => {
    const markdown = [
      '**bold** first',
      '**bold** second',
      '',
    ].join('\n');

    const ranges = collectCommentableRanges(markdown);
    expect(ranges.length).toBe(2);
    expect(ranges.every((r) => r.kind === 'p-line')).toBe(true);

    const { html } = renderMarkdown(markdown, []);
    expect(html).toContain('class="preview-paragraph"');
    expect(html).toContain('<strong>bold</strong>');
  });
});

describe('splitAtTopLevelBreak', () => {
  it('splits highlighted code lines at depth-zero newlines', () => {
    const html = '<span class="hljs-keyword">const</span> x = 1;\n<span class="hljs-keyword">const</span> y = 2;\n';
    const parts = splitAtTopLevelBreak(html);
    expect(parts.length).toBe(3);
    expect(parts[0]).toContain('const');
    expect(parts[0]).toContain('x = 1;');
    expect(parts[1]).toContain('y = 2;');
    expect(parts[2]).toBe('');
  });

  it('returns the input unsplit when an open span straddles a newline', () => {
    const html = '<span class="hljs-string">"line1\nline2"</span>\n';
    const parts = splitAtTopLevelBreak(html);
    expect(parts.length).toBe(1);
    expect(parts[0]).toBe(html);
  });
});

describe('wrapCodeLines', () => {
  it('wraps each highlighted code line in a span.code-line with data-source-*', () => {
    const root = document.createElement('div');
    root.innerHTML = `<pre data-code-line-ranges="${encodeURIComponent(
      JSON.stringify([
        { start: 4, end: 16, kind: 'code-line' },
        { start: 17, end: 29, kind: 'code-line' },
      ])
    )}"><code>const x = 1;\nconst y = 2;\n</code></pre>`;

    wrapCodeLines(root);

    const spans = root.querySelectorAll('span.code-line[data-commentable="true"]');
    expect(spans.length).toBe(2);
    expect((spans[0] as HTMLElement).getAttribute('data-source-start')).toBe('4');
    expect((spans[0] as HTMLElement).getAttribute('data-source-end')).toBe('16');
    expect(spans[0].textContent).toBe('const x = 1;');
    expect((spans[1] as HTMLElement).getAttribute('data-source-start')).toBe('17');
    expect((spans[1] as HTMLElement).getAttribute('data-source-end')).toBe('29');
    expect(spans[1].textContent).toBe('const y = 2;');
    const pre = root.querySelector('pre');
    expect(pre?.hasAttribute('data-code-line-ranges')).toBe(false);
  });

  it('bails (no wrap) when hljs spans straddle a newline', () => {
    const root = document.createElement('div');
    const ranges = [
      { start: 4, end: 12, kind: 'code-line' },
      { start: 13, end: 22, kind: 'code-line' },
    ];
    root.innerHTML = `<pre data-code-line-ranges="${encodeURIComponent(JSON.stringify(ranges))}"><code><span class="hljs-string">"line1\nline2"</span>\n</code></pre>`;

    wrapCodeLines(root);

    expect(root.querySelectorAll('span.code-line').length).toBe(0);
    expect(root.querySelector('pre')?.hasAttribute('data-code-line-ranges')).toBe(false);
  });

  it('skips mermaid <pre> blocks even if they would carry the marker', () => {
    const root = document.createElement('div');
    root.innerHTML = '<pre class="mermaid" data-code-line-ranges="%5B%5D"><code>graph TD;</code></pre>';
    wrapCodeLines(root);
    expect(root.querySelectorAll('span.code-line').length).toBe(0);
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
