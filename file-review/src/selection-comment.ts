import { icons } from "./icons";
import { alignBlock, blockSourceRange, textOffsetIn } from "./inline-highlights";
import { renderedRangeToSource } from "./source-align";

// A floating "Comment" pill below a text selection in the preview (ported
// from the comb selection-comment-button). Clicking it, or Cmd+K, opens the
// composer on the selection.

export interface SelectionTarget {
  commentType: "inline" | "line";
  start: number;
  end: number;
  /** Commentable blocks the selection covers, in document order. */
  blocks: HTMLElement[];
}

const BLOCK_SELECTOR = '[data-commentable="true"]';
const GAP = 6;
const MARGIN = 8;
// Keyboard selections fire selectionchange per keystroke; wait for them to settle.
const SETTLE_MS = 200;

/**
 * Map a preview selection to a comment target. Inside one block it is an
 * inline comment on the exact source text (the whole block when the rendered
 * text cannot be aligned to the source). Across blocks it is a line comment
 * from the first block's line start to the last block's line end.
 */
export function selectionTarget(
  range: Range,
  container: HTMLElement,
  source: string,
  lineAt: (pos: number) => { from: number; to: number }
): SelectionTarget | null {
  const blocks = Array.from(container.querySelectorAll<HTMLElement>(BLOCK_SELECTOR)).filter(
    (el) => blockSourceRange(el) !== null && range.intersectsNode(el)
  );
  // A drag that ends at the very start of the next block selects nothing in it.
  while (blocks.length > 1 && textOffsetIn(blocks[blocks.length - 1], range.endContainer, range.endOffset) === 0) {
    blocks.pop();
  }
  while (
    blocks.length > 1 &&
    textOffsetIn(blocks[0], range.startContainer, range.startOffset) >= (blocks[0].textContent ?? "").length
  ) {
    blocks.shift();
  }
  if (blocks.length === 0) return null;

  const first = blockSourceRange(blocks[0])!;
  const last = blockSourceRange(blocks[blocks.length - 1])!;
  if (blocks.length > 1) {
    return { commentType: "line", start: lineAt(first.start).from, end: lineAt(last.end).to, blocks };
  }

  const block = blocks[0];
  const alignment = alignBlock(block, source);
  const span =
    alignment &&
    renderedRangeToSource(
      alignment,
      textOffsetIn(block, range.startContainer, range.startOffset),
      textOffsetIn(block, range.endContainer, range.endOffset)
    );
  if (span) {
    return { commentType: "inline", start: first.start + span.start, end: first.start + span.end, blocks };
  }
  return { commentType: "line", start: first.start, end: first.end, blocks };
}

let container: HTMLElement | null = null;
let pill: HTMLButtonElement | null = null;
let current: Range | null = null;
let dismissed = false;
let pointerDown = false;
let settleTimer: number | undefined;

function isShown(el: HTMLElement): boolean {
  return el.isConnected && el.getClientRects().length > 0;
}

/** The live, non-empty selection over commentable text in the visible preview, if any. */
export function getPreviewSelection(): Range | null {
  const selection = window.getSelection();
  if (!container || !isShown(container) || !selection || selection.rangeCount === 0) return null;
  if (selection.isCollapsed || selection.toString().trim() === "") return null;
  const range = selection.getRangeAt(0);
  if (!container.contains(range.commonAncestorContainer)) return null;
  const blocks = Array.from(container.querySelectorAll(BLOCK_SELECTOR));
  return blocks.some((el) => range.intersectsNode(el)) ? range.cloneRange() : null;
}

export function hideSelectionPill() {
  current = null;
  if (pill) pill.hidden = true;
}

function evaluate() {
  current = getPreviewSelection();
  dismissed = false;
  position();
}

/** Below the selection end; above it near the bottom; hidden when the end scrolls out of view. */
function position() {
  if (!pill || !container) return;
  if (!current || dismissed || !isShown(container)) {
    pill.hidden = true;
    return;
  }
  const rects = Array.from(current.getClientRects()).filter((r) => r.width > 0 || r.height > 0);
  const end = rects[rects.length - 1];
  const bounds = container.getBoundingClientRect();
  if (!end || end.bottom < bounds.top || end.top > bounds.bottom) {
    pill.hidden = true;
    return;
  }
  pill.hidden = false;
  const width = pill.offsetWidth;
  const height = pill.offsetHeight;
  let top = end.bottom + GAP;
  if (top + height > bounds.bottom - MARGIN) top = end.top - GAP - height;
  const left = Math.max(
    bounds.left + MARGIN,
    Math.min(end.right - width / 2, bounds.right - width - MARGIN)
  );
  pill.style.top = `${Math.round(top)}px`;
  pill.style.left = `${Math.round(left)}px`;
}

export function initSelectionComment(previewContainer: HTMLElement, onComment: (range: Range) => void) {
  container = previewContainer;
  pill = document.createElement("button");
  pill.type = "button";
  pill.className = "selection-comment-btn";
  pill.hidden = true;
  pill.title = "Comment on selection (⌘K)";
  pill.setAttribute("aria-keyshortcuts", "Meta+K");
  pill.innerHTML = `${icons["message-square"]}<span>Comment</span><kbd>⌘K</kbd>`;
  // Keep the document selection when the pill is pressed.
  pill.addEventListener("mousedown", (e) => e.preventDefault());
  pill.addEventListener("click", () => {
    const range = current;
    hideSelectionPill();
    if (range) onComment(range);
  });
  document.body.appendChild(pill);

  // Mouse selections are read when the button comes up; keyboard selections
  // arrive as selectionchange alone.
  previewContainer.addEventListener("pointerdown", (e) => {
    if (e.button === 0) pointerDown = true;
  });
  document.addEventListener("pointerup", () => {
    if (!pointerDown) return;
    pointerDown = false;
    window.clearTimeout(settleTimer);
    requestAnimationFrame(evaluate);
  });
  document.addEventListener("selectionchange", () => {
    if (pointerDown) return;
    window.clearTimeout(settleTimer);
    settleTimer = window.setTimeout(evaluate, SETTLE_MS);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || !pill || pill.hidden) return;
    dismissed = true;
    pill.hidden = true;
  });

  previewContainer.addEventListener("scroll", position, { passive: true });
  window.addEventListener("resize", position);
}
