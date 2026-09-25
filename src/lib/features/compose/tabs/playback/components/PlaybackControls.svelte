<!--
  PlaybackControls.svelte

  Bottom control bar with play/pause, stop, speed, and loop controls.
-->
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import type {
    PlaybackMode,
    StepPlaybackStepSize,
  } from "$lib/shared/animation-engine/state/animation-panel-state.svelte";

  let {
    isPlaying,
    speed,
    shouldLoop,
    playbackMode,
    stepPlaybackStepSize,
    stepPlaybackPauseMs,
    onPlay,
    onPause,
    onStop,
    onSpeedChange,
    onLoopToggle,
    onPlaybackModeChange,
    onStepPlaybackStepSizeChange,
    onStepPlaybackPauseMsChange,
  }: {
    isPlaying: boolean;
    speed: number;
    shouldLoop: boolean;
    playbackMode: PlaybackMode;
    stepPlaybackStepSize: StepPlaybackStepSize;
    stepPlaybackPauseMs: number;
    onPlay: () => void;
    onPause: () => void;
    onStop: () => void;
    onSpeedChange: (speed: number) => void;
    onLoopToggle: (loop: boolean) => void;
    onPlaybackModeChange: (mode: PlaybackMode) => void;
    onStepPlaybackStepSizeChange: (stepSize: StepPlaybackStepSize) => void;
    onStepPlaybackPauseMsChange: (pauseMs: number) => void;
  } = $props();

  // Speed presets
  const speedPresets = [0.25, 0.5, 0.75, 1.0, 1.5, 2.0, 3.0];

  function handlePlayPause() {
    if (isPlaying) {
      onPause();
    } else {
      onPlay();
    }
  }

  function handleSpeedClick(preset: number) {
    onSpeedChange(preset);
  }

  function handleLoopClick() {
    onLoopToggle(!shouldLoop);
  }

  function toggleStepMode() {
    onPlaybackModeChange(playbackMode === "step" ? "continuous" : "step");
  }
</script>

<div class="playback-controls">
  <!-- Left: Transport controls -->
  <div class="controls-left">
    <button
      class="control-btn play-pause-btn"
      onclick={handlePlayPause}
      aria-label={isPlaying ? "Pause" : "Play"}
    >
      <i class="fas fa-{isPlaying ? 'pause' : 'play'}" aria-hidden="true"></i>
    </button>

    <button
      class="control-btn stop-btn"
      onclick={onStop}
      aria-label={t("compose_ui_stop")}
    >
      <i class="fas fa-stop" aria-hidden="true"></i>
    </button>
  </div>

  <!-- Center: Speed controls -->
  <div class="controls-center">
    <span class="speed-label">{t("compose_ui_speed")}</span>
    <div class="speed-presets">
      {#each speedPresets as preset}
        <button
          class="speed-btn"
          class:active={Math.abs(speed - preset) < 0.01}
          onclick={() => handleSpeedClick(preset)}
          aria-label="Speed {preset}x"
        >
          {preset}x
        </button>
      {/each}
    </div>
  </div>

  <!-- Right: Loop toggle -->
  <div class="controls-right">
    <button
      class="control-btn mode-btn"
      class:active={playbackMode === "step"}
      onclick={toggleStepMode}
      disabled={isPlaying}
      aria-label={playbackMode === "step"
        ? "Disable step mode"
        : "Enable step mode"}
      title={isPlaying ? "Pause playback to change mode" : "Toggle step mode"}
    >
      <i class="fas fa-shoe-prints" aria-hidden="true"></i>
      <span class="mode-label">Step</span>
    </button>

    <div
      class="step-settings"
      class:disabled={playbackMode !== "step" || isPlaying}
    >
      <span class="step-size-label">Size:</span>
      <div class="step-size">
        <button
          class="mini-btn"
          class:active={stepPlaybackStepSize === 1}
          onclick={() => onStepPlaybackStepSizeChange(1)}
          disabled={playbackMode !== "step" || isPlaying}
          aria-label={t("compose_ui_step_by_full_steps")}
        >
          Beat
        </button>
        <button
          class="mini-btn"
          class:active={stepPlaybackStepSize === 0.5}
          onclick={() => onStepPlaybackStepSizeChange(0.5)}
          disabled={playbackMode !== "step" || isPlaying}
          aria-label={t("compose_ui_step_by_half_steps")}
        >
          Half
        </button>
      </div>
    </div>

    <button
      class="control-btn loop-btn"
      class:active={shouldLoop}
      onclick={handleLoopClick}
      aria-label={shouldLoop ? "Disable loop" : "Enable loop"}
    >
      <i class="fas fa-repeat" aria-hidden="true"></i>
      <span class="loop-label">{t("compose_ui_loop")}</span>
    </button>
  </div>
</div>

<style>
  .playback-controls {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1.5rem;
    padding: 1rem 1.25rem;
    background: var(--theme-panel-bg);
    border-top: 1px solid var(--theme-stroke);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    position: sticky;
    bottom: 0;
    z-index: 20;
  }

  .controls-left,
  .controls-center,
  .controls-right {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .controls-center {
    flex: 1;
    justify-content: center;
    flex-wrap: wrap;
  }

  .control-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    min-width: var(--min-touch-target);
    height: var(--min-touch-target);
    padding: 0 1rem;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 12px;
    color: var(--theme-text); /* WCAG AAA */
    font-size: 1rem;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .control-btn:hover {
    background: color-mix(in srgb, var(--theme-text, #ffffff) 10%, transparent);
    border-color: var(--theme-stroke-strong);
    color: var(--theme-text);
  }

  .control-btn:active {
    transform: scale(0.95);
  }

  .play-pause-btn {
    background: color-mix(
      in srgb,
      var(--theme-accent, #8b5cf6) 20%,
      transparent
    );
    border-color: color-mix(
      in srgb,
      var(--theme-accent, #8b5cf6) 30%,
      transparent
    );
    color: var(--theme-accent, #a78bfa);
    font-size: 1.1rem;
  }

  .play-pause-btn:hover {
    background: color-mix(
      in srgb,
      var(--theme-accent, #8b5cf6) 30%,
      transparent
    );
    border-color: color-mix(
      in srgb,
      var(--theme-accent, #8b5cf6) 50%,
      transparent
    );
    color: var(--theme-accent, #c4b5fd);
  }

  .loop-btn.active {
    background: color-mix(
      in srgb,
      var(--feature-view, #06b6d4) 20%,
      transparent
    );
    border-color: color-mix(
      in srgb,
      var(--feature-view, #06b6d4) 40%,
      transparent
    );
    color: var(--feature-view, #22d3ee);
  }

  .mode-btn.active {
    background: color-mix(
      in srgb,
      var(--semantic-warning-text, #fbbf24) 16%,
      transparent
    );
    border-color: color-mix(
      in srgb,
      var(--semantic-warning-text, #fbbf24) 35%,
      transparent
    );
    color: var(--semantic-warning-text-vivid, #fcd34d);
  }

  .mode-label {
    font-size: 0.85rem;
    font-weight: 500;
  }

  .step-settings {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.35rem 0.75rem;
    background: color-mix(in srgb, var(--theme-text, #ffffff) 3%, transparent);
    border: 1px solid var(--theme-stroke);
    border-radius: 12px;
  }

  .step-settings.disabled {
    opacity: 0.45; /* WCAG AAA */
  }

  .step-size-label {
    font-size: 0.8rem;
    font-weight: 500;
    color: var(--theme-text-dim);
  }

  .step-size {
    display: flex;
    gap: 0.35rem;
  }

  .mini-btn {
    height: var(--min-touch-target);
    padding: 0 0.65rem;
    background: color-mix(in srgb, var(--theme-text, #ffffff) 4%, transparent);
    border: 1px solid var(--theme-stroke);
    border-radius: 10px;
    color: var(--theme-text-dim); /* WCAG AAA */
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .mini-btn:hover:enabled {
    background: color-mix(in srgb, var(--theme-text, #ffffff) 8%, transparent);
    border-color: var(--theme-stroke-strong);
    color: var(--theme-text);
  }

  .mini-btn.active {
    background: color-mix(
      in srgb,
      var(--semantic-warning-text, #fbbf24) 14%,
      transparent
    );
    border-color: color-mix(
      in srgb,
      var(--semantic-warning-text, #fbbf24) 35%,
      transparent
    );
    color: var(--semantic-warning-text-vivid, #fcd34d);
  }

  .speed-label {
    font-size: 0.8rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--theme-text-dim);
    margin-right: 0.5rem;
  }

  .speed-presets {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .speed-btn {
    min-width: var(--min-touch-target);
    min-height: var(--min-touch-target); /* WCAG AAA touch target */
    padding: 0 0.75rem;
    background: color-mix(in srgb, var(--theme-text, #ffffff) 4%, transparent);
    border: 1px solid var(--theme-stroke);
    border-radius: 8px;
    color: var(--theme-text-dim); /* WCAG AAA */
    font-size: 0.8rem;
    font-weight: 500;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .speed-btn:hover {
    background: color-mix(in srgb, var(--theme-text, #ffffff) 8%, transparent);
    border-color: var(--theme-stroke-strong);
    color: var(--theme-text);
  }

  .speed-btn.active {
    background: color-mix(
      in srgb,
      var(--theme-accent, #8b5cf6) 20%,
      transparent
    );
    border-color: color-mix(
      in srgb,
      var(--theme-accent, #8b5cf6) 40%,
      transparent
    );
    color: var(--theme-accent, #a78bfa);
    font-weight: 600;
  }

  .speed-btn:active {
    transform: scale(0.95);
  }

  .loop-label {
    font-size: 0.85rem;
    font-weight: 500;
  }

  /* Mobile - compact layout */
  @media (max-width: 768px) {
    .playback-controls {
      padding: 0.75rem 1rem;
      gap: 1rem;
    }

    .step-settings {
      padding: 0.3rem 0.5rem;
      gap: 0.4rem;
    }

    .mini-btn {
      height: var(--min-touch-target);
    }

    .speed-label {
      display: none;
    }

    .speed-presets {
      gap: 0.4rem;
    }

    .speed-btn {
      /* Touch target remains 48px for WCAG AAA; 12px supplementary-text floor */
      font-size: var(--font-size-compact);
    }

    .loop-label {
      display: none;
    }

    .control-btn {
      /* Touch target remains 48px for WCAG AAA */
      padding: 0 0.75rem;
    }
  }

  /* Extra small mobile - minimal layout */
  @media (max-width: 480px) {
    .playback-controls {
      flex-wrap: wrap;
      gap: 0.75rem;
    }

    .controls-center {
      order: 3;
      width: 100%;
      justify-content: flex-start;
      padding-top: 0.5rem;
      border-top: 1px solid var(--theme-stroke);
    }

    .speed-btn {
      /* Touch target remains 48px for WCAG AAA; 12px supplementary-text floor */
      font-size: var(--font-size-compact);
    }
  }

  /* Safe area for mobile */
  @supports (padding-bottom: env(safe-area-inset-bottom)) {
    .playback-controls {
      padding-bottom: calc(0.75rem + env(safe-area-inset-bottom));
    }
  }
</style>
