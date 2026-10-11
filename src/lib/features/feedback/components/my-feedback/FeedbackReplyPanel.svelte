<!-- FeedbackReplyPanel - Inline reply form for feedback-needs-info -->
<script lang="ts">
  import type {
    FeedbackItem,
    FeedbackStatus,
  } from "#lib/shared/feedback/domain/models/feedback-models.js";
  import { STATUS_CONFIG } from "#lib/shared/feedback/domain/models/feedback-models.js";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";

  interface Props {
    item: FeedbackItem;
    onSubmit: (reply: string) => Promise<void>;
    isLoading?: boolean;
  }

  let { item, onSubmit, isLoading = false }: Props = $props();

  let reply = $state("");
  let error = $state<string | null>(null);
  let showSuccess = $state(false);

  const statusConfig = $derived(STATUS_CONFIG[item.status as FeedbackStatus]);
  const isValidReply = $derived(reply.trim().length >= 5);
  const hasMinChars = $derived(reply.trim().length >= 5);

  async function handleSubmit() {
    if (!isValidReply || isLoading) return;

    error = null;
    try {
      await onSubmit(reply.trim());
      reply = "";
      showSuccess = true;

      // Hide success message after 3 seconds
      setTimeout(() => {
        showSuccess = false;
      }, 3000);
    } catch (err) {
      error = err instanceof Error ? err.message : t("feedback_reply_failed");
    }
  }

  function handleCancel() {
    reply = "";
    error = null;
  }
</script>

<div class="reply-panel">
  <div class="reply-header">
    <div class="header-icon" style="--status-color: {statusConfig.color}">
      <i class="fas fa-reply" aria-hidden="true"></i>
    </div>
    <div class="header-content">
      <h3>
        {#if (item.status as string) === "feedback-needs-info"}
          {t("feedback_share_more_details")}
        {:else if (item.status as string) === "feedback-response"}
          {t("feedback_admin_response")}
        {/if}
      </h3>
      <p class="header-hint">
        {#if (item.status as string) === "feedback-needs-info"}
          {t("feedback_needs_info_hint")}
        {:else if (item.status as string) === "feedback-response"}
          {t("feedback_response_hint")}
        {/if}
      </p>
    </div>
  </div>

  <div class="reply-form">
    {#if showSuccess}
      <div class="success-message">
        <i class="fas fa-check-circle" aria-hidden="true"></i>
        <span>{t("feedback_reply_sent")}</span>
      </div>
    {/if}

    {#if error}
      <div class="error-message">
        <i class="fas fa-exclamation-circle" aria-hidden="true"></i>
        <span>{error}</span>
      </div>
    {/if}

    <div class="form-group">
      <label for="reply-textarea" class="field-label">{t("feedback_your_reply")}</label>
      <div class="textarea-wrapper">
        <textarea
          id="reply-textarea"
          class="reply-textarea"
          bind:value={reply}
          placeholder={t("feedback_reply_placeholder")}
          rows="4"
          disabled={isLoading}
        ></textarea>
      </div>
      <div class="field-hint">
        <span class="char-count" class:met={hasMinChars}>
          {#if reply.trim().length < 5}
            {t("feedback_chars_needed", { count: 5 - reply.trim().length })}
          {:else}
            <i class="fas fa-check" aria-hidden="true"></i>
          {/if}
        </span>
      </div>
    </div>

    <div class="form-actions">
      <button
        type="button"
        class="cancel-btn"
        onclick={handleCancel}
        disabled={isLoading || reply.length === 0}
      >
        {t("feedback_clear")}
      </button>
      <button
        type="button"
        class="submit-btn"
        onclick={handleSubmit}
        disabled={!isValidReply || isLoading}
      >
        {#if isLoading}
          <i class="fas fa-circle-notch fa-spin" aria-hidden="true"></i>
          <span>{t("feedback_sending")}</span>
        {:else}
          <i class="fas fa-send" aria-hidden="true"></i>
          <span>{t("feedback_send_reply")}</span>
        {/if}
      </button>
    </div>
  </div>
</div>

<style>
  .reply-panel {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 16px;
    background: linear-gradient(
      135deg,
      rgba(59, 130, 246, 0.15) 0%,
      rgba(59, 130, 246, 0.1) 100%
    );
    border: 1.5px solid rgba(59, 130, 246, 0.4);
    border-radius: 12px;
    margin: 20px 0;
  }

  .reply-header {
    display: flex;
    gap: 12px;
  }

  .header-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    background: color-mix(in srgb, var(--status-color) 20%, transparent);
    border-radius: 8px;
    color: var(--status-color);
    font-size: var(--font-size-lg);
    flex-shrink: 0;
  }

  .header-content {
    flex: 1;
    min-width: 0;
  }

  .header-content h3 {
    margin: 0 0 4px 0;
    font-size: 0.9375rem;
    font-weight: 600;
    color: var(--theme-text);
  }

  .header-hint {
    margin: 0;
    font-size: 0.8125rem;
    color: var(--theme-text-dim, var(--theme-text-dim));
    line-height: 1.4;
  }

  .reply-form {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .success-message,
  .error-message {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px;
    border-radius: 8px;
    font-size: 0.8125rem;
    font-weight: 500;
  }

  .success-message {
    background: rgba(16, 185, 129, 0.2);
    border: 1px solid rgba(16, 185, 129, 0.5);
    color: var(--semantic-success);
  }

  .error-message {
    background: rgba(239, 68, 68, 0.2);
    border: 1px solid rgba(239, 68, 68, 0.5);
    color: var(--semantic-error);
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .field-label {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--theme-text-dim, var(--theme-text-dim));
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .textarea-wrapper {
    position: relative;
  }

  .reply-textarea {
    width: 100%;
    padding: 10px 12px;
    background: color-mix(in srgb, var(--theme-panel-bg) 80%, transparent);
    border: 1px solid var(--theme-stroke, var(--theme-stroke));
    border-radius: 8px;
    color: var(--theme-text, var(--theme-text));
    font-family: inherit;
    font-size: 0.9375rem;
    line-height: 1.5;
    resize: vertical;
    transition: all var(--duration-normal) ease;
  }

  .reply-textarea:focus {
    outline: none;
    background: color-mix(in srgb, var(--theme-panel-bg) 90%, transparent);
    border-color: color-mix(
      in srgb,
      var(--theme-accent, var(--semantic-info)) 60%,
      transparent
    );
    box-shadow: 0 0 0 3px
      color-mix(
        in srgb,
        var(--theme-accent, var(--semantic-info)) 10%,
        transparent
      );
  }

  .reply-textarea:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .field-hint {
    display: flex;
    justify-content: flex-end;
  }

  .char-count {
    font-size: 0.75rem;
    color: color-mix(
      in srgb,
      var(--theme-text-dim, var(--theme-text-dim)) 80%,
      transparent
    );
    transition: color var(--duration-normal) ease;
  }

  .char-count.met {
    color: var(--semantic-success, var(--semantic-success));
  }

  .form-actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }

  .cancel-btn,
  .submit-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    border: none;
    border-radius: 6px;
    font-size: 0.8125rem;
    font-weight: 500;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .cancel-btn {
    background: var(--theme-card-bg, var(--theme-card-bg));
    color: var(--theme-text-dim, var(--theme-text-dim));
  }

  .cancel-btn:hover:not(:disabled) {
    background: var(--theme-card-hover-bg);
    color: var(--theme-text);
  }

  .cancel-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .submit-btn {
    background: linear-gradient(135deg, var(--semantic-info) 0%, #2563eb 100%);
    color: white;
  }

  .submit-btn:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
  }

  .submit-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
