import { describe, expect, it } from 'bun:test';
import { autoCollapsedRails, clampRailWidth } from '../src/layout';

describe('clampRailWidth', () => {
  it('clamps to the per-side limits', () => {
    expect(clampRailWidth('left', 100)).toBe(180);
    expect(clampRailWidth('left', 900)).toBe(440);
    expect(clampRailWidth('right', 100)).toBe(260);
    expect(clampRailWidth('right', 900)).toBe(560);
    expect(clampRailWidth('right', 333.6)).toBe(334);
  });

  it('falls back to the default for non-numbers', () => {
    expect(clampRailWidth('left', Number.NaN)).toBe(240);
    expect(clampRailWidth('right', undefined as unknown as number)).toBe(340);
  });
});

describe('autoCollapsedRails', () => {
  it('collapses the left rail below 1000px and both below 760px', () => {
    expect(autoCollapsedRails(1200)).toEqual({ left: false, right: false });
    expect(autoCollapsedRails(999)).toEqual({ left: true, right: false });
    expect(autoCollapsedRails(759)).toEqual({ left: true, right: true });
  });
});
