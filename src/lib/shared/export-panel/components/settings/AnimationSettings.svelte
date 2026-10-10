<!--
  AnimationSettings.svelte

  Settings content for animation export format.
  Rendered inside SettingsPanel when user clicks gear icon.

  Features:
  - FPS slider (15-60 FPS)
  - Loop count control (1-10)
  - Show overlays toggle
  - Preset selector (optional future enhancement)

  Domain: Export Panel - Settings - Animation Format
-->
<script lang="ts">
  import { getExportPanelState } from "../../state/export-panel-state.svelte";
  import { getExportOptionsState } from "#lib/shared/animation-panel/state/export-options-state.svelte.js";
  import type { VideoFps } from "#lib/shared/animation-panel/state/export-options-state.svelte.js";

  const hubState = getExportPanelState();
  const exportOptions = getExportOptionsState();

  function handleFpsChange(event: Event) {
    const value = parseInt((event.target as HTMLInputElement).value);
    hubState.animationSettings = { ...hubState.animationSettings, fps: value };
    exportOptions.setVideoFps(value as VideoFps);
  }

  function handleLoopCountChange(event: Event) {
    const value = parseInt((event.target as HTMLInputElement).value);
    hubState.animationSettings = {
      ...hubState.animationSettings,
      loopCount: value,
    };
    exportOptions.setVideoLoopCount(value);
  }

  function handleOverlaysToggle() {
    hubState.animationSettings = {
      ...hubState.animationSettings,
      showOverlays: !hubState.animationSettings.showOverlays,
    };
  }
</script>

<div class="animation-settings">
  <!-- FPS Control -->
  <div class="setting-group">
    <div class="setting-header">
      <label for="fps-slider">
        <i class="fas fa-tachometer-alt" aria-hidden="true"></i>
        Frame Rate
      </label>
      <span class="setting-value">{hubState.animationSettings.fps} FPS</span>
    </div>
    <input
      id="fps-slider"
      type="range"
      min="15"
      max="60"
      step="5"
      value={hubState.animationSettings.fps}
      oninput={handleFpsChange}
      class="slider"
    />
    <div class="slider-labels">
      <span>15 FPS</span>
      <span>60 FPS</span>
    </div>
  </div>

  <!-- Loop Count Control -->
  <div class="setting-group">
    <div class="setting-header">
      <label for="loop-slider">
        <i class="fas fa-redo" aria-hidden="true"></i>
        Loop Count
      </label>
      <span class="setting-value">{hubState.animationSettings.loopCount}x</span>
    </div>
    <input
      id="loop-slider"
      type="range"
      min="1"
      max="10"
      step="1"
      value={hubState.animationSettings.loopCount}
      oninput={handleLoopCountChange}
      class="slider"
    />
    <div class="slider-labels">
      <span>1x</span>
      <span>10x</span>
    </div>
  </div>

  <!-- Show Overlays Toggle -->
  <div class="setting-group">
    <div class="toggle-row">
      <div class="toggle-label">
        <i class="fas fa-layer-group" aria-hidden="true"></i>
        <div>
          <span class="toggle-title">Show Overlays</span>
          <span class="toggle-description"
            >Display grid lines and beat markers</span
          >
        </div>
      </div>
      <button
        class="toggle-button"
        class:active={hubState.animationSettings.showOverlays}
        onclick={handleOverlaysToggle}
        role="switch"
        aria-checked={hubState.animationSettings.showOverlays}
        aria-label="Toggle overlays"
      >
        <span class="toggle-thumb"></span>
      </button>
    </div>
  </div>

  <!-- Preset Selector (Future Enhancement) -->
  <!-- <div class="setting-group">
    <div class="setting-header">
      <label>
        <i class="fas fa-magic"></i>
        Presets
      </label>
    </div>
    <div class="preset-grid">
      TODO: Add preset cards like TrailSettingsSheet
    </div>
  </div> -->
</div>

<style>
  .animation-settings {
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  .setting-group {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .setting-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .setting-header label {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: var(--font-size-min);
    font-weight: 600;
    color: var(--theme-text, white);
  }

  .setting-header i {
    font-size: var(--font-size-base);
    opacity: 0.7;
  }

  .setting-value {
    font-size: var(--font-size-min);
    font-weight: 700;
    color: var(--theme-accent);
  }

  .slider {
    -webkit-appearance: none;
    appearance: none;
    width: 100%;
    height: 8px;
    background: var(--theme-card-bg);
    border-radius: 4px;
    outline: none;
    cursor: pointer;
  }

  .slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 24px;
    height: 24px;
    background: var(--theme-accent);
    border-radius: 50%;
    cursor: pointer;
    transition: transform var(--duration-normal) ease;
  }

  .slider::-webkit-slider-thumb:hover {
    transform: scale(1.1);
  }

  .slider:focus-visible::-webkit-slider-thumb {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  .slider::-moz-range-thumb {
    width: 24px;
    height: 24px;
    background: var(--theme-accent);
    border: none;
    border-radius: 50%;
    cursor: pointer;
    transition: transform var(--duration-normal) ease;
  }

  .slider::-moz-range-thumb:hover {
    transform: scale(1.1);
  }

  .slider:focus-visible::-moz-range-thumb {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  .slider-labels {
    display: flex;
    justify-content: space-between;
    font-size: var(--font-size-compact);
    color: var(--theme-text-dim);
  }

  .toggle-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 12px;
  }

  .toggle-label {
    display: flex;
    align-items: flex-start;
    gap: 12px;
  }

  .toggle-label i {
    font-size: var(--font-size-lg);
    margin-top: 2px;
    opacity: 0.7;
  }

  .toggle-label > div {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .toggle-title {
    font-size: var(--font-size-min);
    font-weight: 600;
    color: var(--theme-text, white);
  }

  .toggle-description {
    font-size: var(--font-size-compact);
    color: var(--theme-text-dim);
  }

  .toggle-button {
    position: relative;
    width: 48px;
    height: 28px;
    background: var(--theme-card-bg);
    border: 2px solid var(--theme-stroke);
    border-radius: 14px;
    cursor: pointer;
    transition: all var(--duration-emphasis) ease;
    flex-shrink: 0;
  }

  .toggle-button:hover {
    border-color: var(--theme-accent);
  }

  .toggle-button:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  .toggle-button.active {
    background: var(--theme-accent);
    border-color: var(--theme-accent);
  }

  .toggle-thumb {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 20px;
    height: 20px;
    background: white;
    border-radius: 50%;
    transition: transform var(--duration-emphasis) ease;
  }

  .toggle-button.active .toggle-thumb {
    transform: translateX(20px);
  }

  /* Mobile optimization */
  @media (max-width: 600px) {
    .animation-settings {
      gap: 20px;
    }

    .toggle-row {
      padding: 14px;
    }
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .slider::-webkit-slider-thumb,
    .slider::-moz-range-thumb {
      transition: none;
    }

    .toggle-button,
    .toggle-thumb {
      transition: none;
    }
  }
</style>
