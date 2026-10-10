// Pure helpers shared by the comment cards and the composer.

// Block markers at the start of a line: headings, bullets (with task boxes),
// quotes and ordered list numbers. Stripped repeatedly, so "> - item" works.
const LEADING_MARKER = /^\s*(?:#{1,6}\s+|[-*+]\s+(?:\[[ xX]\]\s+)?|>\s?|\d+[.)]\s+)/;

const MAX_EXCERPT = 280;

/**
 * One-line quote of an anchored passage: leading markdown markers trimmed on
 * every line, whitespace collapsed. CSS clamps it to two lines; the length
 * cap only keeps the DOM small.
 */
export function commentExcerpt(passage: string, maxLength = MAX_EXCERPT): string {
  const lines = passage.split("\n").map((line) => {
    let prev: string;
    do {
      prev = line;
      line = line.replace(LEADING_MARKER, "");
    } while (line !== prev);
    return line;
  });
  const text = lines.join(" ").replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trimEnd()}…` : text;
}

/** Compact line chip: "L12" or "L12-14". */
export function lineChipLabel(startLine: number, endLine: number): string {
  return endLine > startLine ? `L${startLine}-${endLine}` : `L${startLine}`;
}

/** "Line 12" or "Lines 12-14". */
export function lineRangeLabel(startLine: number, endLine: number): string {
  return endLine > startLine ? `Lines ${startLine}-${endLine}` : `Line ${startLine}`;
}

/**
 * Comment to select when a passage with `ids` is clicked: the one after the
 * current selection when it is among them (wrapping), else the first.
 */
export function nextCommentId(ids: string[], current: string | null): string | null {
  if (ids.length === 0) return null;
  const idx = current ? ids.indexOf(current) : -1;
  return ids[(idx + 1) % ids.length];
}
