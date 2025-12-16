import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNotificationStore } from '@/lib/notification-store';

export function NotificationBadge() {
  const unreadCount = useNotificationStore((s) =>
    s.notifications.filter((n) => !n.read).length
  );
  const toggleNotificationList = useNotificationStore((s) => s.toggleNotificationList);

  return (
    <Button
      variant="ghost"
      size="icon"
      className="relative h-8 w-8"
      onClick={toggleNotificationList}
    >
      <Bell className="w-4 h-4" />
      {unreadCount > 0 && (
        <span className="absolute -top-0.5 -right-1 flex items-center justify-center w-4 h-4 text-[10px] font-medium bg-[var(--warning)] text-[var(--warning-foreground)]">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </Button>
  );
}
