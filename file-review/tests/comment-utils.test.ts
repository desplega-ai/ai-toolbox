import { describe, expect, it } from 'bun:test';
import {
  commentExcerpt,
  lineChipLabel,
  lineRangeLabel,
  nextCommentId,
} from '../src/comment-utils';

describe('commentExcerpt', () => {
  it('slices of a doc lose leading markdown markers', () => {
    const doc = '# Title\n\nSome text.\n';
    expect(commentExcerpt(doc.slice(0, 7))).toBe('Title');
    expect(commentExcerpt('### Deep heading')).toBe('Deep heading');
    expect(commentExcerpt('- item')).toBe('item');
    expect(commentExcerpt('* item')).toBe('item');
    expect(commentExcerpt('+ item')).toBe('item');
    expect(commentExcerpt('- [x] done task')).toBe('done task');
    expect(commentExcerpt('12. twelfth')).toBe('twelfth');
    expect(commentExcerpt('3) third')).toBe('third');
    expect(commentExcerpt('> quoted')).toBe('quoted');
  });

  it('strips stacked markers on every line and collapses whitespace', () => {
    const passage = '> - first   item\n>   continued\n> 2. second\n';
    expect(commentExcerpt(passage)).toBe('first item continued second');
  });

  it('keeps inline syntax that is not a block marker', () => {
    expect(commentExcerpt('**bold** and #tag')).toBe('**bold** and #tag');
    expect(commentExcerpt('---')).toBe('---');
    expect(commentExcerpt('-5 degrees')).toBe('-5 degrees');
  });

  it('caps long passages with an ellipsis', () => {
    const out = commentExcerpt('word '.repeat(200), 20);
    expect(out.length).toBeLessThanOrEqual(20);
    expect(out.endsWith('…')).toBe(true);
  });

  it('returns an empty string for blank passages', () => {
    expect(commentExcerpt('  \n\n ')).toBe('');
  });
});

describe('line labels', () => {
  it('formats single lines and ranges', () => {
    expect(lineChipLabel(12, 12)).toBe('L12');
    expect(lineChipLabel(12, 14)).toBe('L12-14');
    expect(lineRangeLabel(12, 12)).toBe('Line 12');
    expect(lineRangeLabel(12, 14)).toBe('Lines 12-14');
  });
});

describe('nextCommentId', () => {
  it('starts at the first id and cycles with wrap-around', () => {
    const ids = ['a', 'b', 'c'];
    expect(nextCommentId(ids, null)).toBe('a');
    expect(nextCommentId(ids, 'a')).toBe('b');
    expect(nextCommentId(ids, 'c')).toBe('a');
    expect(nextCommentId(ids, 'other')).toBe('a');
    expect(nextCommentId([], 'a')).toBeNull();
  });
});
