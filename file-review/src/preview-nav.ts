const COMMENTABLE_SELECTOR = '[data-commentable="true"]';
const DEFAULT_PAGE_SIZE = 5;

export class PreviewNavigator {
  private activeIndex = -1;
  private searchVisible = false;
  private searchMarks: HTMLElement[] = [];
  private currentMatchIndex = -1;
  private pendingG = false;
  private pendingGTimer: ReturnType<typeof setTimeout> | null = null;
  private keydownHandler: (e: KeyboardEvent) => void;
  private searchInputHandler: ((e: Event) => void) | null = null;
  private searchKeydownHandler: ((e: KeyboardEvent) => void) | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private getPreviewContainer: () => HTMLElement | null,
    private getVimEnabled: () => boolean,
    private onBlockActivated?: (el: HTMLElement) => void
  ) {
    this.keydownHandler = (e: KeyboardEvent) => this.handleKeydown(e);
    document.addEventListener('keydown', this.keydownHandler);
    this.wireSearchButtons();
  }

  private isPreviewVisible(): boolean {
    const container = this.getPreviewContainer();
    if (!container) return false;
    const wrapper = document.getElementById('preview-wrapper');
    return wrapper !== null && wrapper.style.display !== 'none';
  }

  private isEditableTarget(target: EventTarget | null): boolean {
    if (!target) return false;
    const el = target as HTMLElement;
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return true;
    if (el.isContentEditable) return true;
    // Also check if inside CodeMirror
    if (el.closest('.cm-editor')) return true;
    return false;
  }

  private getCommentableElements(): HTMLElement[] {
    const container = this.getPreviewContainer();
    if (!container) return [];
    return Array.from(container.querySelectorAll<HTMLElement>(COMMENTABLE_SELECTOR));
  }

  private handleKeydown(e: KeyboardEvent) {
    if (!this.isPreviewVisible()) return;

    // Ctrl+F / Cmd+F — always available (non-vim), override browser find
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
      // Don't intercept if in an editable target other than our search input
      const searchInput = document.getElementById('preview-search-input');
      if (this.isEditableTarget(e.target) && e.target !== searchInput) return;
      e.preventDefault();
      this.openSearch();
      return;
    }

    // Search input has its own keydown handler, don't process vim keys
    if (e.target === document.getElementById('preview-search-input')) return;

    if (this.isEditableTarget(e.target)) return;
    if (!this.getVimEnabled()) return;

    const key = e.key;

    if (key === 'j') {
      e.preventDefault();
      this.moveBlock(1);
    } else if (key === 'k') {
      e.preventDefault();
      this.moveBlock(-1);
    } else if (key === 'g' && !e.shiftKey) {
      e.preventDefault();
      if (this.pendingG) {
        this.cancelPendingG();
        this.jumpToBlock(0);
      } else {
        this.pendingG = true;
        this.pendingGTimer = setTimeout(() => {
          this.pendingG = false;
          this.pendingGTimer = null;
        }, 500);
      }
    } else if (key === 'G') {
      e.preventDefault();
      this.cancelPendingG();
      const elements = this.getCommentableElements();
      if (elements.length > 0) this.jumpToBlock(elements.length - 1);
    } else if (key === 'd' && e.ctrlKey) {
      e.preventDefault();
      this.moveBlock(this.getPageSize());
    } else if (key === 'u' && e.ctrlKey) {
      e.preventDefault();
      this.moveBlock(-this.getPageSize());
    } else if (key === '/') {
      e.preventDefault();
      this.openSearch();
    } else if (key === 'Escape') {
      if (this.searchVisible) {
        this.closeSearch();
      } else {
        this.clearActiveBlock();
      }
    } else if (key === 'n' && !e.ctrlKey && !e.metaKey) {
      if (this.searchMarks.length > 0) {
        e.preventDefault();
        this.nextMatch();
      }
    } else if (key === 'N') {
      if (this.searchMarks.length > 0) {
        e.preventDefault();
        this.prevMatch();
      }
    }
  }

  private cancelPendingG() {
    this.pendingG = false;
    if (this.pendingGTimer) {
      clearTimeout(this.pendingGTimer);
      this.pendingGTimer = null;
    }
  }

  private getPageSize(): number {
    const container = this.getPreviewContainer();
    if (!container) return DEFAULT_PAGE_SIZE;
    const elements = this.getCommentableElements();
    const activeEl = elements[this.activeIndex];
    if (!activeEl) return DEFAULT_PAGE_SIZE;
    return Math.max(1, Math.floor(container.clientHeight / activeEl.offsetHeight));
  }

  moveBlock(delta: number) {
    const elements = this.getCommentableElements();
    if (elements.length === 0) return;

    let newIndex: number;
    if (this.activeIndex === -1) {
      newIndex = delta > 0 ? 0 : elements.length - 1;
    } else {
      newIndex = Math.max(0, Math.min(elements.length - 1, this.activeIndex + delta));
    }

    this.setActiveBlock(elements, newIndex);
  }

  jumpToBlock(index: number) {
    const elements = this.getCommentableElements();
    if (elements.length === 0) return;
    const clamped = Math.max(0, Math.min(elements.length - 1, index));
    this.setActiveBlock(elements, clamped);
  }

  private setActiveBlock(elements: HTMLElement[], index: number) {
    // Remove old highlight
    if (this.activeIndex >= 0 && this.activeIndex < elements.length) {
      elements[this.activeIndex].classList.remove('preview-active');
    }
    // Also clear any stale .preview-active (in case DOM re-rendered)
    const container = this.getPreviewContainer();
    container?.querySelectorAll('.preview-active').forEach(el => el.classList.remove('preview-active'));

    this.activeIndex = index;
    const el = elements[index];
    el.classList.add('preview-active');
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    this.onBlockActivated?.(el);
  }

  private clearActiveBlock() {
    const container = this.getPreviewContainer();
    container?.querySelectorAll('.preview-active').forEach(el => el.classList.remove('preview-active'));
    this.activeIndex = -1;
  }

  // --- Search ---

  private wireSearchButtons() {
    document.getElementById('preview-search-close')?.addEventListener('click', () => this.closeSearch());
    document.getElementById('preview-search-next')?.addEventListener('click', () => this.nextMatch());
    document.getElementById('preview-search-prev')?.addEventListener('click', () => this.prevMatch());
  }

  openSearch() {
    const bar = document.getElementById('preview-search-bar');
    const input = document.getElementById('preview-search-input') as HTMLInputElement | null;
    if (!bar || !input) return;

    bar.style.display = 'flex';
    this.searchVisible = true;
    input.focus();
    input.select();

    if (!this.searchInputHandler) {
      this.searchInputHandler = () => {
        if (this.debounceTimer) clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => {
          this.performSearch(input.value);
        }, 150);
      };
      input.addEventListener('input', this.searchInputHandler);

      this.searchKeydownHandler = (e: KeyboardEvent) => {
        if (e.key === 'Enter' && e.shiftKey) {
          e.preventDefault();
          this.prevMatch();
        } else if (e.key === 'Enter') {
          e.preventDefault();
          this.nextMatch();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          this.closeSearch();
        }
      };
      input.addEventListener('keydown', this.searchKeydownHandler);
    }
  }

  closeSearch() {
    const bar = document.getElementById('preview-search-bar');
    const input = document.getElementById('preview-search-input') as HTMLInputElement | null;
    if (bar) bar.style.display = 'none';
    if (input) input.value = '';
    this.searchVisible = false;
    this.clearSearchHighlights();
    this.updateSearchCount();
  }

  private performSearch(query: string) {
    this.clearSearchHighlights();

    if (!query.trim()) {
      this.updateSearchCount();
      return;
    }

    const container = this.getPreviewContainer();
    if (!container) return;

    const lowerQuery = query.toLowerCase();
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    const textNodes: Text[] = [];

    let node: Text | null;
    while ((node = walker.nextNode() as Text | null)) {
      if (node.nodeValue && node.nodeValue.toLowerCase().includes(lowerQuery)) {
        textNodes.push(node);
      }
    }

    for (const textNode of textNodes) {
      const text = textNode.nodeValue!;
      const lowerText = text.toLowerCase();
      const fragments: (string | HTMLElement)[] = [];
      let lastIndex = 0;
      let pos = lowerText.indexOf(lowerQuery, lastIndex);

      while (pos !== -1) {
        if (pos > lastIndex) {
          fragments.push(text.slice(lastIndex, pos));
        }
        const mark = document.createElement('mark');
        mark.className = 'preview-search-match';
        mark.textContent = text.slice(pos, pos + query.length);
        fragments.push(mark);
        this.searchMarks.push(mark);
        lastIndex = pos + query.length;
        pos = lowerText.indexOf(lowerQuery, lastIndex);
      }

      if (lastIndex < text.length) {
        fragments.push(text.slice(lastIndex));
      }

      if (fragments.length > 1) {
        const parent = textNode.parentNode!;
        for (const frag of fragments) {
          if (typeof frag === 'string') {
            parent.insertBefore(document.createTextNode(frag), textNode);
          } else {
            parent.insertBefore(frag, textNode);
          }
        }
        parent.removeChild(textNode);
      }
    }

    this.currentMatchIndex = -1;
    if (this.searchMarks.length > 0) {
      this.nextMatch();
    }
    this.updateSearchCount();
  }

  private clearSearchHighlights() {
    for (const mark of this.searchMarks) {
      const parent = mark.parentNode;
      if (parent) {
        parent.replaceChild(document.createTextNode(mark.textContent || ''), mark);
        parent.normalize();
      }
    }
    this.searchMarks = [];
    this.currentMatchIndex = -1;
  }

  private nextMatch() {
    if (this.searchMarks.length === 0) return;
    if (this.currentMatchIndex >= 0) {
      this.searchMarks[this.currentMatchIndex].classList.remove('current');
    }
    this.currentMatchIndex = (this.currentMatchIndex + 1) % this.searchMarks.length;
    this.highlightCurrentMatch();
  }

  private prevMatch() {
    if (this.searchMarks.length === 0) return;
    if (this.currentMatchIndex >= 0) {
      this.searchMarks[this.currentMatchIndex].classList.remove('current');
    }
    this.currentMatchIndex = this.currentMatchIndex <= 0
      ? this.searchMarks.length - 1
      : this.currentMatchIndex - 1;
    this.highlightCurrentMatch();
  }

  private highlightCurrentMatch() {
    const mark = this.searchMarks[this.currentMatchIndex];
    if (!mark) return;
    mark.classList.add('current');
    mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
    this.updateSearchCount();
  }

  private updateSearchCount() {
    const countEl = document.getElementById('preview-search-count');
    if (!countEl) return;
    if (this.searchMarks.length === 0) {
      countEl.textContent = '';
    } else {
      countEl.textContent = `${this.currentMatchIndex + 1} of ${this.searchMarks.length}`;
    }
  }

  reset() {
    this.clearActiveBlock();
    this.activeIndex = -1;

    if (this.searchVisible) {
      const input = document.getElementById('preview-search-input') as HTMLInputElement | null;
      const query = input?.value || '';
      this.searchMarks = [];
      this.currentMatchIndex = -1;
      if (query.trim()) {
        // Re-run search after DOM re-render
        setTimeout(() => this.performSearch(query), 0);
      }
    }
  }

  destroy() {
    document.removeEventListener('keydown', this.keydownHandler);
    this.cancelPendingG();
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
  }
}
