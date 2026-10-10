import { describe, expect, it } from 'bun:test';
import {
  applyFootnotes,
  numberFootnotes,
  parseFootnoteDef,
  splitFootnoteRefs,
} from '../src/footnotes';

describe('parseFootnoteDef', () => {
  it('parses the marker and its trailing space', () => {
    expect(parseFootnoteDef('[^note]: Some text')).toEqual({ id: 'note', length: 9 });
    expect(parseFootnoteDef('[^1]:x')).toEqual({ id: '1', length: 5 });
  });

  it('rejects text that is not a definition', () => {
    expect(parseFootnoteDef('See [^1]: here')).toBeNull();
    expect(parseFootnoteDef('[^1] no colon')).toBeNull();
    expect(parseFootnoteDef('[^a b]: spaced')).toBeNull();
  });
});

describe('splitFootnoteRefs', () => {
  it('splits text around references', () => {
    expect(splitFootnoteRefs('A[^1] and [^x-y].')).toEqual(['A', { id: '1' }, ' and ', { id: 'x-y' }, '.']);
  });

  it('returns plain text unchanged', () => {
    expect(splitFootnoteRefs('no refs [here]')).toEqual(['no refs [here]']);
  });
});

describe('numberFootnotes', () => {
  it('numbers by first reference order', () => {
    const numbers = numberFootnotes(['b', 'a', 'b'], ['a', 'b']);
    expect([...numbers]).toEqual([['b', 1], ['a', 2]]);
  });

  it('skips undefined references and appends unreferenced definitions', () => {
    const numbers = numberFootnotes(['missing', 'a'], ['c', 'a']);
    expect([...numbers]).toEqual([['a', 1], ['c', 2]]);
  });
});

describe('applyFootnotes', () => {
  function render(html: string): HTMLElement {
    const container = document.createElement('div');
    container.innerHTML = html;
    applyFootnotes(container);
    return container;
  }

  it('links references and marks definitions', () => {
    const container = render(
      '<p>One[^b] two[^a] again[^b]. Missing[^z].</p>' +
        '<p>[^a]: Alpha</p><p>[^b]: Beta</p><pre><code>[^a] in code</code></pre>'
    );

    const refs = Array.from(container.querySelectorAll<HTMLAnchorElement>('sup.footnote-ref a'));
    expect(refs.map((a) => [a.textContent, a.getAttribute('href'), a.id])).toEqual([
      ['1', '#fn-b', 'fnref-b'],
      ['2', '#fn-a', 'fnref-a'],
      ['1', '#fn-b', 'fnref-b-2'],
    ]);
    expect(container.querySelector('p')!.textContent).toContain('Missing[^z].');
    expect(container.querySelector('code')!.textContent).toBe('[^a] in code');

    const defA = container.querySelector<HTMLElement>('#fn-a')!;
    expect(defA.classList.contains('footnote-def')).toBe(true);
    expect(defA.querySelector('.footnote-label')!.textContent).toBe('2.');
    expect(defA.textContent).not.toContain('[^a]');
    expect(defA.querySelector('a.footnote-backref')!.getAttribute('href')).toBe('#fnref-a');
  });

  it('does nothing without definitions', () => {
    const container = render('<p>Text[^1]</p>');
    expect(container.innerHTML).toBe('<p>Text[^1]</p>');
  });
});
