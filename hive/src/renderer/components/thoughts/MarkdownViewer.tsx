import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { MessageSquarePlus, X, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ThoughtComment } from '../../../shared/types';

interface MarkdownViewerProps {
  content: string;
  comments: ThoughtComment[];
  highlightedCommentId: string | null;
  onTextSelect?: (selectedText: string, contextBefore: string, contextAfter: string) => void;
}

export function MarkdownViewer({
  content,
  comments,
  highlightedCommentId,
  onTextSelect,
}: MarkdownViewerProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [selectedBlocks, setSelectedBlocks] = React.useState<Set<number>>(new Set());
  const [lastClickedIndex, setLastClickedIndex] = React.useState<number | null>(null);
  const blockIndexRef = React.useRef(0);

  // Reset block index on each render
  blockIndexRef.current = 0;

  // Get the next block index
  const getNextIndex = () => {
    return blockIndexRef.current++;
  };

  // Build a map of block text -> comment info for highlighting
  // For multi-block comments, split by \n\n and add each segment
  const commentedBlocksMap = React.useMemo(() => {
    const map = new Map<string, { hasComment: boolean; isHighlighted: boolean }>();
    for (const comment of comments) {
      if (comment.selectedText) {
        // Split multi-block selections and add each segment
        const segments = comment.selectedText.split(/\n\n+/).map(s => s.trim()).filter(Boolean);
        const isHighlighted = comment.id === highlightedCommentId;

        for (const segment of segments) {
          // Normalize the text for matching (trim whitespace, normalize spaces)
          const normalizedText = segment.replace(/\s+/g, ' ');
          const existing = map.get(normalizedText);
          map.set(normalizedText, {
            hasComment: true,
            isHighlighted: existing?.isHighlighted || isHighlighted,
          });
        }
      }
    }
    return map;
  }, [comments, highlightedCommentId]);

  // Check if a block's text matches any comment
  const getBlockCommentState = (blockText: string): { hasComment: boolean; isHighlighted: boolean } => {
    const normalizedText = blockText.trim().replace(/\s+/g, ' ');
    return commentedBlocksMap.get(normalizedText) || { hasComment: false, isHighlighted: false };
  };

  // Handle block click
  const handleBlockClick = (e: React.MouseEvent, index: number) => {
    e.stopPropagation();

    if (e.shiftKey && lastClickedIndex !== null) {
      // Range selection
      const start = Math.min(lastClickedIndex, index);
      const end = Math.max(lastClickedIndex, index);
      const newSelection = new Set(selectedBlocks);
      for (let i = start; i <= end; i++) {
        newSelection.add(i);
      }
      setSelectedBlocks(newSelection);
    } else if (e.metaKey || e.ctrlKey || multiSelectMode) {
      // Toggle single block (multi-select mode)
      const newSelection = new Set(selectedBlocks);
      if (newSelection.has(index)) {
        newSelection.delete(index);
      } else {
        newSelection.add(index);
      }
      setSelectedBlocks(newSelection);
      setLastClickedIndex(index);
    } else {
      // Single selection
      if (selectedBlocks.has(index) && selectedBlocks.size === 1) {
        // Clicking same block again deselects it
        setSelectedBlocks(new Set());
        setLastClickedIndex(null);
      } else {
        setSelectedBlocks(new Set([index]));
        setLastClickedIndex(index);
      }
    }
  };

  // Clear selection when clicking container background
  const handleContainerClick = (e: React.MouseEvent) => {
    if (e.target === containerRef.current || (e.target as HTMLElement).classList.contains('markdown-viewer')) {
      setSelectedBlocks(new Set());
      setLastClickedIndex(null);
    }
  };

  // Get selected text from blocks
  const getSelectedText = React.useCallback((): string => {
    if (selectedBlocks.size === 0 || !containerRef.current) return '';

    const texts: string[] = [];
    const sortedIndices = Array.from(selectedBlocks).sort((a, b) => a - b);

    sortedIndices.forEach(index => {
      // Query by specific data-block-index value to ensure correct element
      const block = containerRef.current?.querySelector(`[data-block-index="${index}"]`);
      if (block) {
        texts.push(block.textContent || '');
      }
    });

    return texts.join('\n\n');
  }, [selectedBlocks]);

  // Get context around selection
  const getSelectionContext = React.useCallback((): { before: string; after: string } => {
    if (selectedBlocks.size === 0 || !containerRef.current) return { before: '', after: '' };

    const sortedIndices = Array.from(selectedBlocks).sort((a, b) => a - b);
    const firstIndex = sortedIndices[0];
    const lastIndex = sortedIndices[sortedIndices.length - 1];

    let before = '';
    let after = '';

    // Get text from block before first selected
    if (firstIndex > 0) {
      const prevBlock = containerRef.current.querySelector(`[data-block-index="${firstIndex - 1}"]`);
      if (prevBlock) {
        const text = prevBlock.textContent || '';
        before = text.slice(-50);
      }
    }

    // Get text from block after last selected
    const nextBlock = containerRef.current.querySelector(`[data-block-index="${lastIndex + 1}"]`);
    if (nextBlock) {
      const text = nextBlock.textContent || '';
      after = text.slice(0, 50);
    }

    return { before, after };
  }, [selectedBlocks]);

  // Handle add comment
  const handleAddComment = React.useCallback(() => {
    if (onTextSelect && selectedBlocks.size > 0) {
      const selectedText = getSelectedText();
      const { before, after } = getSelectionContext();
      onTextSelect(selectedText, before, after);
      setSelectedBlocks(new Set());
      setLastClickedIndex(null);
    }
  }, [onTextSelect, selectedBlocks, getSelectedText, getSelectionContext]);

  // Clear selection
  const handleClearSelection = () => {
    setSelectedBlocks(new Set());
    setLastClickedIndex(null);
  };

  // Multi-select mode toggle
  const [multiSelectMode, setMultiSelectMode] = React.useState(false);

  // Handle keyboard shortcuts
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedBlocks(new Set());
        setLastClickedIndex(null);
        setMultiSelectMode(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Wrapper component for selectable blocks
  const SelectableBlock = ({
    children,
    className,
    as = 'div',
  }: {
    children: React.ReactNode;
    className?: string;
    as?: 'div' | 'p' | 'h1' | 'h2' | 'h3' | 'li' | 'pre' | 'blockquote';
  }) => {
    const index = getNextIndex();
    const isSelected = selectedBlocks.has(index);
    const Tag = as;

    // We need to check comment state after render, so use a ref to get text content
    const blockRef = React.useRef<HTMLElement>(null);
    const [commentState, setCommentState] = React.useState({ hasComment: false, isHighlighted: false });

    React.useEffect(() => {
      if (blockRef.current) {
        const text = blockRef.current.textContent || '';
        setCommentState(getBlockCommentState(text));
      }
    }, [comments, highlightedCommentId]);

    return (
      <Tag
        ref={blockRef as React.RefObject<never>}
        data-block-index={index}
        onClick={(e: React.MouseEvent<HTMLElement>) => handleBlockClick(e, index)}
        className={cn(
          className,
          'cursor-pointer transition-colors',
          isSelected
            ? 'bg-[var(--primary)]/20 outline outline-2 outline-[var(--primary)]/50'
            : commentState.isHighlighted
              ? 'bg-amber-500/30 outline outline-2 outline-amber-500'
              : commentState.hasComment
                ? 'bg-amber-500/10 border-l-2 border-amber-500/50'
                : 'hover:bg-[var(--foreground)]/5'
        )}
      >
        {children}
      </Tag>
    );
  };

  return (
    <div
      ref={containerRef}
      className="h-full overflow-auto px-6 py-4 relative"
      onClick={handleContainerClick}
    >
      {/* Selection toolbar - fixed at top of viewport */}
      {selectedBlocks.size > 0 && (
        <div className="sticky top-0 z-50 flex items-center justify-between gap-2 p-2 mb-4 bg-[var(--background-secondary)] border border-[var(--border)] shadow-lg">
          <div className="flex items-center gap-3">
            <span className="text-sm text-[var(--foreground-muted)]">
              {selectedBlocks.size} block{selectedBlocks.size > 1 ? 's' : ''} selected
            </span>
            <button
              onClick={() => setMultiSelectMode(!multiSelectMode)}
              className={cn(
                "flex items-center gap-1.5 px-2 py-1 text-xs border transition-colors",
                multiSelectMode
                  ? "bg-[var(--primary)]/20 border-[var(--primary)] text-[var(--primary)]"
                  : "border-[var(--border)] text-[var(--foreground-muted)] hover:border-[var(--foreground-muted)]"
              )}
              title="Toggle multi-select mode (or hold Shift/Cmd)"
            >
              <Plus className="h-3 w-3" />
              Multi
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleAddComment}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-90 transition-opacity"
            >
              <MessageSquarePlus className="h-4 w-4" />
              Add Comment
            </button>
            <button
              onClick={handleClearSelection}
              className="p-1.5 text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors"
              title="Clear selection (Esc)"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <div className="prose prose-sm dark:prose-invert max-w-none markdown-viewer">
        {/* Non-selectable hint */}
        <div className="text-xs text-[var(--foreground-muted)] mb-4 italic select-none pointer-events-none">
          Click to select · Shift+click for range · Cmd/Ctrl+click to add · Esc to clear
        </div>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeRaw]}
          components={{
            // Headers
            h1: ({ children }) => (
              <SelectableBlock as="h1" className="text-xl font-bold mt-6 mb-3 first:mt-0 px-2 py-1 -mx-2">
                {children}
              </SelectableBlock>
            ),
            h2: ({ children }) => (
              <SelectableBlock as="h2" className="text-lg font-semibold mt-5 mb-2 first:mt-0 px-2 py-1 -mx-2">
                {children}
              </SelectableBlock>
            ),
            h3: ({ children }) => (
              <SelectableBlock as="h3" className="text-base font-medium mt-4 mb-2 first:mt-0 px-2 py-1 -mx-2">
                {children}
              </SelectableBlock>
            ),
            // Paragraphs
            p: ({ children }) => (
              <SelectableBlock as="p" className="my-3 leading-relaxed px-2 py-1 -mx-2">
                {children}
              </SelectableBlock>
            ),
            // Strong/bold - not selectable, just styling
            strong: ({ children }) => (
              <strong className="font-semibold">{children}</strong>
            ),
            // Code
            code: ({ className, children, ...props }) => {
              const isInline = !className;
              if (isInline) {
                return (
                  <code className="px-1.5 py-0.5 bg-[var(--secondary)] text-[var(--foreground)] font-mono text-xs">
                    {children}
                  </code>
                );
              }
              return (
                <code className={cn('block p-3 bg-[var(--secondary)] font-mono text-xs overflow-auto', className)} {...props}>
                  {children}
                </code>
              );
            },
            // Pre (code blocks) - selectable as a whole
            pre: ({ children }) => (
              <SelectableBlock as="pre" className="my-3 bg-[var(--secondary)] overflow-auto">
                {children}
              </SelectableBlock>
            ),
            // Tables - selectable as a whole
            table: ({ children }) => (
              <SelectableBlock className="w-full my-3 text-sm border-collapse">
                <table className="w-full">{children}</table>
              </SelectableBlock>
            ),
            thead: ({ children }) => (
              <thead className="border-b border-[var(--border)]">{children}</thead>
            ),
            tbody: ({ children }) => <tbody>{children}</tbody>,
            tr: ({ children }) => (
              <tr className="border-b border-[var(--border)] last:border-0">{children}</tr>
            ),
            th: ({ children }) => (
              <th className="text-left py-2 pr-4 font-medium text-[var(--foreground-muted)]">{children}</th>
            ),
            td: ({ children }) => <td className="py-2 pr-4">{children}</td>,
            // Lists - each item is selectable
            ul: ({ children }) => (
              <ul className="my-3 ml-4 list-disc space-y-1">{children}</ul>
            ),
            ol: ({ children }) => (
              <ol className="my-3 ml-4 list-decimal space-y-1">{children}</ol>
            ),
            li: ({ children }) => (
              <SelectableBlock as="li" className="leading-relaxed px-2 py-0.5 -mx-2">
                {children}
              </SelectableBlock>
            ),
            // Links
            a: ({ href, children }) => (
              <a
                href={href}
                className="text-[var(--primary)] hover:underline"
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
              >
                {children}
              </a>
            ),
            // Blockquotes - selectable as a whole
            blockquote: ({ children }) => (
              <SelectableBlock as="blockquote" className="my-3 pl-4 border-l-4 border-[var(--border)] text-[var(--foreground-muted)] italic">
                {children}
              </SelectableBlock>
            ),
            // Horizontal rule
            hr: () => (
              <hr className="my-4 border-[var(--border)]" />
            ),
            // Task list items (checkboxes)
            input: ({ type, checked, ...props }) => {
              if (type === 'checkbox') {
                return (
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled
                    className="mr-2 accent-[var(--primary)]"
                    {...props}
                  />
                );
              }
              return <input type={type} {...props} />;
            },
          }}
        >
          {content}
        </ReactMarkdown>
      </div>
    </div>
  );
}
