import type { ReviewComment } from "./comments";
import { getEditorView } from "./editor";

type CommentDeleteHandler = (commentId: string) => void;
type CommentClickHandler = (comment: ReviewComment) => void;
type CommentSubmitHandler = (text: string, lineNumber: number) => void;
type CommentEditHandler = (commentId: string, newText: string) => void;

let deleteHandler: CommentDeleteHandler | null = null;
let clickHandler: CommentClickHandler | null = null;
let submitHandler: CommentSubmitHandler | null = null;
let editHandler: CommentEditHandler | null = null;
let pendingLineNumber: number | null = null;

export function initSidebar(
  onDelete: CommentDeleteHandler,
  onClick: CommentClickHandler,
  onSubmit: CommentSubmitHandler,
  onEdit: CommentEditHandler
) {
  deleteHandler = onDelete;
  clickHandler = onClick;
  submitHandler = onSubmit;
  editHandler = onEdit;
}

export function showCommentInput(lineNumber: number, label?: string) {
  pendingLineNumber = lineNumber;
  const inputArea = document.getElementById("comment-input-area")!;
  const lineLabel = document.getElementById("comment-line-label")!;
  const textarea = document.getElementById(
    "comment-textarea"
  ) as HTMLTextAreaElement;

  // Use custom label if provided (for preview mode), otherwise show line number
  lineLabel.textContent = label ?? `Line ${lineNumber}`;
  inputArea.style.display = "block";
  textarea.value = "";
  textarea.focus();
}

export function hideCommentInput() {
  const inputArea = document.getElementById("comment-input-area")!;
  inputArea.style.display = "none";
  pendingLineNumber = null;

  // Re-focus the editor
  getEditorView().focus();
}

export function setupCommentInput() {
  const textarea = document.getElementById(
    "comment-textarea"
  ) as HTMLTextAreaElement;
  const submitBtn = document.getElementById("comment-submit-btn");
  const cancelBtn = document.getElementById("comment-cancel-btn");

  submitBtn?.addEventListener("click", () => {
    const text = textarea.value.trim();
    if (text && pendingLineNumber !== null) {
      submitHandler?.(text, pendingLineNumber);
      hideCommentInput();
    }
  });

  cancelBtn?.addEventListener("click", hideCommentInput);

  textarea?.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      hideCommentInput();
    } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      submitBtn?.click();
    }
  });
}

export function renderComments(comments: ReviewComment[]) {
  const container = document.getElementById("comments-list")!;
  container.innerHTML = "";

  if (comments.length === 0) {
    container.innerHTML = '<div class="no-comments">No comments yet</div>';
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

  // Get line number from position
  const view = getEditorView();
  const lineNumber = view.state.doc.lineAt(comment.highlight_start).number;

  card.innerHTML = `
    <div class="comment-header">
      <span class="comment-line">Line ${lineNumber}</span>
      <div class="comment-actions">
        <button class="edit-btn" title="Edit comment">&#x270E;</button>
        <button class="delete-btn" title="Delete comment">&times;</button>
      </div>
    </div>
    <div class="comment-text">${escapeHtml(comment.text)}</div>
  `;

  card.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    if (target.classList.contains("delete-btn") || target.classList.contains("edit-btn")) return;
    if (card.querySelector(".comment-edit-container")) return;
    clickHandler?.(comment);
  });

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
  if (!textEl) return;

  textEl.style.display = "none";

  const container = document.createElement("div");
  container.className = "comment-edit-container";

  const textarea = document.createElement("textarea");
  textarea.className = "comment-edit-textarea";
  textarea.value = comment.text;
  textarea.rows = 3;

  const actions = document.createElement("div");
  actions.className = "comment-edit-actions";

  const cancelBtn = document.createElement("button");
  cancelBtn.className = "cancel-btn";
  cancelBtn.textContent = "Cancel";

  const saveBtn = document.createElement("button");
  saveBtn.className = "submit-btn";
  saveBtn.textContent = "Save";

  actions.appendChild(cancelBtn);
  actions.appendChild(saveBtn);
  container.appendChild(textarea);
  container.appendChild(actions);
  textEl.after(container);
  textarea.focus();

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
