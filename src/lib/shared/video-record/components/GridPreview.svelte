<!--
  GridPreview.svelte

  Simplified beat grid preview for video recording reference.
  Shows sequence beats in a static grid or with BPM-synced playback highlighting.
-->
<script lang="ts">
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type { GridSettings } from "../state/video-record-settings.svelte";
  import { onMount, onDestroy } from "svelte";

  let {
    sequence = null,
    settings,
    onSettingsChange = () => {},
  }: {
    sequence?: SequenceData | null;
    settings: GridSettings;
    onSettingsChange?: (settings: GridSettings) => void;
  } = $props();

  // BPM playback state
  let currentStepNumber = $state<number | null>(null);
  let playbackInterval: number | null = null;

  // Start/stop BPM playback
  $effect(() => {
    if (settings.animated && sequence) {
      startPlayback();
    } else {
      stopPlayback();
    }

    return () => stopPlayback();
  });

  function startPlayback() {
    if (!sequence || playbackInterval) return;

    const stepCount = sequence.steps.length;
    if (stepCount === 0) return;

    const beatDuration = (60 / settings.bpm) * 1000; // ms per beat
    let stepIndex = 0;

    currentStepNumber = 0; // Start position

    playbackInterval = window.setInterval(() => {
      stepIndex++;
      if (stepIndex > stepCount) {
        stepIndex = 0; // Loop back to start
      }
      currentStepNumber = stepIndex;
    }, beatDuration);
  }

  function stopPlayback() {
    if (playbackInterval) {
      clearInterval(playbackInterval);
      playbackInterval = null;
    }
    currentStepNumber = null;
  }

  function toggleAnimated() {
    onSettingsChange({
      ...settings,
      animated: !settings.animated,
    });
  }

  function updateBpm(delta: number) {
    const newBpm = Math.max(30, Math.min(200, settings.bpm + delta));
    onSettingsChange({
      ...settings,
      bpm: newBpm,
    });
  }

  onDestroy(() => {
    stopPlayback();
  });
</script>

<div class="grid-preview">
  {#if sequence}
    <!-- Beat Grid -->
    <div class="grid-container">
      {#await import("$lib/features/create/shared/workspace-panel/sequence-display/components/StepGrid.svelte") then mod}
        <mod.default
          steps={sequence.steps}
          startPlacement={sequence.startPlacement}
          selectedStepNumber={currentStepNumber}
          practiceStepNumber={settings.animated ? currentStepNumber : null}
          isSideBySideLayout={false}
          shouldOrbitAroundCenter={false}
        />
      {/await}
    </div>

    <!-- Grid Controls -->
    <div class="grid-controls">
      <!-- Animation Toggle -->
      <button
        class="toggle-btn"
        class:active={settings.animated}
        onclick={toggleAnimated}
      >
        {settings.animated ? "⏸️" : "▶️"}
        {settings.animated ? "Pause" : "Play"}
      </button>

      <!-- BPM Control (only shown when animated) -->
      {#if settings.animated}
        <div class="bpm-control">
          <span class="control-label">BPM: {settings.bpm}</span>
          <div class="button-group">
            <button
              class="control-btn"
              onclick={() => updateBpm(-10)}
              disabled={settings.bpm <= 30}>−</button
            >
            <button
              class="control-btn"
              onclick={() => updateBpm(10)}
              disabled={settings.bpm >= 200}>+</button
            >
          </div>
        </div>
      {/if}
    </div>
  {:else}
    <div class="no-sequence">
      <p>No sequence selected</p>
    </div>
  {/if}
</div>

<style>
  .grid-preview {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    gap: 12px;
    background: rgba(0, 0, 0, 0.3);
    border-radius: 12px;
    overflow: hidden;
  }

  .grid-container {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 12px;
    background: rgba(0, 0, 0, 0.2);
  }

  .grid-controls {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
    background: rgba(0, 0, 0, 0.4);
  }

  .toggle-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 10px 16px;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 8px;
    color: var(--theme-text-dim);
    font-size: var(--font-size-sm);
    font-weight: 500;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .toggle-btn:hover {
    background: rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.8);
  }

  .toggle-btn.active {
    background: linear-gradient(135deg, var(--semantic-info) 0%, #2563eb 100%);
    color: white;
    border-color: transparent;
  }

  .bpm-control {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .control-label {
    font-size: var(--font-size-compact);
    font-weight: 600;
    color: rgba(255, 255, 255, 0.8);
  }

  .button-group {
    display: flex;
    gap: 6px;
  }

  .control-btn {
    width: var(--min-touch-target); /* WCAG AAA touch target */
    height: var(--min-touch-target);
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 6px;
    color: white;
    font-size: var(--font-size-base);
    font-weight: 600;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .control-btn:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.15);
  }

  .control-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .no-sequence {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .no-sequence p {
    color: var(--theme-text-dim);
    font-size: var(--font-size-sm);
  }

  /* Responsive */
  @media (max-width: 640px) {
    .grid-controls {
      padding: 8px;
      gap: 8px;
    }

    .toggle-btn {
      padding: 8px 12px;
      font-size: var(--font-size-compact);
    }
  }
</style>
