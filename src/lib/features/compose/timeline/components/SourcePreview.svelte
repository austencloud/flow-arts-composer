<!--
  SourcePreview.svelte - Source Monitor for Timeline

  Previews sequences from the library BEFORE adding them to the timeline.
  Like Premiere Pro's Source Monitor - audition clips before editing.

  Features:
  - Load any sequence for preview
  - Independent playback controls (doesn't affect timeline)
  - Scrub through steps
  - Quick add to timeline button
-->
<script lang="ts">

import { getSequenceAnimationOrchestrator } from "$lib/shared/animation-engine/get-sequence-animation-orchestrator";
  import ProgressRing from "$lib/shared/components/loading/ProgressRing.svelte";
  import { t } from "$lib/shared/i18n/i18n.svelte";
  import { onMount, onDestroy, untrack } from "svelte";
  import AnimatorCanvas from "$lib/shared/animation-engine/components/AnimatorCanvas.svelte";
  import { animationSettings } from "$lib/shared/animation-engine/state/animation-settings-state.svelte";
  import TKAWordGlyph from "$lib/shared/choreo-card/components/TKAWordGlyph.svelte";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type { SequenceAnimationOrchestrator } from "$lib/shared/animation-engine/services/sequence-animation-orchestrator";
  import type { PropState } from "$lib/shared/foundation/domain/types/prop-state";
  import type { StartPlacementDeriver } from "$lib/shared/pictograph/shared/services/start-placement-deriver";
  import { startPlacementDeriver as startPlacementDeriverSingleton } from "$lib/shared/pictograph/shared/services/start-placement-deriver";
  import type { StartPlacementData } from "$lib/shared/foundation/domain/models/start-placement-data";
  import type { StepData } from "$lib/shared/foundation/domain/models/step-data";

  interface Props {
    /** Sequence to preview (from library) */
    sequence: SequenceData | null;
    /** Callback when user wants to add sequence to timeline */
    onAddToTimeline?: (sequence: SequenceData) => void;
  }

  let { sequence = null, onAddToTimeline }: Props = $props();

  // Animation orchestrator for calculating prop states
  let animationOrchestrator = $state<SequenceAnimationOrchestrator | null>(
    null
  );
  let startPlacementDeriver = $state<StartPlacementDeriver | null>(null);
  let initialized = $state(false);
  let loading = $state(true);
  let error = $state<string | null>(null);

  // Playback state (independent from timeline)
  let currentStep = $state(0);
  let isPlaying = $state(false);
  let playbackInterval: number | null = null;

  // Track loaded sequence
  let loadedSequenceId = $state<string | null>(null);

  // Prop states for rendering
  let leftPropState = $state<PropState | null>(null);
  let rightPropState = $state<PropState | null>(null);

  // Derived values
  // totalSteps = number of motion steps (NOT including start position)
  // fullStepRange = total playback range (start position + motion steps)
  // A 4-step sequence has range 0-5: [0-1) start, [1-2) beat 1, [2-3) beat 2, [3-4) beat 3, [4-5) beat 4
  const totalSteps = $derived(sequence?.steps?.length || 0);
  const fullStepRange = $derived(totalSteps + 1); // +1 for start position
  const displayName = $derived(
    sequence?.word || sequence?.name || t("empty_no_sequence_loaded")
  );

  // Check if we're at start position (before beat 1)
  const isAtStartPlacement = $derived(currentStep < 1);

  // Get the derived start position data (handles missing startPlacement field)
  const derivedStartPlacement = $derived.by(() => {
    if (!sequence || !startPlacementDeriver) return null;
    try {
      return startPlacementDeriver.getOrDeriveStartPlacement(sequence);
    } catch (err) {
      console.warn("SourcePreview: Failed to derive start position:", err);
      return null;
    }
  });

  // Get current letter - start position has its own letter (e.g., "α")
  const currentLetter = $derived.by(() => {
    if (!sequence) return null;

    // At start position - return start position letter
    if (isAtStartPlacement && derivedStartPlacement) {
      return (derivedStartPlacement as any).letter || null;
    }

    // At motion beat - beat N uses steps[N-1]
    if (sequence.steps && sequence.steps.length > 0) {
      const stepNumber = Math.floor(currentStep); // 1, 2, 3, etc.
      const arrayIndex = stepNumber - 1; // steps[0] = beat 1, steps[1] = beat 2, etc.
      const clampedIndex = Math.max(
        0,
        Math.min(arrayIndex, sequence.steps.length - 1)
      );
      return sequence.steps[clampedIndex]?.letter || null;
    }
    return null;
  });

  // Get current step data - start position is separate from steps
  const currentStepData = $derived.by(() => {
    if (!sequence) return null;

    // At start position - return derived start position data
    if (isAtStartPlacement && derivedStartPlacement) {
      return derivedStartPlacement;
    }

    // At motion beat - beat N uses steps[N-1]
    if (sequence.steps && sequence.steps.length > 0) {
      const stepNumber = Math.floor(currentStep); // 1, 2, 3, etc.
      const arrayIndex = stepNumber - 1; // steps[0] = beat 1, steps[1] = beat 2, etc.
      const clampedIndex = Math.max(
        0,
        Math.min(arrayIndex, sequence.steps.length - 1)
      );
      return sequence.steps[clampedIndex] || null;
    }
    return null;
  });

  // Initialize services on mount
  onMount(() => {
    try {
      loading = true;
      animationOrchestrator = getSequenceAnimationOrchestrator();
      startPlacementDeriver = startPlacementDeriverSingleton;
      initialized = true;
      loading = false;
    } catch (err) {
      console.error("SourcePreview: init failed:", err);
      error = "Failed to initialize preview";
      loading = false;
    }
  });

  // Load sequence when it changes
  $effect(() => {
    if (!initialized || !animationOrchestrator || !sequence) {
      untrack(() => {
        loadedSequenceId = null;
        leftPropState = null;
        rightPropState = null;
        currentStep = 0;
        stopPlayback();
      });
      return;
    }

    // Only reinitialize if sequence changed
    if (sequence.id === loadedSequenceId) return;

    untrack(() => {
      loadedSequenceId = sequence.id ?? null;
      currentStep = 0;
      stopPlayback();
      initializeAnimation(sequence);
    });
  });

  // Update prop states when beat changes
  $effect(() => {
    if (!animationOrchestrator || !sequence || loadedSequenceId !== sequence.id)
      return;

    const playbackPosition = currentStep;

    untrack(() => {
      animationOrchestrator!.calculateState(playbackPosition);
      const propStates = animationOrchestrator!.getCurrentPropStates();
      leftPropState = propStates.left;
      rightPropState = propStates.right;
    });
  });

  function initializeAnimation(seq: SequenceData) {
    if (!animationOrchestrator || !seq) return;

    try {
      const success = animationOrchestrator.initializeWithDomainData(seq);
      if (!success) {
        throw new Error("Failed to initialize animation");
      }

      animationOrchestrator.calculateState(0);
      const propStates = animationOrchestrator.getCurrentPropStates();
      leftPropState = propStates.left;
      rightPropState = propStates.right;
    } catch (err) {
      console.error("SourcePreview: animation init failed:", err);
    }
  }

  // Playback controls
  function togglePlayback() {
    if (isPlaying) {
      stopPlayback();
    } else {
      startPlayback();
    }
  }

  function startPlayback() {
    if (playbackInterval) return;
    isPlaying = true;

    const bpm = 60; // Default BPM for preview
    const msPerBeat = (60 / bpm) * 1000;
    const stepsPerBeat = 30; // Smooth animation
    const msPerStep = msPerBeat / stepsPerBeat;

    playbackInterval = window.setInterval(() => {
      currentStep += 1 / stepsPerBeat;
      // Range: 0 to fullStepRange (start position + all motion steps)
      // A 4-step sequence uses range 0-5: [0-1) start, [1-5) steps 1-4
      // Loop back to start position after completing last beat
      if (currentStep >= fullStepRange) {
        currentStep = 0; // Loop back to start position
      }
    }, msPerStep);
  }

  function stopPlayback() {
    if (playbackInterval) {
      clearInterval(playbackInterval);
      playbackInterval = null;
    }
    isPlaying = false;
  }

  function goToStart() {
    currentStep = 0; // Go to start position
  }

  function goToEnd() {
    currentStep = fullStepRange - 0.01; // Go to end of last motion beat (just before loop point)
  }

  function stepBackward() {
    currentStep = Math.max(0, Math.floor(currentStep) - 1);
  }

  function stepForward() {
    // Range: 0 (start position) to fullStepRange (end of last motion beat)
    // Step to next whole beat, but don't exceed the last beat
    const nextStep = Math.floor(currentStep) + 1;
    currentStep = Math.min(fullStepRange - 0.01, nextStep);
  }

  function handleScrub(e: Event) {
    const input = e.target as HTMLInputElement;
    currentStep = parseFloat(input.value);
  }

  function handleAddToTimeline() {
    if (sequence && onAddToTimeline) {
      onAddToTimeline(sequence);
    }
  }

  onDestroy(() => {
    stopPlayback();
    if (animationOrchestrator) {
      animationOrchestrator.dispose();
    }
  });
</script>

<div class="source-preview">
  <!-- Preview Header -->
  <div class="preview-header">
    <span class="preview-label">Source</span>
    {#if sequence}
      <span class="sequence-info" title={displayName}>
        {#if sequence?.word}
          <TKAWordGlyph word={sequence.word} height={13} darkMode />
        {:else}
          {displayName}
        {/if}
      </span>
    {/if}
  </div>

  <!-- Canvas Area -->
  <div class="preview-canvas">
    {#if loading}
      <div class="loading-state">
        <ProgressRing percent={-1} size={32} strokeWidth={3} />
        <span>Initializing...</span>
      </div>
    {:else if error}
      <div class="error-state">
        <i class="fas fa-exclamation-triangle" aria-hidden="true"></i>
        <span>{error}</span>
      </div>
    {:else if sequence && leftPropState && rightPropState}
      <div class="canvas-container">
        <AnimatorCanvas
          leftProp={leftPropState}
          rightProp={rightPropState}
          gridVisible={true}
          gridMode={sequence.gridMode ?? null}
          letter={currentLetter}
          stepData={currentStepData}
          currentStep={Math.floor(currentStep)}
          sequenceData={sequence}
          trailSettings={animationSettings.trail}
        />
      </div>

      <!-- Step indicator overlay -->
      <div class="step-indicator">
        {#if isAtStartPlacement}
          Start
        {:else}
          Beat {Math.floor(currentStep)} / {totalSteps}
        {/if}
      </div>

      <!-- Playback status overlay -->
      {#if isPlaying}
        <div class="playback-status">
          <i class="fas fa-play" aria-hidden="true"></i>
        </div>
      {/if}
    {:else}
      <div class="empty-state">
        <i class="fas fa-photo-film" aria-hidden="true"></i>
        <span>No source loaded</span>
        <span class="hint">Select a sequence from the library to preview</span>
      </div>
    {/if}
  </div>

  <!-- Transport Controls (always visible for layout consistency) -->
  <div class="transport-controls">
    <!-- Scrubber -->
    <div class="scrubber">
      <input
        type="range"
        min="0"
        max={sequence ? fullStepRange : 1}
        step="0.01"
        value={currentStep}
        oninput={handleScrub}
        class="scrub-slider"
        disabled={!sequence}
      />
    </div>

    <!-- Control buttons wrapper for centering -->
    <div class="control-buttons-wrapper">
      <!-- Centered transport buttons -->
      <div class="control-buttons">
        <button
          class="transport-btn"
          onclick={goToStart}
          title="Go to start"
          aria-label="Go to start"
          disabled={!sequence}
        >
          <i class="fas fa-backward-fast" aria-hidden="true"></i>
        </button>
        <button
          class="transport-btn"
          onclick={stepBackward}
          title="Previous step"
          aria-label="Previous step"
          disabled={!sequence}
        >
          <i class="fas fa-backward-step" aria-hidden="true"></i>
        </button>
        <button
          class="transport-btn play-btn"
          onclick={togglePlayback}
          title={isPlaying ? "Pause" : "Play"}
          aria-label={isPlaying ? "Pause" : "Play"}
          disabled={!sequence}
        >
          <i class="fas {isPlaying ? 'fa-pause' : 'fa-play'}" aria-hidden="true"
          ></i>
        </button>
        <button
          class="transport-btn"
          onclick={stepForward}
          title="Next step"
          aria-label="Next step"
          disabled={!sequence}
        >
          <i class="fas fa-forward-step" aria-hidden="true"></i>
        </button>
        <button
          class="transport-btn"
          onclick={goToEnd}
          title="Go to end"
          aria-label="Go to end"
          disabled={!sequence}
        >
          <i class="fas fa-forward-fast" aria-hidden="true"></i>
        </button>
      </div>

      <!-- Add to timeline button (only when sequence loaded) -->
      {#if sequence}
        <button
          class="add-btn"
          onclick={handleAddToTimeline}
          title="Add to timeline at playhead"
        >
          <i class="fas fa-plus" aria-hidden="true"></i>
          <span>Add</span>
        </button>
      {/if}
    </div>
  </div>
</div>

<style>
  .source-preview {
    /* Source-monitor identity accent — yellow distinguishes Source from the
       Program monitor (which uses the theme accent). Component-scoped: this is
       a monitor identity color, not a warning state, so it doesn't map to
       --semantic-warning. */
    --source-monitor-accent: #ffd43b;
    display: flex;
    flex-direction: column;
    background: var(--theme-panel-bg, #0e0e12);
    border: 1px solid var(--theme-stroke);
    border-radius: 8px;
    overflow: hidden;
    container-type: inline-size;
  }

  .preview-header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 12px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.03));
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    font-size: var(--font-size-compact);
  }

  .preview-label {
    font-weight: 600;
    color: var(--source-monitor-accent);
  }

  .sequence-info {
    margin-left: auto;
    color: var(--theme-text-muted, var(--theme-text-dim));
    max-width: 150px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .preview-canvas {
    position: relative;
    aspect-ratio: 1;
    min-height: 150px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #000;
  }

  .canvas-container {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .canvas-container :global(.canvas-wrapper) {
    width: 100%;
    height: 100%;
    max-width: 100%;
    max-height: 100%;
  }

  .loading-state,
  .error-state,
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    color: rgba(255, 255, 255, 0.4);
    text-align: center;
    padding: 20px;
  }

  .empty-state i,
  .error-state i {
    font-size: var(--font-size-3xl);
    opacity: 0.5;
  }

  .empty-state .hint {
    font-size: var(--font-size-compact);
    opacity: 0.6;
  }

  .playback-status {
    position: absolute;
    bottom: 8px;
    right: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    background: color-mix(in srgb, var(--source-monitor-accent) 20%, transparent);
    border-radius: 50%;
    backdrop-filter: blur(4px);
    color: var(--source-monitor-accent);
    font-size: var(--font-size-compact);
    animation: pulse 1.5s ease-in-out infinite;
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
      transform: scale(1);
    }
    50% {
      opacity: 0.7;
      transform: scale(0.95);
    }
  }

  /* Transport Controls */
  .transport-controls {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 8px 12px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.03));
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
  }

  .scrubber {
    width: 100%;
  }

  .scrub-slider {
    width: 100%;
    height: 4px;
    -webkit-appearance: none;
    appearance: none;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 2px;
    cursor: pointer;
  }

  .scrub-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--source-monitor-accent);
    cursor: pointer;
    transition: transform var(--duration-instant) ease;
  }

  .scrub-slider::-webkit-slider-thumb:hover {
    transform: scale(1.2);
  }

  .scrub-slider:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .scrub-slider:disabled::-webkit-slider-thumb {
    cursor: not-allowed;
  }

  .control-buttons-wrapper {
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
  }

  .control-buttons {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
  }

  .transport-btn {
    width: var(--min-touch-target); /* WCAG AAA touch target */
    height: var(--min-touch-target);
    border-radius: 4px;
    border: none;
    background: var(--theme-card-bg);
    color: var(--theme-text-dim);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: var(--font-size-compact);
    transition: all var(--duration-fast) ease;
  }

  .transport-btn:hover:not(:disabled) {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.1));
    color: white;
  }

  .transport-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .transport-btn.play-btn {
    width: 52px; /* WCAG AAA touch target - slightly larger for primary */
    height: 52px;
    background: color-mix(in srgb, var(--source-monitor-accent) 20%, transparent);
    color: var(--source-monitor-accent);
    font-size: var(--font-size-sm);
  }

  .transport-btn.play-btn:hover:not(:disabled) {
    background: color-mix(in srgb, var(--source-monitor-accent) 30%, transparent);
  }

  .add-btn {
    position: absolute;
    right: 0;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border-radius: 4px;
    border: none;
    background: var(--theme-accent);
    color: white;
    cursor: pointer;
    font-size: var(--font-size-compact);
    font-weight: 500;
    transition: all var(--duration-fast) ease;
  }

  .add-btn:hover {
    background: var(--theme-accent-strong, #5aabff);
    transform: translateY(-1px);
  }

  .add-btn i {
    font-size: var(--font-size-compact);
  }

  /* Accessibility: Respect user's motion preferences (WCAG AAA) */
  @media (prefers-reduced-motion: reduce) {
    .playback-status {
      animation: none;
    }
  }
</style>
