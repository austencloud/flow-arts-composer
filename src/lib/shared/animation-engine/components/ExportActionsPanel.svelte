<!--
  ExportActionsPanel.svelte

  2026 Bento Box Design - Save button with inline repetitions control
  Uses WebCodecs for hardware-accelerated MP4 export with precise timing.
  Repetitions control (for circular sequences) is inline, not in a sheet.
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";

  let {
    onExportVideo = () => {},
    onCancelExport = () => {},
    isExporting = false,
    exportProgress = null,
    isCircular = false,
    loopCount = 1,
    onLoopCountChange = () => {},
  }: {
    onExportVideo?: () => void;
    onCancelExport?: () => void;
    isExporting?: boolean;
    exportProgress?: { progress: number; stage: string } | null;
    isCircular?: boolean;
    loopCount?: number;
    onLoopCountChange?: (count: number) => void;
  } = $props();

  function handleSaveClick() {
    if (isExporting) return;
    onExportVideo();
  }

  function handleCancelClick() {
    onCancelExport();
  }

  function handleRepetitionClick(count: number) {
    onLoopCountChange(count);
  }

  // Derive display text based on export state
  const buttonText = $derived(() => {
    if (!isExporting) return t("export_share");
    if (!exportProgress) return t("export_starting");

    const { stage, progress } = exportProgress;
    if (stage === "capturing") {
      return t("export_capturing", { progress: Math.round(progress * 100).toString() });
    } else if (stage === "encoding") {
      return t("export_encoding");
    } else if (stage === "complete") {
      return t("export_complete");
    }
    return t("export_exporting");
  });

  const buttonHint = $derived(() => {
    if (!isExporting) {
      return t("export_mp4_video");
    }
    if (exportProgress?.stage === "complete") return t("export_ready_to_share");
    return t("export_please_wait");
  });

  const repetitionPresets = [1, 2, 4, 8];
</script>

<div class="export-actions-panel">
  <div class="save-button-container">
    <!-- Main save button (or cancel button when exporting) -->
    {#if isExporting && exportProgress?.stage !== "complete"}
      <!-- Cancel button during export -->
      <button
        class="save-btn cancelling"
        onclick={handleCancelClick}
        type="button"
        aria-label={t("export_cancel_export")}
      >
        <i class="fas main-icon fa-times" aria-hidden="true"></i>
        <span class="btn-label">{t("common_cancel")}</span>
        <span class="btn-hint">{t("export_tap_to_stop")}</span>

        {#if exportProgress?.stage === "capturing"}
          <div class="progress-bar">
            <div
              class="progress-fill"
              style="width: {exportProgress.progress * 100}%"
            ></div>
          </div>
        {/if}
      </button>
    {:else}
      <!-- Share button -->
      <button
        class="save-btn"
        class:complete={exportProgress?.stage === "complete"}
        onclick={handleSaveClick}
        type="button"
        aria-label={t("export_share_mp4")}
      >
        <i
          class="fas main-icon"
          class:fa-share={exportProgress?.stage !== "complete"}
          class:fa-check={exportProgress?.stage === "complete"}
          aria-hidden="true"
        ></i>
        <span class="btn-label">{buttonText()}</span>
        <span class="btn-hint">{buttonHint()}</span>
      </button>
    {/if}
  </div>

  <!-- Inline Repetitions Control (only for circular/looping sequences) -->
  {#if isCircular && !isExporting}
    <div class="repetitions-row">
      <div class="repetitions-label">
        <i class="fas fa-redo" aria-hidden="true"></i>
        <span class="label-text">{t("export_repetitions")}</span>
        <span class="label-hint">{t("export_for_video")}</span>
      </div>
      <div class="repetitions-buttons">
        {#each repetitionPresets as count}
          <button
            class="repetition-btn"
            class:active={loopCount === count}
            onclick={() => handleRepetitionClick(count)}
            type="button"
            aria-label={t("export_repetitions_aria", { count: count.toString() })}
          >
            {count}x
          </button>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  /* ===========================
     2026 BENTO BOX DESIGN
     Export Actions Panel
     =========================== */

  .export-actions-panel {
    width: 100%;
  }

  .save-button-container {
    display: flex;
    gap: 8px;
    width: 100%;
  }

  /* Share Button - Primary CTA with filled accent background */
  .save-btn {
    position: relative;
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 0 16px;
    min-height: var(--min-touch-target);
    flex: 1;
    border-radius: 12px;
    color: white;
    cursor: pointer;
    transition: all var(--duration-normal) cubic-bezier(0.4, 0, 0.2, 1);
    -webkit-tap-highlight-color: transparent;
    overflow: hidden;
    background: var(--theme-accent);
    border: 1.5px solid var(--theme-accent);
  }

  .save-btn .main-icon {
    font-size: var(--font-size-lg);
    color: white;
    transition: transform var(--duration-normal) ease;
  }

  .btn-label {
    font-size: var(--font-size-min, 14px);
    font-weight: 700;
    color: white;
    letter-spacing: 0.3px;
  }

  .btn-hint {
    font-size: var(--font-size-compact, 12px);
    font-weight: 500;
    color: var(--theme-text);
  }

  @media (hover: hover) and (pointer: fine) {
    .save-btn:hover:not(:disabled) {
      filter: brightness(1.1);
      transform: translateY(-2px);
    }

    .save-btn:hover .main-icon {
      transform: scale(1.08);
    }
  }

  .save-btn:active:not(:disabled) {
    transform: scale(0.98);
  }

  .save-btn:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }

  .save-btn.cancelling {
    background: var(--theme-card-bg);
    border-color: var(--semantic-error, rgba(239, 68, 68, 0.35));
  }

  .save-btn.cancelling .main-icon {
    color: var(--semantic-error, rgba(239, 68, 68, 1));
  }

  @media (hover: hover) and (pointer: fine) {
    .save-btn.cancelling:hover {
      background: var(--theme-card-hover-bg);
      border-color: var(--semantic-error, rgba(239, 68, 68, 0.5));
      transform: translateY(-2px);
    }
  }

  .save-btn.complete {
    background: var(--theme-card-bg);
    border-color: var(--semantic-success, rgba(34, 197, 94, 0.5));
  }

  .save-btn.complete .main-icon {
    color: var(--semantic-success, rgba(34, 197, 94, 1));
  }

  .progress-bar {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 4px;
    background: var(--theme-card-bg);
    border-radius: 0 0 14px 14px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: var(--theme-accent, rgba(139, 92, 246, 1));
    transition: width var(--duration-emphasis) ease;
  }


  .repetitions-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-top: 12px;
    padding: 10px 14px;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 10px;
  }

  .repetitions-label {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 12px);
  }

  .repetitions-label i {
    font-size: var(--font-size-sm);
    color: var(--theme-accent);
  }

  .label-text {
    font-weight: 600;
    color: var(--theme-text);
  }

  .label-hint {
    font-weight: 400;
    opacity: 0.7;
  }

  .repetitions-buttons {
    display: flex;
    gap: 6px;
  }

  .repetition-btn {
    min-width: 40px;
    min-height: 36px;
    padding: 6px 10px;
    background: transparent;
    border: 1.5px solid var(--theme-stroke);
    border-radius: 8px;
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    cursor: pointer;
    transition: all var(--duration-fast) ease;
    -webkit-tap-highlight-color: transparent;
  }

  @media (hover: hover) and (pointer: fine) {
    .repetition-btn:hover {
      background: var(--theme-card-hover-bg);
      border-color: var(--theme-stroke-strong);
      color: var(--theme-text);
    }
  }

  .repetition-btn:active {
    transform: scale(0.95);
  }

  .repetition-btn.active {
    background: var(--theme-accent);
    border-color: var(--theme-accent);
    color: white;
  }


  @media (max-width: 360px) {
    .save-btn {
      padding: 0 12px;
      gap: 8px;
    }

    .save-btn .main-icon {
      font-size: var(--font-size-base);
    }

    .btn-label {
      font-size: var(--font-size-compact, 12px);
    }

    .btn-hint {
      display: none; /* Hide hint on very small screens */
    }

    .repetitions-row {
      flex-direction: column;
      align-items: stretch;
      gap: 8px;
    }

    .repetitions-label {
      justify-content: center;
    }

    .repetitions-buttons {
      justify-content: center;
    }

    .repetition-btn {
      min-width: 44px;
      padding: 8px 12px;
    }
  }


  @media (prefers-reduced-motion: reduce) {
    .save-btn,
    .save-btn .main-icon,
    .repetition-btn {
      transition: none;
    }

    .save-btn:hover,
    .save-btn:active,
    .repetition-btn:active {
      transform: none;
    }
  }
</style>
