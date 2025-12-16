import React from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface AddCommentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (comment: string) => void;
  selectedText?: string;
}

export function AddCommentDialog({
  isOpen,
  onClose,
  onSubmit,
  selectedText,
}: AddCommentDialogProps) {
  const [comment, setComment] = React.useState('');
  const inputRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  React.useEffect(() => {
    if (!isOpen) {
      setComment('');
    }
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (comment.trim()) {
      onSubmit(comment.trim());
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Dialog */}
      <div className="relative w-full max-w-md bg-[var(--background)] shadow-xl border border-[var(--border)]">
        <form onSubmit={handleSubmit}>
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
            <h2 className="text-lg font-semibold">Add Comment</h2>
            <Button variant="ghost" size="icon" type="button" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Content */}
          <div className="p-4 space-y-4">
            {selectedText && selectedText.length > 0 && (
              <p className="text-sm text-[var(--foreground-muted)] italic">
                "{selectedText.slice(0, 100)}{selectedText.length > 100 ? '…' : ''}"
              </p>
            )}

            <textarea
              ref={inputRef}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Add feedback for Claude to review..."
              className="w-full h-24 px-3 py-2 border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] placeholder:text-[var(--foreground-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
            />

            <p className="text-xs text-[var(--foreground-muted)]">
              This will insert a hive-comment tag that Claude can see and respond to.
            </p>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2 p-4 border-t border-[var(--border)]">
            <Button variant="ghost" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!comment.trim()}>
              Add Comment
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
