import React from 'react';
import { ArrowLeft, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ThoughtComment } from '../../../shared/types';

interface AllCommentsPanelProps {
  comments: ThoughtComment[];
  projectDirectory: string;
  onCommentClick: (comment: ThoughtComment) => void;
  onFileSelect: (filePath: string) => void;
  onClose: () => void;
}

export function AllCommentsPanel({
  comments,
  projectDirectory,
  onCommentClick,
  onFileSelect,
  onClose,
}: AllCommentsPanelProps) {
  // Group comments by file
  const commentsByFile = React.useMemo(() => {
    const grouped = new Map<string, ThoughtComment[]>();
    comments.forEach(comment => {
      const existing = grouped.get(comment.filePath) || [];
      grouped.set(comment.filePath, [...existing, comment]);
    });
    return grouped;
  }, [comments]);

  const pendingCount = comments.filter(c => c.status === 'pending').length;

  // Get relative path for display
  const getRelativePath = (filePath: string) => {
    const thoughtsDir = projectDirectory + '/thoughts/';
    if (filePath.startsWith(thoughtsDir)) {
      return filePath.slice(thoughtsDir.length);
    }
    return filePath;
  };

  return (
    <div className="h-full flex flex-col bg-[var(--background)]">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--border)] bg-[var(--background-secondary)]">
        <Button variant="ghost" size="icon" onClick={onClose} className="h-7 w-7">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <span className="font-medium">All Comments ({pendingCount} pending)</span>
      </div>

      {/* Comments grouped by file */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {Array.from(commentsByFile.entries()).map(([filePath, fileComments]) => {
          const relativePath = getRelativePath(filePath);
          const pendingInFile = fileComments.filter(c => c.status === 'pending');

          if (pendingInFile.length === 0) return null;

          return (
            <div key={filePath} className="space-y-2">
              <button
                onClick={() => {
                  onFileSelect(filePath);
                  onClose();
                }}
                className="flex items-center gap-2 text-sm text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors"
              >
                <FileText className="h-4 w-4" />
                <span className="hover:underline">{relativePath}</span>
                <span className="text-xs opacity-60">({pendingInFile.length})</span>
              </button>
              <div className="space-y-1 ml-6">
                {pendingInFile.map(comment => (
                  <button
                    key={comment.id}
                    onClick={() => {
                      onFileSelect(comment.filePath);
                      onCommentClick(comment);
                      onClose();
                    }}
                    className="w-full text-left p-2 bg-[var(--background-secondary)] hover:bg-[var(--sidebar-accent)] transition-colors"
                  >
                    <div className="text-xs text-[var(--foreground-muted)] italic truncate">
                      "{comment.selectedText?.slice(0, 40)}{(comment.selectedText?.length ?? 0) > 40 ? '…' : ''}"
                    </div>
                    <div className="text-sm mt-0.5 line-clamp-2">{comment.content}</div>
                  </button>
                ))}
              </div>
            </div>
          );
        })}

        {pendingCount === 0 && (
          <div className="text-center text-[var(--foreground-muted)] py-8">
            No pending comments
          </div>
        )}
      </div>
    </div>
  );
}
