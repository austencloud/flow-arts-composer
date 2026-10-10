<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import type { FeedbackUploadProgress } from "#lib/shared/feedback/domain/models/feedback-models.js";

  const { isSubmitting, disabled, uploadProgress = null } = $props<{
    isSubmitting: boolean;
    disabled: boolean;
    uploadProgress?: FeedbackUploadProgress | null;
  }>();

  const isUploading = $derived(
    isSubmitting && uploadProgress?.phase === "uploading"
  );

  const percentText = $derived.by(() => {
    if (!isUploading || !uploadProgress) return "";
    return `${Math.round(uploadProgress.fraction * 100)}%`;
  });

  const submitLabel = $derived.by(() => {
    if (!isSubmitting) return t("feedback_submit_button");
    if (isUploading) return t("feedback_uploading_images_pct", { pct: percentText });
    return t("feedback_submitting");
  });

  const progressPercent = $derived(
    isUploading && uploadProgress ? uploadProgress.fraction * 100 : 0
  );
</script>

<div class="form-footer">
  <button
    type="submit"
    class="submit-btn"
    class:uploading={isUploading}
    {disabled}
    aria-busy={isSubmitting}
    style:--progress="{progressPercent}%"
  >
    <!-- Progress fill layer - sits behind button content, fills left-to-right -->
    {#if isUploading}
      <div class="progress-fill" aria-hidden="true"></div>
    {/if}

    <span class="btn-content">
      {#if isSubmitting}
        <i class="fas fa-circle-notch fa-spin" aria-hidden="true"></i>
        <span>{submitLabel}</span>
      {:else}
        <i class="fas fa-paper-plane" aria-hidden="true"></i>
        <span>{submitLabel}</span>
      {/if}
    </span>
  </button>
</div>

<style>
  .form-footer {
    display: flex;
    justify-content: flex-end;
    padding-top: clamp(4px, 1cqi, 8px);
  }

  .submit-btn {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: clamp(8px, 2cqi, 12px);
    min-height: var(--min-touch-target);
    padding: clamp(10px, 2.5cqi, 14px) clamp(18px, 4cqi, 28px);
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--active-type-color) 100%, white 15%) 0%,
      var(--active-type-color) 50%,
      color-mix(in srgb, var(--active-type-color) 100%, black 10%) 100%
    );
    border: none;
    border-radius: clamp(8px, 2cqi, 12px);
    color: white;
    font-size: clamp(0.875rem, 2.5cqi, 1rem);
    font-weight: 700;
    letter-spacing: 0.01em;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
    overflow: hidden;
  }

  /* During upload, dim the base background so the progress fill is visible */
  .submit-btn.uploading {
    background: color-mix(in srgb, var(--active-type-color) 40%, black);
  }

  /* Progress fill - a bright layer that scales from 0% to 100% width */
  .progress-fill {
    position: absolute;
    inset: 0;
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--active-type-color) 100%, white 15%) 0%,
      var(--active-type-color) 50%,
      color-mix(in srgb, var(--active-type-color) 100%, black 10%) 100%
    );
    transform-origin: left center;
    transform: scaleX(calc(var(--progress) / 100));
    /* Smooth out the jumps between progress events */
    transition: transform 200ms ease-out;
    border-radius: inherit;
  }

  /* Button content sits above the progress fill */
  .btn-content {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
    gap: clamp(8px, 2cqi, 12px);
  }

  .submit-btn:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px
      color-mix(in srgb, var(--active-type-color) 35%, rgba(0, 0, 0, 0.25));
  }

  .submit-btn:active:not(:disabled) {
    transform: translateY(0);
  }

  .submit-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
    transform: none;
    filter: grayscale(20%);
  }

  .submit-btn:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  .submit-btn i {
    font-size: clamp(0.9em, 2cqi, 1.1em);
  }

  @container feedback-form (max-width: 420px) {
    .form-footer {
      justify-content: stretch;
    }
    .submit-btn {
      width: 100%;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .progress-fill {
      transition: none;
    }

    .submit-btn {
      transition: none;
    }
  }
</style>
