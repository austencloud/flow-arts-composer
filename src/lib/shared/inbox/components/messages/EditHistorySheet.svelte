<!--
  EditHistorySheet.svelte

  Bottom sheet showing the edit history of a message for abuse prevention.
  Triggered by tapping "(edited)" indicator.
-->
<script lang="ts">
  import { getLocale, t } from "#lib/shared/i18n/i18n.svelte.js";
  import { Dialog as DialogPrimitive } from "bits-ui";
  import type { MessageEdit } from "#lib/shared/messaging/domain/models/message-models.js";

  let {
    isOpen = $bindable(false),
    currentContent,
    editHistory,
  } = $props<{
    isOpen?: boolean;
    currentContent: string;
    editHistory: MessageEdit[];
  }>();

  function formatDate(date: Date): string {
    const d = date instanceof Date ? date : new Date(date);
    return d.toLocaleString(getLocale(), {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function handleClose() {
    isOpen = false;
  }
</script>

<DialogPrimitive.Root bind:open={isOpen}>
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay class="history-backdrop" onclick={handleClose} />
    <DialogPrimitive.Content class="history-sheet">
      <div class="sheet-header">
        <DialogPrimitive.Title class="sheet-title">{t("inbox_ui_edit_history")}</DialogPrimitive.Title>
        <button
          type="button"
          class="close-button"
          onclick={handleClose}
          aria-label={t("inbox_ui_close")}
        >
          <i class="fa-solid fa-xmark" aria-hidden="true"></i>
        </button>
      </div>

      <DialogPrimitive.Description class="sr-only">
        {t("inbox_ui_view_previous_versions_of_this_message")}
      </DialogPrimitive.Description>

      <div class="history-list">
        <!-- Current version -->
        <div class="history-item current">
          <div class="version-label">
            <span class="version-badge">{t("inbox_ui_current")}</span>
          </div>
          <p class="version-content">{currentContent}</p>
        </div>

        <!-- Previous versions -->
        {#each editHistory.toReversed() as edit, index}
          <div class="history-item">
            <div class="version-label">
              <span class="version-time">{formatDate(edit.editedAt)}</span>
            </div>
            <p class="version-content">{edit.content}</p>
          </div>
        {/each}
      </div>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
</DialogPrimitive.Root>

<style>
  :global(.history-backdrop) {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    z-index: var(--z-modal);
  }

  :global(.history-sheet) {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    max-height: 70vh;
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 16px 16px 0 0;
    z-index: calc(var(--z-modal) + 1);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    animation: slide-up var(--duration-normal) ease-out;
  }

  @keyframes slide-up {
    from {
      transform: translateY(100%);
    }
    to {
      transform: translateY(0);
    }
  }

  .sheet-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  :global(.sheet-title) {
    margin: 0;
    font-size: var(--font-size-lg, 18px);
    font-weight: 600;
    color: var(--theme-text, #ffffff);
  }

  .close-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border: none;
    background: transparent;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    cursor: pointer;
    border-radius: 8px;
    transition: all var(--duration-fast) ease;
  }

  .close-button:hover {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.08));
    color: var(--theme-text, #ffffff);
  }

  .history-list {
    flex: 1;
    overflow-y: auto;
    padding: 16px 20px;
  }

  .history-item {
    padding: 12px 0;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.05));
  }

  .history-item:last-child {
    border-bottom: none;
  }

  .history-item.current {
    background: color-mix(in srgb, var(--theme-accent, #6366f1) 8%, transparent);
    margin: 0 -20px;
    padding: 12px 20px;
    border-radius: 8px;
  }

  .version-label {
    margin-bottom: 6px;
  }

  .version-badge {
    display: inline-block;
    padding: 2px 8px;
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    color: var(--theme-accent, #6366f1);
    background: color-mix(in srgb, var(--theme-accent, #6366f1) 15%, transparent);
    border-radius: 4px;
  }

  .version-time {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
  }

  .version-content {
    margin: 0;
    font-size: var(--font-size-sm, 14px);
    color: var(--theme-text, #ffffff);
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-word;
  }

  :global(.sr-only) {
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

  /* Desktop: centered modal instead of bottom sheet */
  @media (min-width: 768px) {
    :global(.history-sheet) {
      top: 50%;
      left: 50%;
      bottom: auto;
      right: auto;
      transform: translate(-50%, -50%);
      max-width: 480px;
      width: 90%;
      max-height: 60vh;
      border-radius: 16px;
      border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
      animation: fade-scale-in var(--duration-normal) ease-out;
    }

    @keyframes fade-scale-in {
      from {
        opacity: 0;
        transform: translate(-50%, -50%) scale(0.95);
      }
      to {
        opacity: 1;
        transform: translate(-50%, -50%) scale(1);
      }
    }
  }

  /* Accessibility: Respect user's motion preferences (WCAG AAA) */
  @media (prefers-reduced-motion: reduce) {
    :global(.history-sheet) {
      animation: none;
    }
  }
</style>
