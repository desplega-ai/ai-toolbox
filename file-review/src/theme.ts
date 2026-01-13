import { EditorView } from "@codemirror/view";

export type Theme = "light" | "dark";

const darkTheme = EditorView.theme({
  "&": {
    backgroundColor: "#1e1e1e",
    color: "#d4d4d4",
    height: "100%",
  },
  ".cm-content": {
    caretColor: "#d4d4d4",
    padding: "10px 0",
  },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
    backgroundColor: "#264f78",
  },
  ".cm-scroller": {
    overflow: "auto",
  },
  ".cm-gutters": {
    backgroundColor: "#252526",
    borderRight: "1px solid #3c3c3c",
  },
  ".cm-lineNumbers .cm-gutterElement": {
    color: "#858585",
  },
});

const lightTheme = EditorView.theme({
  "&": {
    backgroundColor: "#ffffff",
    color: "#1e1e1e",
    height: "100%",
  },
  ".cm-content": {
    caretColor: "#1e1e1e",
    padding: "10px 0",
  },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
    backgroundColor: "#add6ff",
  },
  ".cm-scroller": {
    overflow: "auto",
  },
  ".cm-gutters": {
    backgroundColor: "#f3f3f3",
    borderRight: "1px solid #e0e0e0",
  },
  ".cm-lineNumbers .cm-gutterElement": {
    color: "#6e7681",
  },
});

export function getThemeExtension(theme: Theme) {
  return theme === "dark" ? darkTheme : lightTheme;
}
