<!--
  InboxSubscriptionProvider.svelte

  Invisible component that sets up inbox subscriptions globally.
  Should be mounted at the app root level when user is authenticated.

  Subscribes to:
  - Conversations (for unread message counts)
  - Notifications (for unread notification counts)

  This enables badge counts to appear on navigation elements
  without requiring the user to visit the Inbox module first.
-->
<script lang="ts">
  import { getFCMTokenManager } from "$lib/shared/push/get-fcm-token-manager";
  import { onMount } from "svelte";
  import { inboxState } from "../state/inbox-state.svelte";
  import { conversationService } from "$lib/shared/messaging/services/conversation-manager";
  import { notificationService } from "$lib/shared/feedback/services/notifier";
  import { authState } from "$lib/shared/auth/state/auth-state.svelte";
  import { userPreviewState } from "$lib/shared/debug/state/user-preview-state.svelte";
  import {
    startForegroundMessageListener,
    stopForegroundMessageListener,
  } from "$lib/shared/push/services/foreground-message-handler";
  // Note: Module loading is handled by container

  let unsubscribeMessages: (() => void) | null = null;
  let unsubscribeNotifications: (() => void) | null = null;
  let messagingModuleLoaded = $state(false);

  onMount(() => {
    // Module is now loaded via container
    messagingModuleLoaded = true;

    // Sweep delivered (shade) notifications whenever the app is opened or
    // refocused. Android derives the PWA icon badge from notifications
    // sitting in the shade, so reading in-app must also close the shade
    // copies — otherwise the badge number sticks after the inbox is cleared.
    sweepDeliveredNotifications();
    const onVisible = () => {
      if (!document.hidden) sweepDeliveredNotifications();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  });

  function sweepDeliveredNotifications(): void {
    if (!("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.ready
      .then(async (reg) => {
        const delivered = await reg.getNotifications();
        for (const n of delivered) n.close();
      })
      .catch(() => {});
  }

  // Track effective user ID (supports preview/impersonation mode)
  const currentUserId = $derived(
    userPreviewState.isActive && userPreviewState.data.profile
      ? userPreviewState.data.profile.uid
      : authState.user?.uid
  );

  // Set up subscriptions when user is authenticated
  $effect(() => {
    const userId = currentUserId;
    const isReady = messagingModuleLoaded;

    const cleanup = () => {
      unsubscribeMessages?.();
      unsubscribeNotifications?.();
      unsubscribeMessages = null;
      unsubscribeNotifications = null;
    };

    if (!isReady || !userId) {
      return cleanup;
    }

    // Subscribe to conversations for unread message counts
    inboxState.markConversationsPending();
    unsubscribeMessages = conversationService.subscribeToConversations(
      (conversations) => {
        inboxState.setConversations(conversations);
      }
    );

    // Subscribe to notifications (all notifications, no limit for Inbox)
    unsubscribeNotifications = notificationService.subscribeToNotifications(
      userId,
      (notifications) => {
        inboxState.setNotifications(notifications);
      },
      0 // No limit - load all notifications for Inbox
    );

    return cleanup;
  });

  // Badge API - update app icon badge with unread count
  $effect(() => {
    const count = inboxState.totalUnreadCount;

    if ("setAppBadge" in navigator) {
      if (count > 0) {
        navigator.setAppBadge(count).catch(() => {});
      } else {
        navigator.clearAppBadge().catch(() => {});
      }
    }
  });

  // Auto-register FCM token if permission already granted
  $effect(() => {
    if (!currentUserId) return;
    void (async () => {
      const fcmTokenManager = getFCMTokenManager();
      const supported = await fcmTokenManager.isSupported();
      if (!supported) return;
      const permission = await fcmTokenManager.getPermissionState();
      if (permission === "granted") {
        await fcmTokenManager.registerToken(currentUserId);
      }
    })();
  });

  // Listen for foreground FCM messages while authenticated
  $effect(() => {
    if (currentUserId) {
      startForegroundMessageListener();
    }
    return () => {
      stopForegroundMessageListener();
    };
  });
</script>
