import { describe, expect, it } from 'bun:test';
import {
  classifyFrontmatterValue,
  formatFrontmatterDate,
  parseLeadingFrontmatter,
  renderFrontmatterHtml,
  statusTone,
} from '../src/frontmatter';
import { frontmatterPathCandidates } from '../src/links';

const doc = (lines: string[]) => ['---', ...lines, '---', '', '# Title', ''].join('\n');

describe('parseLeadingFrontmatter', () => {
  it('strips quotes from scalar values', () => {
    const { entries } = parseLeadingFrontmatter(doc(['topic: "Quoted topic"', "name: 'single'"]));
    expect(entries.map((e) => e.value)).toEqual(['Quoted topic', 'single']);
  });

  it('reads YAML block lists', () => {
    const { entries } = parseLeadingFrontmatter(doc(['tags:', '  - one', '  - "two"', '- three', 'status: draft']));
    expect(entries[0]).toMatchObject({ key: 'tags', isArray: true, value: ['one', 'two', 'three'] });
    expect(entries[1]).toMatchObject({ key: 'status', value: 'draft' });
  });

  it('keeps an empty scalar when no list follows', () => {
    const { entries } = parseLeadingFrontmatter(doc(['owner:', 'status: draft']));
    expect(entries[0]).toMatchObject({ key: 'owner', value: '', isArray: false });
  });
});

describe('classifyFrontmatterValue', () => {
  it('detects the value kinds', () => {
    expect(classifyFrontmatterValue('status', 'complete')).toBe('status');
    expect(classifyFrontmatterValue('date', '2026-03-17')).toBe('date');
    expect(classifyFrontmatterValue('last_updated', '2026-01-21T00:15:22Z')).toBe('date');
    expect(classifyFrontmatterValue('git_commit', 'e6e6062d106a192e1f67ed3e9ed8d5cd6e6bb3d3')).toBe('commit');
    expect(classifyFrontmatterValue('git_commit', 'per-phase')).toBe('text');
    expect(classifyFrontmatterValue('link', 'https://example.com/x')).toBe('url');
    expect(classifyFrontmatterValue('source', 'thoughts/taras/research/x.md')).toBe('path');
    expect(classifyFrontmatterValue('topic', 'a/b testing ideas')).toBe('text');
    expect(classifyFrontmatterValue('branch', 'main')).toBe('text');
  });
});

describe('statusTone and formatFrontmatterDate', () => {
  it('maps status words to tones', () => {
    expect(statusTone('Completed')).toBe('success');
    expect(statusTone('in-progress')).toBe('progress');
    expect(statusTone('blocked')).toBe('danger');
    expect(statusTone('draft')).toBe('neutral');
  });

  it('formats dates without a timezone shift', () => {
    expect(formatFrontmatterDate('2026-03-01')).toBe('Mar 1, 2026');
    expect(formatFrontmatterDate('2026-03-18T23:30:00-04:00')).toBe('Mar 18, 2026 23:30');
    expect(formatFrontmatterDate('not a date')).toBe('not a date');
  });
});

describe('renderFrontmatterHtml', () => {
  const { entries } = parseLeadingFrontmatter(
    doc(['date: 2026-03-17', 'status: complete', 'tags: [a, b, c, d]', 'git_commit: e6e6062d106a192e1f67ed3e9ed8d5cd6e6bb3d3'])
  );

  it('renders a collapsed card with a glance line', () => {
    const html = renderFrontmatterHtml(entries, false);
    expect(html).toContain('<details class="frontmatter-card" data-frontmatter="true">');
    expect(html).toContain('fm-status-success');
    expect(html).toContain('Mar 17, 2026');
    expect(html).toContain('+1');
    expect(html).toContain('data-copy="e6e6062d106a192e1f67ed3e9ed8d5cd6e6bb3d3"');
    expect(html).toContain('>e6e6062<');
  });

  it('renders open when asked', () => {
    expect(renderFrontmatterHtml(entries, true)).toContain('data-frontmatter="true" open>');
  });
});

describe('frontmatterPathCandidates', () => {
  it('tries the file folder first, then each ancestor', () => {
    expect(frontmatterPathCandidates('thoughts/x/a.md', '/repo/thoughts/taras/plans/p.md')).toEqual([
      '/repo/thoughts/taras/plans/thoughts/x/a.md',
      '/repo/thoughts/taras/thoughts/x/a.md',
      '/repo/thoughts/thoughts/x/a.md',
      '/repo/thoughts/x/a.md',
    ]);
  });

  it('uses an absolute path as is', () => {
    expect(frontmatterPathCandidates('/abs/a.md', '/repo/p.md')).toEqual(['/abs/a.md']);
  });
});
