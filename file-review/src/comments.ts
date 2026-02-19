import { StateField, StateEffect } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView } from "@codemirror/view";

export interface ReviewComment {
  id: string;
  text: string;
  comment_type: "inline" | "line";
  marker_pos: number;
  highlight_start: number;
  highlight_end: number;
}

export interface ParsedCommentState {
  cleanContent: string;
  comments: ReviewComment[];
}

type PositionMapper = (pos: number, assoc?: number) => number;

const REVIEW_MARKER_REGEX =
  /<!--\s*review-start\([a-zA-Z0-9-]+\)\s*-->|<!--\s*review-end\([a-zA-Z0-9-]+\):\s*[\s\S]*?\s*-->|<!--\s*review-line-start\([a-zA-Z0-9-]+\)\s*-->\n?|\n?<!--\s*review-line-end\([a-zA-Z0-9-]+\):\s*[\s\S]*?\s*-->/g;
const INLINE_REVIEW_REGEX =
  /<!--\s*review-start\(([a-zA-Z0-9-]+)\)\s*-->([\s\S]*?)<!--\s*review-end\(\1\):\s*([\s\S]*?)\s*-->/g;
const LINE_REVIEW_REGEX =
  /<!--\s*review-line-start\(([a-zA-Z0-9-]+)\)\s*-->\n?([\s\S]*?)\n?<!--\s*review-line-end\(\1\):\s*([\s\S]*?)\s*-->/g;

// State effect for adding/removing highlights
export const addHighlight = StateEffect.define<{
  from: number;
  to: number;
  commentId: string;
}>();

export const removeHighlight = StateEffect.define<string>();

export const clearHighlights = StateEffect.define<void>();

// State field to track comment decorations
export const commentHighlightField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(decorations, tr) {
    decorations = decorations.map(tr.changes);

    for (const effect of tr.effects) {
      if (effect.is(clearHighlights)) {
        decorations = Decoration.none;
      } else if (effect.is(addHighlight)) {
        const { from, to, commentId } = effect.value;
        const mark = Decoration.mark({
          class: "cm-comment-highlight",
          attributes: { "data-comment-id": commentId },
        });
        decorations = decorations.update({
          add: [mark.range(from, to)],
        });
      } else if (effect.is(removeHighlight)) {
        const commentId = effect.value;
        const newDecos: any[] = [];
        decorations.between(0, tr.state.doc.length, (from, to, deco) => {
          const attrs = (deco.spec as any).attributes;
          if (!attrs || attrs["data-comment-id"] !== commentId) {
            newDecos.push(deco.range(from, to));
          }
        });
        decorations = Decoration.set(newDecos);
      }
    }

    return decorations;
  },
  provide: (f) => EditorView.decorations.from(f),
});

function clampOffset(offset: number, max: number): number {
  return Math.max(0, Math.min(offset, max));
}

function sortComments(comments: ReviewComment[]): ReviewComment[] {
  return [...comments].sort((a, b) => {
    if (a.highlight_start !== b.highlight_start) {
      return a.highlight_start - b.highlight_start;
    }
    if (a.highlight_end !== b.highlight_end) {
      return a.highlight_end - b.highlight_end;
    }
    return a.id.localeCompare(b.id);
  });
}

function mapRawOffsetToClean(rawToClean: number[], rawOffset: number): number {
  const idx = clampOffset(rawOffset, rawToClean.length - 1);
  return rawToClean[idx];
}

function stripCommentMarkers(content: string): { cleanContent: string; rawToClean: number[] } {
  const rawToClean = new Array<number>(content.length + 1).fill(0);
  let cleanContent = "";
  let rawCursor = 0;
  let cleanCursor = 0;

  REVIEW_MARKER_REGEX.lastIndex = 0;
  let markerMatch: RegExpExecArray | null;

  while ((markerMatch = REVIEW_MARKER_REGEX.exec(content)) !== null) {
    const markerStart = markerMatch.index;
    const markerEnd = markerStart + markerMatch[0].length;

    while (rawCursor < markerStart) {
      rawToClean[rawCursor] = cleanCursor;
      cleanContent += content[rawCursor];
      rawCursor += 1;
      cleanCursor += 1;
    }

    while (rawCursor < markerEnd) {
      rawToClean[rawCursor] = cleanCursor;
      rawCursor += 1;
    }
  }

  while (rawCursor < content.length) {
    rawToClean[rawCursor] = cleanCursor;
    cleanContent += content[rawCursor];
    rawCursor += 1;
    cleanCursor += 1;
  }

  rawToClean[content.length] = cleanCursor;
  return { cleanContent, rawToClean };
}

function sanitizeCommentText(text: string): string {
  return text.replace(/-->/g, "--\\>");
}

function generateCommentId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID().slice(0, 8);
  }
  return Math.random().toString(36).slice(2, 10);
}

function parseCommentsFromContent(content: string): ReviewComment[] {
  const parsed: ReviewComment[] = [];

  INLINE_REVIEW_REGEX.lastIndex = 0;
  let inlineMatch: RegExpExecArray | null;
  while ((inlineMatch = INLINE_REVIEW_REGEX.exec(content)) !== null) {
    const full = inlineMatch[0];
    const id = inlineMatch[1];
    const text = inlineMatch[3];
    const startMarker = full.match(/^<!--\s*review-start\([a-zA-Z0-9-]+\)\s*-->/)?.[0] ?? "";
    const endMarker = full.match(/<!--\s*review-end\([a-zA-Z0-9-]+\):\s*[\s\S]*?\s*-->$/)?.[0] ?? "";
    const rawStart = inlineMatch.index + startMarker.length;
    const rawEnd = inlineMatch.index + full.length - endMarker.length;

    if (rawEnd <= rawStart) {
      continue;
    }

    parsed.push({
      id,
      text,
      comment_type: "inline",
      marker_pos: inlineMatch.index,
      highlight_start: rawStart,
      highlight_end: rawEnd,
    });
  }

  LINE_REVIEW_REGEX.lastIndex = 0;
  let lineMatch: RegExpExecArray | null;
  while ((lineMatch = LINE_REVIEW_REGEX.exec(content)) !== null) {
    const full = lineMatch[0];
    const id = lineMatch[1];
    const text = lineMatch[3];
    const startMarker = full.match(/^<!--\s*review-line-start\([a-zA-Z0-9-]+\)\s*-->\n?/)?.[0] ?? "";
    const endMarker = full.match(/\n?<!--\s*review-line-end\([a-zA-Z0-9-]+\):\s*[\s\S]*?\s*-->$/)?.[0] ?? "";
    const rawStart = lineMatch.index + startMarker.length;
    const rawEnd = lineMatch.index + full.length - endMarker.length;

    if (rawEnd <= rawStart) {
      continue;
    }

    parsed.push({
      id,
      text,
      comment_type: "line",
      marker_pos: lineMatch.index,
      highlight_start: rawStart,
      highlight_end: rawEnd,
    });
  }

  return sortComments(parsed);
}

export function parseAndStripComments(content: string): ParsedCommentState {
  const parsedComments = parseCommentsFromContent(content);
  const { cleanContent, rawToClean } = stripCommentMarkers(content);

  const mapped = parsedComments
    .map((comment) => {
      const start = mapRawOffsetToClean(rawToClean, comment.highlight_start);
      const end = mapRawOffsetToClean(rawToClean, comment.highlight_end);

      return {
        ...comment,
        marker_pos: start,
        highlight_start: start,
        highlight_end: end,
      };
    })
    .filter((comment) => comment.highlight_end > comment.highlight_start);

  return { cleanContent, comments: sortComments(mapped) };
}

export function serializeComments(content: string, comments: ReviewComment[]): string {
  if (comments.length === 0) {
    return content;
  }

  let result = content;
  const insertOrder = [...comments].sort((a, b) => {
    if (a.highlight_start !== b.highlight_start) {
      return b.highlight_start - a.highlight_start;
    }
    return b.highlight_end - a.highlight_end;
  });

  for (const comment of insertOrder) {
    const start = clampOffset(comment.highlight_start, result.length);
    const end = clampOffset(comment.highlight_end, result.length);
    if (end <= start) {
      continue;
    }

    const safeText = sanitizeCommentText(comment.text);
    const selected = result.slice(start, end);

    if (comment.comment_type === "line") {
      result =
        result.slice(0, start) +
        `<!-- review-line-start(${comment.id}) -->\n` +
        selected +
        `\n<!-- review-line-end(${comment.id}): ${safeText} -->` +
        result.slice(end);
    } else {
      result =
        result.slice(0, start) +
        `<!-- review-start(${comment.id}) -->` +
        selected +
        `<!-- review-end(${comment.id}): ${safeText} -->` +
        result.slice(end);
    }
  }

  return result;
}

export function createComment(
  commentType: ReviewComment["comment_type"],
  start: number,
  end: number,
  text: string
): ReviewComment {
  const commentStart = Math.max(0, Math.min(start, end));
  const commentEnd = Math.max(commentStart, Math.max(start, end));

  return {
    id: generateCommentId(),
    text,
    comment_type: commentType,
    marker_pos: commentStart,
    highlight_start: commentStart,
    highlight_end: commentEnd,
  };
}

export function mapCommentsThroughChanges(
  comments: ReviewComment[],
  mapPos: PositionMapper
): ReviewComment[] {
  const mapped = comments
    .map((comment) => {
      const start = mapPos(comment.highlight_start, -1);
      const end = mapPos(comment.highlight_end, 1);
      const nextStart = Math.max(0, Math.min(start, end));
      const nextEnd = Math.max(nextStart, Math.max(start, end));

      return {
        ...comment,
        marker_pos: nextStart,
        highlight_start: nextStart,
        highlight_end: nextEnd,
      };
    })
    .filter((comment) => comment.highlight_end > comment.highlight_start);

  return sortComments(mapped);
}

export function addComment(comments: ReviewComment[], comment: ReviewComment): ReviewComment[] {
  return sortComments([...comments, comment]);
}
