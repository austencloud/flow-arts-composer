<!--
  TimelinePreview.svelte - Program Monitor for Timeline

  Shows the animation at the current playhead position.
  Like Premiere Pro's Program Monitor - displays what's "on screen" at the playhead.

  Features:
  - Syncs to timeline playhead position
  - Renders active clip's animation with interpolated prop positions
  - Shows empty state when no clip at playhead
-->
<script lang="ts">

import { getSequenceAnimationOrchestrator } from "$lib/shared/animation-engine/get-sequence-animation-orchestrator";
  import ProgressRing from "$lib/shared/components/loading/ProgressRing.svelte";
  import { onMount, onDestroy, untrack } from "svelte";
  import AnimatorCanvas from "$lib/shared/animation-engine/components/AnimatorCanvas.svelte";
  import { animationSettings } from "$lib/shared/animation-engine/state/animation-settings-state.svelte";
  import { getTimelinePlayer } from "../services/timeline-playback-service";
  import type { TimelineClip } from "$lib/shared/animation-engine/domain/timeline-types";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type { SequenceAnimationOrchestrator } from "$lib/shared/animation-engine/services/sequence-animation-orchestrator";
  import type { PropState } from "$lib/shared/foundation/domain/types/prop-state";
  import type { StartPlacementDeriver } from "$lib/shared/pictograph/shared/services/start-placement-deriver";
  import { startPlacementDeriver as startPlacementDeriverSingleton } from "$lib/shared/pictograph/shared/services/start-placement-deriver";

  interface Props {
    /** Current playhead position in seconds */
    playheadPosition: number;
    /** All clips from timeline (flattened across tracks) */
    clips: TimelineClip[];
    /** Whether timeline is playing */
    isPlaying: boolean;
    /** Pixels per second (for display info) */
    pixelsPerSecond?: number;
    /** Total timeline duration for scrubber */
    totalDuration?: number;
    /** BPM for playback sync */
    bpm?: number;
  }

  let {
    playheadPosition = 0,
    clips = [],
    isPlaying = false,
    pixelsPerSecond = 50,
    totalDuration = 60,
    bpm = 60,
  }: Props = $props();

  // Playback service access
  function getPlayback() {
    return getTimelinePlayer();
  }

  // Animation orchestrator for calculating prop states
  let animationOrchestrator = $state<SequenceAnimationOrchestrator | null>(
    null
  );
  let startPlacementDeriver = $state<StartPlacementDeriver | null>(null);
  let initialized = $state(false);
  let loading = $state(true);
  let error = $state<string | null>(null);

  // Track the currently displayed clip
  let currentClipId = $state<string | null>(null);
  let currentSequence = $state<SequenceData | null>(null);

  // Prop states for rendering
  let leftPropState = $state<PropState | null>(null);
  let rightPropState = $state<PropState | null>(null);

  // Find the active clip at playhead position
  const activeClip = $derived.by(() => {
    if (clips.length === 0) return null;

    // Find first clip that contains the playhead position
    // Clips are ordered by track then by startTime
    for (const clip of clips) {
      if (clip.muted) continue;
      const clipEnd = clip.startTime + clip.duration;
      if (playheadPosition >= clip.startTime && playheadPosition < clipEnd) {
        return clip;
      }
    }

    return null;
  });

  // Calculate beat position within the active clip (fractional for smooth animation)
  // A 4-step sequence has range 0-5: [0-1) start position, [1-5) steps 1-4
  const clipStepPosition = $derived.by(() => {
    if (!activeClip) return 0;

    // Time elapsed within the clip
    const timeInClip = playheadPosition - activeClip.startTime;

    // Adjust for in/out points
    const clipContentDuration = activeClip.duration; // Already adjusted for speed
    const sourceStartFraction = activeClip.inPoint;
    const sourceEndFraction = activeClip.outPoint;
    const sourceDurationFraction = sourceEndFraction - sourceStartFraction;

    // Progress through the visible portion
    const progressInClip =
      clipContentDuration > 0 ? timeInClip / clipContentDuration : 0;

    // Map to source position (0-1 fraction through source content)
    const sourcePosition =
      sourceStartFraction + progressInClip * sourceDurationFraction;

    // Convert to beat number (fractional for interpolation)
    // fullStepRange = totalSteps + 1 to account for start position
    // Start position occupies beat range [0-1), then motion steps follow
    const totalSteps = activeClip.sequence.steps?.length || 1;
    const fullStepRange = totalSteps + 1; // +1 for start position
    const beat = sourcePosition * fullStepRange;

    if (activeClip.loop) {
      return beat % fullStepRange;
    }

    return Math.min(beat, fullStepRange - 0.001);
  });

  // Check if we're at start position (before beat 1)
  const isAtStartPlacement = $derived(clipStepPosition < 1);

  // Derive start position using the StartPlacementDeriver service
  // This handles sequences that don't have an explicit startPlacement field
  const derivedStartPlacement = $derived.by(() => {
    if (!activeClip?.sequence || !startPlacementDeriver) return null;
    try {
      return startPlacementDeriver.getOrDeriveStartPlacement(activeClip.sequence);
    } catch (err) {
      console.warn("TimelinePreview: Failed to derive start position:", err);
      return null;
    }
  });

  // Current letter derived from beat position
  // Start position has its own letter (e.g., "α"), steps have their own
  const currentLetter = $derived.by(() => {
    if (!activeClip?.sequence) return null;

    const seq = activeClip.sequence;

    // At start position - return start position letter from derived start position
    if (isAtStartPlacement && derivedStartPlacement) {
      return (derivedStartPlacement as any).letter || null;
    }

    // At motion beat - beat N uses steps[N-1]
    if (seq.steps && seq.steps.length > 0) {
      const stepNumber = Math.floor(clipStepPosition); // 1, 2, 3, etc.
      const arrayIndex = stepNumber - 1; // steps[0] = beat 1, steps[1] = beat 2, etc.
      const clampedIndex = Math.max(
        0,
        Math.min(arrayIndex, seq.steps.length - 1)
      );
      return seq.steps[clampedIndex]?.letter || null;
    }

    return null;
  });

  // Current step data - start position is separate from steps
  const currentStepData = $derived.by(() => {
    if (!activeClip?.sequence) return null;

    const seq = activeClip.sequence;

    // At start position - return derived start position data
    if (isAtStartPlacement && derivedStartPlacement) {
      return derivedStartPlacement as any;
    }

    // At motion beat - beat N uses steps[N-1]
    if (seq.steps && seq.steps.length > 0) {
      const stepNumber = Math.floor(clipStepPosition); // 1, 2, 3, etc.
      const arrayIndex = stepNumber - 1; // steps[0] = beat 1, steps[1] = beat 2, etc.
      const clampedIndex = Math.max(
        0,
        Math.min(arrayIndex, seq.steps.length - 1)
      );
      return seq.steps[clampedIndex] || null;
    }

    return null;
  });

  // Initialize services on mount
  onMount(() => {
    try {
      loading = true;

      // Get services from ITI container
      animationOrchestrator = getSequenceAnimationOrchestrator();
      startPlacementDeriver = startPlacementDeriverSingleton;
      initialized = true;
      loading = false;
    } catch (err) {
      console.error("TimelinePreview: init failed:", err);
      error = "Failed to initialize preview";
      loading = false;
    }
  });

  // Sync animation when active clip changes
  $effect(() => {
    if (!initialized || !animationOrchestrator) return;

    const clip = activeClip;
    if (!clip) {
      // Clear animation state when no clip
      untrack(() => {
        currentClipId = null;
        currentSequence = null;
        leftPropState = null;
        rightPropState = null;
      });
      return;
    }

    // Only reinitialize if clip changed
    if (clip.id === currentClipId) return;

    untrack(() => {
      currentClipId = clip.id;
      initializeAnimation(clip.sequence);
    });
  });

  // Update prop states when playhead moves - this is the key fix!
  $effect(() => {
    if (!animationOrchestrator || !currentSequence || !activeClip) return;

    const playbackPosition = clipStepPosition;

    untrack(() => {
      // Calculate interpolated state for this fractional playback position
      animationOrchestrator!.calculateState(playbackPosition);

      // Get the calculated prop states
      const propStates = animationOrchestrator!.getCurrentPropStates();
      leftPropState = propStates.left;
      rightPropState = propStates.right;
    });
  });

  function initializeAnimation(sequence: SequenceData) {
    if (!animationOrchestrator || !sequence) return;

    try {
      const success = animationOrchestrator.initializeWithDomainData(sequence);
      if (!success) {
        throw new Error("Failed to initialize animation");
      }

      // Get initial prop states
      animationOrchestrator.calculateState(0);
      const propStates = animationOrchestrator.getCurrentPropStates();

      // Wrap all state updates in untrack to prevent effect cycles
      untrack(() => {
        currentSequence = sequence;
        leftPropState = propStates.left;
        rightPropState = propStates.right;
      });
    } catch (err) {
      console.error("TimelinePreview: animation init failed:", err);
      untrack(() => {
        currentSequence = null;
      });
    }
  }

  // Format time display
  function formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toFixed(2).padStart(5, "0")}`;
  }

  onDestroy(() => {
    // Cleanup
    if (animationOrchestrator) {
      animationOrchestrator.dispose();
    }
  });
</script>

<div class="timeline-preview">
  <!-- Preview Header -->
  <div class="preview-header">
    <span class="preview-label">Preview</span>
    <span class="time-display">{formatTime(playheadPosition)}</span>
    {#if activeClip}
      <span
        class="clip-info"
        title={activeClip.sequence.word || activeClip.sequence.name}
      >
        {activeClip.sequence.word || activeClip.sequence.name || "Clip"}
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
    {:else if activeClip && currentSequence && leftPropState && rightPropState}
      <div class="canvas-container">
        <AnimatorCanvas
          leftProp={leftPropState}
          rightProp={rightPropState}
          gridVisible={true}
          gridMode={currentSequence.gridMode ?? null}
          letter={currentLetter}
          stepData={currentStepData}
          currentStep={Math.floor(clipStepPosition)}
          sequenceData={currentSequence}
          trailSettings={animationSettings.trail}
        />
      </div>

      <!-- Beat indicator overlay -->
      <div class="beat-indicator">
        {#if isAtStartPlacement}
          Start
        {:else}
          Beat {Math.floor(clipStepPosition)} / {activeClip.sequence.steps
            ?.length || 1}
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
        <i class="fas fa-film" aria-hidden="true"></i>
        <span>No clip at playhead</span>
        <span class="hint">Position the playhead over a clip to preview</span>
      </div>
    {/if}
  </div>

  <!-- Transport Controls -->
  <div class="transport-controls">
    <!-- Scrubber -->
    <div class="scrubber">
      <input
        type="range"
        min="0"
        max={totalDuration}
        step="0.01"
        value={playheadPosition}
        oninput={(e) =>
          getPlayback().seek(parseFloat((e.target as HTMLInputElement).value))}
        class="scrub-slider"
      />
    </div>

    <!-- Control buttons -->
    <div class="control-buttons">
      <button
        class="transport-btn"
        onclick={() => getPlayback().goToStart()}
        title="Go to start (Home)"
        aria-label="Go to start"
      >
        <i class="fas fa-backward-fast" aria-hidden="true"></i>
      </button>
      <button
        class="transport-btn"
        onclick={() => getPlayback().stepBackward(1)}
        title="Previous frame (←)"
        aria-label="Previous frame"
      >
        <i class="fas fa-backward-step" aria-hidden="true"></i>
      </button>
      <button
        class="transport-btn play-btn"
        onclick={() => getPlayback().togglePlayPause()}
        title={isPlaying ? "Pause (Space)" : "Play (Space)"}
        aria-label={isPlaying ? "Pause" : "Play"}
      >
        <i class="fas {isPlaying ? 'fa-pause' : 'fa-play'}" aria-hidden="true"
        ></i>
      </button>
      <button
        class="transport-btn"
        onclick={() => getPlayback().stepForward(1)}
        title="Next frame (→)"
        aria-label="Next frame"
      >
        <i class="fas fa-forward-step" aria-hidden="true"></i>
      </button>
      <button
        class="transport-btn"
        onclick={() => getPlayback().goToEnd()}
        title="Go to end (End)"
        aria-label="Go to end"
      >
        <i class="fas fa-forward-fast" aria-hidden="true"></i>
      </button>
    </div>
  </div>
</div>

<style>
  .timeline-preview {
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
    color: var(--theme-text, var(--theme-text));
  }

  .time-display {
    font-family: "SF Mono", monospace;
    color: var(--theme-accent);
    background: color-mix(in srgb, var(--theme-accent) 10%, transparent);
    padding: 2px 8px;
    border-radius: 4px;
  }

  .clip-info {
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

  .beat-indicator {
    position: absolute;
    bottom: 8px;
    left: 8px;
    padding: 4px 8px;
    background: rgba(0, 0, 0, 0.7);
    border-radius: 4px;
    font-size: var(--font-size-compact);
    color: var(--theme-text-dim);
    backdrop-filter: blur(4px);
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
    background: color-mix(in srgb, var(--semantic-success, #51cf66) 20%, transparent);
    border-radius: 50%;
    backdrop-filter: blur(4px);
    color: var(--semantic-success, #51cf66);
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
    background: var(--theme-accent);
    cursor: pointer;
    transition: transform var(--duration-instant) ease;
  }

  .scrub-slider::-webkit-slider-thumb:hover {
    transform: scale(1.2);
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

  .transport-btn:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.1));
    color: white;
  }

  .transport-btn.play-btn {
    width: 52px; /* WCAG AAA touch target - slightly larger for primary */
    height: 52px;
    background: color-mix(in srgb, var(--theme-accent) 20%, transparent);
    color: var(--theme-accent);
    font-size: var(--font-size-sm);
  }

  .transport-btn.play-btn:hover {
    background: color-mix(in srgb, var(--theme-accent) 30%, transparent);
  }

  /* Accessibility: Respect user's motion preferences (WCAG AAA) */
  @media (prefers-reduced-motion: reduce) {
    .playback-status {
      animation: none;
    }
  }
</style>
