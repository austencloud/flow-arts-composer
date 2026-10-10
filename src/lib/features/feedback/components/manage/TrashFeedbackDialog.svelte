<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { toast } from "#lib/shared/toast/state/toast-state.svelte.js";
  import type { KanbanBoardState } from "../../state/kanban-board-state.svelte";
  import type { FeedbackManageState } from "#lib/shared/feedback/state/feedback-manage-state.svelte.js";

  interface Props {
    boardState: KanbanBoardState;
    manageState: FeedbackManageState;
  }

  let { boardState, manageState }: Props = $props();

  async function handleConfirm() {
    if (!boardState.itemToTrash) return;

    boardState.setIsSubmittingTrash(true);

    try {
      await manageState.deleteFeedback(boardState.itemToTrash.id);
      toast.info(t("feedback_deleted"));
      boardState.resetTrashDialog();
    } catch (err) {
      console.error("Failed to delete feedback:", err);
      toast.error(t("feedback_failed_delete"));
    } finally {
      boardState.setIsSubmittingTrash(false);
    }
  }

  function handleCancel() {
    boardState.resetTrashDialog();
  }
</script>

<div
  class="trash-dialog-overlay"
  onclick={handleCancel}
  onkeydown={(e) => e.key === "Escape" && handleCancel()}
  role="button"
  tabindex="0"
  aria-label="Close trash dialog"
>
  <div
    class="trash-dialog"
    onclick={(e) => e.stopPropagation()}
    onkeydown={(e) => e.stopPropagation()}
    role="dialog"
    aria-modal="true"
    aria-labelledby="trash-dialog-title"
    tabindex="-1"
  >
    <div class="dialog-header trash-header">
      <div class="dialog-icon trash-icon">
        <i class="fas fa-trash-alt" aria-hidden="true"></i>
      </div>
      <h3 class="dialog-title" id="trash-dialog-title">{t("feedback_delete_title")}</h3>
      <button
        type="button"
        class="close-button"
        onclick={handleCancel}
        aria-label="Close dialog"
      >
        <i class="fas fa-times" aria-hidden="true"></i>
      </button>
    </div>

    <div class="dialog-body">
      <div class="feedback-preview trash-preview">
        <span class="preview-label">{t("feedback_defer_item_label")}</span>
        <span class="preview-title"
          >{boardState.itemToTrash!.title ||
            boardState.itemToTrash!.description.substring(0, 60)}</span
        >
      </div>

      <p class="trash-warning">
        {t("feedback_delete_warning")}
      </p>
    </div>

    <div class="dialog-footer">
      <button
        type="button"
        class="cancel-button"
        onclick={handleCancel}
        disabled={boardState.isSubmittingTrash}
      >
        {t("feedback_cancel")}
      </button>
      <button
        type="button"
        class="submit-button trash-submit"
        onclick={handleConfirm}
        disabled={boardState.isSubmittingTrash}
      >
        {#if boardState.isSubmittingTrash}
          <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
          {t("feedback_deleting")}
        {:else}
          <i class="fas fa-trash-alt" aria-hidden="true"></i>
          {t("feedback_delete")}
        {/if}
      </button>
    </div>
  </div>
</div>

<style>
  .trash-dialog-overlay {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(8px);
    z-index: var(--z-modal);
    animation: fadeIn var(--duration-normal) ease;
  }

  .trash-dialog {
    display: flex;
    flex-direction: column;
    width: clamp(320px, 90vw, 460px);
    max-height: 90vh;
    background: linear-gradient(
      180deg,
      var(--theme-panel-elevated-bg) 0%,
      var(--theme-panel-bg) 100%
    );
    border: 1px solid var(--theme-stroke);
    border-radius: clamp(16px, 4cqi, 24px);
    box-shadow:
      0 20px 60px rgba(0, 0, 0, 0.5),
      inset 0 1px 0 var(--theme-stroke);
    animation: slideUp var(--duration-emphasis) cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  .dialog-header {
    display: flex;
    align-items: center;
    gap: clamp(12px, 3cqi, 16px);
    padding: clamp(16px, 4cqi, 24px);
    border-bottom: 1px solid var(--theme-stroke);
  }

  .trash-header {
    background: linear-gradient(
      90deg,
      color-mix(in srgb, var(--semantic-error) 10%, transparent) 0%,
      transparent 100%
    );
  }

  .dialog-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: clamp(36px, 9cqi, 44px);
    height: clamp(36px, 9cqi, 44px);
    border-radius: clamp(8px, 2cqi, 12px);
    font-size: clamp(16px, 4cqi, 20px);
  }

  .trash-icon {
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--semantic-error) 40%, transparent) 0%,
      color-mix(in srgb, var(--semantic-error) 20%, transparent) 100%
    );
    color: var(--semantic-error);
    box-shadow: 0 4px 12px
      color-mix(in srgb, var(--semantic-error) 30%, transparent);
  }

  .dialog-title {
    flex: 1;
    margin: 0;
    font-size: clamp(1.125rem, 3.5cqi, 1.375rem);
    font-weight: 700;
    color: var(--theme-text);
  }

  .close-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: clamp(32px, 8cqi, 40px);
    height: clamp(32px, 8cqi, 40px);
    background: transparent;
    border: none;
    border-radius: clamp(6px, 1.5cqi, 8px);
    color: var(--theme-text-dim);
    font-size: clamp(16px, 4cqi, 18px);
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .close-button:hover {
    background: var(--theme-card-hover-bg);
    color: var(--theme-text);
  }

  .dialog-body {
    display: flex;
    flex-direction: column;
    gap: clamp(16px, 4cqi, 24px);
    padding: clamp(20px, 5cqi, 28px);
    overflow-y: auto;
  }

  .feedback-preview {
    display: flex;
    flex-direction: column;
    gap: clamp(6px, 1.5cqi, 8px);
    padding: clamp(12px, 3cqi, 16px);
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: clamp(8px, 2cqi, 12px);
  }

  .trash-preview {
    border-left: 3px solid var(--semantic-error);
  }

  .preview-label {
    font-size: clamp(0.75rem, 2cqi, 0.875rem);
    font-weight: 600;
    color: var(--theme-text-dim);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .preview-title {
    font-size: clamp(0.875rem, 2.5cqi, 1rem);
    color: var(--theme-text);
    line-height: 1.4;
  }

  .trash-warning {
    margin: 0;
    font-size: clamp(0.875rem, 2.5cqi, 1rem);
    color: var(--theme-text-dim);
    line-height: 1.5;
  }

  .dialog-footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: clamp(10px, 2.5cqi, 14px);
    padding: clamp(16px, 4cqi, 20px) clamp(20px, 5cqi, 28px);
    border-top: 1px solid var(--theme-stroke);
    background: rgba(0, 0, 0, 0.2);
  }

  .cancel-button,
  .submit-button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: clamp(6px, 1.5cqi, 8px);
    padding: clamp(10px, 2.5cqi, 12px) clamp(16px, 4cqi, 24px);
    border: none;
    border-radius: clamp(8px, 2cqi, 12px);
    font-size: clamp(0.875rem, 2.5cqi, 1rem);
    font-weight: 600;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .cancel-button {
    background: var(--theme-card-bg);
    color: var(--theme-text);
  }

  .cancel-button:hover:not(:disabled) {
    background: var(--theme-card-hover-bg);
    color: var(--theme-text);
  }

  .trash-submit {
    background: linear-gradient(
      135deg,
      var(--semantic-error) 0%,
      #b91c1c 100%
    );
    color: #fff;
    box-shadow: 0 4px 12px
      color-mix(in srgb, var(--semantic-error) 30%, transparent);
  }

  .trash-submit:hover:not(:disabled) {
    background: linear-gradient(
      135deg,
      var(--semantic-error) 0%,
      var(--semantic-error) 100%
    );
    box-shadow: 0 6px 16px
      color-mix(in srgb, var(--semantic-error) 40%, transparent);
    transform: translateY(-1px);
  }

  .submit-button:disabled,
  .cancel-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes slideUp {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
  }

  @media (prefers-reduced-motion: reduce) {
    .trash-dialog-overlay { animation: none; }
    .trash-dialog { animation: none; }
  }
</style>
