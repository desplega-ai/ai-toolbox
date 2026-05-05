import { API, isTauri } from "./api";
import {
  initEditor,
  getEditorContent,
  setEditorContent,
  getEditorView,
  getSelection,
  scrollToPosition,
  updateTheme,
  updateVimMode,
  updateFontSize,
  editorUndo,
  editorRedo,
  focusEditor,
  onSelectionChange,
  onDocumentChange,
} from "./editor";
import {
  parseAndStripComments,
  serializeComments,
  createComment,
  addComment,
  mapCommentsThroughChanges,
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
import {
  initPreview,
  updatePreview,
  scrollPreviewToComment,
  initInteractiveCommenting,
  flashElement,
  getPreviewContainer,
  refreshMermaidForTheme,
} from "./markdown-preview";
import { initMermaid } from "./mermaid";
import { extractTocEntries, initToc, renderToc } from "./toc";
import { PreviewNavigator } from "./preview-nav";
import { TabManager, type Tab } from "./tabs";
import { initTabStrip } from "./tabs-view";

const tabManager = new TabManager();

// Global UI state — NOT per-tab. Vim mode and theme are app-wide settings.
let currentTheme: Theme = "dark";
let vimEnabled = false;
let appConfig: AppConfig;
let suppressCommentSync = false;
let previewNav: PreviewNavigator | null = null;

/**
 * Read fields from the active tab. Returns null if no tab is open — callers
 * that touch tab state must guard.
 */
function readActive(): Tab | null {
  return tabManager.getActive();
}

/**
 * Patch fields on the active tab. No-op if no tab is open.
 */
function writeActive(patch: Partial<Tab>): void {
  const active = tabManager.getActive();
  if (!active) return;
  tabManager.update(active.id, patch);
}

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

function withSuppressedCommentSync<T>(fn: () => T): T {
  suppressCommentSync = true;
  try {
    return fn();
  } finally {
    suppressCommentSync = false;
  }
}

function getSerializedContentForPersistence(content = getEditorContent()): string {
  const active = readActive();
  return serializeComments(content, active?.comments ?? []);
}

function markSnapshotAsSaved(snapshot: string) {
  writeActive({ lastSavedSnapshot: snapshot, hasUnsavedChanges: false });
}

function syncUnsavedChangesState() {
  const active = readActive();
  if (!active || !active.path) {
    if (active) writeActive({ hasUnsavedChanges: false });
    return;
  }
  const dirty =
    serializeComments(getEditorContent(), active.comments) !== active.lastSavedSnapshot;
  if (dirty !== active.hasUnsavedChanges) {
    writeActive({ hasUnsavedChanges: dirty });
  }
}

function confirmDiscardUnsavedChanges(action: string): boolean {
  const active = readActive();
  if (!active?.hasUnsavedChanges) {
    return true;
  }
  return window.confirm(`You have unsaved changes. ${action}`);
}

function handleTocClick(entry: import('./toc').TocEntry) {
  const active = readActive();
  if (active?.isRawMode) {
    const view = getEditorView();
    view.dispatch({ selection: { anchor: entry.sourcePos } });
    scrollToPosition(entry.sourcePos);
    focusEditor();
  } else {
    const container = getPreviewContainer();
    if (!container) return;
    const el = container.querySelector('#' + CSS.escape(entry.id)) as HTMLElement | null;
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    flashElement(el);
  }
}

function renderCommentState() {
  const active = readActive();
  const comments = active?.comments ?? [];

  renderComments(comments);

  const content = getEditorContent();
  if (active?.isMarkdownFile && !active.isRawMode) {
    updatePreview(content, comments);
    previewNav?.reset();
  }
  if (active?.isMarkdownFile) {
    const entries = extractTocEntries(content);
    renderToc(entries, handleTocClick);
  }

  const view = getEditorView();
  view.dispatch({ effects: clearHighlights.of() });

  for (const comment of comments) {
    view.dispatch({
      effects: addHighlight.of({
        from: comment.highlight_start,
        to: comment.highlight_end,
        commentId: comment.id,
      }),
    });
  }

  syncUnsavedChangesState();
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
  initSidebar(
    handleDeleteComment,
    handleCommentClick,
    handleCommentSubmit,
    handleEditComment,
    readActive
  );
  setupCommentInput();

  // Initialize markdown preview
  initPreview(document.getElementById("preview-container")!, readActive);
  initMermaid(() => currentTheme);

  // Initialize ToC (passes active-tab accessor for step-2/3 forward-compat)
  initToc(readActive);

  // Initialize tab strip
  initTabStrip(tabManager, {
    onActivate: (id) => tabManager.setActive(id),
    onClose: (id) => closeTab(id),
  });

  // Initialize preview navigator (vim nav + search)
  previewNav = new PreviewNavigator(
    () => getPreviewContainer(),
    () => vimEnabled,
    undefined,
    readActive
  );

  // Set up interactive preview commenting
  initInteractiveCommenting((sourceStart, sourceEnd, element) => {
    handlePreviewAddComment(sourceStart, sourceEnd, element);
  });

  // Initialize keyboard shortcuts
  initShortcuts({
    addComment: handleAddCommentShortcut,
    save: saveFile,
    toggleTheme,
    toggleVim,
    toggleMarkdownView,
    openFile: showFilePickerAndLoad,
    zoomIn,
    zoomOut,
    undo: editorUndo,
    redo: editorRedo,
  });

  // Set version badge
  const version = await API.getVersion();
  const versionBadge = document.getElementById("version-badge");
  if (versionBadge) versionBadge.textContent = `v${version}`;

  // Get file path from Rust state (set from CLI args)
  const filePath = await API.getCurrentFile();

  if (filePath) {
    await loadFile(filePath);
    hideEmptyState();
  } else {
    showEmptyState();
  }

  // Listen for save command from menu (Tauri only)
  if (isTauri()) {
    const { listen } = await import("@tauri-apps/api/event");
    await listen("menu:save", async () => {
      await saveFile();
    });
  }

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
    .getElementById("markdown-toggle")
    ?.addEventListener("click", toggleMarkdownView);
  document
    .getElementById("help-btn")
    ?.addEventListener("click", showShortcutsHelp);

  // Set up comment button
  document
    .getElementById("add-comment-btn")
    ?.addEventListener("click", handleAddCommentShortcut);

  // Update comment button on selection change
  onSelectionChange(updateCommentButton);
  onDocumentChange((changes) => {
    if (suppressCommentSync) {
      return;
    }

    const active = readActive();
    if (!active || active.comments.length === 0) {
      syncUnsavedChangesState();
      return;
    }

    const remapped = mapCommentsThroughChanges(active.comments, (pos, assoc) =>
      changes.mapPos(pos, assoc)
    );
    writeActive({ comments: remapped });
    renderCommentState();
  });

  window.addEventListener("beforeunload", (event) => {
    if (!readActive()?.hasUnsavedChanges) {
      return;
    }
    event.preventDefault();
    event.returnValue = "";
  });

  // Listen for preview comment clicks (when clicking on highlighted text)
  window.addEventListener("preview-comment-click", ((e: CustomEvent<{ commentId: string }>) => {
    const active = readActive();
    const comment = active?.comments.find(c => c.id === e.detail.commentId);
    if (comment) {
      // Highlight the comment card in sidebar
      const card = document.querySelector(`[data-comment-id="${comment.id}"]`);
      if (card) {
        card.scrollIntoView({ behavior: "smooth", block: "center" });
        card.classList.add("highlight-flash");
        setTimeout(() => card.classList.remove("highlight-flash"), 1000);
      }
    }
  }) as EventListener);

  // Listen for preview element clicks (when clicking on commentable element with a comment)
  window.addEventListener("preview-element-click", ((e: CustomEvent<{ commentId: string; element: HTMLElement }>) => {
    const active = readActive();
    const comment = active?.comments.find(c => c.id === e.detail.commentId);
    if (comment) {
      // Scroll and highlight the comment card in sidebar
      const card = document.querySelector(`[data-comment-id="${comment.id}"]`);
      if (card) {
        card.scrollIntoView({ behavior: "smooth", block: "center" });
        card.classList.add("highlight-flash");
        setTimeout(() => card.classList.remove("highlight-flash"), 1000);
      }
    }
  }) as EventListener);

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
    updateFontSize(appConfig.font_size || 14);

    showToast("Config reloaded", "info");
  });

  // Web mode specific setup
  if (!isTauri()) {
    setupWebModeUI();
  }
}

/**
 * Set up web mode specific UI elements
 */
function setupWebModeUI() {
  // Add web mode badge
  const toolbarRight = document.getElementById("toolbar-right");
  if (toolbarRight) {
    const badge = document.createElement("span");
    badge.className = "web-mode-badge";
    badge.textContent = "WEB";
    badge.title = "Running in web server mode";
    toolbarRight.insertBefore(badge, toolbarRight.firstChild);
  }

  // Add quit button
  if (toolbarRight) {
    const quitBtn = document.createElement("button");
    quitBtn.id = "quit-btn";
    quitBtn.title = "Quit and show final report";
    quitBtn.innerHTML = '<span class="icon">&#x2715;</span> Quit';
    quitBtn.addEventListener("click", handleWebQuit);
    toolbarRight.appendChild(quitBtn);
  }

  // Disable file picker buttons (not supported in web mode)
  const openBtn = document.getElementById("open-file-btn") as HTMLButtonElement;
  const emptyOpenBtn = document.getElementById("empty-open-btn") as HTMLButtonElement;

  if (openBtn) {
    openBtn.disabled = true;
    openBtn.title = "File picker not available in web mode. Use CLI to specify file.";
  }
  if (emptyOpenBtn) {
    emptyOpenBtn.disabled = true;
    emptyOpenBtn.title = "File picker not available in web mode";
  }

  // Update empty state message for web mode
  const emptyContent = document.querySelector(".empty-content");
  if (emptyContent) {
    const hint = emptyContent.querySelector(".shortcut-hint");
    if (hint) {
      hint.textContent = "Start with: file-review --web <file.md>";
    }
  }
}

/**
 * Handle quit button click in web mode
 */
async function handleWebQuit() {
  if (!confirmDiscardUnsavedChanges("Quit without saving?")) {
    return;
  }

  try {
    const result = await API.quit();
    showFinalReportModal(result);
  } catch (error) {
    console.error("Failed to quit:", error);
    showToast("Failed to quit: " + error, "info");
  }
}

/**
 * Show final report modal before closing
 */
function showFinalReportModal(result: import("./api").QuitResponse) {
  const modal = document.createElement("div");
  modal.className = "final-report-modal";

  const hasOutput = result.output && result.output.trim().length > 0;

  modal.innerHTML = `
    <div class="final-report-content">
      <div class="final-report-header">
        <h3>Review Complete</h3>
        <span class="badge">${result.comments_count} comment${result.comments_count !== 1 ? 's' : ''}</span>
      </div>
      <div class="final-report-body">
        ${hasOutput
          ? `<pre>${escapeHtml(result.output)}</pre>`
          : '<p class="no-comments-msg">No comments to report. The review is complete.</p>'
        }
      </div>
      <div class="final-report-footer">
        <span class="info-text">
          ${hasOutput ? 'Comments have been printed to the server terminal.' : ''}
          You can now close this window.
        </span>
        <button class="primary-btn" id="close-final-report">Close</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Close button handler - just remove modal, let user close tab manually
  // (window.close() closes the entire browser window, not just the tab)
  const closeBtn = modal.querySelector("#close-final-report");
  closeBtn?.addEventListener("click", () => {
    modal.remove();
  });

  // Click outside to close modal
  modal.addEventListener("click", (e) => {
    if (e.target === modal) {
      modal.remove();
    }
  });
}

/**
 * Escape HTML entities to prevent XSS
 */
function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
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
  if (!confirmDiscardUnsavedChanges("Open another file and discard them?")) {
    return;
  }

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
  refreshMermaidForTheme();
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

async function zoomIn() {
  appConfig.font_size = Math.min(32, (appConfig.font_size || 14) + 2);
  updateFontSize(appConfig.font_size);
  await saveConfig(appConfig);
}

async function zoomOut() {
  appConfig.font_size = Math.max(8, (appConfig.font_size || 14) - 2);
  updateFontSize(appConfig.font_size);
  await saveConfig(appConfig);
}

async function toggleMarkdownView() {
  const active = readActive();
  if (!active?.isMarkdownFile) return;

  const newRawMode = !active.isRawMode;
  writeActive({ isRawMode: newRawMode });
  appConfig.markdown_raw = newRawMode;
  await saveConfig(appConfig);

  updateViewMode();
}

function updateViewMode() {
  const active = readActive();
  const editorContainer = document.getElementById("editor-container")!;
  const previewWrapper = document.getElementById("preview-wrapper")!;
  const toggleBtn = document.getElementById("markdown-toggle");
  const tocPanel = document.getElementById("sidebar-toc-panel");

  const isMarkdown = active?.isMarkdownFile ?? false;
  const isRaw = active?.isRawMode ?? false;

  if (isRaw) {
    editorContainer.style.display = "block";
    previewWrapper.style.display = "none";
    toggleBtn?.classList.remove("active");
  } else {
    editorContainer.style.display = "none";
    previewWrapper.style.display = "flex";
    toggleBtn?.classList.add("active");
    updatePreview(getEditorContent(), active?.comments ?? []);
    previewNav?.reset();
  }

  // ToC is always visible for markdown files regardless of mode
  if (tocPanel) tocPanel.style.display = isMarkdown ? "flex" : "none";
  if (isMarkdown) {
    const entries = extractTocEntries(getEditorContent());
    renderToc(entries, handleTocClick);
  }
}

function handleAddCommentShortcut() {
  const active = readActive();
  // In preview mode, use the active block from preview navigation
  if (active && !active.isRawMode && active.isMarkdownFile) {
    const previewContainer = getPreviewContainer();
    const activeEl = previewContainer?.querySelector<HTMLElement>('.preview-active');
    if (activeEl) {
      const sourceStart = parseInt(activeEl.dataset.sourceStart ?? '0', 10);
      const sourceEnd = parseInt(activeEl.dataset.sourceEnd ?? '0', 10);
      handlePreviewAddComment(sourceStart, sourceEnd, activeEl);
    }
    // No active block — nothing to comment on
    return;
  }

  // Raw mode: use CodeMirror editor position
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

/**
 * Handle adding comment from preview mode
 */
function handlePreviewAddComment(
  sourceStart: number,
  sourceEnd: number,
  element: HTMLElement
) {
  // Store pending preview comment info on the active tab
  writeActive({ pendingPreviewComment: { sourceStart, sourceEnd, element } });

  // Show comment input in sidebar with element type label
  const tagName = element.tagName.toLowerCase();
  const label = (tagName === 'p' && element.classList.contains('preview-line')) ? 'Line' :
    tagName === 'p' ? 'Paragraph' :
    tagName.match(/^h[1-6]$/) ? 'Heading' :
    tagName === 'li' ? 'List item' :
    tagName === 'tr' ? 'Table row' :
    tagName === 'blockquote' ? 'Blockquote' :
    tagName === 'pre' ? 'Code block' : 'Element';

  showCommentInput(0, label);
}

async function handleCommentSubmit(text: string, _lineNumber: number) {
  const active = readActive();
  if (!active) {
    hideCommentInput();
    return;
  }

  // Handle preview mode comment
  if (active.pendingPreviewComment) {
    const { sourceStart, sourceEnd, element } = active.pendingPreviewComment;
    const next = addComment(
      active.comments,
      createComment("line", sourceStart, sourceEnd, text)
    );
    writeActive({ comments: next, pendingPreviewComment: null });
    renderCommentState();

    // Flash the element for visual feedback
    flashElement(element);
    showToast("Comment added", "success");
    hideCommentInput();
    return;
  }

  // Handle raw mode comment (with selection)
  const selection = getSelection();
  if (!selection || selection.from === selection.to) {
    hideCommentInput();
    return;
  }

  const view = getEditorView();

  // Check if selection spans multiple lines or is a full line selection
  const startLine = view.state.doc.lineAt(selection.from);
  const endLine = view.state.doc.lineAt(selection.to);
  const isMultiLine = startLine.number !== endLine.number;
  const isFullLineSelection =
    selection.from === startLine.from && selection.to === startLine.to;

  let next: ReviewComment[];
  if (isMultiLine || isFullLineSelection) {
    // For multi-line or full-line selections, use line-based comments.
    const lineStart = startLine.from;
    const lineEnd = endLine.to;
    next = addComment(active.comments, createComment("line", lineStart, lineEnd, text));
  } else {
    next = addComment(
      active.comments,
      createComment("inline", selection.from, selection.to, text)
    );
  }

  writeActive({ comments: next });
  renderCommentState();
  showToast("Comment added", "success");
  focusEditor();
}

async function loadFile(path: string) {
  try {
    const fileContent = await API.readFile(path);
    const parsed = parseAndStripComments(fileContent);
    await API.setCurrentFile(path);

    const isMarkdownFile = path.endsWith(".md") || path.endsWith(".markdown");
    const initialRawMode = isMarkdownFile ? (appConfig.markdown_raw ?? false) : false;
    const snapshot = serializeComments(parsed.cleanContent, parsed.comments);

    // Step-1: replace-in-active-tab semantics. Step-2 will append a new tab.
    if (tabManager.tabs.length === 0) {
      tabManager.add({
        path,
        comments: parsed.comments,
        isMarkdownFile,
        isRawMode: initialRawMode,
        hasUnsavedChanges: false,
        lastSavedSnapshot: snapshot,
        pendingPreviewComment: null,
      });
    } else {
      const active = tabManager.getActive();
      if (active) {
        tabManager.update(active.id, {
          path,
          comments: parsed.comments,
          isMarkdownFile,
          isRawMode: initialRawMode,
          hasUnsavedChanges: false,
          lastSavedSnapshot: snapshot,
          pendingPreviewComment: null,
        });
      }
    }

    withSuppressedCommentSync(() => {
      setEditorContent(parsed.cleanContent);
    });

    // Check if stdin mode for UI adjustments
    const isStdin = await API.isStdinMode();
    updateFileNameDisplay(path, isStdin);

    const toggleBtn = document.getElementById("markdown-toggle");
    if (toggleBtn) {
      toggleBtn.style.display = isMarkdownFile ? "flex" : "none";
    }

    // Show comment button
    const commentBtn = document.getElementById("add-comment-btn");
    if (commentBtn) commentBtn.style.display = "flex";

    // Render existing comments/highlights from in-memory state
    renderCommentState();

    // Set up view mode for markdown files
    if (isMarkdownFile) {
      updateViewMode();
    } else {
      // For non-markdown files, ensure editor is visible and hide ToC
      const editorContainer = document.getElementById("editor-container")!;
      const previewWrapper = document.getElementById("preview-wrapper")!;
      const tocPanel = document.getElementById("sidebar-toc-panel");
      editorContainer.style.display = "block";
      previewWrapper.style.display = "none";
      if (tocPanel) tocPanel.style.display = "none";
    }

    // Focus editor (only if in raw mode or not a markdown file)
    if (initialRawMode || !isMarkdownFile) {
      focusEditor();
    }
  } catch (error) {
    console.error("Failed to load file:", error);
  }
}

function updateFileNameDisplay(path: string, isStdin = false) {
  const fileNameEl = document.getElementById("file-name");
  const openBtn = document.getElementById("open-file-btn");
  const inWebMode = !isTauri();

  if (fileNameEl) {
    const nameSpan = fileNameEl.querySelector(".name");
    if (isStdin) {
      // In stdin mode, show "(stdin)" and disable reveal in Finder
      if (nameSpan) nameSpan.textContent = "(stdin)";
      fileNameEl.title = "Content from stdin (temporary file)";
      fileNameEl.style.display = "flex";
      fileNameEl.onclick = null;
      fileNameEl.style.cursor = "default";
    } else if (inWebMode) {
      // Web mode - no reveal in Finder support
      if (nameSpan) nameSpan.textContent = path.split("/").pop() || path;
      fileNameEl.title = path;
      fileNameEl.style.display = "flex";
      fileNameEl.onclick = null;
      fileNameEl.style.cursor = "default";
    } else {
      // Normal Tauri file mode
      if (nameSpan) nameSpan.textContent = path.split("/").pop() || path;
      fileNameEl.title = `Click to reveal in Finder: ${path}`;
      fileNameEl.style.display = "flex";
      fileNameEl.onclick = () => revealInFinder(path);
      fileNameEl.style.cursor = "pointer";
    }
  }
  if (openBtn) openBtn.style.display = "none";
}

async function revealInFinder(path: string) {
  try {
    await API.revealInFinder(path);
  } catch (error) {
    console.error("Failed to reveal in Finder:", error);
  }
}

async function saveFile() {
  const active = readActive();
  if (!active?.path) return;

  try {
    const contentWithComments = getSerializedContentForPersistence();
    await API.writeFile(active.path, contentWithComments);
    markSnapshotAsSaved(contentWithComments);
    showToast("File saved", "success");
  } catch (error) {
    console.error("Failed to save file:", error);
  }
}

function handleDeleteComment(commentId: string) {
  const active = readActive();
  if (!active) return;
  writeActive({ comments: active.comments.filter((c) => c.id !== commentId) });
  renderCommentState();
  showToast("Comment removed", "info");
}

function handleEditComment(commentId: string, newText: string) {
  const active = readActive();
  if (!active) return;
  // Mutate the comment in place, then re-set the array so subscribers fire.
  const next = active.comments.map((c) =>
    c.id === commentId ? { ...c, text: newText } : c
  );
  writeActive({ comments: next });
  renderCommentState();
  showToast("Comment updated", "success");
}

function handleCommentClick(comment: ReviewComment) {
  const active = readActive();
  if (active?.isMarkdownFile && !active.isRawMode) {
    scrollPreviewToComment(comment.id);
  } else {
    scrollToPosition(comment.highlight_start);
  }
}

/**
 * Close a tab by id. In step-1 only the active tab can be closed (single-tab
 * semantics); step-2 will allow closing any tab.
 */
function closeTab(id: string) {
  const tab = tabManager.tabs.find((t) => t.id === id);
  if (!tab) return;
  if (tab.hasUnsavedChanges) {
    if (!window.confirm("You have unsaved changes. Close this tab and discard them?")) {
      return;
    }
  }
  tabManager.remove(id);

  const remaining = tabManager.getActive();
  if (!remaining) {
    // No tabs left — return to empty state
    withSuppressedCommentSync(() => {
      setEditorContent("");
    });
    showEmptyState();
    // Hide file-bound UI elements that loadFile() showed
    const fileNameEl = document.getElementById("file-name");
    if (fileNameEl) fileNameEl.style.display = "none";
    const openBtn = document.getElementById("open-file-btn");
    if (openBtn) openBtn.style.display = "";
    const commentBtn = document.getElementById("add-comment-btn");
    if (commentBtn) commentBtn.style.display = "none";
    const toggleBtn = document.getElementById("markdown-toggle");
    if (toggleBtn) toggleBtn.style.display = "none";
    const tocPanel = document.getElementById("sidebar-toc-panel");
    if (tocPanel) tocPanel.style.display = "none";
    renderComments([]);
  }
}

// Initialize the app
document.addEventListener("DOMContentLoaded", async () => {
  // Pre-load config to get font size for editor initialization
  const config = await loadConfig();
  initEditor(document.getElementById("editor-container")!, config.font_size || 14);
  init();
});
