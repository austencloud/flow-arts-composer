<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  /**
   * NotificationList
   *
   * List of notifications with error handling and accessibility
   */

  import type { UserNotification } from "#lib/shared/notifications/domain/models/notification-models.js";
  import InboxNotificationItem from "./InboxNotificationItem.svelte";
  import NotificationSkeleton from "../skeletons/NotificationSkeleton.svelte";
  import EmptyNotifications from "../empty-states/EmptyNotifications.svelte";
  import NotificationFilter, {
    type FilterState,
  } from "./NotificationFilter.svelte";

  interface Props {
    notifications: UserNotification[];
    isLoading: boolean;
  }

  let { notifications, isLoading }: Props = $props();

  let filters = $state<FilterState>({
    readStatus: "all",
    type: "all",
    searchQuery: "",
  });

  // Track which notifications were unread when first rendered
  // This allows us to animate them when they get marked as read
  let unreadSnapshot = $state<Set<string>>(new Set());

  // Capture unread notifications when list first loads or updates
  $effect(() => {
    const currentUnreadIds = new Set(
      notifications.filter((n) => !n.read).map((n) => n.id)
    );
    // Only update snapshot if we have new unread items
    if (currentUnreadIds.size > 0) {
      unreadSnapshot = currentUnreadIds;
    }
  });

  // Filter notifications based on current filters
  const filteredNotifications = $derived.by(() => {
    let result = notifications;

    if (filters.type !== "all") {
      result = result.filter((n) => n.type === filters.type);
    }

    if (filters.searchQuery.trim()) {
      const query = filters.searchQuery.toLowerCase();
      result = result.filter((n) => n.message.toLowerCase().includes(query));
    }

    return result;
  });
</script>

<div class="notification-list" role="region" aria-label={t("notifications_title")}>
  <!-- Filter UI -->
  <NotificationFilter onFilterChange={(newFilters) => (filters = newFilters)} />

  {#if isLoading}
    <NotificationSkeleton count={5} />
  {:else if filteredNotifications.length === 0}
    {#if notifications.length === 0}
      <EmptyNotifications />
    {:else}
      <div class="empty-state">
        <i class="fas fa-filter" aria-hidden="true"></i>
        <p>{t("notifications_no_filter_matches")}</p>
      </div>
    {/if}
  {:else}
    <div class="notifications" role="list" aria-label={t("notifications_list")}>
      {#each filteredNotifications as notification, index (notification.id)}
        <div
          class="notification-wrapper"
          style="--stagger-index: {Math.min(index, 10)}"
          role="listitem"
        >
          <InboxNotificationItem
            {notification}
            wasUnread={unreadSnapshot.has(notification.id)}
          />
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .notification-list {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 48px 24px;
    color: var(--theme-text-dim, var(--theme-text-dim));
    gap: 12px;
  }

  .empty-state i {
    font-size: var(--font-size-3xl);
  }

  .empty-state p {
    margin: 0;
    font-size: var(--font-size-min);
  }

  .notifications {
    flex: 1;
    overflow-y: auto;
  }

  .notification-wrapper {
    animation: slideInStagger var(--duration-emphasis) ease-out backwards;
    animation-delay: calc(var(--stagger-index) * 30ms);
  }

  @keyframes slideInStagger {
    from {
      opacity: 0;
      transform: translateX(-8px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .notification-wrapper {
      transition: none !important;
      animation: none !important;
    }
  }
</style>
