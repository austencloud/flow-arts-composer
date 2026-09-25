<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte";
  import { getReplyPreviewText } from "../../utils/message-preview";
  import type {
    MessageAttachmentType,
    ReplyPreview as ReplyPreviewType,
  } from "$lib/shared/messaging/domain/models/message-models";

  let {
    reply,
    onDismiss,
    onActivate,
    compact = false,
    unavailable = false,
    domId,
  } = $props<{
    reply: ReplyPreviewType;
    onDismiss?: () => void;
    onActivate?: () => void;
    compact?: boolean;
    unavailable?: boolean;
    domId?: string;
  }>();

  const previewText = $derived(
    unavailable ? t("inbox_ui_original_message_was_deleted") : getReplyPreviewText(reply)
  );
  const senderLabel = $derived(
    compact ? reply.senderName : t("inbox_replying_person", { name: reply.senderName })
  );

  function getAttachmentIcon(type?: MessageAttachmentType): string {
    switch (type) {
      case "image":
        return "fa-image";
      case "sequence":
        return "fa-wand-magic-sparkles";
      case "collection":
        return "fa-layer-group";
      case "link":
        return "fa-link";
      case "feedback":
        return "fa-comment-dots";
      default:
        return "fa-reply";
    }
  }

  function activate(event: MouseEvent): void {
    event.stopPropagation();
    onActivate?.();
  }

  function dismiss(event: MouseEvent): void {
    event.stopPropagation();
    onDismiss?.();
  }
</script>

{#snippet previewContent()}
  <span class="reply-icon" aria-hidden="true">
    <i class="fa-solid {getAttachmentIcon(reply.attachmentType)}"></i>
  </span>

  <span class="reply-content">
    <span class="reply-sender">{senderLabel}</span>
    <span class="reply-text" class:unavailable>{previewText}</span>
  </span>
{/snippet}

{#if onActivate}
  <button
    id={domId}
    type="button"
    class="reply-preview actionable"
    class:compact
    class:unavailable
    onclick={activate}
    aria-label={unavailable
      ? t("inbox_go_deleted", { name: reply.senderName })
      : t("inbox_go_original", { name: reply.senderName })}
  >
    {@render previewContent()}
  </button>
{:else}
  <div
    id={domId}
    class="reply-preview"
    class:compact
    class:dismissible={!!onDismiss}
    class:unavailable
  >
    {@render previewContent()}

    {#if onDismiss}
      <button
        type="button"
        class="dismiss-button"
        onclick={dismiss}
        aria-label={t("inbox_ui_cancel_reply")}
      >
        <i class="fa-solid fa-xmark" aria-hidden="true"></i>
      </button>
    {/if}
  </div>
{/if}

<style>
  .reply-preview {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    min-width: 0;
    min-height: 44px;
    padding: 8px 10px;
    box-sizing: border-box;
    color: var(--theme-text, #ffffff);
    background: color-mix(
      in srgb,
      var(--theme-accent, #6366f1) 10%,
      var(--theme-card-bg, rgba(255, 255, 255, 0.04))
    );
    border: 1px solid
      color-mix(
        in srgb,
        var(--theme-accent, #6366f1) 36%,
        var(--theme-stroke, rgba(255, 255, 255, 0.1))
      );
    border-radius: 10px;
    overflow: hidden;
  }

  .reply-preview.compact {
    min-height: 42px;
    padding: 7px 9px;
    margin-bottom: 6px;
  }

  .reply-preview.dismissible {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
  }

  .reply-preview.actionable {
    font: inherit;
    text-align: left;
    cursor: pointer;
    transition:
      background var(--duration-fast, 120ms) ease,
      border-color var(--duration-fast, 120ms) ease,
      transform var(--duration-fast, 120ms) ease;
  }

  .reply-preview.actionable:hover {
    background: color-mix(
      in srgb,
      var(--theme-accent, #6366f1) 18%,
      var(--theme-card-bg, rgba(255, 255, 255, 0.04))
    );
    border-color: color-mix(
      in srgb,
      var(--theme-accent, #6366f1) 60%,
      var(--theme-stroke, rgba(255, 255, 255, 0.1))
    );
  }

  .reply-preview.actionable:active {
    transform: scale(0.985);
  }

  .reply-preview.actionable:focus-visible,
  .dismiss-button:focus-visible {
    outline: 2px solid var(--theme-accent, #6366f1);
    outline-offset: 2px;
  }

  .reply-icon {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    flex: 0 0 28px;
    border-radius: 50%;
    color: var(--theme-accent, #6366f1);
    background: color-mix(
      in srgb,
      var(--theme-accent, #6366f1) 16%,
      transparent
    );
    font-size: var(--font-size-compact, 12px);
  }

  .reply-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .reply-sender {
    overflow: hidden;
    color: var(--theme-accent, #6366f1);
    font-size: var(--font-size-compact, 12px);
    font-weight: 650;
    line-height: 1.25;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .reply-text {
    display: -webkit-box;
    overflow: hidden;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.72));
    font-size: var(--font-size-sm, 14px);
    line-height: 1.35;
    overflow-wrap: anywhere;
    white-space: pre-wrap;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }

  .compact .reply-text {
    font-size: var(--font-size-compact, 12px);
  }

  .reply-text.unavailable {
    font-style: italic;
  }

  .dismiss-button {
    display: grid;
    place-items: center;
    width: var(--min-touch-target, 44px);
    height: var(--min-touch-target, 44px);
    flex: 0 0 var(--min-touch-target, 44px);
    padding: 0;
    border: 0;
    border-radius: 50%;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.65));
    background: transparent;
    cursor: pointer;
    transition:
      color var(--duration-fast, 120ms) ease,
      background var(--duration-fast, 120ms) ease;
  }

  .dismiss-button:hover {
    color: var(--theme-text, #ffffff);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.08));
  }

  :global(.message-bubble.own) .reply-preview {
    color: white;
    background: rgba(0, 0, 0, 0.16);
    border-color: rgba(255, 255, 255, 0.24);
  }

  :global(.message-bubble.own) .reply-sender,
  :global(.message-bubble.own) .reply-icon,
  :global(.message-bubble.own) .reply-text {
    color: white;
  }

  :global(.message-bubble.own) .reply-icon {
    background: rgba(255, 255, 255, 0.15);
  }

  @media (prefers-reduced-motion: reduce) {
    .reply-preview.actionable,
    .dismiss-button {
      transition: none;
    }

    .reply-preview.actionable:active {
      transform: none;
    }
  }
</style>
