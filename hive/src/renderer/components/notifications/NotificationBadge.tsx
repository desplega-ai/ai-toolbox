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
        <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-medium bg-[var(--destructive)] text-[var(--destructive-foreground)] rounded-full">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </Button>
  );
}
