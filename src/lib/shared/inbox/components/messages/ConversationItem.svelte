<script lang="ts">
  /**
   * ConversationItem
   *
   * Single conversation row in the list with enhanced visual polish.
   * Supports both direct (1:1) and group conversations.
   */

  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import { onMount } from "svelte";
  import type { ConversationPreview } from "$lib/shared/messaging/domain/models/conversation-models";
  import RobustAvatar from "$lib/shared/components/avatar/RobustAvatar.svelte";
  import GroupAvatarStack from "./GroupAvatarStack.svelte";
  import { formatRelativeTime, truncateText } from "../../utils/format";
  import type { HapticFeedback } from "$lib/shared/application/services/haptic-feedback";
  import { getMessageDeliveryContext } from "../../context/message-delivery-context";
  import { getUserIdentityLabels } from "$lib/shared/community/domain/user-identity-labels";

  interface Props {
    conversation: ConversationPreview;
    onclick: () => void;
    selectionMode?: boolean;
    selected?: boolean;
  }

  let {
    conversation,
    onclick,
    selectionMode = false,
    selected = false,
  }: Props = $props();

  // Haptic feedback service
  let hapticService: HapticFeedback | undefined;
  // A selection row shows no draft, so it never needs the outbox; the send
  // pickers render rows before a lazily mounted drawer has registered one.
  const messageDeliveryState = selectionMode
    ? null
    : getMessageDeliveryContext();

  onMount(() => {
    hapticService = getHapticFeedback();
  });

  function handleClick() {
    hapticService?.trigger("selection");
    onclick();
  }

  // Derived display values based on conversation type
  const isGroup = $derived(conversation.type === "group");
  const directIdentity = $derived(
    getUserIdentityLabels(conversation.otherParticipant, "Unknown")
  );
  const displayName = $derived(
    isGroup ? conversation.groupName || "Unnamed Group" : directIdentity.primary
  );
  const draft = $derived(messageDeliveryState?.draftFor(conversation.id));
  const draftPreview = $derived.by(() => {
    if (!draft) return "";
    const content = draft.content.trim();
    if (content) return content;
    switch (draft.attachment?.type) {
      case "image":
        return "Image";
      case "sequence":
        return "Sequence";
      case "collection":
        return "Collection";
      default:
        return "Reply";
    }
  });
  const displayTime = $derived(
    draft ? new Date(draft.updatedAt) : conversation.updatedAt
  );
  const accountName = $derived(isGroup ? null : directIdentity.secondary);
  const relativeTime = $derived(formatRelativeTime(displayTime));
  const accessiblePreview = $derived.by(() => {
    if (draft) return `Draft ${draftPreview}`;
    if (!conversation.lastMessage) return "No messages yet";
    const sender =
      isGroup && conversation.lastMessage.senderName
        ? `${conversation.lastMessage.senderName}: `
        : "";
    return `${sender}${conversation.lastMessage.content}`;
  });
  const ariaLabel = $derived(
    selectionMode
      ? `${selected ? "Selected. " : ""}Send to ${displayName}${accountName ? `, ${accountName}` : ""}${isGroup && conversation.participantCount ? `, ${conversation.participantCount} members` : ""}`
      : isGroup
        ? `Group: ${displayName}, ${conversation.participantCount} members, ${relativeTime}, ${accessiblePreview}${conversation.unreadCount > 0 ? `, ${conversation.unreadCount} unread` : ""}`
        : `Conversation with ${displayName}${accountName ? `, ${accountName}` : ""}, ${relativeTime}, ${accessiblePreview}${conversation.unreadCount > 0 ? `, ${conversation.unreadCount} unread` : ""}`
  );
</script>

<button
  class="conversation-item"
  class:unread={!selectionMode && conversation.unreadCount > 0}
  class:selection-mode={selectionMode}
  class:selected
  onclick={handleClick}
  aria-label={ariaLabel}
  aria-pressed={selectionMode ? selected : undefined}
>
  <!-- Unread accent bar -->
  {#if !selectionMode && conversation.unreadCount > 0}
    <div class="unread-accent"></div>
  {/if}

  <!-- Avatar -->
  <div class="avatar-wrapper" aria-hidden="true">
    {#if isGroup}
      <GroupAvatarStack
        participants={conversation.participantPreviews || []}
        customAvatar={conversation.groupAvatar}
        size={44}
        maxVisible={3}
      />
    {:else if conversation.otherParticipant}
      <RobustAvatar
        src={conversation.otherParticipant.avatar}
        name={conversation.otherParticipant.displayName}
        alt="Avatar for {directIdentity.primary}"
        customSize={44}
      />
    {/if}
    {#if !selectionMode && conversation.unreadCount > 0}
      <span class="online-dot" aria-hidden="true"></span>
    {/if}
  </div>

  <!-- Content -->
  <div class="content">
    <div class="header">
      <span class="identity">
        <span class="name">
          {#if isGroup}
            <i class="fas fa-users group-icon" aria-hidden="true"></i>
          {/if}
          {displayName}
        </span>
        {#if accountName}
          <span class="account-name">{accountName}</span>
        {/if}
      </span>
      <span class="time">{relativeTime}</span>
    </div>
    {#if draft}
      <p class="preview draft-preview">
        <span class="draft-label">Draft</span>
        {truncateText(draftPreview, isGroup ? 45 : 60)}
      </p>
    {:else if conversation.lastMessage}
      <p class="preview">
        {#if isGroup && conversation.lastMessage.senderName}
          <span class="sender">{conversation.lastMessage.senderName}:</span>
        {/if}
        {truncateText(conversation.lastMessage.content, isGroup ? 45 : 60)}
      </p>
    {:else}
      <p class="preview empty">No messages yet</p>
    {/if}
  </div>

  <!-- Unread badge -->
  {#if selectionMode}
    <span class="selection-indicator" class:selected aria-hidden="true">
      <i class="fas {selected ? 'fa-check' : 'fa-paper-plane'}"></i>
    </span>
  {:else if conversation.unreadCount > 0}
    <span
      class="unread-badge"
      aria-label="{conversation.unreadCount} unread messages"
    >
      {conversation.unreadCount > 9 ? "9+" : conversation.unreadCount}
    </span>
  {/if}
</button>

<style>
  .conversation-item {
    position: relative;
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    padding: 12px 16px;
    background: transparent;
    border: none;
    border-bottom: 1px solid var(--theme-stroke);
    text-align: left;
    cursor: pointer;
    transition:
      background 0.2s ease,
      transform 0.15s ease;
  }

  .conversation-item:hover {
    background: var(--theme-card-bg);
  }

  .conversation-item:active {
    transform: scale(0.99);
  }

  .conversation-item:focus-visible {
    outline: none;
    background: var(--theme-card-hover-bg);
    box-shadow: inset 0 0 0 2px
      color-mix(in srgb, var(--theme-accent) 50%, transparent);
  }

  .conversation-item.unread {
    background: color-mix(in srgb, var(--theme-accent) 5%, transparent);
  }

  .conversation-item.selection-mode.selected {
    background: color-mix(
      in srgb,
      var(--theme-accent, var(--semantic-info)) 10%,
      transparent
    );
    box-shadow: inset 3px 0 0 var(--theme-accent, var(--semantic-info));
  }

  /* Unread accent bar */
  .unread-accent {
    position: absolute;
    left: 0;
    top: 8px;
    bottom: 8px;
    width: 3px;
    background: var(--theme-accent, var(--semantic-info));
    border-radius: 0 2px 2px 0;
    animation: accentPulse 2s ease-in-out infinite;
  }

  @keyframes accentPulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.6;
    }
  }

  /* Avatar wrapper for positioning online dot */
  .avatar-wrapper {
    position: relative;
    flex-shrink: 0;
    transition: transform var(--duration-normal) ease;
  }

  .conversation-item:hover .avatar-wrapper {
    transform: scale(1.05);
  }

  .online-dot {
    position: absolute;
    bottom: 2px;
    right: 2px;
    width: 10px;
    height: 10px;
    background: var(--theme-accent, var(--semantic-info));
    border: 2px solid var(--theme-panel-bg);
    border-radius: 50%;
    z-index: 10;
  }

  /* Content */
  .content {
    flex: 1;
    min-width: 0;
  }

  .header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 2px;
  }

  .identity {
    display: flex;
    flex: 1;
    min-width: 0;
    flex-direction: column;
    gap: 1px;
  }

  .name {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: var(--font-size-sm);
    font-weight: 600;
    color: var(--theme-text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .account-name {
    overflow: hidden;
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact);
    line-height: 1.2;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .group-icon {
    font-size: var(--font-size-compact);
    color: var(--theme-accent, var(--semantic-info));
    flex-shrink: 0;
  }

  .unread .name {
    font-weight: 700;
  }

  .time {
    flex-shrink: 0;
    font-size: var(--font-size-compact);
    color: var(--theme-text-dim, var(--theme-text-dim));
  }

  .unread .time {
    color: var(--theme-accent, var(--semantic-info));
    font-weight: 500;
  }

  .preview {
    margin: 0;
    font-size: var(--font-size-compact);
    color: var(--theme-text-dim, var(--theme-text-dim));
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .preview .sender {
    font-weight: 500;
    color: var(--theme-text);
    margin-right: 4px;
  }

  .draft-label {
    margin-right: 4px;
    color: var(--semantic-error);
    font-weight: 700;
  }

  .draft-preview {
    color: var(--theme-text);
  }

  .preview.empty {
    font-style: italic;
    opacity: 0.7;
  }

  .unread .preview {
    color: var(--theme-text);
    font-weight: 500;
  }

  /* Unread badge */
  .unread-badge {
    flex-shrink: 0;
    min-width: 22px;
    height: 22px;
    padding: 0 6px;
    background: var(--theme-accent, var(--semantic-info));
    border-radius: 11px;
    color: white;
    font-size: var(--font-size-compact);
    font-weight: 600;
    line-height: 22px;
    text-align: center;
    box-shadow: 0 2px 4px var(--theme-shadow);
  }

  .selection-indicator {
    display: grid;
    flex: 0 0 auto;
    place-items: center;
    width: 2rem;
    height: 2rem;
    background: transparent;
    border: 1px solid var(--theme-stroke);
    border-radius: 50%;
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 0.75rem);
  }

  .selection-indicator.selected {
    background: var(--theme-accent, var(--semantic-info));
    border-color: var(--theme-accent, var(--semantic-info));
    color: white;
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .conversation-item,
    .avatar-wrapper,
    .unread-accent {
      transition: none !important;
      animation: none !important;
    }
  }
</style>
