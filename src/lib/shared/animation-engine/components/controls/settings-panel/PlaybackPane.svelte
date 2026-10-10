<!--
  PlaybackPane.svelte

  Playback settings:
  - Style toggle (Flow/Step)
  - Step size selector (Beat/Half) - shown in step mode
  - BPM control with tap tempo and presets
-->
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import { onDestroy } from "svelte";
  import type {
    PlaybackMode,
    StepPlaybackStepSize,
  } from "$lib/shared/animation-engine/state/animation-panel-state.svelte";
  import BpmChips from "$lib/shared/animation-engine/components/controls/BpmChips.svelte";

  let {
    bpm = $bindable(60),
    playbackMode = "continuous",
    stepPlaybackStepSize = 1,
    isPlaying = false,
    onBpmChange = () => {},
    onPlaybackModeChange = () => {},
    onStepPlaybackStepSizeChange = () => {},
    onPlaybackToggle = () => {},
  }: {
    bpm: number;
    playbackMode?: PlaybackMode;
    stepPlaybackStepSize?: StepPlaybackStepSize;
    isPlaying?: boolean;
    onBpmChange?: (bpm: number) => void;
    onPlaybackModeChange?: (mode: PlaybackMode) => void;
    onStepPlaybackStepSizeChange?: (stepSize: StepPlaybackStepSize) => void;
    onPlaybackToggle?: () => void;
  } = $props();

  let nextTickTimer: ReturnType<typeof setTimeout> | null = null;

  function handleModeChange(mode: PlaybackMode) {
    if (mode === playbackMode) return;
    const wasPlaying = isPlaying;
    if (wasPlaying) onPlaybackToggle();
    onPlaybackModeChange(mode);
    if (wasPlaying) {
      if (nextTickTimer !== null) clearTimeout(nextTickTimer);
      nextTickTimer = setTimeout(() => {
        onPlaybackToggle();
        nextTickTimer = null;
      }, 0);
    }
  }

  onDestroy(() => {
    if (nextTickTimer !== null) clearTimeout(nextTickTimer);
  });
</script>

<div class="playback-pane">
  <!-- Style Toggle: Flow / Step -->
  <div class="style-toggle">
    <button
      class="style-btn"
      class:active={playbackMode === "continuous"}
      onclick={() => handleModeChange("continuous")}
      type="button"
      aria-label={t("playback_audit_continuous_mode")}
      aria-pressed={playbackMode === "continuous"}
    >
      <i class="fas fa-infinity" aria-hidden="true"></i>
      <span>{t("playback_audit_flow")}</span>
    </button>
    <button
      class="style-btn"
      class:active={playbackMode === "step"}
      onclick={() => handleModeChange("step")}
      type="button"
      aria-label={t("playback_audit_step_mode")}
      aria-pressed={playbackMode === "step"}
    >
      <i class="fas fa-shoe-prints" aria-hidden="true"></i>
      <span>{t("playback_audit_step")}</span>
    </button>
  </div>

  <!-- Step Size (only in step mode) -->
  {#if playbackMode === "step"}
    <div class="step-size-row">
      <span class="step-label">{t("compose_ui_step_size")}</span>
      <div class="step-chips">
        <button
          class="step-chip"
          class:active={stepPlaybackStepSize === 1}
          onclick={() => onStepPlaybackStepSizeChange(1)}
          type="button"
          aria-label={t("compose_ui_step_by_full_steps")}
          aria-pressed={stepPlaybackStepSize === 1}
        >
          {t("playback_audit_step")}
        </button>
        <button
          class="step-chip"
          class:active={stepPlaybackStepSize === 0.5}
          onclick={() => onStepPlaybackStepSizeChange(0.5)}
          type="button"
          aria-label={t("compose_ui_step_by_half_steps")}
          aria-pressed={stepPlaybackStepSize === 0.5}
        >
          {t("playback_audit_half")}
        </button>
      </div>
    </div>
  {/if}

  <!-- BPM Control -->
  <BpmChips bind:bpm variant="full" {onBpmChange} />
</div>

<style>
  .playback-pane {
    display: flex;
    flex-direction: column;
    gap: 10px;
    animation: fadeSlideIn var(--duration-dramatic) cubic-bezier(0.4, 0, 0.2, 1);
  }

  @keyframes fadeSlideIn {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* Style Toggle: Flow / Step */
  .style-toggle {
    display: flex;
    gap: 8px;
  }

  .style-btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: var(--min-touch-target);
    padding: 12px 16px;
    background: var(--theme-card-bg);
    border: 1.5px solid var(--theme-stroke);
    border-radius: 12px;
    color: var(--theme-text-dim);
    font-size: var(--font-size-sm);
    font-weight: 600;
    cursor: pointer;
    transition: all var(--duration-normal) cubic-bezier(0.4, 0, 0.2, 1);
  }

  .style-btn i {
    font-size: var(--font-size-sm);
  }

  .style-btn.active {
    background: var(--theme-accent);
    border-color: var(--theme-accent);
    color: white;
  }

  @media (hover: hover) and (pointer: fine) {
    .style-btn:hover:not(.active) {
      background: var(--theme-card-hover-bg);
      border-color: var(--theme-stroke-strong);
      color: var(--theme-text);
    }
  }

  /* Step Size Row */
  .step-size-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 12px;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 10px;
    animation: fadeSlideIn var(--duration-emphasis) ease;
  }

  .step-label {
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    color: var(--theme-text-dim);
    white-space: nowrap;
  }

  .step-chips {
    display: flex;
    gap: 6px;
    flex: 1;
  }

  .step-chip {
    flex: 1;
    min-height: 40px;
    padding: 8px 12px;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 8px;
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .step-chip.active {
    background: var(--theme-accent);
    border-color: var(--theme-accent);
    color: white;
  }

  @media (prefers-reduced-motion: reduce) {
    .playback-pane,
    .step-size-row {
      animation: none;
    }
  }
</style>
