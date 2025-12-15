import React from 'react';
import { Shield, X, Check, AlertTriangle, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { PermissionRequest } from '../../../shared/sdk-types';

interface PermissionRequestWithTimeout extends PermissionRequest {
  autoApproveMs?: number;
}

interface PermissionDialogProps {
  request: PermissionRequestWithTimeout | null;
  onApprove: (request: PermissionRequest, remember: boolean) => void;
  onDeny: (request: PermissionRequest, message?: string) => void;
}

export function PermissionDialog({ request, onApprove, onDeny }: PermissionDialogProps) {
  const [remember, setRemember] = React.useState(false);
  const [timeLeft, setTimeLeft] = React.useState<number | null>(null);

  // Countdown timer effect
  React.useEffect(() => {
    if (!request?.autoApproveMs) {
      setTimeLeft(null);
      return;
    }

    // Initialize countdown
    const totalSeconds = Math.ceil(request.autoApproveMs / 1000);
    setTimeLeft(totalSeconds);

    // Update every 100ms for smoother countdown
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev === null || prev <= 0) return 0;
        return prev - 0.1;
      });
    }, 100);

    return () => clearInterval(interval);
  }, [request?.id, request?.autoApproveMs]);

  if (!request) return null;

  const isDangerous = ['Bash', 'Write', 'Edit'].includes(request.toolName);
  const inputPreview = typeof request.input === 'object'
    ? JSON.stringify(request.input, null, 2).slice(0, 500)
    : String(request.input).slice(0, 500);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" />

      {/* Dialog */}
      <div className="relative w-full max-w-lg bg-[var(--background)] rounded-lg shadow-xl border border-[var(--border)]">
        {/* Header */}
        <div className={`flex items-center gap-3 p-4 border-b border-[var(--border)] ${
          isDangerous ? 'bg-[var(--warning)]/10' : 'bg-[var(--primary)]/10'
        }`}>
          {isDangerous ? (
            <AlertTriangle className="h-5 w-5 text-[var(--warning)]" />
          ) : (
            <Shield className="h-5 w-5 text-[var(--primary)]" />
          )}
          <div className="flex-1">
            <h2 className="font-semibold">Permission Required</h2>
            <p className="text-sm text-[var(--foreground-muted)]">
              Claude wants to use: <code className="bg-[var(--secondary)] px-1 rounded">{request.toolName}</code>
            </p>
          </div>
          {/* Countdown timer */}
          {timeLeft !== null && timeLeft > 0 && (
            <div className="flex items-center gap-1 text-sm text-[var(--warning)]">
              <Clock className="h-4 w-4" />
              <span className="font-mono">{Math.ceil(timeLeft)}s</span>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Input preview */}
          <div>
            <h3 className="text-sm font-medium mb-2">Details:</h3>
            <pre className="text-xs bg-[var(--secondary)] p-3 rounded overflow-auto max-h-48 font-mono">
              {inputPreview}
              {inputPreview.length >= 500 && '...'}
            </pre>
          </div>

          {/* Remember checkbox */}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="rounded"
            />
            Remember this choice for this session
          </label>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between p-4 border-t border-[var(--border)]">
          {timeLeft !== null && timeLeft > 0 ? (
            <span className="text-xs text-[var(--foreground-muted)]">
              Auto-approving in {Math.ceil(timeLeft)}s...
            </span>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button
              variant="destructive"
              onClick={() => onDeny(request, 'User denied permission')}
            >
              <X className="h-4 w-4 mr-2" />
              Deny
            </Button>
            <Button
              onClick={() => onApprove(request, remember)}
            >
              <Check className="h-4 w-4 mr-2" />
              Approve
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
