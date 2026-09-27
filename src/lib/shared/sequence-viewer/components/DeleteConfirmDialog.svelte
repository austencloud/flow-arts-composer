<!--
  Delete Confirmation Dialog

  The viewer's one confirmation surface for irreversible deletes. Defaults read
  as a sequence delete (the drawer host and the full-page viewer); the video
  gallery and video panel pass their own title and body for performance videos.
-->
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte";
  interface Props {
    /** The word/name shown in the default confirmation message */
    word?: string;
    /** Whether the delete is currently in progress */
    isDeleting: boolean;
    /** Called when the user confirms deletion */
    onConfirm: () => void;
    /** Called when the user cancels */
    onCancel: () => void;
    /**
     * "absolute" positions within a parent container (drawer),
     * "fixed" covers the full viewport (standalone page).
     */
    positioning?: "absolute" | "fixed";
    /** Overrides the heading for non-sequence deletes. */
    title?: string;
    /** Overrides the body copy for non-sequence deletes. */
    body?: string;
  }

  let {
    word,
    isDeleting,
    onConfirm,
    onCancel,
    positioning = "fixed",
    title = t("viewer_detail_delete_sequence"),
    body,
  }: Props = $props();

  const message = $derived(
    body ??
      (word
        ? `"${word}" will be permanently removed from your library.`
        : t("viewer_detail_this_sequence_will_be_permanently_removed_from_your_library"))
  );

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") onCancel();
  }
</script>

<div
  class="delete-confirm-backdrop"
  class:positioning-absolute={positioning === "absolute"}
  class:positioning-fixed={positioning === "fixed"}
  role="dialog"
  aria-modal="true"
  aria-labelledby="delete-confirm-title"
  tabindex="-1"
  onkeydown={handleKeydown}
>
  <div class="delete-confirm-dialog">
    <h2 id="delete-confirm-title">{title}</h2>
    <p>{message}</p>
    <div class="delete-confirm-actions">
      <button
        type="button"
        class="delete-cancel-btn"
        onclick={onCancel}
        disabled={isDeleting}
      >
        {t("viewer_detail_cancel")}
      </button>
      <button
        type="button"
        class="delete-confirm-btn"
        disabled={isDeleting}
        onclick={onConfirm}
      >
        {isDeleting ? "Deleting..." : t("viewer_detail_delete")}
      </button>
    </div>
  </div>
</div>

<style>
  .delete-confirm-backdrop {
    inset: 0;
    background: rgba(0, 0, 0, 0.65);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1.5rem;
  }

  .positioning-absolute {
    position: absolute;
    z-index: 200;
  }

  .positioning-fixed {
    position: fixed;
    z-index: var(--z-modal);
  }

  .delete-confirm-dialog {
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
    border: 1px solid color-mix(in srgb, var(--semantic-error) 30%, transparent);
    border-radius: 12px;
    padding: 1.5rem;
    max-width: 360px;
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .delete-confirm-dialog h2 {
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    color: var(--theme-text, #fff);
    margin: 0;
  }

  .delete-confirm-dialog p {
    font-size: var(--font-size-sm, 13px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
    margin: 0;
    line-height: 1.5;
  }

  .delete-confirm-actions {
    display: flex;
    gap: 0.75rem;
    justify-content: flex-end;
    margin-top: 0.25rem;
  }

  .delete-cancel-btn,
  .delete-confirm-btn {
    padding: 0.5rem 1.25rem;
    border-radius: 8px;
    font-size: var(--font-size-compact, 12px);
    font-weight: 500;
    cursor: pointer;
    transition: background 150ms ease, border-color 150ms ease;
  }

  .delete-cancel-btn:disabled,
  .delete-confirm-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .delete-cancel-btn {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.08));
    color: var(--theme-text, #fff);
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  .delete-cancel-btn:hover:not(:disabled) {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.12));
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
  }

  .delete-confirm-btn {
    background: color-mix(in srgb, var(--semantic-error) 15%, transparent);
    color: var(--semantic-error);
    border: 1px solid color-mix(in srgb, var(--semantic-error) 40%, transparent);
  }

  .delete-confirm-btn:hover:not(:disabled) {
    background: color-mix(in srgb, var(--semantic-error) 25%, transparent);
    border-color: color-mix(in srgb, var(--semantic-error) 60%, transparent);
  }
</style>
