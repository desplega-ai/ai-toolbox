import { StateField, StateEffect } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView } from "@codemirror/view";
import { API } from "./api";

export interface ReviewComment {
  id: string;
  text: string;
  comment_type: "inline" | "line";
  marker_pos: number;
  highlight_start: number;
  highlight_end: number;
}

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

// Parse comments from content and return them
export async function parseComments(content: string): Promise<ReviewComment[]> {
  return API.parseComments(content);
}

// Insert a wrapped comment around selected text
export async function insertWrappedComment(
  content: string,
  startPos: number,
  endPos: number,
  text: string
): Promise<[string, string]> {
  return API.insertWrappedComment(content, startPos, endPos, text);
}

// Insert a line comment that wraps the entire line
export async function insertLineComment(
  content: string,
  lineStartPos: number,
  lineEndPos: number,
  text: string
): Promise<[string, string]> {
  return API.insertLineComment(content, lineStartPos, lineEndPos, text);
}

// Remove a comment from content
export async function removeComment(
  content: string,
  commentId: string
): Promise<string> {
  return API.removeComment(content, commentId);
}
