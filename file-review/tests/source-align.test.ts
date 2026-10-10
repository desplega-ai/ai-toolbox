import { describe, expect, it } from 'bun:test';
import {
  alignRenderedToSource,
  renderedRangeToSource,
  sourceRangeToRendered,
} from '../src/source-align';
import { createComment, parseAndStripComments, serializeComments } from '../src/comments';
import { selectionTarget } from '../src/selection-comment';
import { alignBlock } from '../src/inline-highlights';
import { initPreview, updatePreview } from '../src/markdown-preview';

/** Source text behind the rendered substring `needle`. */
function sourceOf(rendered: string, source: string, needle: string): string {
  const alignment = alignRenderedToSource(rendered, source);
  expect(alignment).not.toBeNull();
  const from = rendered.indexOf(needle);
  const span = renderedRangeToSource(alignment!, from, from + needle.length)!;
  return source.slice(span.start, span.end);
}

describe('alignRenderedToSource', () => {
  it('maps plain text one to one', () => {
    const alignment = alignRenderedToSource('hello', 'hello')!;
    expect(alignment.start).toEqual([0, 1, 2, 3, 4]);
    expect(alignment.end).toEqual([1, 2, 3, 4, 5]);
  });

  it('skips emphasis, strikethrough and inline code markers', () => {
    const source = 'Some **bold**, _it_, ~~gone~~ and `npm i` here';
    const rendered = 'Some bold, it, gone and npm i here';
    expect(sourceOf(rendered, source, 'bold')).toBe('bold');
    expect(sourceOf(rendered, source, 'it, gone')).toBe('it_, ~~gone');
    expect(sourceOf(rendered, source, 'npm i')).toBe('npm i');
    expect(sourceOf(rendered, source, 'here')).toBe('here');
  });

  it('skips link brackets, URLs and titles', () => {
    const source = 'See [the docs](./a.md "Title") and [ref][r] or <https://x.dev> now';
    const rendered = 'See the docs and ref or https://x.dev now';
    expect(sourceOf(rendered, source, 'the docs')).toBe('the docs');
    expect(sourceOf(rendered, source, 'docs and ref')).toBe('docs](./a.md "Title") and [ref');
    expect(sourceOf(rendered, source, 'https://x.dev')).toBe('https://x.dev');
    expect(sourceOf(rendered, source, 'now')).toBe('now');
  });

  it('skips images, which render no text', () => {
    const source = 'a ![alt text](img/x.png) b';
    expect(sourceOf('a  b', source, 'b')).toBe('b');
  });

  it('handles backslash escapes and HTML entities', () => {
    expect(sourceOf('1*2 & 3', '1\\*2 &amp; 3', '*2 &')).toBe('\\*2 &amp;');
    expect(sourceOf('a < b', 'a &lt; b', 'b')).toBe('b');
    expect(sourceOf('x y', 'x&#160;y', 'y')).toBe('y');
  });

  it('skips heading, list, quote and task prefixes', () => {
    expect(sourceOf('Hello world', '## Hello *world*', 'Hello')).toBe('Hello');
    expect(sourceOf('todo item', '- [ ] todo item', 'todo')).toBe('todo');
    expect(sourceOf('quoted', '> quoted', 'quoted')).toBe('quoted');
  });

  it('keeps literal markers in code', () => {
    const source = '# install *deps* &amp; run';
    expect(sourceOf(source, source, '*deps*')).toBe('*deps*');
    expect(sourceOf(source, source, '&amp;')).toBe('&amp;');
    // Dedented nested code keeps its marker, only the indent is skipped.
    expect(sourceOf('- item', '    - item', 'item')).toBe('item');
  });

  it('matches table cells across pipes and rendered-only whitespace', () => {
    expect(sourceOf('\na\nb\n', '| a | b |', 'b')).toBe('b');
  });

  it('returns null when rendered text has no source', () => {
    expect(alignRenderedToSource('xyz', 'abc')).toBeNull();
    expect(alignRenderedToSource('abcd', 'abc')).toBeNull();
  });
});

describe('alignment of rendered preview blocks', () => {
  it('aligns every block kind the preview renders', () => {
    const md = [
      '# Title with `code` and *em*',
      '',
      'Para with **bold**, [link](./a.md), ![img](b.png) and &amp; entity.',
      'Second line with \\*escaped\\*.',
      '',
      '- item one',
      '- [ ] task item',
      '  - nested [l](http://x.com)',
      '',
      '> more **quote**',
      '',
      '| A | B |',
      '|---|---|',
      '| *a* | `b` |',
      '',
      '```js',
      'const x = 1; // *not em*',
      '```',
      '',
    ].join('\n');
    const container = document.createElement('div');
    document.body.appendChild(container);
    initPreview(container);
    updatePreview(md, []);
    const blocks = Array.from(container.querySelectorAll<HTMLElement>('[data-commentable="true"]'));
    expect(blocks.length).toBeGreaterThan(8);
    for (const block of blocks) {
      expect({ text: block.textContent, aligned: alignBlock(block, md) !== null }).toEqual({
        text: block.textContent,
        aligned: true,
      });
    }
    container.remove();
  });
});

describe('sourceRangeToRendered', () => {
  it('maps a source range back to rendered offsets', () => {
    const source = 'Some **bold** text';
    const rendered = 'Some bold text';
    const alignment = alignRenderedToSource(rendered, source)!;
    const start = source.indexOf('bold');
    expect(sourceRangeToRendered(alignment, start, start + 4)).toEqual({ start: 5, end: 9 });
    // A range over the markers alone renders nothing.
    expect(sourceRangeToRendered(alignment, 5, 7)).toBeNull();
    expect(renderedRangeToSource(alignment, 3, 3)).toBeNull();
  });
});

describe('inline comment round trip', () => {
  const cases: Array<[string, string, string]> = [
    ['emphasis', 'Intro with **bold words** here.\n', 'bold words'],
    ['partial emphasis', 'Intro with **bold words** here.\n', 'words here'],
    ['link', 'Read [the guide](./guide.md#setup) first.\n', 'the guide first'],
    ['inline code', 'Run `bun test` now.\n', 'bun test'],
  ];

  for (const [name, source, needle] of cases) {
    it(`survives serialize and parse: ${name}`, () => {
      const rendered = source
        .trimEnd()
        .replace(/\*\*/g, '')
        .replace(/`/g, '')
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
      const alignment = alignRenderedToSource(rendered, source)!;
      const from = rendered.indexOf(needle);
      const span = renderedRangeToSource(alignment, from, from + needle.length)!;
      const comment = createComment('inline', span.start, span.end, 'note');

      const parsed = parseAndStripComments(serializeComments(source, [comment]));
      expect(parsed.cleanContent).toBe(source);
      expect(parsed.comments).toHaveLength(1);
      expect(parsed.comments[0]).toMatchObject({
        comment_type: 'inline',
        highlight_start: span.start,
        highlight_end: span.end,
        text: 'note',
      });
      // And it maps back to the same rendered text.
      expect(sourceRangeToRendered(alignment, span.start, span.end)).toEqual({
        start: from,
        end: from + needle.length,
      });
    });
  }
});

describe('selectionTarget', () => {
  const source = 'Some **bold** text\n\nSecond line\n';
  const second = source.indexOf('Second');

  function setup() {
    const container = document.createElement('div');
    container.innerHTML =
      `<p data-commentable="true" data-source-start="0" data-source-end="18">Some <strong>bold</strong> text</p>` +
      `<p data-commentable="true" data-source-start="${second}" data-source-end="${second + 11}">Second line</p>`;
    document.body.appendChild(container);
    return container;
  }

  function lineAt(pos: number) {
    const from = source.lastIndexOf('\n', pos - 1) + 1;
    const nl = source.indexOf('\n', pos);
    return { from, to: nl < 0 ? source.length : nl };
  }

  it('makes an inline comment on the exact source inside one block', () => {
    const container = setup();
    const strong = container.querySelector('strong')!.firstChild!;
    const range = document.createRange();
    range.setStart(strong, 1);
    range.setEnd(strong, 4);
    const target = selectionTarget(range, container, source, lineAt)!;
    expect(target.commentType).toBe('inline');
    expect(source.slice(target.start, target.end)).toBe('old');
    container.remove();
  });

  it('makes a line comment across blocks', () => {
    const container = setup();
    const [a, b] = Array.from(container.querySelectorAll('p'));
    const range = document.createRange();
    range.setStart(a.lastChild!, 2);
    range.setEnd(b.firstChild!, 3);
    const target = selectionTarget(range, container, source, lineAt)!;
    expect(target.commentType).toBe('line');
    expect(target.start).toBe(0);
    expect(target.end).toBe(second + 11);
    expect(target.blocks).toHaveLength(2);
    container.remove();
  });

  it('drops a block the selection only touches at its start', () => {
    const container = setup();
    const [a, b] = Array.from(container.querySelectorAll('p'));
    const range = document.createRange();
    range.setStart(a.firstChild!, 0);
    range.setEnd(b.firstChild!, 0);
    const target = selectionTarget(range, container, source, lineAt)!;
    expect(target.commentType).toBe('inline');
    expect(target.blocks).toEqual([a]);
    container.remove();
  });

  it('falls back to the whole block when alignment fails', () => {
    const container = document.createElement('div');
    container.innerHTML = '<p data-commentable="true" data-source-start="0" data-source-end="5">other</p>';
    const text = container.querySelector('p')!.firstChild!;
    const range = document.createRange();
    range.setStart(text, 1);
    range.setEnd(text, 3);
    const target = selectionTarget(range, container, 'abcde', lineAt)!;
    expect(target).toMatchObject({ commentType: 'line', start: 0, end: 5 });
  });
});
