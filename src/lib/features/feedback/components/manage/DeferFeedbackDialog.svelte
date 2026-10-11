<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import type { KanbanBoardState } from "../../state/kanban-board-state.svelte";
  import type { FeedbackManageState } from "#lib/shared/feedback/state/feedback-manage-state.svelte.js";

  interface Props {
    boardState: KanbanBoardState;
    manageState: FeedbackManageState;
  }

  let { boardState, manageState }: Props = $props();

  async function handleSubmit() {
    if (!boardState.itemToDefer || !boardState.deferDate) return;

    boardState.setIsSubmittingDefer(true);

    try {
      await manageState.deferFeedback(
        boardState.itemToDefer.id,
        boardState.deferDate,
        boardState.deferNotes
      );
      boardState.resetDeferDialog();
    } catch (err) {
      console.error("Failed to defer feedback:", err);
    } finally {
      boardState.setIsSubmittingDefer(false);
    }
  }

  function handleCancel() {
    boardState.resetDeferDialog();
  }
</script>

<div
  class="defer-dialog-overlay"
  onclick={handleCancel}
  onkeydown={(e) => e.key === "Escape" && handleCancel()}
  role="button"
  tabindex="0"
  aria-label="Close defer dialog"
>
  <div
    class="defer-dialog"
    onclick={(e) => e.stopPropagation()}
    onkeydown={(e) => e.stopPropagation()}
    role="dialog"
    aria-modal="true"
    aria-labelledby="defer-dialog-title"
    tabindex="-1"
  >
    <div class="dialog-header">
      <div class="dialog-icon">
        <i class="fas fa-clock" aria-hidden="true"></i>
      </div>
      <h3 class="dialog-title" id="defer-dialog-title">{t("feedback_defer_title")}</h3>
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
      <div class="feedback-preview">
        <span class="preview-label">{t("feedback_defer_item_label")}</span>
        <span class="preview-title"
          >{boardState.itemToDefer!.title ||
            boardState.itemToDefer!.description.substring(0, 60)}</span
        >
      </div>

      <div class="form-field">
        <label for="defer-date" class="field-label">
          <i class="fas fa-calendar" aria-hidden="true"></i>
          {t("feedback_defer_reactivate_on")}
        </label>
        <input
          id="defer-date"
          type="date"
          class="date-input"
          value={boardState.deferDate}
          onchange={(e) =>
            boardState.setDeferDate(e.currentTarget.value)}
          min={new Date().toISOString().split("T")[0]}
          required
        />
      </div>

      <div class="form-field">
        <label for="defer-notes" class="field-label">
          <i class="fas fa-sticky-note" aria-hidden="true"></i>
          {t("feedback_defer_reason")}
        </label>
        <textarea
          id="defer-notes"
          class="notes-input"
          value={boardState.deferNotes}
          onchange={(e) =>
            boardState.setDeferNotes(e.currentTarget.value)}
          placeholder={t("feedback_defer_placeholder")}
          rows="3"
        ></textarea>
      </div>
    </div>

    <div class="dialog-footer">
      <button
        type="button"
        class="cancel-button"
        onclick={handleCancel}
        disabled={boardState.isSubmittingDefer}
      >
        {t("feedback_cancel")}
      </button>
      <button
        type="button"
        class="submit-button"
        onclick={handleSubmit}
        disabled={!boardState.deferDate || boardState.isSubmittingDefer}
      >
        {#if boardState.isSubmittingDefer}
          <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
          {t("feedback_deferring")}
        {:else}
          <i class="fas fa-clock" aria-hidden="true"></i>
          {t("feedback_defer")}
        {/if}
      </button>
    </div>
  </div>
</div>

<style>
  .defer-dialog-overlay {
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

  .defer-dialog {
    display: flex;
    flex-direction: column;
    width: clamp(320px, 90vw, 500px);
    max-height: 90vh;
    background: linear-gradient(
      180deg,
      var(--theme-panel-elevated-bg) 0%,
      var(--theme-panel-bg) 100%
    );
    border: 1px solid var(--theme-stroke, var(--theme-stroke));
    border-radius: clamp(16px, 4cqi, 24px);
    box-shadow:
      0 20px 60px rgba(0, 0, 0, 0.5),
      inset 0 1px 0 var(--theme-stroke, var(--theme-stroke));
    animation: slideUp var(--duration-emphasis) cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  .dialog-header {
    display: flex;
    align-items: center;
    gap: clamp(12px, 3cqi, 16px);
    padding: clamp(16px, 4cqi, 24px);
    border-bottom: 1px solid var(--theme-stroke);
    background: linear-gradient(
      90deg,
      color-mix(in srgb, var(--semantic-warning) 10%, transparent) 0%,
      transparent 100%
    );
  }

  .dialog-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: clamp(36px, 9cqi, 44px);
    height: clamp(36px, 9cqi, 44px);
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--semantic-warning) 40%, transparent) 0%,
      color-mix(in srgb, var(--semantic-warning) 20%, transparent) 100%
    );
    border-radius: clamp(8px, 2cqi, 12px);
    color: var(--semantic-warning);
    font-size: clamp(16px, 4cqi, 20px);
    box-shadow: 0 4px 12px
      color-mix(in srgb, var(--semantic-warning) 30%, transparent);
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
    color: var(--theme-text-dim, var(--theme-text-dim));
    font-size: clamp(16px, 4cqi, 18px);
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .close-button:hover {
    background: var(--theme-card-hover-bg);
    color: var(--theme-text, var(--theme-text));
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
    border-left: 3px solid var(--semantic-warning);
    border-radius: clamp(8px, 2cqi, 12px);
  }

  .preview-label {
    font-size: clamp(0.75rem, 2cqi, 0.875rem);
    font-weight: 600;
    color: var(--theme-text-dim, var(--theme-text-dim));
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .preview-title {
    font-size: clamp(0.875rem, 2.5cqi, 1rem);
    color: var(--theme-text, var(--theme-text));
    line-height: 1.4;
  }

  .form-field {
    display: flex;
    flex-direction: column;
    gap: clamp(8px, 2cqi, 12px);
  }

  .field-label {
    display: flex;
    align-items: center;
    gap: clamp(8px, 2cqi, 10px);
    font-size: clamp(0.875rem, 2.5cqi, 1rem);
    font-weight: 600;
    color: var(--theme-text);
  }

  .field-label i {
    font-size: clamp(14px, 3.5cqi, 16px);
    color: var(--semantic-warning);
    opacity: 0.8;
  }

  .date-input,
  .notes-input {
    width: 100%;
    padding: clamp(10px, 2.5cqi, 14px) clamp(12px, 3cqi, 16px);
    background: var(--theme-card-bg, var(--theme-card-bg));
    border: 1px solid var(--theme-stroke, var(--theme-stroke));
    border-radius: clamp(8px, 2cqi, 12px);
    color: var(--theme-text);
    font-size: clamp(0.875rem, 2.5cqi, 1rem);
    font-family: inherit;
    transition: all var(--duration-normal) ease;
  }

  .date-input:focus,
  .notes-input:focus {
    outline: none;
    background: var(--theme-card-hover-bg, var(--theme-card-bg));
    border-color: var(--semantic-warning);
    box-shadow: 0 0 0 3px
      color-mix(in srgb, var(--semantic-warning) 15%, transparent);
  }

  .notes-input {
    resize: vertical;
    min-height: 80px;
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

  .submit-button {
    background: linear-gradient(
      135deg,
      var(--semantic-warning) 0%,
      #d97706 100%
    );
    color: rgba(0, 0, 0, 0.9);
    box-shadow: 0 4px 12px
      color-mix(in srgb, var(--semantic-warning) 30%, transparent);
  }

  .submit-button:hover:not(:disabled) {
    background: linear-gradient(
      135deg,
      var(--semantic-warning) 0%,
      var(--semantic-warning) 100%
    );
    box-shadow: 0 6px 16px
      color-mix(in srgb, var(--semantic-warning) 40%, transparent);
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
    .defer-dialog-overlay { animation: none; }
    .defer-dialog { animation: none; }
  }
</style>
