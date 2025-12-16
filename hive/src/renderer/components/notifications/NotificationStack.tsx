import { Bell } from 'lucide-react';
import { NotificationToast } from '@/components/ui/notification-toast';
import { useNotificationStore } from '@/lib/notification-store';
import type { InAppNotification } from '../../../shared/types';

interface NotificationStackProps {
  onNotificationClick: (notification: InAppNotification) => void;
}

export function NotificationStack({ onNotificationClick }: NotificationStackProps) {
  const notifications = useNotificationStore((s) => s.notifications);
  const markAsRead = useNotificationStore((s) => s.markAsRead);
  const toggleNotificationList = useNotificationStore((s) => s.toggleNotificationList);

  const visibleNotifications = notifications.filter((n) => !n.read).slice(0, 3);
  const unreadCount = notifications.filter((n) => !n.read).length;
  const hiddenCount = unreadCount - visibleNotifications.length;

  if (visibleNotifications.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {visibleNotifications.map((notification) => (
        <NotificationToast
          key={notification.id}
          notification={notification}
          onDismiss={(id) => {
            markAsRead(id);
          }}
          onClick={(n) => {
            markAsRead(n.id);
            onNotificationClick(n);
          }}
        />
      ))}

      {hiddenCount > 0 && (
        <button
          className="self-end flex items-center gap-2 px-3 py-2 text-sm bg-[var(--background)] border border-[var(--border)] rounded-lg shadow-lg hover:bg-[var(--secondary)] transition-colors"
          onClick={toggleNotificationList}
        >
          <Bell className="w-4 h-4" />
          <span>+{hiddenCount} more</span>
        </button>
      )}
    </div>
  );
}
