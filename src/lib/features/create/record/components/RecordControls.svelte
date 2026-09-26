<!--
RecordControls.svelte

Playback controls for the Record tab.
Provides play/pause, speed adjustment (BPM), reset, and metronome toggle.
-->
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  // Props
  const {
    isPlaying = false,
    bpm = 60,
    minBpm = 30,
    maxBpm = 180,
    isMetronomeEnabled = true,
    onPlayPause,
    onSpeedChange,
    onReset,
    onMetronomeToggle,
  }: {
    isPlaying?: boolean;
    bpm?: number;
    minBpm?: number;
    maxBpm?: number;
    isMetronomeEnabled?: boolean;
    onPlayPause: () => void;
    onSpeedChange: (bpm: number) => void;
    onReset: () => void;
    onMetronomeToggle: (enabled: boolean) => void;
  } = $props();

  // Local state for slider interaction - initialized with default, $effect syncs from prop
  let localBpm = $state(120);

  // Sync local BPM with prop changes
  $effect(() => {
    localBpm = bpm;
  });

  function handleBpmChange(event: Event) {
    const target = event.target as HTMLInputElement;
    const newBpm = parseInt(target.value, 10);
    localBpm = newBpm;
    onSpeedChange(newBpm);
  }

  function incrementBpm(delta: number) {
    const newBpm = Math.max(minBpm, Math.min(maxBpm, localBpm + delta));
    localBpm = newBpm;
    onSpeedChange(newBpm);
  }
</script>

<div class="record-controls">
  <!-- Main playback controls -->
  <div class="main-controls">
    <button
      class="control-button play-pause-button"
      class:playing={isPlaying}
      onclick={onPlayPause}
      title={isPlaying ? "Pause" : "Play"}
      aria-label={isPlaying ? "Pause playback" : "Start playback"}
      aria-pressed={isPlaying}
    >
      {#if isPlaying}
        <span class="icon">⏸️</span>
      {:else}
        <span class="icon">▶️</span>
      {/if}
      <span class="label">{isPlaying ? "Pause" : "Play"}</span>
    </button>

    <button
      class="control-button reset-button"
      onclick={onReset}
      title={t("create_ui_reset_to_beginning")}
      aria-label={t("create_ui_reset_to_beginning")}
    >
      <span class="icon">⏮️</span>
      <span class="label">{t("create_ui_reset")}</span>
    </button>
  </div>

  <!-- Speed control -->
  <div class="speed-control">
    <div class="speed-label">
      <span class="label-text">Speed (BPM)</span>
      <div class="speed-display">{localBpm}</div>
    </div>

    <div class="speed-slider-container">
      <button
        class="bpm-adjust-button"
        onclick={() => incrementBpm(-10)}
        title={t("create_ui_decrease_by_10_bpm")}
        aria-label={t("create_ui_decrease_speed_by_10_bpm")}
      >
        <span aria-hidden="true">−</span>
      </button>

      <input
        type="range"
        class="speed-slider"
        min={minBpm}
        max={maxBpm}
        value={localBpm}
        oninput={handleBpmChange}
        step="5"
        aria-label={t("create_ui_playback_speed_in_bpm")}
        aria-valuemin={minBpm}
        aria-valuemax={maxBpm}
        aria-valuenow={localBpm}
      />

      <button
        class="bpm-adjust-button"
        onclick={() => incrementBpm(10)}
        title={t("create_ui_increase_by_10_bpm")}
        aria-label={t("create_ui_increase_speed_by_10_bpm")}
      >
        <span aria-hidden="true">+</span>
      </button>
    </div>
  </div>

  <!-- Metronome toggle -->
  <div class="metronome-control">
    <button
      type="button"
      class="metronome-toggle"
      aria-pressed={isMetronomeEnabled}
      onclick={() => onMetronomeToggle(!isMetronomeEnabled)}
      aria-label={isMetronomeEnabled ? "Disable metronome" : "Enable metronome"}
    >
      <span
        class="toggle-track"
        class:on={isMetronomeEnabled}
        aria-hidden="true"
      >
        <span class="toggle-thumb"></span>
      </span>
      <span class="toggle-icon" aria-hidden="true"
        >{isMetronomeEnabled ? "🔊" : "🔇"}</span
      >
      <span class="toggle-label">{t("create_ui_metronome")}</span>
    </button>
  </div>
</div>

<style>
  .record-controls {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs, 4px);
    padding: var(--spacing-xs, 4px);
    background: var(
      --theme-panel-elevated-bg,
      var(--surface-glass, rgba(0, 0, 0, 0.5))
    );
    border-radius: var(--border-radius-lg, 12px);
    border: 1px solid
      var(--theme-stroke, var(--border-color, var(--theme-stroke)));
  }

  /* Main controls */
  .main-controls {
    display: flex;
    flex-direction: row;
    gap: var(--spacing-md, 16px);
  }

  .control-button {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-sm, 8px);
    padding: var(--spacing-md, 16px) var(--spacing-lg, 24px);
    background: var(--theme-card-bg, var(--surface-light, #333));
    color: var(--theme-text, var(--foreground, #ffffff));
    border: 2px solid transparent;
    border-radius: var(--border-radius-md, 8px);
    font-size: var(--font-size-md);
    font-weight: 600;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .control-button:hover {
    background: var(--theme-card-hover-bg, var(--surface-lighter, #444));
    border-color: var(--theme-accent, var(--primary, var(--semantic-info)));
    transform: translateY(-2px);
  }

  .control-button:active {
    transform: translateY(0);
  }

  .play-pause-button.playing {
    background: var(--semantic-error, var(--error, var(--semantic-error)));
  }

  .play-pause-button.playing:hover {
    background: color-mix(
      in srgb,
      var(--semantic-error, var(--semantic-error)) 85%,
      black
    );
  }

  .icon {
    font-size: var(--font-size-2xl);
  }

  .label {
    font-size: var(--font-size-sm);
  }

  /* Speed control */
  .speed-control {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md, 16px);
  }

  .speed-label {
    display: flex;
    justify-content: space-between;
    align-items: center;
    color: var(--theme-text, var(--foreground, #ffffff));
  }

  .label-text {
    font-size: var(--font-size-sm);
    font-weight: 600;
  }

  .speed-display {
    font-size: var(--font-size-xl);
    font-weight: 700;
    color: var(--theme-accent, var(--primary, var(--semantic-info)));
  }

  .speed-slider-container {
    display: flex;
    align-items: center;
    gap: var(--spacing-md, 16px);
  }

  .bpm-adjust-button {
    width: var(--min-touch-target);
    height: var(--min-touch-target);
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--theme-card-bg, var(--surface-light, #333));
    color: var(--theme-text, var(--foreground, #ffffff));
    border: 1px solid
      var(--theme-stroke, var(--border-color, var(--theme-stroke)));
    border-radius: var(--border-radius-md, 8px);
    font-size: var(--font-size-lg);
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .bpm-adjust-button:hover {
    background: var(--theme-card-hover-bg, var(--surface-lighter, #444));
    border-color: var(--theme-accent, var(--primary, var(--semantic-info)));
  }

  .speed-slider {
    flex: 1;
    height: 8px;
    background: var(--theme-card-bg, var(--surface-light, #333));
    border-radius: 4px;
    outline: none;
    -webkit-appearance: none;
    appearance: none;
  }

  .speed-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 20px;
    height: 20px;
    background: var(--theme-accent, var(--primary, var(--semantic-info)));
    border-radius: 50%;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .speed-slider::-webkit-slider-thumb:hover {
    transform: scale(1.2);
  }

  .speed-slider::-moz-range-thumb {
    width: 20px;
    height: 20px;
    background: var(--theme-accent, var(--primary, var(--semantic-info)));
    border: none;
    border-radius: 50%;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .speed-slider::-moz-range-thumb:hover {
    transform: scale(1.2);
  }

  /* Metronome control */
  .metronome-control {
    padding-top: var(--spacing-md, 16px);
    border-top: 1px solid
      var(--theme-stroke, var(--border-color, var(--theme-stroke)));
  }

  .metronome-toggle {
    display: flex;
    align-items: center;
    gap: var(--spacing-md, 16px);
    cursor: pointer;
    color: var(--theme-text, var(--foreground, #ffffff));
    background: transparent;
    border: none;
    padding: 0;
    min-height: var(--min-touch-target);
  }

  .toggle-track {
    width: 48px;
    height: 24px;
    flex-shrink: 0;
    background: var(--theme-card-bg, var(--surface-light, #333));
    border: 1px solid
      var(--theme-stroke, var(--border-color, var(--theme-stroke)));
    border-radius: 12px;
    position: relative;
    transition: all var(--duration-emphasis) ease;
  }

  .toggle-thumb {
    position: absolute;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--theme-text, var(--foreground, #ffffff));
    left: 2px;
    top: 2px;
    transition: all var(--duration-emphasis) ease;
  }

  .toggle-track.on {
    background: var(--theme-accent, var(--primary, var(--semantic-info)));
  }

  .toggle-track.on .toggle-thumb {
    left: 26px;
  }

  .toggle-icon {
    font-size: var(--font-size-2xl);
  }

  .toggle-label {
    font-size: var(--font-size-md);
    font-weight: 600;
  }

  /* Responsive adjustments - aligned with mobile breakpoint (768px) */
  @media (max-width: 768px) {
    .record-controls {
      padding: var(--spacing-sm, 16px);
      gap: var(--spacing-sm, 16px);
    }

    .main-controls {
      flex-direction: row;
    }

    .control-button {
      padding: var(--spacing-sm, 8px) var(--spacing-sm, 16px);
    }
  }

  /* Accessibility: Focus indicators */
  .control-button:focus-visible,
  .bpm-adjust-button:focus-visible {
    outline: 2px solid var(--theme-accent, var(--semantic-info));
    outline-offset: 2px;
  }

  .speed-slider:focus-visible {
    outline: 2px solid var(--theme-accent, var(--semantic-info));
    outline-offset: 4px;
  }

  .metronome-toggle:focus-visible {
    outline: 2px solid var(--theme-accent, var(--semantic-info));
    outline-offset: 2px;
    border-radius: var(--border-radius-md, 8px);
  }

  /* Accessibility: Respect user's motion preferences (WCAG AAA) */
  @media (prefers-reduced-motion: reduce) {
    .control-button,
    .bpm-adjust-button,
    .speed-slider::-webkit-slider-thumb,
    .speed-slider::-moz-range-thumb,
    .toggle-track,
    .toggle-thumb {
      transition: none;
    }
  }
</style>
