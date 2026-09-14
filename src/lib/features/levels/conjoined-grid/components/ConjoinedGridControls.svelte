<!--
  ConjoinedGridControls.svelte - Sidebar controls for the conjoined grid tab

  Sections:
  1. Topology preset selector (grid of named arrangements)
  2. Browse / Explore mode toggle (segmented control)
  3. Browse mode: pictograph navigation, overlaps-only filter
  4. Explore mode: playback, speed, manual placement
  5. Junction overlaps summary (always visible)
-->
<script lang="ts">
  import { TOPOLOGY_PRESETS } from "$lib/shared/multi-grid/domain/constants/topology-presets";
  import type { ConjoinedGridState } from "../state/conjoined-grid-state.svelte";

  interface Props {
    state: ConjoinedGridState;
  }

  let { state }: Props = $props();

  const speedLabel = $derived(
    state.playbackSpeed >= 1000
      ? `${(state.playbackSpeed / 1000).toFixed(1)}s`
      : `${state.playbackSpeed}ms`
  );

  // 1-based position within the overlapping subset
  const overlapPosition = $derived.by(() => {
    if (state.overlappingIndices.length === 0) return 0;
    const idx = state.overlappingIndices.indexOf(state.selectedPictographIndex);
    return idx >= 0 ? idx + 1 : 0;
  });
</script>

<div class="conjoined-grid-controls themed-scrollbar">
  <!-- 1. Topology Preset Selector -->
  <div class="section-label">Topology</div>
  <div class="preset-grid">
    {#each TOPOLOGY_PRESETS as preset}
      <button
        class="preset-button"
        class:active={state.selectedPresetId === preset.id}
        onclick={() => state.selectPreset(preset.id)}
        title={preset.description}
      >
        <i class="fas {preset.icon}" aria-hidden="true"></i>
        <span class="preset-label">{preset.label}</span>
      </button>
    {/each}
  </div>

  <!-- 2. Mode Toggle -->
  <div class="section-label">Mode</div>
  <div class="mode-toggle">
    <button
      class="mode-button"
      class:active={state.activeMode === "browse"}
      aria-pressed={state.activeMode === "browse"}
      onclick={() => state.setMode("browse")}
    >
      Browse
    </button>
    <button
      class="mode-button"
      class:active={state.activeMode === "explore"}
      aria-pressed={state.activeMode === "explore"}
      onclick={() => state.setMode("explore")}
    >
      Explore
    </button>
  </div>

  <!-- 3. Browse Mode Controls -->
  {#if state.activeMode === "browse"}
    <div class="section-label">Pictographs</div>
    <div class="browse-section">
      <div class="counter">
        {state.allPictographs.length > 0
          ? `${state.selectedPictographIndex + 1} / ${state.allPictographs.length}`
          : "No data loaded"}
      </div>

      <div class="nav-row">
        <button
          class="control-button"
          onclick={() => state.prevPictograph()}
          disabled={state.allPictographs.length === 0}
          title="Previous pictograph"
        >
          <i class="fas fa-chevron-left" aria-hidden="true"></i>
        </button>
        <button
          class="control-button"
          onclick={() => state.nextPictograph()}
          disabled={state.allPictographs.length === 0}
          title="Next pictograph"
        >
          <i class="fas fa-chevron-right" aria-hidden="true"></i>
        </button>
      </div>

      <!-- Overlaps-only filter -->
      <button
        class="toggle-button"
        class:active={state.showOverlapsOnly}
        aria-pressed={state.showOverlapsOnly}
        onclick={() => state.toggleOverlapsOnly()}
      >
        <i class="fas fa-filter" aria-hidden="true"></i>
        <span>Overlaps Only</span>
        {#if state.overlappingIndices.length > 0}
          <span class="badge">{state.overlappingIndices.length}</span>
        {/if}
      </button>

      <!-- Overlap navigation when filter is active -->
      {#if state.showOverlapsOnly && state.overlappingIndices.length > 0}
        <div class="overlap-nav">
          <div class="counter">
            Overlap {overlapPosition} / {state.overlappingIndices.length}
          </div>
          <div class="nav-row">
            <button
              class="control-button"
              onclick={() => state.goToPrevOverlap()}
              title="Previous overlap"
            >
              <i class="fas fa-chevron-left" aria-hidden="true"></i>
            </button>
            <button
              class="control-button"
              onclick={() => state.goToNextOverlap()}
              title="Next overlap"
            >
              <i class="fas fa-chevron-right" aria-hidden="true"></i>
            </button>
          </div>
        </div>
      {/if}
    </div>
  {/if}

  <!-- 4. Explore Mode Controls -->
  {#if state.activeMode === "explore"}
    <div class="section-label">Playback</div>
    <div class="explore-section">
      <div class="playback-row">
        <button
          class="control-button"
          onclick={() => state.stepBack()}
          disabled={state.allPairs.length === 0}
          title="Step backward"
        >
          <i class="fas fa-step-backward" aria-hidden="true"></i>
        </button>
        <button
          class="control-button play-button"
          class:playing={state.isPlaying}
          onclick={() => (state.isPlaying ? state.pause() : state.play())}
          disabled={state.allPairs.length === 0}
          title={state.isPlaying ? "Pause" : "Play"}
        >
          <i
            class="fas {state.isPlaying ? 'fa-pause' : 'fa-play'}"
            aria-hidden="true"
          ></i>
        </button>
        <button
          class="control-button"
          onclick={() => state.stepForward()}
          disabled={state.allPairs.length === 0}
          title="Step forward"
        >
          <i class="fas fa-step-forward" aria-hidden="true"></i>
        </button>
      </div>

      <div class="counter">
        {state.allPairs.length > 0
          ? `Pair ${state.currentPairIndex + 1} / ${state.allPairs.length}`
          : "No pairs"}
      </div>

      <!-- Speed slider -->
      <div class="speed-row">
        <span class="speed-label">Speed: {speedLabel}</span>
        <input
          type="range"
          min="100"
          max="2000"
          step="100"
          value={state.playbackSpeed}
          oninput={(e) =>
            state.setSpeed(Number((e.target as HTMLInputElement).value))}
          class="speed-slider"
          aria-label="Playback speed"
        />
      </div>

      <!-- Manual placement toggle -->
      <div class="section-label">Manual Placement</div>
      <button
        class="toggle-button"
        class:active={state.manualPlacement}
        aria-pressed={state.manualPlacement}
        onclick={() => state.toggleManualPlacement()}
      >
        <i
          class="fas {state.manualPlacement ? 'fa-hand-pointer' : 'fa-hand'}"
          aria-hidden="true"
        ></i>
        <span>{state.manualPlacement ? "Enabled" : "Disabled"}</span>
      </button>

      {#if state.manualPlacement}
        <div class="placement-indicator">
          <div class="placement-row">
            <span class="placement-dot blue-dot"></span>
            <span class="placement-text">
              Left: {state.manualLeftRef
                ? `${state.manualLeftRef.gridId}:${state.manualLeftRef.location}`
                : "Click to place"}
            </span>
          </div>
          <div class="placement-row">
            <span class="placement-dot red-dot"></span>
            <span class="placement-text">
              Right: {state.manualRightRef
                ? `${state.manualRightRef.gridId}:${state.manualRightRef.location}`
                : "Click to place"}
            </span>
          </div>
        </div>
      {/if}
    </div>
  {/if}

  <!-- 5. Junction Overlaps (always visible) -->
  <div class="section-label">Junction Overlaps</div>
  <div class="overlaps-section">
    <div
      class="overlap-count"
      class:has-overlaps={state.junctionOverlaps.length > 0}
    >
      {state.junctionOverlaps.length}
      {state.junctionOverlaps.length === 1 ? "overlap" : "overlaps"}
    </div>
    {#if state.junctionOverlaps.length > 0}
      <div class="overlap-list">
        {#each state.junctionOverlaps as overlap}
          <div class="overlap-chip">
            <span class="overlap-junction">
              {overlap.junction.refs
                .map((r) => `${r.gridId}:${r.location}`)
                .join(" = ")}
            </span>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .conjoined-grid-controls {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px;
    overflow-y: auto;
    height: 100%;
  }

  .section-label {
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.5));
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-top: 4px;
  }

  /* Preset grid */
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
    min-height: 44px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 8px;
    color: var(--theme-text, #ffffff);
    cursor: pointer;
    transition:
      border-color 0.15s,
      background 0.15s;
    font-size: var(--font-size-compact, 12px);
  }

  .preset-button:hover {
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.15));
    background: var(--theme-card-bg-hover, rgba(255, 255, 255, 0.06));
  }

  .preset-button.active {
    border-color: var(--theme-accent, #10b981);
    background: color-mix(
      in srgb,
      var(--theme-accent, #10b981) 10%,
      transparent
    );
  }

  .preset-button i {
    font-size: 16px;
    opacity: 0.7;
  }

  .preset-button.active i {
    opacity: 1;
    color: var(--theme-accent, #10b981);
  }

  .preset-label {
    text-align: center;
    line-height: 1.2;
  }

  /* Mode toggle (segmented control) */
  .mode-toggle {
    display: flex;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 8px;
    overflow: hidden;
  }

  .mode-button {
    flex: 1;
    padding: 10px;
    min-height: 44px;
    background: transparent;
    border: none;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.5));
    cursor: pointer;
    font-size: var(--font-size-sm, 14px);
    font-weight: 600;
    transition:
      background 0.15s,
      color 0.15s;
  }

  .mode-button:hover {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
  }

  .mode-button.active {
    background: var(--theme-accent, #10b981);
    color: var(--text-on-accent, #ffffff);
  }

  /* Browse section */
  .browse-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 8px;
  }

  .counter {
    text-align: center;
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.5));
  }

  .nav-row {
    display: flex;
    justify-content: center;
    gap: 8px;
  }

  .control-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 8px;
    color: var(--theme-text, #ffffff);
    cursor: pointer;
    transition:
      border-color 0.15s,
      background 0.15s;
    font-size: 14px;
  }

  .control-button:hover:not(:disabled) {
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.15));
    background: var(--theme-card-bg-hover, rgba(255, 255, 255, 0.06));
  }

  .control-button:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  /* Toggle button */
  .toggle-button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 8px 16px;
    min-height: 44px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 8px;
    color: var(--theme-text, #ffffff);
    cursor: pointer;
    font-size: var(--font-size-sm, 14px);
    transition:
      border-color 0.15s,
      background 0.15s;
  }

  .toggle-button:hover {
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.15));
  }

  .toggle-button.active {
    border-color: var(--theme-accent, #10b981);
    background: color-mix(
      in srgb,
      var(--theme-accent, #10b981) 10%,
      transparent
    );
    color: var(--theme-accent, #10b981);
  }

  .badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 20px;
    height: 20px;
    padding: 0 6px;
    background: var(--theme-accent, #10b981);
    color: var(--text-on-accent, #ffffff);
    border-radius: 10px;
    font-size: var(--font-size-compact, 12px);
    font-weight: 700;
  }

  .overlap-nav {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding-top: 6px;
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  /* Explore section */
  .explore-section {
    display: flex;
    flex-direction: column;
    gap: 10px;
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

  .play-button.playing {
    border-color: var(--theme-accent, #10b981);
    background: color-mix(
      in srgb,
      var(--theme-accent, #10b981) 15%,
      transparent
    );
    color: var(--theme-accent, #10b981);
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
    direction: rtl;
  }

  .speed-slider::-webkit-slider-thumb {
    appearance: none;
    width: 20px;
    height: 20px;
    background: var(--theme-accent, #10b981);
    border-radius: 50%;
    cursor: pointer;
  }

  .speed-slider::-moz-range-thumb {
    width: 20px;
    height: 20px;
    background: var(--theme-accent, #10b981);
    border-radius: 50%;
    border: none;
    cursor: pointer;
  }

  /* Manual placement indicator */
  .placement-indicator {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.02));
    border-radius: 6px;
  }

  .placement-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .placement-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .blue-dot {
    background: var(--dm-motion-blue, #3575e2);
  }

  .red-dot {
    background: var(--dm-motion-red, #ed1c24);
  }

  .placement-text {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text, #ffffff);
    font-family: monospace;
  }

  /* Overlaps section */
  .overlaps-section {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 8px;
  }

  .overlap-count {
    font-size: var(--font-size-sm, 14px);
    font-weight: 600;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.5));
    text-align: center;
  }

  .overlap-count.has-overlaps {
    color: var(--semantic-warning, #f59e0b);
  }

  .overlap-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .overlap-chip {
    padding: 4px 8px;
    background: color-mix(
      in srgb,
      var(--semantic-warning, #f59e0b) 8%,
      transparent
    );
    border: 1px solid
      color-mix(in srgb, var(--semantic-warning, #f59e0b) 20%, transparent);
    border-radius: 6px;
  }

  .overlap-junction {
    font-size: var(--font-size-compact, 12px);
    color: var(--semantic-warning, #f59e0b);
    font-family: monospace;
  }
</style>
