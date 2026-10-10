// Map the rendered text of a preview block back to its markdown source, so a
// text selection becomes exact source offsets and an inline comment becomes
// an exact DOM range again. Pure: no DOM.

/**
 * Per rendered character: the source span it came from. `start[i]` is the
 * first source offset, `end[i]` is exclusive. Rendered-only whitespace (for
 * example between table cells) has an empty span.
 */
export interface TextAlignment {
  start: number[];
  end: number[];
}

// Inline markers skipped one character at a time when they do not match.
const SYNTAX_CHARS = new Set(["*", "_", "~", "`", "[", "]", "<", ">", "|", "^", "\\"]);
// Block prefixes at a line start: indent, quotes, list markers, task boxes, heading hashes.
const LINE_PREFIX =
  /^[ \t]*(?:>[ \t]?)*(?:(?:[-*+]|\d{1,9}[.)])[ \t]+)?(?:\[[ xX]\][ \t]+)?(?:#{1,6}(?:[ \t]+|$))?/;
const ENTITY = /^&(?:#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6})|([a-zA-Z][a-zA-Z0-9]{1,31}));/;
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};
const ESCAPABLE = /^[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]$/;
// Constructs that render no text of their own at this point.
const SKIPPED_CONSTRUCTS = [
  /^!\[[^\]]*\](?:\([^)]*\)|\[[^\]]*\])/, // image (alt text is not rendered as text)
  /^\]\((?:<[^>]*>|[^()\s]*(?:\([^()]*\)[^()\s]*)*)(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*\)/, // ](url "title")
  /^\]\[[^\]]*\]/, // ][ref]
  /^<!--[\s\S]*?-->/, // HTML comment
  /^<\/?[a-zA-Z][a-zA-Z0-9-]*(?:\s[^<>]*)?\/?>/, // HTML tag
];

const isSpace = (ch: string) => /\s/.test(ch);

function decodeEntity(match: RegExpExecArray): string | null {
  const code = match[1] ? parseInt(match[1], 10) : match[2] ? parseInt(match[2], 16) : null;
  if (code !== null) {
    try {
      return String.fromCodePoint(code);
    } catch {
      return null;
    }
  }
  return NAMED_ENTITIES[match[3].toLowerCase()] ?? null;
}

/**
 * Align `rendered` (the text of a rendered block) to `source` (its markdown)
 * by greedy forward matching. Markdown syntax in the source is skipped only
 * when it does not match the rendered text literally, so code keeps its
 * characters. Returns null when some rendered text has no source.
 */
export function alignRenderedToSource(rendered: string, source: string): TextAlignment | null {
  const start = new Array<number>(rendered.length);
  const end = new Array<number>(rendered.length);
  let i = 0;
  let j = 0;
  let prefixDoneAt = -1;

  const map = (from: number, to: number) => {
    start[i] = from;
    end[i] = to;
    i++;
  };

  while (i < rendered.length) {
    if (j >= source.length) return null;
    const r = rendered[i];
    const s = source[j];

    if ((j === 0 || source[j - 1] === "\n") && prefixDoneAt !== j) {
      prefixDoneAt = j;
      const prefix = LINE_PREFIX.exec(source.slice(j, source.indexOf("\n", j) + 1 || undefined))?.[0];
      if (prefix && !rendered.startsWith(prefix, i)) {
        // Dedented code keeps its markers: drop only the indent then.
        const indent = /^[ \t]*/.exec(prefix)![0].length;
        j += indent > 0 && rendered.startsWith(prefix.slice(indent), i) ? indent : prefix.length;
        continue;
      }
    }

    if (s === "&") {
      const m = ENTITY.exec(source.slice(j, j + 40));
      const decoded = m && !rendered.startsWith(m[0], i) ? decodeEntity(m) : null;
      if (m && decoded && rendered.startsWith(decoded, i)) {
        for (let k = 0; k < decoded.length; k++) map(j, j + m[0].length);
        j += m[0].length;
        continue;
      }
    }

    if (s === "\\" && j + 1 < source.length && ESCAPABLE.test(source[j + 1])) {
      if (!rendered.startsWith(source.slice(j, j + 2), i) && r === source[j + 1]) {
        map(j, j + 2);
        j += 2;
        continue;
      }
    }

    if (s === "!" || s === "]" || s === "<") {
      const rest = source.slice(j, j + 2048);
      const construct = SKIPPED_CONSTRUCTS.map((re) => re.exec(rest)?.[0]).find(Boolean);
      if (construct && !rendered.startsWith(construct, i)) {
        j += construct.length;
        continue;
      }
    }

    if (r === s || (isSpace(r) && isSpace(s))) {
      map(j, j + 1);
      j++;
    } else if (SYNTAX_CHARS.has(s) || isSpace(s)) {
      j++;
    } else if (isSpace(r)) {
      map(j, j);
    } else {
      return null;
    }
  }

  return { start, end };
}

/** Source span of the rendered text [from, to), or null when it is empty. */
export function renderedRangeToSource(
  alignment: TextAlignment,
  from: number,
  to: number
): { start: number; end: number } | null {
  const n = alignment.start.length;
  const a = Math.max(0, Math.min(from, n));
  const b = Math.max(a, Math.min(to, n));
  let first = -1;
  let last = -1;
  for (let k = a; k < b; k++) {
    if (alignment.end[k] <= alignment.start[k]) continue;
    if (first < 0) first = k;
    last = k;
  }
  if (first < 0) return null;
  return { start: alignment.start[first], end: alignment.end[last] };
}

/**
 * Widen an inline comment span so its markers never land inside markdown
 * syntax: a code span the span cuts into is taken whole (a marker inside one
 * would show as literal text wherever else the file is rendered), and an
 * emphasis or strike pair wrapping the whole span is included. A delimiter
 * touching only one edge stays outside, so pairs are never split.
 */
export function snapToInlineSyntax(
  source: string,
  start: number,
  end: number
): { start: number; end: number } {
  for (const match of source.matchAll(/(`+)[\s\S]*?\1/g)) {
    const spanStart = match.index;
    const spanEnd = spanStart + match[0].length;
    if (start > spanStart && start < spanEnd) start = spanStart;
    if (end > spanStart && end < spanEnd) end = spanEnd;
  }
  let before = 0;
  while (start - before > 0 && "*_~".includes(source[start - before - 1])) before++;
  let after = 0;
  while (end + after < source.length && "*_~".includes(source[end + after])) after++;
  const pair = Math.min(before, after);
  return { start: start - pair, end: end + pair };
}

/** Rendered span covering the source range [start, end), or null when no rendered text comes from it. */
export function sourceRangeToRendered(
  alignment: TextAlignment,
  start: number,
  end: number
): { start: number; end: number } | null {
  let first = -1;
  let last = -1;
  for (let k = 0; k < alignment.start.length; k++) {
    const s = alignment.start[k];
    const e = alignment.end[k];
    if (e <= s || s >= end || e <= start) continue;
    if (first < 0) first = k;
    last = k;
  }
  return first < 0 ? null : { start: first, end: last + 1 };
}
