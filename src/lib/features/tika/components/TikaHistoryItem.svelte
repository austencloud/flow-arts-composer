<!--
  TIKA History Item - Conversation Card

  Displays a single conversation in the history list.
  Shows title, time, message count, and preview text.
-->
<script lang="ts">
  import type { TikaSessionPreview } from "../domain/models/tika-conversation-models";

  let {
    session,
    isActive = false,
    onSelect,
    onDelete,
  }: {
    session: TikaSessionPreview;
    isActive?: boolean;
    onSelect: () => void;
    onDelete: () => void;
  } = $props();

  // Format relative time
  function formatRelativeTime(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  }

  // Handle delete with confirmation
  function handleDeleteClick(e: MouseEvent) {
    e.stopPropagation();
    onDelete();
  }

  // Handle keyboard navigation
  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect();
    }
  }
</script>

<div
  class="history-item"
  class:active={isActive}
  role="button"
  tabindex="0"
  onclick={onSelect}
  onkeydown={handleKeydown}
  aria-label={`Load conversation: ${session.title}`}
  aria-current={isActive ? "true" : undefined}
>
  <div class="item-content">
    <div class="item-title">{session.title}</div>
    <div class="item-meta">
      <span class="item-time">{formatRelativeTime(session.updatedAt)}</span>
      <span class="item-separator">·</span>
      <span class="item-count">{session.messageCount} messages</span>
    </div>
    {#if session.lastUserMessage}
      <div class="item-preview">{session.lastUserMessage}</div>
    {/if}
  </div>

  <button
    aria-label="Delete conversation"
    class="delete-btn"
    onclick={handleDeleteClick}
    title="Delete conversation"
  >
    <i class="fas fa-times" aria-hidden="true"></i>
  </button>
</div>

<style>
  .history-item {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 12px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 8px;
    cursor: pointer;
    transition:
      background-color var(--duration-normal) var(--ease-standard),
      border-color var(--duration-normal) var(--ease-standard),
      opacity var(--duration-normal) var(--ease-standard);
  }

  .history-item:hover {
    background: var(--theme-card-bg-hover, rgba(255, 255, 255, 0.08));
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.15));
  }

  .history-item:focus-visible {
    outline: 2px solid var(--theme-accent, #6366f1);
    outline-offset: 2px;
  }

  .history-item.active {
    border-color: var(--theme-accent, #6366f1);
    background: color-mix(
      in srgb,
      var(--theme-accent, #6366f1) 10%,
      transparent
    );
  }

  .item-content {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .item-title {
    font-size: var(--font-size-min, 14px);
    font-weight: 500;
    color: var(--theme-text, #ffffff);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .item-meta {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.6));
  }

  .item-separator {
    opacity: 0.5;
  }

  .item-preview {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.5));
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    line-height: 1.3;
  }

  .delete-btn {
    flex-shrink: 0;
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    border-radius: 6px;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.4));
    cursor: pointer;
    opacity: 0;
    transition:
      background-color var(--duration-normal) var(--ease-standard),
      color var(--duration-normal) var(--ease-standard),
      opacity var(--duration-normal) var(--ease-standard);
  }

  .history-item:hover .delete-btn,
  .delete-btn:focus-visible {
    opacity: 1;
  }

  .delete-btn:hover {
    background: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 20%,
      transparent
    );
    color: var(--semantic-error, #ef4444);
  }

  .delete-btn:focus-visible {
    outline: 2px solid var(--theme-accent, #6366f1);
    outline-offset: 2px;
  }

  /* Reduced Motion */
  @media (prefers-reduced-motion: reduce) {
    .history-item,
    .delete-btn {
      transition: none;
    }
  }
</style>
