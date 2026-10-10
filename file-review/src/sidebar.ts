import type { ReviewComment } from "./comments";
import { getEditorView, getLineSpan } from "./editor";
import type { Tab } from "./tabs";
import { icons } from "./icons";
import { commentExcerpt, lineChipLabel, nextCommentId } from "./comment-utils";
import { autoGrowTextarea } from "./composer";
import { inlineCommentAt, setInlineEmphasis } from "./inline-highlights";

type CommentDeleteHandler = (commentId: string) => void;
type CommentClickHandler = (comment: ReviewComment) => void;
type CommentEditHandler = (commentId: string, newText: string) => void;
type GetActiveTab = () => Tab | null;

let deleteHandler: CommentDeleteHandler | null = null;
let clickHandler: CommentClickHandler | null = null;
let editHandler: CommentEditHandler | null = null;
// Reserved for step-2/3 use; passed in at init for forward compatibility.
let getActiveTab: GetActiveTab = () => null;

// Bidirectional linking between cards and passages. Painted by one injected
// stylesheet keyed on comment ids, so it survives preview and rail re-renders.
let selectedId: string | null = null;
let hoveredIds: string[] = [];
let flashIds: string[] = [];
let flashAlt = false;
let flashTimer: number | undefined;

export function initSidebar(
  onDelete: CommentDeleteHandler,
  onClick: CommentClickHandler,
  onEdit: CommentEditHandler,
  activeTabAccessor: GetActiveTab
) {
  deleteHandler = onDelete;
  clickHandler = onClick;
  editHandler = onEdit;
  getActiveTab = activeTabAccessor;
}

// Exported so step-2/3 can read active-tab state from sidebar internals if
// needed; today this is a forward-compat hook.
export function getActiveTabFromSidebar(): Tab | null {
  return getActiveTab();
}

function prefersReducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

function isTextField(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !(el instanceof HTMLElement)) return false;
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return true;
  return el.isContentEditable || !!el.closest(".cm-editor");
}

// Ids come from the marker regex ([a-zA-Z0-9-]); keep selectors safe anyway.
const safeId = (id: string) => id.replace(/[^a-zA-Z0-9-]/g, "");

function passageSelectors(id: string, suffix = ""): string {
  const s = safeId(id);
  return [
    `#preview-container [data-comment-ids~="${s}"]${suffix}`,
    `.cm-comment-highlight[data-comment-id="${s}"]${suffix}`,
  ].join(", ");
}

function updateFocusStyle() {
  let style = document.getElementById("comment-focus-style");
  if (!style) {
    style = document.createElement("style");
    style.id = "comment-focus-style";
    document.head.appendChild(style);
  }
  const rules: string[] = [];
  const emphasized = new Set(hoveredIds);
  if (selectedId) emphasized.add(selectedId);
  for (const id of emphasized) {
    rules.push(
      `${passageSelectors(id)} { background: var(--comment-focus-bg) !important; outline: 2px solid var(--highlight-border); outline-offset: 1px; }`,
      `#preview-container tr[data-comment-ids~="${safeId(id)}"] > :is(td, th) { background: var(--comment-focus-bg) !important; }`
    );
  }
  for (const id of hoveredIds) {
    rules.push(
      `.comment-card[data-comment-id="${safeId(id)}"] { background: var(--bg-hover); border-color: var(--highlight-border); }`
    );
  }
  // Two identical keyframes, alternated so a repeated flash restarts.
  const animation = flashAlt ? "comment-flash-alt" : "comment-flash";
  for (const id of flashIds) {
    rules.push(`${passageSelectors(id)} { animation: ${animation} 1s ease-out; }`);
  }
  style.textContent = rules.join("\n");
  // Inline passages are Highlight ranges, not elements: flashing shows the active style.
  setInlineEmphasis(new Set([...emphasized, ...flashIds]));
}

/** Briefly flash the passage of a comment in the preview and in CodeMirror. */
export function flashCommentPassage(id: string) {
  if (prefersReducedMotion()) return;
  window.clearTimeout(flashTimer);
  flashIds = [id];
  flashAlt = !flashAlt;
  updateFocusStyle();
  flashTimer = window.setTimeout(() => {
    flashIds = [];
    updateFocusStyle();
  }, 1000);
}

function cardFor(id: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    `#comments-list .comment-card[data-comment-id="${safeId(id)}"]`
  );
}

/** Scroll the rail (not its ancestors) so `card` is visible. */
function scrollCardIntoView(card: HTMLElement, block: "nearest" | "center") {
  const list = document.getElementById("comments-list");
  if (!list) return;
  const listRect = list.getBoundingClientRect();
  const cardRect = card.getBoundingClientRect();
  const offset = cardRect.top - listRect.top + list.scrollTop;
  let top: number;
  if (block === "center") {
    top = offset - (list.clientHeight - cardRect.height) / 2;
  } else if (cardRect.top < listRect.top) {
    top = offset - 8;
  } else if (cardRect.bottom > listRect.bottom) {
    top = offset + cardRect.height - list.clientHeight + 8;
  } else {
    return;
  }
  list.scrollTo({ top, behavior: prefersReducedMotion() ? "auto" : "smooth" });
}

function flashCard(card: HTMLElement) {
  card.classList.remove("highlight-flash");
  void card.offsetWidth;
  card.classList.add("highlight-flash");
  setTimeout(() => card.classList.remove("highlight-flash"), 1000);
}

function setSelected(id: string | null) {
  selectedId = id;
  document.querySelectorAll<HTMLElement>("#comments-list .comment-card").forEach((card) => {
    if (card.dataset.commentId === id) card.setAttribute("aria-current", "true");
    else card.removeAttribute("aria-current");
  });
  updateFocusStyle();
}

export function clearCommentSelection() {
  if (selectedId) setSelected(null);
}

/**
 * A highlighted passage was clicked: select the next of its comments (repeated
 * clicks cycle through them), scroll its card to the center and flash it.
 */
export function selectCommentFromPassage(ids: string[]) {
  const id = nextCommentId(ids, selectedId);
  if (!id) return;
  setSelected(id);
  const card = cardFor(id);
  if (card) {
    scrollCardIntoView(card, "center");
    flashCard(card);
  }
}

function setHovered(ids: string[], scrollRail: boolean) {
  if (ids.length === hoveredIds.length && ids.every((id, i) => id === hoveredIds[i])) return;
  hoveredIds = ids;
  updateFocusStyle();
  const card = scrollRail && ids.length > 0 ? cardFor(ids[0]) : null;
  if (card) scrollCardIntoView(card, "nearest");
}

/**
 * Wire passage hover and click to the cards: hovering a highlighted passage
 * marks its card, clicking one in CodeMirror selects it, Escape clears the
 * selection. Preview clicks arrive through the `preview-element-click` event.
 */
export function initCommentLinking(preview: HTMLElement, editorDom: HTMLElement) {
  // Preview: an inline passage under the pointer wins over its block's comments.
  let frame = 0;
  preview.addEventListener("mousemove", (e) => {
    if (frame) return;
    const { clientX, clientY, target } = e;
    frame = requestAnimationFrame(() => {
      frame = 0;
      const inline = inlineCommentAt(clientX, clientY);
      const block = (target as HTMLElement).closest<HTMLElement>("[data-comment-ids]");
      preview.classList.toggle("inline-comment-hover", inline !== null);
      setHovered(
        inline ? [inline] : (block?.dataset.commentIds ?? "").split(" ").filter(Boolean),
        true
      );
    });
  });
  preview.addEventListener("mouseleave", () => {
    cancelAnimationFrame(frame);
    frame = 0;
    preview.classList.remove("inline-comment-hover");
    setHovered([], false);
  });

  editorDom.addEventListener("mouseover", (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>(".cm-comment-highlight");
    setHovered(el?.dataset.commentId ? [el.dataset.commentId] : [], true);
  });
  editorDom.addEventListener("mouseleave", () => setHovered([], false));

  editorDom.addEventListener("click", (e) => {
    const { from, to } = getEditorView().state.selection.main;
    if (from !== to) return;
    const el = (e.target as HTMLElement).closest<HTMLElement>(".cm-comment-highlight");
    if (el?.dataset.commentId) selectCommentFromPassage([el.dataset.commentId]);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || !selectedId || isTextField(e.target)) return;
    clearCommentSelection();
  });
}

/** Pulse the collapsed rail's count badge (a comment was added while it is hidden). */
export function pulseCommentBadge() {
  const badge = document.getElementById("comments-rail-count");
  if (!badge) return;
  badge.classList.remove("pulse");
  void badge.offsetWidth;
  badge.classList.add("pulse");
  badge.addEventListener("animationend", () => badge.classList.remove("pulse"), { once: true });
}

export function renderComments(comments: ReviewComment[]) {
  const container = document.getElementById("comments-list")!;
  container.innerHTML = "";

  // Count badges: rail header and collapsed rail strip
  for (const id of ["comments-count", "comments-rail-count"]) {
    const badge = document.getElementById(id);
    if (!badge) continue;
    badge.textContent = String(comments.length);
    badge.hidden = comments.length === 0;
  }

  if (selectedId && !comments.some((c) => c.id === selectedId)) selectedId = null;
  hoveredIds = hoveredIds.filter((id) => comments.some((c) => c.id === id));
  updateFocusStyle();

  if (comments.length === 0) {
    container.innerHTML = `
      <div class="no-comments">
        <span class="no-comments-icon">${icons["message-square"]}</span>
        <p class="no-comments-title">No comments yet</p>
        <p class="no-comments-hint">Select text or hover a block and click +. ⌘K comments the current line or block.</p>
      </div>`;
    return;
  }

  comments.forEach((comment) => {
    const card = createCommentCard(comment);
    container.appendChild(card);
  });
}

function createCommentCard(comment: ReviewComment): HTMLElement {
  const card = document.createElement("div");
  card.className = "comment-card";
  card.dataset.commentId = comment.id;
  if (comment.id === selectedId) card.setAttribute("aria-current", "true");

  const { start, end } = getLineSpan(comment.highlight_start, comment.highlight_end);
  const chip = lineChipLabel(start, end);
  const kind = comment.comment_type === "inline" ? "Inline" : "Line";
  const quote = commentExcerpt(
    getEditorView().state.doc.sliceString(comment.highlight_start, comment.highlight_end)
  );

  card.innerHTML = `
    <div class="comment-header">
      <button class="comment-line-chip" type="button" title="Go to ${chip}">${chip}</button>
      <span class="comment-kind">${kind}</span>
      <div class="comment-actions">
        <button class="edit-btn" type="button" aria-label="Edit comment" title="Edit comment">${icons.pencil}</button>
        <button class="delete-btn" type="button" aria-label="Delete comment" title="Delete comment">${icons.trash}</button>
      </div>
    </div>
    ${quote ? `<div class="comment-quote">${escapeHtml(quote)}</div>` : ""}
    <div class="comment-text">${escapeHtml(comment.text)}</div>
  `;

  card.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    if (target.closest(".delete-btn, .edit-btn")) return;
    if (card.querySelector(".comment-edit-container")) return;
    setSelected(comment.id);
    flashCommentPassage(comment.id);
    clickHandler?.(comment);
  });

  card.addEventListener("mouseenter", () => setHovered([comment.id], false));
  card.addEventListener("mouseleave", () => setHovered([], false));

  card.querySelector(".edit-btn")?.addEventListener("click", (e) => {
    e.stopPropagation();
    enterEditMode(card, comment);
  });

  card.querySelector(".delete-btn")?.addEventListener("click", (e) => {
    e.stopPropagation();
    deleteHandler?.(comment.id);
  });

  return card;
}

function enterEditMode(card: HTMLElement, comment: ReviewComment) {
  const textEl = card.querySelector(".comment-text") as HTMLElement;
  if (!textEl || card.querySelector(".comment-edit-container")) return;

  textEl.style.display = "none";

  const container = document.createElement("div");
  container.className = "comment-edit-container";

  const textarea = document.createElement("textarea");
  textarea.className = "comment-edit-textarea";
  textarea.value = comment.text;
  textarea.rows = 2;
  textarea.setAttribute("aria-label", "Edit comment");

  const actions = document.createElement("div");
  actions.className = "comment-edit-actions";

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "cancel-btn";
  cancelBtn.textContent = "Cancel";

  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "submit-btn";
  saveBtn.textContent = "Save";

  actions.appendChild(cancelBtn);
  actions.appendChild(saveBtn);
  container.appendChild(textarea);
  container.appendChild(actions);
  textEl.after(container);
  autoGrowTextarea(textarea);
  textarea.focus();
  textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  textarea.addEventListener("input", () => autoGrowTextarea(textarea));

  const doSave = () => {
    const newText = textarea.value.trim();
    if (newText && newText !== comment.text) {
      editHandler?.(comment.id, newText);
    }
    exitEditMode(card);
  };

  const doCancel = () => exitEditMode(card);

  saveBtn.addEventListener("click", (e) => { e.stopPropagation(); doSave(); });
  cancelBtn.addEventListener("click", (e) => { e.stopPropagation(); doCancel(); });

  textarea.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      doCancel();
    } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.stopPropagation();
      doSave();
    }
  });
}

function exitEditMode(card: HTMLElement) {
  const container = card.querySelector(".comment-edit-container");
  container?.remove();
  const textEl = card.querySelector(".comment-text") as HTMLElement;
  if (textEl) textEl.style.display = "";
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
