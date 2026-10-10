/**
 * Notification State
 *
 * Global state for user notifications.
 * Uses a factory function to create reactive state.
 */

import type { UserNotification } from "#lib/shared/feedback/domain/models/notification-models.js";
import { notificationService } from "#lib/shared/feedback/services/notifier.js";
import { authState } from "#lib/shared/auth/state/auth-state.svelte.js";

/**
 * Creates notification state instance
 */
export function createNotificationState() {
  let notifications = $state<UserNotification[]>([]);
  let unreadCount = $state(0);
  let isLoading = $state(false);
  let unsubscribe: (() => void) | null = null;

  function init() {
    const user = authState.user;
    if (!user) return;

    // Clean up previous subscription
    if (unsubscribe) {
      unsubscribe();
    }

    isLoading = true;

    // Subscribe to real-time updates
    unsubscribe = notificationService.subscribeToNotifications(
      user.uid,
      (updated) => {
        notifications = updated;
        unreadCount = updated.filter((n) => !n.read).length;
        isLoading = false;
      }
    );
  }

  async function markAsRead(notificationId: string) {
    const user = authState.user;
    if (!user) return;

    await notificationService.markAsRead(user.uid, notificationId);

    // Optimistic update
    notifications = notifications.map((n) =>
      n.id === notificationId ? { ...n, read: true, readAt: new Date() } : n
    );
    unreadCount = notifications.filter((n) => !n.read).length;
  }

  async function markAllAsRead() {
    const user = authState.user;
    if (!user) return;

    await notificationService.markAllAsRead(user.uid);

    // Optimistic update
    notifications = notifications.map((n) => ({
      ...n,
      read: true,
      readAt: new Date(),
    }));
    unreadCount = 0;
  }

  function cleanup() {
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
    notifications = [];
    unreadCount = 0;
  }

  return {
    get notifications() {
      return notifications;
    },
    get unreadCount() {
      return unreadCount;
    },
    get isLoading() {
      return isLoading;
    },
    init,
    markAsRead,
    markAllAsRead,
    cleanup,
  };
}

export type NotificationState = ReturnType<typeof createNotificationState>;
