import {
  EditorView,
  lineNumbers,
  highlightActiveLine,
  keymap,
  drawSelection,
} from "@codemirror/view";
import { EditorState, Compartment, Prec, type ChangeDesc } from "@codemirror/state";
import { markdown } from "@codemirror/lang-markdown";
import { defaultKeymap, history, historyKeymap, undo, redo } from "@codemirror/commands";
import { vim, Vim } from "@replit/codemirror-vim";
import { commentHighlightField } from "./comments";
import { getThemeExtension, type Theme } from "./theme";

let editorView: EditorView;
const themeCompartment = new Compartment();
const vimCompartment = new Compartment();
const fontSizeCompartment = new Compartment();
const keymapCompartment = new Compartment();
const docChangeCallbacks: Array<(changes: ChangeDesc) => void> = [];

// Filter out Ctrl+D from defaultKeymap (conflicts with vim half-page scroll)
const filteredKeymap = defaultKeymap.filter(
  (binding) => binding.key !== "Mod-d"
);

function createFontSizeTheme(size: number) {
  return EditorView.theme({
    "&": { fontSize: `${size}px` },
    ".cm-content": { fontSize: `${size}px` },
    ".cm-gutters": { fontSize: `${size}px` },
    ".cm-line": { fontSize: `${size}px` },
  });
}

export function initEditor(container: HTMLElement, fontSize: number = 14) {
  const startState = EditorState.create({
    doc: "",
    extensions: [
      vimCompartment.of([]),  // Vim FIRST for proper precedence
      drawSelection(),        // Required for vim visual mode
      history(),
      lineNumbers(),
      highlightActiveLine(),
      markdown(),
      commentHighlightField,
      EditorView.updateListener.of((update) => {
        if (!update.docChanged) return;
        docChangeCallbacks.forEach((callback) => callback(update.changes));
      }),
      keymapCompartment.of(keymap.of([...filteredKeymap, ...historyKeymap])),
      themeCompartment.of(getThemeExtension("dark")),
      fontSizeCompartment.of(createFontSizeTheme(fontSize)),
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

export function updateFontSize(size: number) {
  editorView.dispatch({
    effects: fontSizeCompartment.reconfigure(createFontSizeTheme(size)),
  });
}

export function updateVimMode(enabled: boolean) {
  if (enabled) {
    // Map Ctrl+Q to visual block mode (Ctrl+V is captured by OS for paste)
    Vim.map("<C-q>", "<C-v>", "normal");
  }
  editorView.dispatch({
    // Use Prec.high to ensure vim keybindings take precedence over CodeMirror defaults
    effects: vimCompartment.reconfigure(
      enabled ? Prec.high(vim({ status: true })) : []
    ),
  });
}

export function editorUndo() {
  undo(editorView);
}

export function editorRedo() {
  redo(editorView);
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

export function onDocumentChange(callback: (changes: ChangeDesc) => void) {
  docChangeCallbacks.push(callback);
}
