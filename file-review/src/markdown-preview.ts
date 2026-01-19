import { marked } from 'marked';
import type { ReviewComment } from './comments';

let previewContainer: HTMLElement | null = null;
let hoverButton: HTMLElement | null = null;
let currentHoverElement: HTMLElement | null = null;
let addCommentCallback: ((sourceStart: number, sourceEnd: number, element: HTMLElement) => void) | null = null;
let hoverListenersAttached = false;
let hideTimeout: ReturnType<typeof setTimeout> | null = null;

export function initPreview(container: HTMLElement) {
  previewContainer = container;
}

/**
 * Initialize interactive commenting for preview mode
 */
export function initInteractiveCommenting(
  onAddComment: (sourceStart: number, sourceEnd: number, element: HTMLElement) => void
) {
  addCommentCallback = onAddComment;

  if (!hoverButton) {
    hoverButton = document.createElement('button');
    hoverButton.className = 'preview-add-comment-btn';
    hoverButton.innerHTML = '+';
    hoverButton.title = 'Add comment to this section';
    hoverButton.style.display = 'none';
    document.body.appendChild(hoverButton);

    hoverButton.addEventListener('mouseenter', () => {
      if (hideTimeout) {
        clearTimeout(hideTimeout);
        hideTimeout = null;
      }
    });

    hoverButton.addEventListener('mouseleave', () => {
      scheduleHideButton();
    });

    hoverButton.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!currentHoverElement || !addCommentCallback) return;

      const sourceStart = parseInt(currentHoverElement.dataset.sourceStart ?? '0', 10);
      const sourceEnd = parseInt(currentHoverElement.dataset.sourceEnd ?? '0', 10);

      addCommentCallback(sourceStart, sourceEnd, currentHoverElement);
      hideHoverButtonNow();
    });
  }
}

function positionHoverButton(element: HTMLElement) {
  if (!hoverButton || !previewContainer) return;

  if (hideTimeout) {
    clearTimeout(hideTimeout);
    hideTimeout = null;
  }

  const rect = element.getBoundingClientRect();
  const containerRect = previewContainer.getBoundingClientRect();
  const leftPos = Math.max(8, containerRect.left - 32);

  hoverButton.style.display = 'flex';
  hoverButton.style.position = 'fixed';
  hoverButton.style.left = `${leftPos}px`;
  hoverButton.style.top = `${rect.top + Math.min(rect.height / 2, 20) - 12}px`;
}

function scheduleHideButton() {
  if (hideTimeout) return;
  hideTimeout = setTimeout(() => {
    hideHoverButtonNow();
  }, 150);
}

function hideHoverButtonNow() {
  if (hideTimeout) {
    clearTimeout(hideTimeout);
    hideTimeout = null;
  }
  if (hoverButton) {
    hoverButton.style.display = 'none';
  }
  currentHoverElement = null;
}

export function flashElement(element: HTMLElement) {
  element.classList.add('element-flash');
  setTimeout(() => element.classList.remove('element-flash'), 1000);
}

/**
 * Replace comment markers with HTML spans
 * Handles both inline and line comment formats:
 * - Inline: <!-- review-start(id) -->...<!-- review-end(id): text -->
 * - Line: <!-- review-line-start(id) -->...<!-- review-line-end(id): text -->
 */
function injectHighlightSpans(content: string, comments: ReviewComment[]): string {
  let result = content;

  // Sort by position (descending) to process from end to start
  const sortedComments = [...comments].sort((a, b) => b.marker_pos - a.marker_pos);

  for (const comment of sortedComments) {
    const isLine = comment.comment_type === 'line';

    // Build patterns based on comment type
    const startMarkerRegex = isLine
      ? new RegExp(`<!--\\s*review-line-start\\(${comment.id}\\)\\s*-->\\n?`)
      : new RegExp(`<!--\\s*review-start\\(${comment.id}\\)\\s*-->`);

    const endMarkerRegex = isLine
      ? new RegExp(`\\n?<!--\\s*review-line-end\\(${comment.id}\\):[^>]*-->`)
      : new RegExp(`<!--\\s*review-end\\(${comment.id}\\):[^>]*-->`);

    const startMatch = result.match(startMarkerRegex);
    if (!startMatch || startMatch.index === undefined) {
      continue;
    }

    const startIdx = startMatch.index;
    const afterStart = startIdx + startMatch[0].length;

    const endMatch = result.slice(afterStart).match(endMarkerRegex);
    if (!endMatch || endMatch.index === undefined) {
      continue;
    }

    const highlightedText = result.slice(afterStart, afterStart + endMatch.index);
    const endMarkerEnd = afterStart + endMatch.index + endMatch[0].length;

    // Replace with HTML span
    result =
      result.slice(0, startIdx) +
      `<span class="review-comment-highlight" data-comment-id="${comment.id}">` +
      highlightedText +
      '</span>' +
      result.slice(endMarkerEnd);
  }

  return result;
}

/**
 * Render markdown with highlights
 */
export function renderMarkdown(content: string, comments: ReviewComment[]): string {
  // Step 1: Replace comment markers with HTML spans BEFORE markdown parsing
  const contentWithSpans = injectHighlightSpans(content, comments);

  // Step 2: Configure marked to preserve HTML
  marked.setOptions({
    gfm: true,
    breaks: true,
  });

  // Step 3: Parse markdown - marked preserves inline HTML by default
  const html = marked.parse(contentWithSpans, { async: false }) as string;

  // Step 4: Post-process to add data-commentable attributes
  const temp = document.createElement('div');
  temp.innerHTML = html;

  // Add commentable attributes to block elements
  const commentableSelectors = 'p, h1, h2, h3, h4, h5, h6, li, blockquote, pre, tr';
  let position = 0;

  temp.querySelectorAll(commentableSelectors).forEach((el) => {
    el.setAttribute('data-commentable', 'true');
    el.setAttribute('data-source-start', String(position));
    // Rough position estimate based on text length
    const textLen = el.textContent?.length ?? 0;
    position += textLen + 10;
    el.setAttribute('data-source-end', String(position));
  });

  return temp.innerHTML;
}

function setupHighlightClickHandlers() {
  if (!previewContainer) return;

  const highlights = previewContainer.querySelectorAll('.review-comment-highlight');
  highlights.forEach((el) => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const commentId = el.getAttribute('data-comment-id');
      if (commentId) {
        window.dispatchEvent(new CustomEvent('preview-comment-click', { detail: { commentId } }));
      }
    });
  });
}

function setupElementClickHandlers() {
  if (!previewContainer) return;

  const commentables = previewContainer.querySelectorAll('[data-commentable="true"]');

  commentables.forEach((el) => {
    el.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.review-comment-highlight')) {
        return;
      }

      const highlight = el.querySelector('.review-comment-highlight');
      if (highlight) {
        const commentId = highlight.getAttribute('data-comment-id');
        if (commentId) {
          window.dispatchEvent(new CustomEvent('preview-element-click', {
            detail: { commentId, element: el }
          }));
        }
      }
    });
  });
}

function setupHoverHandlers() {
  if (!previewContainer || hoverListenersAttached) return;

  previewContainer.addEventListener('mousemove', (e) => {
    if (!addCommentCallback) return;

    const target = (e.target as HTMLElement).closest('[data-commentable="true"]') as HTMLElement;

    if (target && target !== currentHoverElement) {
      currentHoverElement = target;
      positionHoverButton(target);
    } else if (!target && currentHoverElement) {
      scheduleHideButton();
    }
  });

  previewContainer.addEventListener('mouseleave', () => {
    scheduleHideButton();
  });

  hoverListenersAttached = true;
}

export function updatePreview(content: string, comments: ReviewComment[]) {
  if (!previewContainer) return;

  const html = renderMarkdown(content, comments);
  previewContainer.innerHTML = html;

  setupHighlightClickHandlers();
  setupElementClickHandlers();
  setupHoverHandlers();
}

export function scrollPreviewToComment(commentId: string) {
  if (!previewContainer) return;

  const element = previewContainer.querySelector(`[data-comment-id="${commentId}"]`);
  element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

export function getPreviewContainer(): HTMLElement | null {
  return previewContainer;
}
