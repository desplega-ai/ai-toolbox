import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  initEditor,
  getEditorContent,
  setEditorContent,
  getEditorView,
  getSelection,
  scrollToPosition,
  updateTheme,
  updateVimMode,
  focusEditor,
  onSelectionChange,
} from "./editor";
import {
  parseComments,
  insertWrappedComment,
  removeComment,
  addHighlight,
  clearHighlights,
  type ReviewComment,
} from "./comments";
import {
  initSidebar,
  renderComments,
  showCommentInput,
  hideCommentInput,
  setupCommentInput,
} from "./sidebar";
import { showFilePicker } from "./file-picker";
import { initShortcuts, showShortcutsHelp } from "./shortcuts";
import { type Theme } from "./theme";
import {
  loadConfig,
  saveConfig,
  migrateFromLocalStorage,
  type AppConfig,
} from "./config";

let currentFilePath: string | null = null;
let comments: ReviewComment[] = [];
let currentTheme: Theme = "dark";
let vimEnabled = false;
let appConfig: AppConfig;

// Toast notifications
export function showToast(message: string, type: "success" | "info" = "info") {
  const container = document.getElementById("toast-container")!;
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("fade-out");
    setTimeout(() => toast.remove(), 200);
  }, 2000);
}

// Update comment button text based on selection
function updateCommentButton(hasSelection: boolean) {
  const btn = document.getElementById("add-comment-btn");
  if (btn) {
    const label = btn.querySelector(".label");
    if (label) {
      label.textContent = hasSelection ? "Comment Selection" : "Comment Line";
    }
  }
}

async function init() {
  // Load config from file
  appConfig = await loadConfig();

  // One-time migration from localStorage
  const migrated = migrateFromLocalStorage();
  if (migrated) {
    appConfig = { ...appConfig, ...migrated };
    await saveConfig(appConfig);
  }

  // Apply settings from config
  currentTheme = appConfig.theme;
  vimEnabled = appConfig.vim_mode;

  // Apply theme to body
  document.body.classList.toggle("light-theme", currentTheme === "light");
  updateTheme(currentTheme);
  updateThemeButton();
  updateVimMode(vimEnabled);
  updateVimButton();

  // Initialize sidebar handlers
  initSidebar(handleDeleteComment, handleCommentClick, handleCommentSubmit);
  setupCommentInput();

  // Initialize keyboard shortcuts
  initShortcuts({
    addComment: handleAddCommentShortcut,
    toggleTheme,
    toggleVim,
    openFile: showFilePickerAndLoad,
  });

  // Get file path from Rust state (set from CLI args)
  const filePath = await invoke<string | null>("get_current_file");

  if (filePath) {
    await loadFile(filePath);
    hideEmptyState();
  } else {
    showEmptyState();
  }

  // Listen for save command from menu
  await listen("menu:save", async () => {
    await saveFile();
  });

  // Set up empty state open button
  document
    .getElementById("empty-open-btn")
    ?.addEventListener("click", showFilePickerAndLoad);
  document
    .getElementById("open-file-btn")
    ?.addEventListener("click", showFilePickerAndLoad);

  // Set up toolbar buttons
  document
    .getElementById("theme-toggle")
    ?.addEventListener("click", toggleTheme);
  document.getElementById("vim-toggle")?.addEventListener("click", toggleVim);
  document
    .getElementById("help-btn")
    ?.addEventListener("click", showShortcutsHelp);

  // Set up comment button
  document
    .getElementById("add-comment-btn")
    ?.addEventListener("click", handleAddCommentShortcut);

  // Update comment button on selection change
  onSelectionChange(updateCommentButton);

  // Listen for config reload requests
  window.addEventListener("reload-config", async () => {
    appConfig = await loadConfig();
    currentTheme = appConfig.theme;
    vimEnabled = appConfig.vim_mode;

    document.body.classList.toggle("light-theme", currentTheme === "light");
    updateTheme(currentTheme);
    updateThemeButton();
    updateVimMode(vimEnabled);
    updateVimButton();

    showToast("Config reloaded", "info");
  });
}

function showEmptyState() {
  const emptyState = document.getElementById("empty-state");
  const mainContainer = document.getElementById("main-container");
  if (emptyState) emptyState.style.display = "flex";
  if (mainContainer) mainContainer.style.display = "none";
}

function hideEmptyState() {
  const emptyState = document.getElementById("empty-state");
  const mainContainer = document.getElementById("main-container");
  if (emptyState) emptyState.style.display = "none";
  if (mainContainer) mainContainer.style.display = "flex";
}

async function showFilePickerAndLoad() {
  const filePath = await showFilePicker();
  if (filePath) {
    await loadFile(filePath);
    hideEmptyState();
  }
}

async function toggleTheme() {
  currentTheme = currentTheme === "dark" ? "light" : "dark";
  appConfig.theme = currentTheme;
  await saveConfig(appConfig);
  document.body.classList.toggle("light-theme", currentTheme === "light");
  updateTheme(currentTheme);
  updateThemeButton();
}

function updateThemeButton() {
  const btn = document.getElementById("theme-toggle");
  if (btn) {
    btn.querySelector("span")!.textContent =
      currentTheme === "dark" ? "🌙" : "☀️";
  }
}

async function toggleVim() {
  vimEnabled = !vimEnabled;
  appConfig.vim_mode = vimEnabled;
  await saveConfig(appConfig);
  updateVimMode(vimEnabled);
  updateVimButton();
}

function updateVimButton() {
  const btn = document.getElementById("vim-toggle");
  if (btn) {
    btn.classList.toggle("active", vimEnabled);
  }
}

function handleAddCommentShortcut() {
  const selection = getSelection();
  const view = getEditorView();

  // If no selection, select the current line
  if (!selection || selection.from === selection.to) {
    const pos = selection?.from ?? 0;
    const line = view.state.doc.lineAt(pos);
    // Select the entire line content (excluding newline)
    view.dispatch({
      selection: { anchor: line.from, head: line.to },
    });
    showCommentInput(line.number);
    return;
  }

  const line = view.state.doc.lineAt(selection.from);
  showCommentInput(line.number);
}

async function handleCommentSubmit(text: string, _lineNumber: number) {
  const selection = getSelection();
  if (!selection || selection.from === selection.to) {
    hideCommentInput();
    return;
  }

  const content = getEditorContent();
  const [newContent] = await insertWrappedComment(
    content,
    selection.from,
    selection.to,
    text
  );
  setEditorContent(newContent);
  await refreshComments();
  showToast("Comment added", "success");
  focusEditor();
}

async function loadFile(path: string) {
  try {
    const content = await invoke<string>("read_file", { path });
    currentFilePath = path;
    await invoke("set_current_file", { path });
    setEditorContent(content);

    // Set window title to full path
    document.title = path;
    updateFileNameDisplay(path);

    // Show comment button
    const commentBtn = document.getElementById("add-comment-btn");
    if (commentBtn) commentBtn.style.display = "flex";

    // Parse and display existing comments
    await refreshComments();

    // Focus editor
    focusEditor();
  } catch (error) {
    console.error("Failed to load file:", error);
  }
}

function updateFileNameDisplay(path: string) {
  const fileNameEl = document.getElementById("file-name");
  const openBtn = document.getElementById("open-file-btn");

  if (fileNameEl) {
    const nameSpan = fileNameEl.querySelector(".name");
    if (nameSpan) nameSpan.textContent = path.split("/").pop() || path;
    fileNameEl.title = `Click to reveal in Finder: ${path}`;
    fileNameEl.style.display = "flex";
    fileNameEl.onclick = () => revealInFinder(path);
  }
  if (openBtn) openBtn.style.display = "none";
}

async function revealInFinder(path: string) {
  try {
    await invoke("reveal_in_finder", { path });
  } catch (error) {
    console.error("Failed to reveal in Finder:", error);
  }
}

async function saveFile() {
  if (!currentFilePath) return;

  try {
    const content = getEditorContent();
    await invoke("write_file", { path: currentFilePath, content });
    showToast("File saved", "success");
  } catch (error) {
    console.error("Failed to save file:", error);
  }
}

async function refreshComments() {
  const content = getEditorContent();
  comments = await parseComments(content);
  renderComments(comments);

  // Clear and re-add highlights
  const view = getEditorView();
  view.dispatch({ effects: clearHighlights.of() });

  // Add highlights for each comment using absolute positions
  for (const comment of comments) {
    view.dispatch({
      effects: addHighlight.of({
        from: comment.highlight_start,
        to: comment.highlight_end,
        commentId: comment.id,
      }),
    });
  }
}

function handleDeleteComment(commentId: string) {
  const content = getEditorContent();
  removeComment(content, commentId).then((newContent) => {
    setEditorContent(newContent);
    refreshComments();
    showToast("Comment removed", "info");
  });
}

function handleCommentClick(comment: ReviewComment) {
  scrollToPosition(comment.highlight_start);
}

// Initialize the app
document.addEventListener("DOMContentLoaded", () => {
  initEditor(document.getElementById("editor-container")!);
  init();
});
