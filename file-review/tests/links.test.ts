import { describe, expect, it } from 'bun:test';
import { decoratePreview, describeLink, initLinkRouter, resolveHref } from '../src/links';
import { initPreview, onPreviewRendered, updatePreview } from '../src/markdown-preview';
import type { Tab } from '../src/tabs';

const CURRENT = '/Users/me/docs/guide/intro.md';

describe('resolveHref', () => {
  it('treats a bare fragment as an in-file anchor', () => {
    expect(resolveHref('#setup', CURRENT)).toEqual({ kind: 'anchor', fragment: 'setup' });
    expect(resolveHref('#caf%C3%A9', CURRENT)).toEqual({ kind: 'anchor', fragment: 'café' });
    expect(resolveHref('#', CURRENT)).toEqual({ kind: 'anchor', fragment: '' });
  });

  it('resolves ./ and ../ relative to the current file', () => {
    expect(resolveHref('./next.md', CURRENT)).toEqual({ kind: 'doc', path: '/Users/me/docs/guide/next.md' });
    expect(resolveHref('next.md', CURRENT)).toEqual({ kind: 'doc', path: '/Users/me/docs/guide/next.md' });
    expect(resolveHref('../api/ref.markdown', CURRENT)).toEqual({
      kind: 'doc',
      path: '/Users/me/docs/api/ref.markdown',
    });
    expect(resolveHref('../../../../../../etc/hosts', CURRENT)).toEqual({ kind: 'file', path: '/etc/hosts' });
  });

  it('classifies doc extensions case-insensitively and everything else as file', () => {
    expect(resolveHref('a.MDX', CURRENT).kind).toBe('doc');
    expect(resolveHref('notes.txt', CURRENT).kind).toBe('doc');
    expect(resolveHref('diagram.png', CURRENT).kind).toBe('file');
    expect(resolveHref('script.sh', CURRENT).kind).toBe('file');
    expect(resolveHref('Makefile', CURRENT).kind).toBe('file');
    expect(resolveHref('.md', CURRENT).kind).toBe('file');
  });

  it('keeps absolute paths and normalizes them', () => {
    expect(resolveHref('/tmp/./x/../plan.md', CURRENT)).toEqual({ kind: 'doc', path: '/tmp/plan.md' });
  });

  it('splits off fragment and query suffixes', () => {
    expect(resolveHref('./next.md#install-steps', CURRENT)).toEqual({
      kind: 'doc',
      path: '/Users/me/docs/guide/next.md',
      fragment: 'install-steps',
    });
    expect(resolveHref('img.png?raw=1', CURRENT)).toEqual({ kind: 'file', path: '/Users/me/docs/guide/img.png' });
    expect(resolveHref('next.md?plain=1#top', CURRENT)).toEqual({
      kind: 'doc',
      path: '/Users/me/docs/guide/next.md',
      fragment: 'top',
    });
  });

  it('decodes percent-encoded paths', () => {
    expect(resolveHref('my%20notes/a%23b.md', CURRENT)).toEqual({
      kind: 'doc',
      path: '/Users/me/docs/guide/my notes/a#b.md',
    });
    // Malformed escapes fall back to the raw text instead of throwing.
    expect(resolveHref('bad%zz.md', CURRENT)).toEqual({ kind: 'doc', path: '/Users/me/docs/guide/bad%zz.md' });
  });

  it('handles file:// URLs with or without a host', () => {
    expect(resolveHref('file:///Users/me/a%20b.md#x', CURRENT)).toEqual({
      kind: 'doc',
      path: '/Users/me/a b.md',
      fragment: 'x',
    });
    expect(resolveHref('file://localhost/tmp/pic.jpg', CURRENT)).toEqual({ kind: 'file', path: '/tmp/pic.jpg' });
    expect(resolveHref('FILE:/tmp/x.md', CURRENT)).toEqual({ kind: 'doc', path: '/tmp/x.md' });
  });

  it('marks http, https and mailto as external', () => {
    expect(resolveHref('https://example.com/a?b=1#c', CURRENT)).toEqual({
      kind: 'external',
      url: 'https://example.com/a?b=1#c',
    });
    expect(resolveHref('HTTP://example.com', CURRENT).kind).toBe('external');
    expect(resolveHref('mailto:me@example.com', CURRENT).kind).toBe('external');
    expect(resolveHref('//cdn.example.com/x.png', CURRENT)).toEqual({
      kind: 'external',
      url: 'https://cdn.example.com/x.png',
    });
  });

  it('rejects other schemes and unresolvable relative links', () => {
    expect(resolveHref('javascript:alert(1)', CURRENT).kind).toBe('unsupported');
    expect(resolveHref('ftp://host/file', CURRENT).kind).toBe('unsupported');
    expect(resolveHref('', CURRENT).kind).toBe('unsupported');
    expect(resolveHref('next.md', null).kind).toBe('unsupported');
    expect(resolveHref('/abs/next.md', null)).toEqual({ kind: 'doc', path: '/abs/next.md' });
  });
});

describe('describeLink', () => {
  it('shows the resolved destination', () => {
    expect(describeLink(resolveHref('./b.md#x', CURRENT), './b.md#x')).toBe('/Users/me/docs/guide/b.md#x');
    expect(describeLink(resolveHref('#x', CURRENT), '#x')).toBe('#x');
    expect(describeLink(resolveHref('https://a.dev', CURRENT), 'https://a.dev')).toBe('https://a.dev');
    expect(describeLink(resolveHref('tel:123', CURRENT), 'tel:123')).toBe('tel:123');
  });
});

describe('decoratePreview', () => {
  it('rewrites local image sources and titles links after render', () => {
    initLinkRouter({
      getActiveTab: () => ({ path: CURRENT }) as Tab,
      openDoc: async () => {},
      toast: () => {},
    });
    const container = document.createElement('div');
    initPreview(container);
    onPreviewRendered(decoratePreview);
    updatePreview(
      'See ![diagram](./img/flow%20chart.png) and [next](./next.md "Custom") or [site](https://a.dev).\n',
      []
    );

    const paragraph = container.querySelector('p')!;
    expect(paragraph.getAttribute('data-commentable')).toBe('true');

    const img = paragraph.querySelector('img')!;
    expect(img.dataset.originalSrc).toBe('./img/flow%20chart.png');
    expect(img.dataset.path).toBe('/Users/me/docs/guide/img/flow chart.png');
    expect(img.getAttribute('src')).toBe(
      `/api/asset?path=${encodeURIComponent('/Users/me/docs/guide/img/flow chart.png')}`
    );

    const [next, site] = Array.from(container.querySelectorAll('a'));
    expect(next.getAttribute('title')).toBe('Custom');
    expect(site.getAttribute('title')).toBe('https://a.dev');
    expect(site.classList.contains('link-external')).toBe(true);
  });
});
