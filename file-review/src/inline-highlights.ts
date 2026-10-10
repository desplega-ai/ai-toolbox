import type { ReviewComment } from "./comments";
import { alignRenderedToSource, sourceRangeToRendered, type TextAlignment } from "./source-align";

// Inline comments are painted as exact text ranges with the CSS Custom
// Highlight API (styles: ::highlight(review-inline*) in styles.css). Ranges do
// not touch the DOM, so selection and the commentable blocks stay intact.
const INLINE = "review-inline";
const ACTIVE = "review-inline-active";
const PENDING = "review-pending";

const BLOCK_SELECTOR = '[data-commentable="true"]';

interface PaintedComment {
  ranges: Range[];
  /** Source length, for hit-testing: the smallest passage wins. */
  length: number;
}

const painted = new Map<string, PaintedComment>();
let emphasized: string[] = [];

export function supportsHighlights(): boolean {
  return typeof CSS !== "undefined" && "highlights" in CSS && typeof Highlight !== "undefined";
}

/** Source range [start, end) of a commentable block, or null without one. */
export function blockSourceRange(block: HTMLElement): { start: number; end: number } | null {
  const start = Number.parseInt(block.dataset.sourceStart ?? "", 10);
  const end = Number.parseInt(block.dataset.sourceEnd ?? "", 10);
  return Number.isFinite(start) && Number.isFinite(end) && end > start ? { start, end } : null;
}

/** Align a block's rendered text to its source slice. Offsets are relative to the block start. */
export function alignBlock(block: HTMLElement, source: string): TextAlignment | null {
  const bounds = blockSourceRange(block);
  if (!bounds || block.classList.contains("mermaid")) return null;
  return alignRenderedToSource(block.textContent ?? "", source.slice(bounds.start, bounds.end));
}

/** Rendered text offset of a DOM point, clamped to `block`. */
export function textOffsetIn(block: HTMLElement, node: Node, offset: number): number {
  if (!block.contains(node)) {
    const before = block.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_PRECEDING;
    return before ? 0 : (block.textContent ?? "").length;
  }
  const range = document.createRange();
  range.selectNodeContents(block);
  range.setEnd(node, offset);
  return range.toString().length;
}

/** DOM range over the rendered text [from, to) of `block`. */
export function rangeFromTextOffsets(block: HTMLElement, from: number, to: number): Range | null {
  if (to <= from) return null;
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  let pos = 0;
  let started = false;
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const length = (node as Text).data.length;
    if (!started && from < pos + length) {
      range.setStart(node, from - pos);
      started = true;
    }
    if (started && to <= pos + length) {
      range.setEnd(node, to - pos);
      return range;
    }
    pos += length;
  }
  return null;
}

/**
 * Paint inline comments as exact text ranges. Returns the ids painted; the
 * caller gives the others (line comments, failed mappings, no API) the block
 * highlight.
 */
export function paintInlineHighlights(
  root: ParentNode,
  comments: ReviewComment[],
  source: string
): Set<string> {
  painted.clear();
  const done = new Set<string>();
  if (!supportsHighlights()) return done;

  const blocks = Array.from(root.querySelectorAll<HTMLElement>(BLOCK_SELECTOR));
  const alignments = new Map<HTMLElement, TextAlignment | null>();
  for (const comment of comments) {
    if (comment.comment_type !== "inline") continue;
    const ranges: Range[] = [];
    let ok = true;
    for (const block of blocks) {
      const bounds = blockSourceRange(block);
      if (!bounds || comment.highlight_start >= bounds.end || comment.highlight_end <= bounds.start) {
        continue;
      }
      if (!alignments.has(block)) alignments.set(block, alignBlock(block, source));
      const alignment = alignments.get(block);
      if (!alignment) {
        ok = false;
        break;
      }
      const span = sourceRangeToRendered(
        alignment,
        comment.highlight_start - bounds.start,
        comment.highlight_end - bounds.start
      );
      // Only markup of this block is commented: nothing to paint here.
      if (!span) continue;
      const range = rangeFromTextOffsets(block, span.start, span.end);
      if (!range) {
        ok = false;
        break;
      }
      ranges.push(range);
    }
    if (!ok || ranges.length === 0) continue;
    painted.set(comment.id, { ranges, length: comment.highlight_end - comment.highlight_start });
    done.add(comment.id);
  }

  CSS.highlights.set(INLINE, new Highlight(...[...painted.values()].flatMap((p) => p.ranges)));
  paintEmphasis();
  return done;
}

function paintEmphasis() {
  if (!supportsHighlights()) return;
  const highlight = new Highlight(...emphasized.flatMap((id) => painted.get(id)?.ranges ?? []));
  highlight.priority = 1;
  CSS.highlights.set(ACTIVE, highlight);
}

/** Paint these comments' inline passages in the active style (hovered, selected, flashing). */
export function setInlineEmphasis(ids: Iterable<string>) {
  emphasized = [...ids];
  paintEmphasis();
}

/** The painted inline comment under a viewport point (the smallest passage wins). */
export function inlineCommentAt(x: number, y: number): string | null {
  let hit: string | null = null;
  let hitLength = Number.POSITIVE_INFINITY;
  painted.forEach(({ ranges, length }, id) => {
    if (length >= hitLength) return;
    const over = ranges.some((range) =>
      Array.from(range.getClientRects()).some(
        (rect) => x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
      )
    );
    if (over) {
      hit = id;
      hitLength = length;
    }
  });
  return hit;
}

/** The block that holds the start of a painted inline comment. */
export function inlineCommentBlock(id: string): HTMLElement | null {
  const node = painted.get(id)?.ranges[0]?.startContainer ?? null;
  const el = node instanceof Element ? node : (node?.parentElement ?? null);
  return el?.closest<HTMLElement>(BLOCK_SELECTOR) ?? null;
}

/** Mark the passage a new comment is written on. False when the API is missing. */
export function setPendingRange(range: Range | null): boolean {
  if (!supportsHighlights()) return false;
  if (range) CSS.highlights.set(PENDING, new Highlight(range));
  else CSS.highlights.delete(PENDING);
  return true;
}
