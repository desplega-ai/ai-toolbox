import {
  EditorView,
  lineNumbers,
  highlightActiveLine,
  keymap,
} from "@codemirror/view";
import { EditorState, Compartment } from "@codemirror/state";
import { markdown } from "@codemirror/lang-markdown";
import { defaultKeymap } from "@codemirror/commands";
import { vim, Vim } from "@replit/codemirror-vim";
import { commentHighlightField } from "./comments";
import { getThemeExtension, type Theme } from "./theme";

let editorView: EditorView;
const themeCompartment = new Compartment();
const vimCompartment = new Compartment();

export function initEditor(container: HTMLElement) {
  const startState = EditorState.create({
    doc: "",
    extensions: [
      lineNumbers(),
      highlightActiveLine(),
      markdown(),
      commentHighlightField,
      keymap.of(defaultKeymap),
      themeCompartment.of(getThemeExtension("dark")),
      vimCompartment.of([]),
    ],
  });

  editorView = new EditorView({
    state: startState,
    parent: container,
  });
}

export function updateTheme(theme: Theme) {
  editorView.dispatch({
    effects: themeCompartment.reconfigure(getThemeExtension(theme)),
  });
}

export function updateVimMode(enabled: boolean) {
  if (enabled) {
    // Map Ctrl+Q to visual block mode (Ctrl+V is captured by OS for paste)
    Vim.map("<C-q>", "<C-v>", "normal");
  }
  editorView.dispatch({
    effects: vimCompartment.reconfigure(enabled ? vim({ status: true }) : []),
  });
}

export function getEditorContent(): string {
  return editorView.state.doc.toString();
}

export function setEditorContent(content: string) {
  editorView.dispatch({
    changes: {
      from: 0,
      to: editorView.state.doc.length,
      insert: content,
    },
  });
}

export function getEditorView(): EditorView {
  return editorView;
}

export function getSelection(): { from: number; to: number } | null {
  const { from, to } = editorView.state.selection.main;
  return { from, to };
}

export function scrollToLine(lineNumber: number) {
  const line = editorView.state.doc.line(lineNumber);
  editorView.dispatch({
    effects: EditorView.scrollIntoView(line.from, { y: "center" }),
  });
}

export function scrollToPosition(pos: number) {
  editorView.dispatch({
    effects: EditorView.scrollIntoView(pos, { y: "center" }),
  });
}

export function focusEditor() {
  editorView.focus();
}

export function hasSelection(): boolean {
  const { from, to } = editorView.state.selection.main;
  return from !== to;
}

export function onSelectionChange(callback: (hasSelection: boolean) => void) {
  editorView.dom.addEventListener("mouseup", () => {
    callback(hasSelection());
  });
  editorView.dom.addEventListener("keyup", () => {
    callback(hasSelection());
  });
}
