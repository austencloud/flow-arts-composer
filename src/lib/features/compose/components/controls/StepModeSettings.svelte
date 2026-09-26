<!--
  StepModeSettings.svelte

  Inline settings row for step playback mode.
  Shows step size toggle (Beat/Half).
  Only rendered when playbackMode === "step".
-->
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import type { StepPlaybackStepSize } from "$lib/shared/animation-engine/state/animation-panel-state.svelte";

  let {
    stepPlaybackStepSize = 1,
    stepPlaybackPauseMs = 0,
    isPlaying = false,
    onStepPlaybackStepSizeChange = () => {},
    onStepPlaybackPauseMsChange = () => {},
  }: {
    stepPlaybackStepSize?: StepPlaybackStepSize;
    stepPlaybackPauseMs?: number;
    isPlaying?: boolean;
    onStepPlaybackStepSizeChange?: (stepSize: StepPlaybackStepSize) => void;
    onStepPlaybackPauseMsChange?: (pauseMs: number) => void;
  } = $props();
</script>

<div class="step-settings-row">
  <span class="step-label">Step size:</span>
  <div
    class="step-size-group"
    role="group"
    aria-label={t("compose_ui_step_size")}
  >
    <button
      class="step-chip"
      class:active={stepPlaybackStepSize === 1}
      onclick={() => onStepPlaybackStepSizeChange(1)}
      type="button"
      aria-pressed={stepPlaybackStepSize === 1}
      aria-label={t("compose_ui_step_by_full_steps")}
    >
      Beat
    </button>
    <button
      class="step-chip"
      class:active={stepPlaybackStepSize === 0.5}
      onclick={() => onStepPlaybackStepSizeChange(0.5)}
      type="button"
      aria-pressed={stepPlaybackStepSize === 0.5}
      aria-label={t("compose_ui_step_by_half_steps")}
    >
      Half
    </button>
  </div>
</div>

<style>
  .step-settings-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    background: var(--theme-card-bg);
    border: 1.5px solid color-mix(in srgb, var(--theme-accent) 15%, transparent);
    border-radius: 12px;
  }

  .step-label {
    font-size: var(--font-size-compact, 12px);
    font-weight: 500;
    color: var(--theme-text-dim, var(--theme-text-dim));
  }

  .step-size-group {
    display: flex;
    gap: 4px;
  }

  .step-chip {
    min-height: 36px;
    padding: 6px 14px;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke, var(--theme-stroke));
    border-radius: 8px;
    color: var(--theme-text-dim, var(--theme-text-dim));
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    cursor: pointer;
    transition: all var(--duration-normal) cubic-bezier(0.4, 0, 0.2, 1);
    -webkit-tap-highlight-color: transparent;
    white-space: nowrap;
  }

  .step-chip.active {
    background: color-mix(in srgb, var(--theme-accent) 15%, transparent);
    border-color: color-mix(in srgb, var(--theme-accent) 35%, transparent);
    color: var(--theme-accent);
  }

  @media (hover: hover) and (pointer: fine) {
    .step-chip:hover:not(.active) {
      background: var(--theme-card-hover-bg);
      border-color: var(--theme-stroke-strong);
      color: var(--theme-text, var(--theme-text));
    }
  }

  .step-chip:active {
    transform: scale(0.95);
  }

  .step-chip:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    .step-chip {
      transition: none;
    }
  }

  /* Responsive */
  @media (max-width: 480px) {
    .step-settings-row {
      padding: 6px 10px;
      gap: 8px;
    }

    .step-chip {
      min-height: 32px;
      padding: 4px 12px;
      font-size: var(--font-size-compact, 12px);
    }
  }
</style>
