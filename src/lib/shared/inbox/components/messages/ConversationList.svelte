<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte";
  /**
   * ConversationList
   *
   * List of conversations with enhanced interactions and error handling.
   * Action buttons (new message, new group) are now in the parent header.
   */

  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import { onMount } from "svelte";
  import type { ConversationPreview } from "$lib/shared/messaging/domain/models/conversation-models";
  import { conversationService } from "$lib/shared/messaging/services/conversation-manager";
  import { toast } from "../../../toast/state/toast-state.svelte";
  import ConversationItem from "./ConversationItem.svelte";
  import ConversationSkeleton from "../skeletons/ConversationSkeleton.svelte";
  import EmptyConversations from "../empty-states/EmptyConversations.svelte";
  import type { HapticFeedback } from "$lib/shared/application/services/haptic-feedback";

  interface Props {
    conversations: ConversationPreview[];
    isLoading: boolean;
    onSelect: (conversationId: string) => void;
  }

  let { conversations, isLoading, onSelect }: Props = $props();

  let isMarkingRead = $state(false);

  // Haptic feedback service
  let hapticService: HapticFeedback | undefined;

  onMount(() => {
    hapticService = getHapticFeedback();
  });

  // Check if there are any unread messages
  const hasUnread = $derived(conversations.some((c) => c.unreadCount > 0));

  async function handleMarkAllRead() {
    if (isMarkingRead) return;
    hapticService?.trigger("selection");

    isMarkingRead = true;
    try {
      await conversationService.markAllAsRead();
      toast.success(t("inbox_ui_all_messages_marked_as_read"));
    } catch (error) {
      console.error("Failed to mark all as read:", error);
      toast.error(t("inbox_ui_failed_to_mark_messages_as_read"));
    } finally {
      isMarkingRead = false;
    }
  }
</script>

<div class="conversation-list" role="region" aria-label={t("inbox_ui_conversations")}>
  <!-- Mark all read appears when there are unread messages -->
  {#if conversations.length > 0 && hasUnread}
    <div class="header-actions">
      <button
        class="mark-all-read"
        onclick={handleMarkAllRead}
        disabled={isMarkingRead}
        aria-label={t("inbox_ui_mark_all_conversations_as_read")}
      >
        {#if isMarkingRead}
          <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
        {:else}
          <i class="fas fa-check-double" aria-hidden="true"></i>
        {/if}
        <span>{t("inbox_ui_mark_all_read")}</span>
      </button>
    </div>
  {/if}

  {#if isLoading}
    <ConversationSkeleton count={5} />
  {:else if conversations.length === 0}
    <EmptyConversations />
  {:else}
    <div class="conversations" role="list" aria-label={t("inbox_ui_conversation_list")}>
      {#each conversations as conversation, index (conversation.id)}
        <div
          class="conversation-wrapper"
          style="--stagger-index: {Math.min(index, 10)}"
          role="listitem"
        >
          <ConversationItem
            {conversation}
            onclick={() => onSelect(conversation.id)}
          />
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .conversation-list {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .header-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    padding: 8px 12px;
    border-bottom: 1px solid var(--theme-stroke);
  }

  .mark-all-read {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: var(--min-touch-target);
    padding: 8px 12px;
    background: transparent;
    border: none;
    border-radius: 8px;
    color: var(--theme-accent, var(--semantic-info));
    font-size: var(--font-size-sm);
    cursor: pointer;
    transition:
      background 0.2s ease,
      opacity 0.2s ease;
  }

  .mark-all-read:hover:not(:disabled) {
    background: var(--theme-card-bg);
  }

  .mark-all-read:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .mark-all-read:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px
      color-mix(in srgb, var(--theme-accent) 50%, transparent);
  }

  .conversations {
    flex: 1;
    overflow-y: auto;
  }

  .conversation-wrapper {
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
    .mark-all-read,
    .conversation-wrapper {
      transition: none !important;
      animation: none !important;
    }
  }
</style>
