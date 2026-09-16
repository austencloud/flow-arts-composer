<!--
  PlaybackBar.svelte

  Playback controls for the compose grid.
  Composes existing shared components:
  - HorizontalTransportRow: step buttons + play/pause
  - BpmChips: BPM presets with tap tempo
  Plus: stop button, beat counter, loop mode toggle
-->
<script lang="ts">
  import HorizontalTransportRow from "$lib/shared/sequence-viewer/components/HorizontalTransportRow.svelte";
  import BpmChips from "$lib/shared/animation-engine/components/controls/BpmChips.svelte";

  let {
    isPlaying,
    currentStep,
    totalSteps,
    bpm = $bindable(120),
    skipStartPlacement = true,
    onPlayPause,
    onStop,
    onStepHalfBack,
    onStepHalfFwd,
    onStepFullBack,
    onStepFullFwd,
    onBpmChange,
    onToggleLoop,
  }: {
    isPlaying: boolean;
    currentStep: number;
    totalSteps: number;
    bpm: number;
    skipStartPlacement?: boolean;
    onPlayPause: () => void;
    onStop: () => void;
    onStepHalfBack: () => void;
    onStepHalfFwd: () => void;
    onStepFullBack: () => void;
    onStepFullFwd: () => void;
    onBpmChange?: (bpm: number) => void;
    onToggleLoop?: () => void;
  } = $props();

  const canStop = $derived(isPlaying || currentStep > 0);
</script>

<div class="playback-bar">
  <!-- Transport: step buttons + play/pause (reuses shared component) -->
  <HorizontalTransportRow
    {isPlaying}
    onPlaybackToggle={onPlayPause}
    {onStepHalfBack}
    {onStepHalfFwd}
    {onStepFullBack}
    {onStepFullFwd}
  />

  <!-- Step counter + stop + loop toggle -->
  <div class="info-row">
    <div class="step-display">
      <span class="current">{Math.floor(currentStep) + 1}</span>
      <span class="separator">/</span>
      <span class="total">{totalSteps}</span>
      <span class="step-label">steps</span>
    </div>

    <div class="controls-right">
      <!-- Loop toggle -->
      {#if onToggleLoop}
        <button
          class="loop-btn"
          class:active={skipStartPlacement}
          onclick={onToggleLoop}
          aria-label={skipStartPlacement ? "Loop mode: seamless" : "Loop mode: with start position"}
          title={skipStartPlacement ? "Seamless loop (skips start pose)" : "Includes start pose each loop"}
        >
          <i class="fas fa-repeat" aria-hidden="true"></i>
        </button>
      {/if}

      <!-- Stop button -->
      <button
        class="stop-btn"
        onclick={onStop}
        disabled={!canStop}
        aria-label="Stop"
      >
        <i class="fas fa-stop" aria-hidden="true"></i>
      </button>
    </div>
  </div>

  <!-- BPM control (reuses shared component, compact variant) -->
  <BpmChips
    bind:bpm
    variant="compact"
    onBpmChange={onBpmChange}
  />
</div>

<style>
  .playback-bar {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm, 8px);
  }

  /* Override HorizontalTransportRow's default card background since
     we're already inside a panel-section card */
  .playback-bar :global(.horizontal-transport-row) {
    background: transparent;
    border: none;
    padding: 8px 0;
  }

  .info-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .controls-right {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm, 8px);
  }

  /* Step display */
  .step-display {
    display: flex;
    align-items: baseline;
    gap: 2px;
    font-family: var(--font-mono, monospace);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    font-size: var(--font-size-min, 14px);
  }

  .current {
    color: var(--theme-text, white);
    font-weight: 600;
    font-size: 1.25rem;
  }

  .separator {
    opacity: 0.5;
    margin: 0 2px;
  }

  .total {
    font-weight: 500;
  }

  .step-label {
    margin-left: var(--spacing-xs);
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.4));
  }

  /* Loop toggle */
  .loop-btn {
    width: var(--min-touch-target, 48px);
    height: var(--min-touch-target, 48px);
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 50%;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    font-size: 0.85rem;
    cursor: pointer;
    transition: all var(--duration-fast, 150ms) ease;
  }

  .loop-btn:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.1));
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
    color: var(--theme-text, white);
  }

  .loop-btn.active {
    background: color-mix(in srgb, var(--semantic-success, #10b981) 20%, transparent);
    border-color: color-mix(in srgb, var(--semantic-success, #10b981) 40%, transparent);
    color: var(--semantic-success, #10b981);
  }

  .loop-btn.active:hover {
    background: color-mix(in srgb, var(--semantic-success, #10b981) 30%, transparent);
    border-color: color-mix(in srgb, var(--semantic-success, #10b981) 50%, transparent);
  }

  .loop-btn:focus-visible {
    outline: 2px solid var(--theme-accent, #8b5cf6);
    outline-offset: 2px;
  }

  /* Stop button */
  .stop-btn {
    width: var(--min-touch-target, 48px);
    height: var(--min-touch-target, 48px);
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.1));
    border: 1.5px solid var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
    border-radius: 50%;
    color: white;
    font-size: 0.85rem;
    cursor: pointer;
    transition: all var(--duration-fast, 150ms) ease;
  }

  .stop-btn:hover:not(:disabled) {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.2));
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.3));
  }

  .stop-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .stop-btn:focus-visible {
    outline: 2px solid var(--theme-accent, #8b5cf6);
    outline-offset: 2px;
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .loop-btn,
    .stop-btn {
      transition: none;
    }
  }
</style>
