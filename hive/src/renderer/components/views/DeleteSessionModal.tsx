import { X, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Session } from '../../../shared/types';

interface DeleteSessionModalProps {
  isOpen: boolean;
  session: Session | null;
  onClose: () => void;
  onConfirm: () => void;
}

export function DeleteSessionModal({ isOpen, session, onClose, onConfirm }: DeleteSessionModalProps) {
  if (!isOpen || !session) return null;

  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-[var(--background)] border border-[var(--border)] shadow-xl w-[400px] max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
          <div className="flex items-center gap-2">
            <Trash2 className="w-5 h-5 text-[var(--destructive)]" />
            <h2 className="text-lg font-semibold">Delete Session</h2>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          <div className="p-3 bg-[var(--destructive)]/10 border border-[var(--destructive)]/20">
            <p className="text-sm text-[var(--destructive)]">
              <strong>Warning:</strong> This action cannot be undone. The session and all its associated data will be permanently deleted.
            </p>
          </div>

          <div className="space-y-2">
            <p className="text-sm text-[var(--foreground-muted)]">
              You are about to delete:
            </p>
            <div className="p-3 bg-[var(--background-secondary)] border border-[var(--border)]">
              <p className="font-medium truncate">{session.name}</p>
              <p className="text-xs text-[var(--foreground-muted)] mt-1">
                Status: {session.status} | Created: {new Date(session.createdAt).toLocaleDateString()}
              </p>
            </div>
          </div>

          <p className="text-sm text-[var(--foreground-muted)]">
            This will delete:
          </p>
          <ul className="text-sm text-[var(--foreground-muted)] list-disc list-inside space-y-1">
            <li>All session messages and history</li>
            <li>Pending approvals and approved tool calls</li>
            <li>Session analytics and results</li>
            <li>Associated thought comments</li>
          </ul>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-[var(--border)]">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
          >
            Delete Session
          </Button>
        </div>
      </div>
    </div>
  );
}
