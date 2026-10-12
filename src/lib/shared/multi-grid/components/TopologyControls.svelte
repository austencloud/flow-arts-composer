<!--
  TopologyControls.svelte - Preset selector, topology info, and playback controls

  Sections:
  1. Preset grid - buttons for each topology arrangement
  2. Topology info - grid/junction/point counts
  3. Playback controls - play/pause, step, speed, position counter
  4. Placement mode toggle - click-to-place left or right
  5. Grid details - chips showing each grid's metadata
  6. Dark mode toggle
-->
<script lang="ts">
  import type { GridTopology } from "../domain/models/grid-topology";
  import { TOPOLOGY_PRESETS } from "../domain/constants/topology-presets";

  interface Props {
    selectedPresetId: string;
    topology: GridTopology;
    darkMode?: boolean;
    onPresetChange: (presetId: string) => void;
    onDarkModeToggle?: () => void;
    // Playback props
    totalPairs: number;
    currentPairIndex: number;
    isPlaying: boolean;
    playbackSpeed: number;
    onTogglePlay: () => void;
    onStepForward: () => void;
    onStepBack: () => void;
    onSpeedChange: (speed: number) => void;
    onPairIndexChange: (index: number) => void;
    // Placement mode
    placementMode: "left" | "right";
    clickToPlaceEnabled: boolean;
    onPlacementModeChange: (mode: "left" | "right") => void;
    onClickToPlaceToggle: () => void;
  }

  let {
    selectedPresetId,
    topology,
    darkMode = true,
    onPresetChange,
    onDarkModeToggle,
    totalPairs,
    currentPairIndex,
    isPlaying,
    playbackSpeed,
    onTogglePlay,
    onStepForward,
    onStepBack,
    onSpeedChange,
    onPairIndexChange,
    placementMode,
    clickToPlaceEnabled,
    onPlacementModeChange,
    onClickToPlaceToggle,
  }: Props = $props();

  const gridCount = $derived(topology.grids.length);
  const junctionCount = $derived(topology.junctions.length);
  const pointCount = $derived(topology.worldPoints.length);

  // Format speed as readable interval
  const speedLabel = $derived(
    playbackSpeed >= 1000
      ? `${(playbackSpeed / 1000).toFixed(1)}s`
      : `${playbackSpeed}ms`
  );
</script>

<div class="topology-controls">
  <!-- Preset selector -->
  <div class="section-label">Arrangement</div>
  <div class="preset-grid">
    {#each TOPOLOGY_PRESETS as preset}
      <button
        class="preset-button"
        class:active={selectedPresetId === preset.id}
        onclick={() => onPresetChange(preset.id)}
        title={preset.description}
      >
        <i class="fas {preset.icon}"></i>
        <span class="preset-label">{preset.label}</span>
      </button>
    {/each}
  </div>

  <!-- Topology info -->
  <div class="topology-info">
    <div class="info-item">
      <span class="info-value">{gridCount}</span>
      <span class="info-label">{gridCount === 1 ? "grid" : "grids"}</span>
    </div>
    <div class="info-item">
      <span class="info-value">{junctionCount}</span>
      <span class="info-label"
        >{junctionCount === 1 ? "junction" : "junctions"}</span
      >
    </div>
    <div class="info-item">
      <span class="info-value">{pointCount}</span>
      <span class="info-label">world points</span>
    </div>
  </div>

  <!-- Playback controls -->
  <div class="section-label">Playback</div>
  <div class="playback-section">
    <div class="playback-row">
      <button
        class="control-button"
        onclick={onStepBack}
        title="Previous pair"
        aria-label="Previous pair"
      >
        <i class="fas fa-step-backward"></i>
      </button>
      <button
        class="control-button play-button"
        class:playing={isPlaying}
        onclick={onTogglePlay}
        title={isPlaying ? "Pause" : "Play"}
        aria-label={isPlaying ? "Pause" : "Play"}
      >
        <i class="fas {isPlaying ? 'fa-pause' : 'fa-play'}"></i>
      </button>
      <button
        class="control-button"
        onclick={onStepForward}
        title="Next pair"
        aria-label="Next pair"
      >
        <i class="fas fa-step-forward"></i>
      </button>
    </div>

    <div class="pair-counter">
      Pair {currentPairIndex + 1} of {totalPairs}
    </div>

    <div class="speed-row">
      <span class="speed-label">Speed: {speedLabel}</span>
      <input
        type="range"
        min="100"
        max="2000"
        step="100"
        value={playbackSpeed}
        oninput={(e) =>
          onSpeedChange(Number((e.target as HTMLInputElement).value))}
        class="speed-slider"
        aria-label="Playback speed (interval per pair)"
        aria-valuetext={speedLabel}
      />
    </div>
  </div>

  <!-- Placement mode -->
  <div class="section-label">Click to Place</div>
  <div class="placement-section">
    <button
      class="toggle-button"
      class:active={clickToPlaceEnabled}
      onclick={onClickToPlaceToggle}
    >
      <i class="fas {clickToPlaceEnabled ? 'fa-hand-pointer' : 'fa-hand'}"></i>
      <span>{clickToPlaceEnabled ? "Enabled" : "Disabled"}</span>
    </button>

    {#if clickToPlaceEnabled}
      <div class="placement-mode-row">
        <button
          class="mode-button blue-mode"
          class:active={placementMode === "left"}
          onclick={() => onPlacementModeChange("left")}
        >
          Left
        </button>
        <button
          class="mode-button red-mode"
          class:active={placementMode === "right"}
          onclick={() => onPlacementModeChange("right")}
        >
          Right
        </button>
      </div>
    {/if}
  </div>

  <!-- Grid details -->
  <div class="section-label">Grid Details</div>
  <div class="grid-details">
    {#each topology.grids as grid}
      <div class="grid-chip">
        <span class="grid-id">{grid.id}</span>
        <span class="grid-mode">{grid.mode}</span>
        <span class="grid-pos"
          >({grid.center.x.toFixed(1)}, {grid.center.y.toFixed(1)})</span
        >
      </div>
    {/each}
  </div>

  <!-- Dark mode toggle -->
  {#if onDarkModeToggle}
    <button class="toggle-button" onclick={onDarkModeToggle}>
      <i class="fas {darkMode ? 'fa-sun' : 'fa-moon'}"></i>
      <span>{darkMode ? "Light" : "Dark"}</span>
    </button>
  {/if}
</div>

<style>
  .topology-controls {
    /* Scoped module accent — change here, not at 11 call sites */
    --multi-grid-accent: #10b981;
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: var(--scrollbar-thumb, rgba(255, 255, 255, 0.2))
      var(--scrollbar-track, transparent);
  }

  .section-label {
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.5));
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-top: 4px;
  }

  .preset-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(90px, 1fr));
    gap: 6px;
  }

  .preset-button {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 10px 6px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 8px;
    color: var(--theme-text, #ffffff);
    cursor: pointer;
    transition:
      border-color var(--duration-fast),
      background var(--duration-fast);
    font-size: var(--font-size-compact, 12px);
  }

  .preset-button:hover {
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.15));
    background: rgba(255, 255, 255, 0.06);
  }

  .preset-button.active {
    border-color: var(--multi-grid-accent);
    background: color-mix(in srgb, var(--multi-grid-accent) 10%, transparent);
  }

  .preset-button i {
    font-size: 16px;
    opacity: 0.7;
  }

  .preset-button.active i {
    opacity: 1;
    color: var(--multi-grid-accent);
  }

  .preset-label {
    text-align: center;
    line-height: 1.2;
  }

  .topology-info {
    display: flex;
    gap: 16px;
    justify-content: center;
  }

  .info-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }

  .info-value {
    font-size: 18px;
    font-weight: 700;
    color: var(--multi-grid-accent);
  }

  .info-label {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.5));
  }

  /* Playback controls */
  .playback-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 8px;
  }

  .playback-row {
    display: flex;
    justify-content: center;
    gap: 8px;
  }

  .control-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 8px;
    color: var(--theme-text, #ffffff);
    cursor: pointer;
    transition:
      border-color var(--duration-fast),
      background var(--duration-fast);
    font-size: 14px;
  }

  .control-button:hover {
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.15));
    background: rgba(255, 255, 255, 0.06);
  }

  .play-button.playing {
    border-color: var(--multi-grid-accent);
    background: color-mix(in srgb, var(--multi-grid-accent) 15%, transparent);
    color: var(--multi-grid-accent);
  }

  .pair-counter {
    text-align: center;
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.5));
  }

  .speed-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .speed-label {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.5));
    white-space: nowrap;
    min-width: 60px;
  }

  .speed-slider {
    flex: 1;
    height: 4px;
    appearance: none;
    background: var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 2px;
    cursor: pointer;
    /* Invert so left=fast, right=slow */
    direction: rtl;
  }

  .speed-slider::-webkit-slider-thumb {
    appearance: none;
    width: 14px;
    height: 14px;
    background: var(--multi-grid-accent);
    border-radius: 50%;
    cursor: pointer;
  }

  .speed-slider::-moz-range-thumb {
    width: 14px;
    height: 14px;
    background: var(--multi-grid-accent);
    border-radius: 50%;
    border: none;
    cursor: pointer;
  }

  /* Placement controls */
  .placement-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .placement-mode-row {
    display: flex;
    gap: 6px;
  }

  .mode-button {
    flex: 1;
    padding: 8px;
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 8px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    color: var(--theme-text, #ffffff);
    cursor: pointer;
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    text-align: center;
    transition:
      border-color var(--duration-fast),
      background var(--duration-fast);
  }

  .mode-button:hover {
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.15));
  }

  .blue-mode.active {
    border-color: #3575e2;
    background: rgba(53, 117, 226, 0.15);
    color: #3575e2;
  }

  .red-mode.active {
    border-color: #ed1c24;
    background: rgba(237, 28, 36, 0.15);
    color: #ed1c24;
  }

  /* Grid details */
  .grid-details {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .grid-chip {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 6px;
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text, #ffffff);
  }

  .grid-id {
    font-weight: 700;
    color: var(--multi-grid-accent);
    text-transform: uppercase;
  }

  .grid-mode {
    opacity: 0.6;
  }

  .grid-pos {
    opacity: 0.4;
    font-family: monospace;
    font-size: var(--font-size-compact, 12px);
  }

  .toggle-button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 8px 16px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 8px;
    color: var(--theme-text, #ffffff);
    cursor: pointer;
    font-size: var(--font-size-min, 14px);
    transition: border-color var(--duration-fast);
  }

  .toggle-button:hover {
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.15));
  }

  .toggle-button.active {
    border-color: var(--multi-grid-accent);
    background: color-mix(in srgb, var(--multi-grid-accent) 10%, transparent);
    color: var(--multi-grid-accent);
  }
</style>
