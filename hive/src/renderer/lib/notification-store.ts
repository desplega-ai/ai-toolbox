import { create } from 'zustand';
import type { InAppNotification } from '../../shared/types';

interface NotificationState {
  notifications: InAppNotification[];
  showNotificationList: boolean;

  // Actions
  addNotification: (notification: Omit<InAppNotification, 'id' | 'timestamp' | 'read'>) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  removeNotification: (id: string) => void;
  clearAll: () => void;
  toggleNotificationList: () => void;
  setShowNotificationList: (show: boolean) => void;
}

export const useNotificationStore = create<NotificationState>((set) => ({
  notifications: [],
  showNotificationList: false,

  addNotification: (notification) =>
    set((state) => ({
      notifications: [
        {
          ...notification,
          id: `notif-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          timestamp: Date.now(),
          read: false,
        },
        ...state.notifications,
      ].slice(0, 100), // Keep max 100 notifications
    })),

  markAsRead: (id) =>
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n
      ),
    })),

  markAllAsRead: () =>
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
    })),

  removeNotification: (id) =>
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    })),

  clearAll: () => set({ notifications: [] }),

  toggleNotificationList: () =>
    set((state) => ({
      showNotificationList: !state.showNotificationList,
    })),

  setShowNotificationList: (show) => set({ showNotificationList: show }),
}));

// Selector helpers
export const getVisibleNotifications = (state: NotificationState) =>
  state.notifications.filter((n) => !n.read).slice(0, 3);

export const getUnreadCount = (state: NotificationState) =>
  state.notifications.filter((n) => !n.read).length;
