import React from 'react';
import { X, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PERMISSION_DURATIONS, type PermissionDuration } from '../../../shared/types';

interface PermissionModeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (duration: PermissionDuration) => void;
}

export function PermissionModeModal({ isOpen, onClose, onConfirm }: PermissionModeModalProps) {
  const [selectedDuration, setSelectedDuration] = React.useState<PermissionDuration>(15);

  if (!isOpen) return null;

  const handleConfirm = () => {
    onConfirm(selectedDuration);
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
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            <h2 className="text-lg font-semibold">Enable Bypass Permissions</h2>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          <div className="p-3 bg-amber-500/10 border border-amber-500/20">
            <p className="text-sm text-amber-600 dark:text-amber-400">
              <strong>Warning:</strong> This mode bypasses ALL permission checks. Claude will be able to execute any tool without asking for confirmation.
            </p>
            <p className="text-sm text-amber-600/80 dark:text-amber-400/80 mt-2">
              Use with caution and only for trusted tasks.
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Duration</label>
            <select
              value={selectedDuration}
              onChange={(e) => setSelectedDuration(Number(e.target.value) as PermissionDuration)}
              className="w-full px-3 py-2 border border-[var(--border)] bg-[var(--background)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
            >
              {PERMISSION_DURATIONS.map((d) => (
                <option key={d} value={d}>
                  {d} minutes
                </option>
              ))}
            </select>
            <p className="text-xs text-[var(--muted-foreground)]">
              Permission mode will automatically revert to Default after this duration.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-[var(--border)]">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="default"
            onClick={handleConfirm}
            className="bg-amber-500 hover:bg-amber-600 text-white"
          >
            Enable Bypass
          </Button>
        </div>
      </div>
    </div>
  );
}
