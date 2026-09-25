<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte";
  /**
   * MessageThread
   *
   * Full conversation message view with composer
   * Uses preview mode state for View As feature support
   * Supports both direct (1:1) and group conversations
   */

  import { onDestroy, onMount, tick } from "svelte";
  import type {
    Conversation,
    ConversationType,
  } from "$lib/shared/messaging/domain/models/conversation-models";
  import type { Message } from "$lib/shared/messaging/domain/models/message-models";
  import { authState } from "$lib/shared/auth/state/auth-state.svelte";
  import { userPreviewState } from "$lib/shared/debug/state/user-preview-state.svelte";
  import { messagingService } from "$lib/shared/messaging/services/messenger";
  import { inboxState } from "../../state/inbox-state.svelte";
  import MessageBubble from "./MessageBubble.svelte";
  import MessageComposer from "./MessageComposer.svelte";
  import MessageSkeleton from "../skeletons/MessageSkeleton.svelte";
  import DateSeparator from "./DateSeparator.svelte";
  import EmptyMessages from "../empty-states/EmptyMessages.svelte";
  import TypingIndicator from "./TypingIndicator.svelte";
  import { toast } from "$lib/shared/toast/state/toast-state.svelte";
  import { messageHasSequencePreview } from "../../domain/message-link-parts";
  import { createSequencePreviewCoordinator } from "../../state/sequence-preview-coordinator.svelte";
  import { getMessageDeliveryContext } from "../../context/message-delivery-context";
  import { buildOutgoingMessage } from "../../domain/outgoing-message-mapper";
  import { getErrorHandler } from "$lib/shared/application/get-error-handler";

  interface Props {
    conversation: Conversation;
    messages: Message[];
    isLoading: boolean;
  }

  let { conversation, messages, isLoading }: Props = $props();
  const messageDeliveryState = getMessageDeliveryContext();

  // Determine conversation type (defaults to "direct" for backward compatibility)
  // Use optional chaining: parent {#if} guard unmounts this component when
  // conversation becomes null, but $derived values can re-evaluate before unmount.
  const conversationType = $derived<ConversationType>(
    conversation?.type || "direct"
  );
  const isGroup = $derived(conversationType === "group");

  let messagesContainer: HTMLDivElement | undefined = $state();
  let contextualMessages: Message[] | null = $state(null);
  let contextTargetId: string | null = $state(null);
  let highlightedMessageId: string | null = $state(null);
  let isLocatingReply = $state(false);
  let navigationAnnouncement = $state("");
  let highlightTimer: ReturnType<typeof setTimeout> | null = null;
  let trackedConversationId = conversation?.id ?? "";
  let previousLatestMessageId: string | null = null;

  onDestroy(() => {
    if (highlightTimer) clearTimeout(highlightTimer);
  });

  // Subscribe to typing indicators
  onMount(() => {
    if (!conversation) return;
    const unsubscribe = messagingService.subscribeToTyping(
      conversation.id,
      (typingUsers) => {
        inboxState.setTypingUsers(typingUsers);
      }
    );

    return () => {
      unsubscribe();
      inboxState.setTypingUsers([]);
    };
  });

  // Get effective user ID (preview mode or actual)
  const currentUserId = $derived(
    userPreviewState.isActive && userPreviewState.data.profile
      ? userPreviewState.data.profile.uid
      : authState.user?.uid
  );

  const localOutbox = $derived(
    conversation?.id ? messageDeliveryState.outboxFor(conversation.id) : []
  );
  const localOutboxById = $derived(
    new Map(localOutbox.map((item) => [item.id, item] as const))
  );
  const latestMessages = $derived.by(() => {
    const serverIds = new Set(messages.map((message) => message.id));
    const sender = {
      id: authState.user?.uid ?? currentUserId ?? "",
      name: authState.user?.displayName || "You",
      avatar: authState.user?.photoURL ?? undefined,
    };
    return [
      ...messages,
      ...localOutbox
        .filter((item) => !serverIds.has(item.id))
        .map((item) => buildOutgoingMessage(item, sender)),
    ].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  });
  const displayedMessages = $derived(contextualMessages ?? latestMessages);
  const messagesById = $derived.by(
    () =>
      new Map(
        displayedMessages.map((message) => [message.id, message] as const)
      )
  );
  const contextTarget = $derived(
    contextTargetId ? messagesById.get(contextTargetId) : undefined
  );
  const sequencePreviewCoordinator = createSequencePreviewCoordinator({
    isMessageAvailable: (messageId) => {
      const message = messagesById.get(messageId);
      return Boolean(message && messageHasSequencePreview(message));
    },
  });

  $effect(() => {
    if (!conversation?.id || messages.length === 0) return;
    void messageDeliveryState
      .reconcile(conversation.id, messages)
      .catch((error) =>
        console.error("Failed to reconcile delivered messages:", error)
      );
  });

  $effect(() => {
    const conversationId = conversation?.id ?? "";
    if (conversationId === trackedConversationId) return;

    trackedConversationId = conversationId;
    contextualMessages = null;
    contextTargetId = null;
    highlightedMessageId = null;
    navigationAnnouncement = "";
    sequencePreviewCoordinator.reset();
    previousLatestMessageId = null;
  });

  // Initial load and messages sent by the current user go to the latest
  // message. Incoming messages never pull someone away from older context.
  $effect(() => {
    const latestMessage = latestMessages.at(-1);
    const container = messagesContainer;
    if (!latestMessage || !container) return;
    if (latestMessage.id === previousLatestMessageId) return;

    const isInitialLoad = previousLatestMessageId === null;
    previousLatestMessageId = latestMessage.id;
    const isNearLatest =
      container.scrollHeight - container.scrollTop - container.clientHeight <
      96;
    const isOwnMessage = latestMessage.senderId === currentUserId;
    if (!isInitialLoad && !isNearLatest && !isOwnMessage) return;

    if (contextualMessages && isOwnMessage) {
      contextualMessages = null;
      contextTargetId = null;
    }

    requestAnimationFrame(() => {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: isInitialLoad ? "auto" : "smooth",
      });
    });
  });

  function findRenderedMessage(messageId: string): HTMLElement | undefined {
    return Array.from(
      messagesContainer?.querySelectorAll<HTMLElement>("[data-message-id]") ??
        []
    ).find((element) => element.dataset.messageId === messageId);
  }

  function prefersReducedMotion(): boolean {
    return (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  }

  async function focusMessage(messageId: string): Promise<boolean> {
    await tick();
    const element = findRenderedMessage(messageId);
    if (!element) return false;

    element.scrollIntoView({
      block: "center",
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
    element.focus({ preventScroll: true });
    highlightedMessageId = messageId;
    if (highlightTimer) clearTimeout(highlightTimer);
    highlightTimer = setTimeout(() => {
      if (highlightedMessageId === messageId) highlightedMessageId = null;
    }, 1600);
    return true;
  }

  async function navigateToMessage(messageId: string): Promise<void> {
    if (isLocatingReply) return;

    let target = messagesById.get(messageId);
    if (!target) {
      isLocatingReply = true;
      navigationAnnouncement = t("inbox_ui_loading_the_original_message");
      try {
        const context = await messagingService.getMessageContext(
          conversation.id,
          messageId
        );
        target = context.find((message) => message.id === messageId);
        if (!target) {
          navigationAnnouncement = t("inbox_ui_original_message_is_unavailable");
          toast.error(t("inbox_ui_original_message_is_unavailable"));
          return;
        }
        contextualMessages = context;
        contextTargetId = messageId;
      } catch {
        navigationAnnouncement = t("inbox_ui_could_not_load_the_original_message");
        toast.error(t("inbox_ui_couldn_t_load_the_original_message"));
        return;
      } finally {
        isLocatingReply = false;
      }
    }

    if (!(await focusMessage(messageId))) {
      navigationAnnouncement = t("inbox_ui_original_message_is_unavailable");
      toast.error(t("inbox_ui_original_message_is_unavailable"));
      return;
    }

    if (!target) return;

    navigationAnnouncement = target.isDeleted
      ? t("inbox_moved_deleted", { name: target.senderName })
      : t("inbox_moved_original", { name: target.senderName });
  }

  async function returnToLatest(): Promise<void> {
    contextualMessages = null;
    contextTargetId = null;
    highlightedMessageId = null;
    navigationAnnouncement = t("inbox_ui_returned_to_latest_messages");
    await tick();
    messagesContainer?.scrollTo({
      top: messagesContainer.scrollHeight,
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
  }

  function showOutboxFailure(error: unknown, action: string): void {
    const failure = error instanceof Error ? error : new Error(String(error));
    getErrorHandler().showUserError({
      message: t("inbox_ui_the_outbox_could_not_be_updated"),
      technicalDetails: failure.message,
      error: failure,
      severity: "error",
      context: { module: "inbox", tab: "messages", action },
    });
  }

  function retryOutgoingMessage(messageId: string): void {
    void messageDeliveryState
      .retry(messageId)
      .catch((error) => showOutboxFailure(error, "retryMessage"));
  }

  function removeOutgoingMessage(messageId: string): void {
    void messageDeliveryState
      .remove(messageId)
      .catch((error) => showOutboxFailure(error, "removeOutboxMessage"));
  }

  // Get other participant info
  const otherParticipantId = $derived(
    conversation?.participants?.find((p: string) => p !== currentUserId) || ""
  );
  const otherParticipant = $derived(
    conversation?.participantInfo?.[otherParticipantId]
  );

  // Group messages by date for separators
  interface MessageGroup {
    date: Date;
    messages: Message[];
  }

  function getDateKey(d: Date): string {
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  }

  const messageGroups = $derived.by(() => {
    const groups: MessageGroup[] = [];
    let currentDateKey = "";
    let currentGroup: MessageGroup | null = null;

    for (const message of displayedMessages) {
      const dateKey = getDateKey(message.createdAt);

      if (dateKey !== currentDateKey) {
        currentDateKey = dateKey;
        currentGroup = {
          date: message.createdAt,
          messages: [message],
        };
        groups.push(currentGroup);
      } else if (currentGroup) {
        currentGroup.messages.push(message);
      }
    }

    return groups;
  });

  // Find the last own message that was read by the other participant
  // This is the only message that should show the read receipt (Facebook-style)
  const lastReadOwnMessageId = $derived.by(() => {
    if (!currentUserId || !otherParticipantId) return null;

    // Iterate backwards through messages to find the last own message read by other
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (!msg) continue;
      if (
        msg.senderId === currentUserId &&
        !msg.isDeleted &&
        msg.readBy?.includes(otherParticipantId)
      ) {
        return msg.id;
      }
    }
    return null;
  });

  const lastEditableOwnMessage = $derived.by(() => {
    if (!currentUserId) return undefined;

    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      if (message?.senderId === currentUserId && !message.isDeleted) {
        return message;
      }
    }

    return undefined;
  });
</script>

<div class="message-thread">
  <!-- Messages container -->
  <div
    class="messages-container themed-scrollbar"
    bind:this={messagesContainer}
  >
    {#if isLocatingReply}
      <div class="locating-reply" role="status">
        <i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i>
        {t("inbox_ui_finding_original_message")}
      </div>
    {/if}
    {#if isLoading}
      <MessageSkeleton count={6} />
    {:else if displayedMessages.length === 0}
      <EmptyMessages
        recipientName={isGroup
          ? conversation?.groupMetadata?.name
          : otherParticipant?.displayName}
        {isGroup}
      />
    {:else}
      {#if contextualMessages}
        <div class="context-toolbar" role="status">
          <span>
            {contextTarget?.isDeleted
              ? t("inbox_ui_viewing_a_deleted_original_message")
              : t("inbox_ui_viewing_the_original_message")}
          </span>
          <button type="button" onclick={returnToLatest}>
            <i class="fa-solid fa-arrow-down" aria-hidden="true"></i>
            {t("inbox_ui_return_to_latest")}
          </button>
        </div>
      {/if}
      <div class="messages">
        {#each messageGroups as group, groupIndex}
          <DateSeparator date={group.date} />
          {#each group.messages as message, messageIndex (message.id)}
            <MessageBubble
              {message}
              {currentUserId}
              isOwn={message.senderId === currentUserId}
              isNew={groupIndex === messageGroups.length - 1 &&
                messageIndex === group.messages.length - 1}
              {otherParticipantId}
              showReadReceipt={!isGroup && message.id === lastReadOwnMessageId}
              {isGroup}
              senderInfo={isGroup
                ? conversation?.participantInfo?.[message.senderId]
                : undefined}
              replyTarget={message.replyTo
                ? messagesById.get(message.replyTo.messageId)
                : undefined}
              onNavigateToMessage={navigateToMessage}
              isHighlighted={message.id === highlightedMessageId}
              sequencePlaybackActive={sequencePreviewCoordinator.isPlaybackActive(
                message.id
              )}
              sequencePlaybackMounted={sequencePreviewCoordinator.isPlayerMounted(
                message.id
              )}
              onSequencePlaybackRequest={() =>
                sequencePreviewCoordinator.requestPlayback(message.id)}
              outboxItem={localOutboxById.get(message.id)}
              onRetry={() => retryOutgoingMessage(message.id)}
              onRemove={() => removeOutgoingMessage(message.id)}
            />
          {/each}
        {/each}
      </div>
    {/if}
  </div>

  <!-- Typing indicator -->
  <TypingIndicator typingUsers={inboxState.typingUsers} />

  <!-- Composer -->
  {#if conversation?.id}
    <MessageComposer
      conversationId={conversation.id}
      lastEditableMessage={lastEditableOwnMessage}
    />
  {/if}

  <p class="sr-only" aria-live="polite">{navigationAnnouncement}</p>
</div>

<style>
  .message-thread {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .messages-container {
    position: relative;
    flex: 1;
    overflow-y: auto;
    padding: 8px 16px 16px;
    overscroll-behavior: contain;
  }

  .messages {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .context-toolbar {
    position: sticky;
    top: 0;
    z-index: 20;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 52px;
    margin: -2px 0 10px;
    padding: 6px 8px 6px 14px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 14px;
    color: var(--theme-text, #ffffff);
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
    font-size: var(--font-size-sm, 14px);
  }

  .locating-reply {
    position: sticky;
    top: 0;
    z-index: 21;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: var(--min-touch-target, 44px);
    margin: -2px auto 8px;
    padding: 0 16px;
    width: fit-content;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 999px;
    color: var(--theme-text, #ffffff);
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
    font-size: var(--font-size-sm, 14px);
    font-weight: 600;
  }

  .context-toolbar span {
    min-width: 0;
    overflow: hidden;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .context-toolbar button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: var(--min-touch-target, 44px);
    padding: 0 14px;
    border: 1px solid
      color-mix(
        in srgb,
        var(--theme-accent, #6366f1) 46%,
        var(--theme-stroke, rgba(255, 255, 255, 0.1))
      );
    border-radius: 999px;
    color: var(--theme-text, #ffffff);
    background: color-mix(
      in srgb,
      var(--theme-accent, #6366f1) 14%,
      var(--theme-card-bg, rgba(255, 255, 255, 0.04))
    );
    font: inherit;
    font-weight: 600;
    cursor: pointer;
    transition:
      background var(--duration-fast, 120ms) ease,
      border-color var(--duration-fast, 120ms) ease;
  }

  .context-toolbar button:hover,
  .context-toolbar button:focus-visible {
    border-color: var(--theme-accent, #6366f1);
    background: color-mix(
      in srgb,
      var(--theme-accent, #6366f1) 24%,
      var(--theme-card-bg, rgba(255, 255, 255, 0.04))
    );
  }

  .context-toolbar button:focus-visible {
    outline: 2px solid var(--theme-accent, #6366f1);
    outline-offset: 2px;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  @media (max-width: 520px) {
    .context-toolbar {
      align-items: stretch;
      flex-direction: column;
      padding: 10px;
    }

    .context-toolbar span {
      padding: 0 4px;
    }

    .context-toolbar button {
      width: 100%;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .locating-reply i {
      animation: none;
    }

    .context-toolbar button {
      transition: none;
    }
  }
</style>
