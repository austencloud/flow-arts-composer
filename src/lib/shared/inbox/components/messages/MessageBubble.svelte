<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte";
  /**
   * MessageBubble
   *
   * Single message bubble with read receipts, animations, reactions, and rich attachments
   * Supports both direct (1:1) and group conversations with sender display
   *
   * Reaction layout follows the Messenger pattern:
   * - Reactions are a sibling to .bubble inside a flex-column wrapper
   * - translateY(-50%) pulls the reaction pill up to overlap the bubble's bottom edge
   * - align-items on the wrapper controls left/right anchoring
   * - No absolute positioning - reactions stay in document flow
   */

  import type { Message } from "$lib/shared/messaging/domain/models/message-models";
  import type { ParticipantInfo } from "$lib/shared/messaging/domain/models/conversation-models";
  import { formatTime } from "../../utils/format";
  import FeedbackMessageCard from "./FeedbackMessageCard.svelte";
  import SequenceMessageCard from "./SequenceMessageCard.svelte";
  import CollectionMessageCard from "./CollectionMessageCard.svelte";
  import ImageMessageCard from "./ImageMessageCard.svelte";
  import ReplyPreview from "./ReplyPreview.svelte";
  import MessageReactions from "./MessageReactions.svelte";
  import EditHistorySheet from "./EditHistorySheet.svelte";
  import MessageActions from "./MessageActions.svelte";
  import { messagingService } from "$lib/shared/messaging/services/messenger";
  import RobustAvatar from "../../../components/avatar/RobustAvatar.svelte";
  import { toast } from "../../../toast/state/toast-state.svelte";
  import { getMessagePreviewText } from "../../utils/message-preview";
  import RichMessageText from "./RichMessageText.svelte";
  import {
    buildDetectedSequenceAttachment,
    findMessageSequenceLink,
    messageHasSequencePreview,
  } from "../../domain/message-link-parts";
  import type { MessageOutboxRecord } from "../../domain/message-delivery-models";
  import { getUserIdentityLabels } from "$lib/shared/community/domain/user-identity-labels";

  interface Props {
    message: Message;
    isOwn: boolean;
    currentUserId?: string;
    isNew?: boolean;
    otherParticipantId?: string;
    showReadReceipt?: boolean;
    isGroup?: boolean;
    senderInfo?: ParticipantInfo;
    replyTarget?: Message;
    onNavigateToMessage?: (messageId: string) => void;
    isHighlighted?: boolean;
    sequencePlaybackActive?: boolean;
    sequencePlaybackMounted?: boolean;
    onSequencePlaybackRequest?: () => void;
    outboxItem?: MessageOutboxRecord;
    onRetry?: () => void;
    onRemove?: () => void;
  }

  let {
    message,
    isOwn,
    currentUserId,
    isNew = false,
    otherParticipantId,
    showReadReceipt = false,
    isGroup = false,
    senderInfo,
    replyTarget,
    onNavigateToMessage,
    isHighlighted = false,
    sequencePlaybackActive = true,
    sequencePlaybackMounted = sequencePlaybackActive,
    onSequencePlaybackRequest,
    outboxItem,
    onRetry,
    onRemove,
  }: Props = $props();

  const showSender = $derived(isGroup && !isOwn && senderInfo);
  const senderIdentity = $derived(getUserIdentityLabels(senderInfo));
  let showEditHistory = $state(false);
  const wasEdited = $derived(message.editedAt !== undefined);
  const hasReactions = $derived(
    message.reactions && message.reactions.length > 0
  );
  const feedbackAttachment = $derived(
    message.attachments?.find((a) => a.type === "feedback")
  );
  const sequenceAttachment = $derived(
    message.attachments?.find((a) => a.type === "sequence")
  );
  const imageAttachment = $derived(
    message.attachments?.find((a) => a.type === "image")
  );
  const collectionAttachment = $derived(
    message.attachments?.find((a) => a.type === "collection")
  );
  const detectedSequenceAttachment = $derived.by(() => {
    if (
      message.isDeleted ||
      feedbackAttachment ||
      sequenceAttachment ||
      imageAttachment ||
      collectionAttachment
    ) {
      return null;
    }

    const link = findMessageSequenceLink(message.content);
    return link ? buildDetectedSequenceAttachment(link) : null;
  });
  const hasAttachment = $derived(
    Boolean(
      feedbackAttachment ||
      sequenceAttachment ||
      imageAttachment ||
      collectionAttachment ||
      detectedSequenceAttachment
    )
  );
  const hasSequencePreview = $derived(messageHasSequencePreview(message));
  const accessibleMessage = $derived(
    getMessagePreviewText(message.content, message.attachments)
  );
  const readTimestamp = $derived.by(() => {
    if (!otherParticipantId || !message.readAt) return null;
    return message.readAt[otherParticipantId] || null;
  });
  const localAttachment = $derived(outboxItem?.attachment);
  const deliveryLabel = $derived.by(() => {
    if (!outboxItem) return "";
    if (outboxItem.status === "sending") {
      return outboxItem.progress?.label || t("inbox_ui_sending");
    }
    if (outboxItem.status === "queued") {
      return outboxItem.lastError || t("inbox_ui_waiting_to_send");
    }
    if (outboxItem.status === "failed") {
      return outboxItem.lastError || t("inbox_ui_message_could_not_be_sent");
    }
    return "Sent";
  });

  function formatReadTime(date: Date): string {
    return formatTime(date);
  }

  function handleToggleReaction(emoji: string) {
    messagingService
      .toggleReaction(message.conversationId, message.id, emoji)
      .catch((err) => {
        console.error("Failed to toggle reaction:", err);
        toast.error(t("inbox_ui_failed_to_update_reaction"));
      });
  }

  function handleEditedClick() {
    if (message.editHistory && message.editHistory.length > 0) {
      showEditHistory = true;
    }
  }
</script>

<!--
  Shared snippet: the bubble content (reply, attachments, text, meta).
  Used in both group and 1:1 paths to avoid duplication.
-->
{#snippet bubbleContent()}
  {#if message.replyTo}
    <ReplyPreview
      reply={message.replyTo}
      compact
      unavailable={replyTarget?.isDeleted ?? false}
      onActivate={onNavigateToMessage
        ? () => onNavigateToMessage?.(message.replyTo!.messageId)
        : undefined}
    />
  {/if}

  {#if message.isDeleted}
    <RichMessageText content={message.content} {isOwn} linkify={false} />
  {:else if imageAttachment}
    <ImageMessageCard
      attachment={imageAttachment}
      caption={message.content}
      localFile={localAttachment?.type === "image"
        ? localAttachment.blob
        : undefined}
    />
    {#if message.content}
      <RichMessageText content={message.content} {isOwn} attachment />
    {/if}
  {:else if sequenceAttachment}
    <SequenceMessageCard
      attachment={sequenceAttachment}
      {isOwn}
      playbackActive={sequencePlaybackActive}
      playbackMounted={sequencePlaybackMounted}
      onRequestPlayback={onSequencePlaybackRequest}
      localSequence={localAttachment?.type === "sequence"
        ? localAttachment.payload.sequence
        : undefined}
    />
    {#if message.content && !message.content.startsWith("Check out this sequence")}
      <RichMessageText content={message.content} {isOwn} attachment />
    {/if}
  {:else if collectionAttachment}
    <CollectionMessageCard
      attachment={collectionAttachment}
      {isOwn}
      {currentUserId}
      recipientId={isOwn ? otherParticipantId : currentUserId}
    />
    {#if message.content}
      <RichMessageText content={message.content} {isOwn} attachment />
    {/if}
  {:else if feedbackAttachment}
    <FeedbackMessageCard attachment={feedbackAttachment} {isOwn} />
    {#if message.content && message.content !== "[Feedback submitted]"}
      <RichMessageText content={message.content} {isOwn} attachment />
    {/if}
  {:else}
    <RichMessageText content={message.content} {isOwn} />
    {#if detectedSequenceAttachment}
      <div class="detected-sequence-preview">
        <SequenceMessageCard
          attachment={detectedSequenceAttachment}
          {isOwn}
          playbackActive={sequencePlaybackActive}
          playbackMounted={sequencePlaybackMounted}
          onRequestPlayback={onSequencePlaybackRequest}
        />
      </div>
    {/if}
  {/if}

  <div class="meta">
    <time class="time" datetime={message.createdAt.toISOString()}
      >{formatTime(message.createdAt)}</time
    >
    {#if wasEdited && !message.isDeleted}
      {#if message.editHistory && message.editHistory.length > 0}
        <button
          type="button"
          class="edited-button"
          onclick={handleEditedClick}
          aria-label={t("inbox_ui_view_edit_history")}
        >
          {t("inbox_ui__edited")}
        </button>
      {:else}
        <span class="edited">{t("inbox_ui__edited")}</span>
      {/if}
    {/if}
    {#if showReadReceipt && !message.isDeleted}
      <span class="read-receipt read" aria-label={t("inbox_ui_read")}>
        <i class="fas fa-check-double" aria-hidden="true"></i>
        {#if readTimestamp}
          <span class="read-time">{t("inbox_ui_seen")} {formatReadTime(readTimestamp)}</span>
        {/if}
      </span>
    {/if}
    {#if outboxItem}
      <span
        class="delivery-state"
        class:failed={outboxItem.status === "failed"}
        role="status"
      >
        <i
          class="fa-solid {outboxItem.status === 'sending'
            ? 'fa-spinner fa-spin'
            : outboxItem.status === 'queued'
              ? 'fa-clock'
              : outboxItem.status === 'failed'
                ? 'fa-circle-exclamation'
                : 'fa-check'}"
          aria-hidden="true"
        ></i>
        <span>{deliveryLabel}</span>
        {#if outboxItem.status === "failed"}
          <button type="button" onclick={onRetry}>{t("inbox_ui_retry")}</button>
        {/if}
        {#if outboxItem.status === "failed" || outboxItem.status === "queued"}
          <button type="button" class="remove-delivery" onclick={onRemove}
            >{t("inbox_ui_remove")}</button
          >
        {/if}
      </span>
    {/if}
  </div>
{/snippet}

<!-- Shared snippet: reaction badge anchored to bubble corner -->
{#snippet reactionBadge()}
  {#if hasReactions && message.reactions}
    <div class="reaction-badge">
      <MessageReactions
        reactions={message.reactions}
        onToggleReaction={handleToggleReaction}
        {currentUserId}
      />
    </div>
  {/if}
{/snippet}

<MessageActions {message} {isOwn} actionsEnabled={!outboxItem}>
  {#if showSender && senderInfo}
    <!-- Group messages from others: avatar gutter layout -->
    <div class="group-message-row">
      <div class="avatar-gutter">
        <RobustAvatar
          src={senderInfo.avatar}
          name={senderIdentity.primary}
          alt=""
          customSize={28}
        />
      </div>
      <div
        class="message-bubble"
        class:deleted={message.isDeleted}
        class:is-new={isNew}
        class:has-attachment={hasAttachment}
        class:has-reactions={hasReactions}
        class:has-sender={true}
        class:has-sequence={hasSequencePreview}
        class:has-delivery={Boolean(outboxItem)}
        class:highlighted={isHighlighted}
        data-message-id={message.id}
        role="article"
        tabindex="-1"
        aria-label="{message.senderName}: {accessibleMessage}{deliveryLabel
          ? `, ${deliveryLabel}`
          : ''}"
      >
        <span class="sender-name">{senderIdentity.primary}</span>
        <div class="bubble" data-message-action-anchor="true">
          {@render bubbleContent()}
          {@render reactionBadge()}
        </div>
      </div>
    </div>
  {:else}
    <!-- Own messages and 1:1 chat messages -->
    <div
      class="message-bubble"
      class:own={isOwn}
      class:deleted={message.isDeleted}
      class:is-new={isNew}
      class:has-attachment={hasAttachment}
      class:has-reactions={hasReactions}
      class:has-sequence={hasSequencePreview}
      class:has-delivery={Boolean(outboxItem)}
      class:highlighted={isHighlighted}
      data-message-id={message.id}
      role="article"
      tabindex="-1"
      aria-label="{isOwn
        ? t("inbox_you")
        : message.senderName}: {accessibleMessage}{deliveryLabel
        ? `, ${deliveryLabel}`
        : ''}"
    >
      <div class="bubble" data-message-action-anchor="true">
        {@render bubbleContent()}
        {@render reactionBadge()}
      </div>
    </div>
  {/if}
</MessageActions>

{#if message.editHistory && message.editHistory.length > 0}
  <EditHistorySheet
    bind:isOpen={showEditHistory}
    currentContent={message.content}
    editHistory={message.editHistory}
  />
{/if}

<style>
  /* ===== Message bubble wrapper (flex column: bubble + reaction tray) ===== */
  .message-bubble {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    max-width: 80%;
    animation: slideIn var(--duration-normal) ease-out;
    transform-origin: bottom left;
  }

  .message-bubble.own {
    margin-left: auto;
    align-items: flex-end;
    transform-origin: bottom right;
  }

  .message-bubble.has-sequence {
    width: min(32rem, 96%);
    max-width: min(32rem, 96%);
  }

  .message-bubble.has-delivery {
    max-width: min(30rem, 96%);
  }

  .message-bubble.has-sequence .bubble {
    width: 100%;
    max-width: none;
    box-sizing: border-box;
  }

  .message-bubble.is-new {
    animation: slideInNew var(--duration-emphasis) ease-out;
  }

  .message-bubble:focus {
    outline: none;
  }

  @keyframes slideIn {
    from {
      opacity: 0;
      transform: translateY(8px) scale(0.95);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  @keyframes slideInNew {
    from {
      opacity: 0;
      transform: translateY(16px) scale(0.9);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  .bubble {
    position: relative;
    padding: 10px 14px;
    border-radius: 18px;
    background: var(--theme-card-bg);
    overflow: visible;
    transition: transform var(--duration-fast) ease;
  }

  .bubble:hover {
    transform: scale(1.01);
  }

  .message-bubble.highlighted .bubble {
    animation: reply-target-pulse 1.4s ease-out;
  }

  @keyframes reply-target-pulse {
    0%,
    100% {
      box-shadow: 0 0 0 1px transparent;
    }
    24%,
    70% {
      box-shadow:
        0 0 0 2px var(--theme-accent, #6366f1),
        0 0 0 7px
          color-mix(in srgb, var(--theme-accent, #6366f1) 22%, transparent);
    }
  }

  .own .bubble {
    background: color-mix(
      in srgb,
      var(--theme-accent, var(--semantic-info)) 45%,
      black
    );
    border: 1px solid
      color-mix(
        in srgb,
        var(--theme-accent, var(--semantic-info)) 72%,
        transparent
      );
    color: white;
    border-bottom-right-radius: 6px;
  }

  .message-bubble:not(.own) .bubble {
    border-bottom-left-radius: 6px;
  }

  /* The 44px interaction box stays transparent. Its compact visible capsule
     straddles the bubble edge, while the opposite-corner anchor keeps it clear
     of the timestamp and read receipt. */
  .reaction-badge {
    position: absolute;
    right: 0.625rem;
    bottom: calc(var(--touch-target-min, 44px) / -2);
    z-index: 2;
    pointer-events: auto;
  }

  .message-bubble.own .reaction-badge {
    right: auto;
    left: 0.625rem;
  }

  /* The thread contributes another 8px between messages, bringing the full
     44px reaction hit box clear of the next bubble without a visible gap. */
  .message-bubble.has-reactions {
    margin-bottom: 0.875rem;
  }

  .group-message-row {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    max-width: 85%;
  }

  .avatar-gutter {
    flex-shrink: 0;
    padding-top: 2px;
  }

  .sender-name {
    display: block;
    font-size: var(--font-size-compact, 12px);
    font-weight: 500;
    color: var(--theme-text-dim);
    margin-bottom: 2px;
    padding-left: 2px;
  }

  .message-bubble.has-sender {
    margin-top: 8px;
  }

  .deleted .bubble {
    background: var(--theme-card-bg);
    font-style: italic;
    opacity: 0.7;
  }

  .detected-sequence-preview {
    margin-top: 8px;
  }

  .has-attachment .bubble {
    max-width: min(22rem, 100%);
  }

  /* ===== Meta (timestamp, edited, read receipt) ===== */
  .meta {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: var(--font-size-compact);
    color: var(--theme-text-dim);
  }

  .own .meta {
    justify-content: flex-end;
  }

  .has-delivery .meta {
    flex-wrap: wrap;
    width: 100%;
    color: rgba(255, 255, 255, 0.78);
  }

  .has-delivery .time {
    white-space: nowrap;
  }

  .delivery-state {
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: 5px;
    color: rgba(255, 255, 255, 0.82);
    font-size: var(--font-size-compact, 12px);
  }

  .delivery-state.failed {
    color: color-mix(in srgb, var(--semantic-error) 52%, white);
  }

  .delivery-state.failed button {
    color: white;
  }

  .delivery-state button {
    min-height: var(--min-touch-target, 44px);
    padding: 0 8px;
    border: 0;
    border-radius: 8px;
    background: color-mix(in srgb, white 18%, transparent);
    color: inherit;
    font: inherit;
    font-weight: 700;
    cursor: pointer;
  }

  .delivery-state button:hover,
  .delivery-state button:focus-visible {
    background: color-mix(in srgb, white 24%, transparent);
  }

  .delivery-state button:focus-visible {
    outline: 2px solid currentColor;
    outline-offset: 1px;
  }

  .delivery-state .remove-delivery {
    font-weight: 500;
  }

  .edited {
    font-style: italic;
  }

  .edited-button {
    font-style: italic;
    font-size: inherit;
    color: inherit;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    text-decoration: underline;
    text-decoration-style: dotted;
    text-underline-offset: 2px;
  }

  .edited-button:hover {
    text-decoration-style: solid;
  }

  .read-receipt {
    font-size: var(--font-size-compact);
    opacity: 0.7;
    transition: color var(--duration-normal) ease;
  }

  .read-receipt.read {
    color: var(--semantic-info);
    opacity: 1;
  }

  .own .read-receipt.read {
    /* Lighter tint of the read color for contrast on the accent bubble */
    color: color-mix(in srgb, var(--semantic-info) 60%, white);
  }

  .read-time {
    margin-left: 4px;
    font-size: var(--font-size-compact, 12px);
  }

  @media (prefers-reduced-motion: reduce) {
    .message-bubble,
    .bubble,
    .delivery-state i {
      animation: none !important;
      transition: none !important;
    }

    .message-bubble.highlighted .bubble {
      box-shadow: 0 0 0 2px var(--theme-accent, #6366f1);
    }
  }
</style>
