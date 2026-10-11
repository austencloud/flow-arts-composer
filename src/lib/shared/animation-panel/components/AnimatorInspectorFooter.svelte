<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import type { VideoExportProgress } from "#lib/shared/compose/domain/video-export-types.js";

  let {
    onAction,
    label,
    icon = "fa-download",
    busy = false,
    disabled = false,
    ready = true,
    pendingLabel = t("animation_export_preparing"),
    meta = "",
    showProgress = false,
    progress = null,
    onCancel,
    testId,
    concealed = false,
  }: {
    onAction: () => void;
    label: string;
    icon?: string;
    busy?: boolean;
    disabled?: boolean;
    ready?: boolean;
    pendingLabel?: string;
    meta?: string;
    showProgress?: boolean;
    progress?: VideoExportProgress | null;
    onCancel?: () => void;
    testId?: string;
    concealed?: boolean;
  } = $props();
</script>

<div
  class="panel-footer"
  class:concealed
  inert={concealed}
  aria-hidden={concealed}
>
  {#if busy && showProgress}
    <div class="export-progress-row" role="status" aria-live="polite">
      <div class="progress-info">
        <span class="progress-stage">
          {#if !progress}{t("animation_export_starting")}{:else}{t("export_exporting")}{/if}
        </span>
        <span class="progress-pct"
          >{progress ? Math.round(progress.progress * 100) : 0}%</span
        >
      </div>
      <div
        class="progress-bar"
        role="progressbar"
        aria-valuenow={progress ? Math.round(progress.progress * 100) : 0}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={t("viewer_ui_export_progress")}
      >
        <div
          class="progress-fill"
          style:width={`${progress ? progress.progress * 100 : 0}%`}
        ></div>
      </div>
      {#if onCancel}
        <button
          type="button"
          class="cancel-btn"
          onclick={onCancel}
          aria-label={t("export_cancel_export")}
        >
          <i class="fas fa-times" aria-hidden="true"></i>
          {t("viewer_detail_cancel")}
        </button>
      {/if}
    </div>
  {:else}
    <div class="export-row">
      <button
        type="button"
        class="export-btn"
        onclick={onAction}
        {disabled}
        aria-label={label}
        data-testid={testId}
      >
        {#if !ready}
          <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
          {pendingLabel}
        {:else}
          <i class="fas {busy ? 'fa-spinner fa-spin' : icon}" aria-hidden="true"
          ></i>
          {label}
        {/if}
      </button>
      <!-- Both Animator modes keep the same footer allocation. A missing
           estimate is visually empty, but it must not give Tunnel a shorter
           footer and make the Effects viewport jump on every mode switch. -->
      <span
        class="time-estimate"
        class:empty={!meta || disabled}
        aria-hidden={!meta || disabled}
        >{meta && !disabled ? meta : "\u00a0"}</span
      >
    </div>
  {/if}
</div>

<style>
  .concealed {
    visibility: hidden;
  }
  .panel-footer {
    padding: 12px 16px 16px;
    flex-shrink: 0;
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.06));
  }

  .export-row,
  .export-progress-row {
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .export-row {
    gap: 6px;
  }

  .export-progress-row {
    gap: 10px;
    width: 100%;
  }

  .time-estimate,
  .progress-stage {
    font-size: var(--font-size-compact, 12px);
    font-weight: 500;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.75));
  }

  .time-estimate.empty {
    visibility: hidden;
  }

  .export-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    min-height: var(--min-touch-target);
    padding: 12px 24px;
    border: none;
    border-radius: 12px;
    background: var(--theme-accent, #6366f1);
    color: white;
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    cursor: pointer;
    transition:
      filter 0.15s ease,
      box-shadow 0.15s ease,
      transform 0.15s ease;
  }

  .export-btn:hover:not(:disabled) {
    filter: brightness(1.1);
    box-shadow: 0 4px 12px
      color-mix(in srgb, var(--theme-accent, #6366f1) 40%, transparent);
  }

  .export-btn:active:not(:disabled) {
    transform: scale(0.98);
    transition-duration: 50ms;
  }

  .export-btn:disabled,
  .cancel-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .progress-info {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
  }

  .progress-pct {
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    color: var(--theme-text, white);
  }

  .progress-bar {
    width: 100%;
    height: 6px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border-radius: 3px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: var(--theme-accent, #6366f1);
    border-radius: 3px;
    transition: width 0.2s ease;
  }

  .cancel-btn {
    align-self: center;
    border: 0;
    background: transparent;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.75));
    cursor: pointer;
  }

  @media (prefers-reduced-motion: reduce) {
    .export-btn,
    .progress-fill {
      transition: none;
    }
  }
</style>
