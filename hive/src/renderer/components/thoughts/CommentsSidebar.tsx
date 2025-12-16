import React from 'react';
import { Send, Quote, Trash2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ThoughtComment } from '../../../shared/types';

// Truncate text with ellipsis
function truncateText(text: string, maxLength: number = 50): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trim() + '…';
}

interface CommentsSidebarProps {
  comments: ThoughtComment[];
  selectedCommentIds: Set<string>;
  highlightedCommentId: string | null;
  onCommentClick: (comment: ThoughtComment) => void;
  onCommentSelect: (commentId: string, selected: boolean) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onSendSelected: () => void;
  onDeleteComment: (commentId: string) => void;
}

export function CommentsSidebar({
  comments,
  selectedCommentIds,
  highlightedCommentId,
  onCommentClick,
  onCommentSelect,
  onSelectAll,
  onDeselectAll,
  onSendSelected,
  onDeleteComment,
}: CommentsSidebarProps) {
  const pendingComments = comments.filter(c => c.status === 'pending');
  const sentComments = comments.filter(c => c.status === 'sent');

  const allSelected = pendingComments.length > 0 && pendingComments.every(c => selectedCommentIds.has(c.id));

  return (
    <div className="h-full flex flex-col bg-[var(--background-secondary)] border-l border-[var(--border)]">
      {/* Header with actions */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border)]">
        <span className="text-sm font-medium">
          Comments ({pendingComments.length})
        </span>
        <div className="flex items-center gap-1">
          {pendingComments.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={allSelected ? onDeselectAll : onSelectAll}
              className="text-xs h-7 px-2"
            >
              {allSelected ? 'Deselect' : 'Select All'}
            </Button>
          )}
          {selectedCommentIds.size > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onSendSelected}
              className="gap-1 text-xs h-7 px-2"
            >
              <Send className="h-3 w-3" />
              Send ({selectedCommentIds.size})
            </Button>
          )}
        </div>
      </div>

      {/* Comments list */}
      <div className="flex-1 overflow-auto">
        {pendingComments.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-[var(--foreground-muted)] text-sm p-4">
            <p>No comments yet</p>
            <p className="text-xs mt-1">Select text to add a comment</p>
          </div>
        ) : (
          <div className="p-2 space-y-2">
            {pendingComments.map((comment) => (
              <CommentCard
                key={comment.id}
                comment={comment}
                isSelected={selectedCommentIds.has(comment.id)}
                isHighlighted={highlightedCommentId === comment.id}
                onClick={() => onCommentClick(comment)}
                onSelect={(selected) => onCommentSelect(comment.id, selected)}
                onDelete={() => onDeleteComment(comment.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Sent comments section (collapsed by default) */}
      {sentComments.length > 0 && (
        <details className="border-t border-[var(--border)]">
          <summary className="px-3 py-2 text-sm text-[var(--foreground-muted)] cursor-pointer hover:bg-[var(--sidebar-accent)]">
            Sent ({sentComments.length})
          </summary>
          <div className="max-h-40 overflow-auto p-2 space-y-1">
            {sentComments.map((comment) => (
              <div
                key={comment.id}
                className="px-3 py-2 text-xs text-[var(--foreground-muted)] opacity-60 bg-[var(--background)]"
              >
                <div className="flex items-center gap-1 mb-1">
                  <Check className="h-3 w-3" />
                  <span className="italic truncate">"{truncateText(comment.selectedText, 30)}"</span>
                </div>
                <p className="line-clamp-2">{comment.content}</p>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

interface CommentCardProps {
  comment: ThoughtComment;
  isSelected: boolean;
  isHighlighted: boolean;
  onClick: () => void;
  onSelect: (selected: boolean) => void;
  onDelete: () => void;
}

function CommentCard({
  comment,
  isSelected,
  isHighlighted,
  onClick,
  onSelect,
  onDelete,
}: CommentCardProps) {
  const cardRef = React.useRef<HTMLDivElement>(null);

  // Scroll into view when highlighted
  React.useEffect(() => {
    if (isHighlighted && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [isHighlighted]);

  return (
    <div
      ref={cardRef}
      className={cn(
        'group px-3 py-2 border cursor-pointer transition-colors',
        isHighlighted && 'bg-[var(--color-sol-yellow)]/20 border-[var(--color-sol-yellow)]',
        isSelected && !isHighlighted && 'bg-[var(--primary)]/10 border-[var(--primary)]',
        !isHighlighted && !isSelected && 'bg-[var(--background)] border-[var(--border)] hover:border-[var(--foreground-muted)]'
      )}
      onClick={onClick}
    >
      <div className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={(e) => {
            e.stopPropagation();
            onSelect(e.target.checked);
          }}
          onClick={(e) => e.stopPropagation()}
          className="mt-1 accent-[var(--primary)]"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 text-xs text-[var(--foreground-muted)]">
            <Quote className="h-3 w-3" />
            <span className="italic truncate">"{truncateText(comment.selectedText, 40)}"</span>
            {comment.gitCommit && (
              <span className="font-mono opacity-60 ml-1">
                @ {comment.gitCommit.slice(0, 7)}
              </span>
            )}
          </div>
          <p className="text-sm mt-1 whitespace-pre-wrap">{comment.content}</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}
