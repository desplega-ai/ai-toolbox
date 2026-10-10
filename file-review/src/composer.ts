import { setPendingHighlight } from "./comments";
import { getEditorView, getLineSpan } from "./editor";
import { lineRangeLabel } from "./comment-utils";
import { setPendingRange } from "./inline-highlights";

/** A passage the floating composer writes a comment on. */
export interface ComposerTarget {
  sourceStart: number;
  sourceEnd: number;
  /** Block kind shown after the line label, e.g. "Paragraph". */
  kind?: string;
  /** Viewport rect of the passage, read again on every reposition. Null re-anchors on the covering block. */
  anchorRect: () => DOMRect | null;
  /** Excerpt of the passage (see commentExcerpt). */
  quote: string;
  /** Preview block that gets the pending outline. Without one, the range is marked in CodeMirror. */
  pendingElement?: HTMLElement | null;
  /** Preview text marked as pending instead of the block, when the Highlight API exists. */
  pendingRange?: Range | null;
  /** Comment type to create. Without one, main.ts decides from the target. */
  commentType?: "inline" | "line";
}

interface ComposerHandlers {
  onSubmit: (text: string, target: ComposerTarget) => void;
}

const GAP = 8;
const MARGIN = 8;
const MAX_WIDTH = 440;
const MIN_COLUMN = 280;

let handlers: ComposerHandlers | null = null;
let current: ComposerTarget | null = null;
let returnFocus: HTMLElement | null = null;
let frame = 0;

const root = () => document.getElementById("comment-composer");
const textarea = () =>
  root()?.querySelector<HTMLTextAreaElement>(".composer-textarea") ?? null;

/** Grow a textarea with its content (CSS max-height caps it). */
export function autoGrowTextarea(ta: HTMLTextAreaElement) {
  ta.style.height = "auto";
  ta.style.height = `${ta.scrollHeight + ta.offsetHeight - ta.clientHeight}px`;
}

export function initComposer(composerHandlers: ComposerHandlers) {
  handlers = composerHandlers;
  const el = root();
  const ta = textarea();
  if (!el || !ta) return;

  el.querySelector(".composer-submit")?.addEventListener("click", submit);
  el.querySelector(".composer-cancel")?.addEventListener("click", () => closeComposer());
  ta.addEventListener("input", () => {
    autoGrowTextarea(ta);
    schedulePosition();
  });
  el.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      closeComposer();
    } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit();
    }
  });

  // Capture: the preview and CodeMirror scroll in their own containers.
  document.addEventListener("scroll", schedulePosition, true);
  window.addEventListener("resize", schedulePosition);
}

/**
 * Open the composer next to `target`. Replaces an open composer (its text is
 * dropped). Focus returns to the current element when it closes.
 */
export function openComposer(target: ComposerTarget) {
  const el = root();
  const ta = textarea();
  if (!el || !ta) return;

  if (current) setPending(current, false);
  else returnFocus = document.activeElement as HTMLElement | null;
  current = target;

  const { start, end } = getLineSpan(target.sourceStart, target.sourceEnd);
  const label = el.querySelector(".composer-label");
  if (label) {
    label.textContent = lineRangeLabel(start, end) + (target.kind ? ` · ${target.kind}` : "");
  }
  const quote = el.querySelector<HTMLElement>(".composer-quote");
  if (quote) {
    quote.textContent = target.quote;
    quote.hidden = !target.quote;
  }
  ta.value = "";
  ta.style.height = "";

  setPending(target, true);
  el.hidden = false;
  position();
  ta.focus({ preventScroll: true });
}

/** Close without keeping the text. Focus goes back where it was if it is still in the composer. */
export function closeComposer() {
  const el = root();
  if (!current || !el) return;
  const target = current;
  current = null;
  setPending(target, false);
  if (frame) cancelAnimationFrame(frame);
  frame = 0;

  const focusInside = el.contains(document.activeElement);
  el.hidden = true;
  el.style.visibility = "";
  const focus = returnFocus;
  returnFocus = null;
  if (focusInside && focus?.isConnected) focus.focus({ preventScroll: true });
}

function submit() {
  const text = textarea()?.value.trim();
  if (!text || !current) return;
  handlers?.onSubmit(text, current);
  closeComposer();
}

function setPending(target: ComposerTarget, on: boolean) {
  // recoverAnchor may have marked a re-rendered block.
  if (!on) {
    document
      .querySelectorAll(".comment-pending")
      .forEach((el) => el.classList.remove("comment-pending"));
  }
  if (target.pendingRange && setPendingRange(on ? target.pendingRange : null)) return;
  if (target.pendingElement) {
    target.pendingElement.classList.toggle("comment-pending", on);
    return;
  }
  getEditorView().dispatch({
    effects: setPendingHighlight.of(on ? { from: target.sourceStart, to: target.sourceEnd } : null),
  });
}

function schedulePosition() {
  if (!current || frame) return;
  frame = requestAnimationFrame(position);
}

/** The visible content area (vertical bounds) and its text column (horizontal bounds). */
function contentBounds(): { top: number; bottom: number; left: number; right: number } | null {
  const wrapper = document.getElementById("preview-wrapper");
  const inPreview = !!wrapper && wrapper.style.display !== "none";
  const scroller = document.getElementById(inPreview ? "preview-container" : "editor-container");
  if (!scroller) return null;
  const rect = scroller.getBoundingClientRect();
  let left = rect.left;
  let right = rect.right - MARGIN;
  if (inPreview) {
    const style = getComputedStyle(scroller);
    left += parseFloat(style.paddingLeft) || 0;
    right = rect.right - (parseFloat(style.paddingRight) || 0);
  } else {
    left = getEditorView().contentDOM.getBoundingClientRect().left;
  }
  if (right - left < MIN_COLUMN) {
    left = rect.left + MARGIN;
    right = rect.right - MARGIN;
  }
  return { top: rect.top, bottom: rect.bottom, left, right };
}

/**
 * Keep the open target on the same text while the document is edited in
 * source mode. Closes the composer when its text was deleted.
 */
export function mapComposerTarget(mapPos: (pos: number, assoc?: number) => number) {
  if (!current) return;
  const start = mapPos(current.sourceStart, -1);
  const end = mapPos(current.sourceEnd, 1);
  if (end <= start) {
    closeComposer();
    return;
  }
  current.sourceStart = start;
  current.sourceEnd = end;
  schedulePosition();
}

/**
 * The anchor element was re-rendered away (the preview re-renders on every
 * comment change): re-anchor on the block that now covers the target.
 */
function recoverAnchor(target: ComposerTarget): DOMRect | null {
  const wrapper = document.getElementById("preview-wrapper");
  if (wrapper && wrapper.style.display !== "none") {
    const blocks = document.querySelectorAll<HTMLElement>('#preview-container [data-commentable="true"]');
    for (const block of blocks) {
      const start = Number(block.dataset.sourceStart);
      const end = Number(block.dataset.sourceEnd);
      if (start <= target.sourceStart && target.sourceStart < end) {
        block.classList.add("comment-pending");
        target.pendingElement = block;
        target.anchorRect = () => (block.isConnected ? block.getBoundingClientRect() : null);
        return block.getBoundingClientRect();
      }
    }
    return null;
  }
  const coords = getEditorView().coordsAtPos(target.sourceStart);
  return coords ? new DOMRect(coords.left, coords.top, 0, coords.bottom - coords.top) : null;
}

function position() {
  frame = 0;
  const el = root();
  if (!el || !current) return;
  const anchor = current.anchorRect() ?? recoverAnchor(current);
  const bounds = contentBounds();
  // Out of view: hide but keep the draft, so scrolling to check context is safe.
  if (!anchor || !bounds || anchor.bottom < bounds.top || anchor.top > bounds.bottom) {
    el.style.visibility = "hidden";
    return;
  }
  el.style.visibility = "";

  const width = Math.min(MAX_WIDTH, bounds.right - bounds.left);
  el.style.width = `${width}px`;
  const height = el.offsetHeight;

  // Below the target; above it when it would run past the bottom.
  let top = anchor.bottom + GAP;
  if (top + height > bounds.bottom - MARGIN) top = anchor.top - GAP - height;
  top = Math.max(bounds.top + MARGIN, Math.min(top, bounds.bottom - height - MARGIN));
  const left = Math.max(bounds.left, Math.min(anchor.left, bounds.right - width));

  el.style.top = `${Math.round(top)}px`;
  el.style.left = `${Math.round(left)}px`;
}
