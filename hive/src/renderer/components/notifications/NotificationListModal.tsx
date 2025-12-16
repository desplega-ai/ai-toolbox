import { X, Bell, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NotificationToast } from '@/components/ui/notification-toast';
import { useNotificationStore } from '@/lib/notification-store';
import type { InAppNotification } from '../../../shared/types';

interface NotificationListModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNotificationClick: (notification: InAppNotification) => void;
}

export function NotificationListModal({
  isOpen,
  onClose,
  onNotificationClick,
}: NotificationListModalProps) {
  const notifications = useNotificationStore((s) => s.notifications);
  const markAsRead = useNotificationStore((s) => s.markAsRead);
  const clearAll = useNotificationStore((s) => s.clearAll);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md max-h-[80vh] bg-[var(--background)] rounded-lg shadow-xl border border-[var(--border)] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5" />
            <h2 className="text-lg font-semibold">Notifications</h2>
            <span className="text-sm text-[var(--foreground-muted)]">
              ({notifications.length})
            </span>
          </div>
          <div className="flex items-center gap-2">
            {notifications.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearAll}
                className="text-xs"
              >
                <Trash2 className="w-4 h-4 mr-1" />
                Clear all
              </Button>
            )}
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {notifications.length === 0 ? (
            <p className="text-center text-[var(--foreground-muted)] py-8">
              No notifications
            </p>
          ) : (
            notifications.map((notification) => (
              <NotificationToast
                key={notification.id}
                notification={notification}
                onDismiss={markAsRead}
                onClick={(n) => {
                  markAsRead(n.id);
                  onNotificationClick(n);
                  onClose();
                }}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
