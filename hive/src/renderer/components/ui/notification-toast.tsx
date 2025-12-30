import { X, AlertCircle, CheckCircle, ShieldQuestion, MessageCircleQuestion } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { InAppNotification } from '../../../shared/types';

interface NotificationToastProps {
  notification: InAppNotification;
  onDismiss: (id: string) => void;
  onClick: (notification: InAppNotification) => void;
}

const iconMap = {
  permission: ShieldQuestion,
  question: MessageCircleQuestion,
  success: CheckCircle,
  error: AlertCircle,
};

const colorMap = {
  permission: 'border-l-[var(--warning)]',
  question: 'border-l-blue-500',
  success: 'border-l-[var(--success)]',
  error: 'border-l-[var(--destructive)]',
};

const iconColorMap = {
  permission: 'text-[var(--warning)]',
  question: 'text-blue-500',
  success: 'text-[var(--success)]',
  error: 'text-[var(--destructive)]',
};

export function NotificationToast({ notification, onDismiss, onClick }: NotificationToastProps) {
  const Icon = iconMap[notification.type];

  return (
    <div
      className={cn(
        'w-full bg-[var(--background)] border border-[var(--border)] shadow-lg',
        'border-l-4 cursor-pointer transition-all hover:shadow-xl hover:scale-[1.02]',
        colorMap[notification.type]
      )}
      onClick={() => onClick(notification)}
    >
      <div className="p-3 flex items-start gap-3">
        <Icon className={cn('w-5 h-5 flex-shrink-0 mt-0.5', iconColorMap[notification.type])} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{notification.title}</p>
          <p className="text-xs text-[var(--foreground-muted)] line-clamp-2">
            {notification.body}
          </p>
        </div>
        <button
          className="flex-shrink-0 p-1 hover:bg-[var(--secondary)] transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            onDismiss(notification.id);
          }}
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
