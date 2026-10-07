<script lang="ts">
  /**
   * SnapGuides - Visual indicators for snap points
   *
   * Shows vertical lines when clips are being dragged near snap points.
   * Provides visual feedback for beat markers, clip edges, grid, and playhead.
   */

  import { getTimelineState } from "$lib/shared/animation-engine/state/timeline-state.svelte";
  import { timeToPixels, type TimeSeconds } from "$lib/shared/animation-engine/domain/timeline-types";
  import { generateStepTimestamps } from "$lib/shared/audio/bpm-analyzer";

  interface Props {
    /** Active snap point (shown when dragging) */
    activeSnapTime: TimeSeconds | null;
    /** Height of the timeline tracks area */
    height: number;
  }

  let { activeSnapTime, height }: Props = $props();

  function getState() {
    return getTimelineState();
  }

  // Local reactive state (synced via effects)
  let beatMarkers = $state<TimeSeconds[]>([]);
  let downbeats = $state<TimeSeconds[]>([]);
  let gridLines = $state<TimeSeconds[]>([]);
  let clipEdges = $state<TimeSeconds[]>([]);
  let activeSnapX = $state<number | null>(null);
  let pixelsPerSecond = $state(50);
  let playheadPosition = $state(0);
  let snapToSteps = $state(false);

  // Sync local state from timeline state
  $effect(() => {
    const state = getState();
    pixelsPerSecond = state.viewport.pixelsPerSecond;
    playheadPosition = state.playhead.position;
    snapToSteps = state.project.snap.snapToSteps;

    // Generate beat markers from audio BPM
    if (
      state.project.audio.bpm &&
      state.project.audio.duration &&
      state.project.snap.snapToSteps
    ) {
      beatMarkers = generateStepTimestamps(
        state.project.audio.bpm,
        state.project.audio.duration
      );
      downbeats = beatMarkers.filter((_, i) => i % 4 === 0);
    } else {
      beatMarkers = [];
      downbeats = [];
    }

    // Grid lines based on interval
    if (state.project.snap.snapToGrid) {
      const lines: TimeSeconds[] = [];
      const interval = state.project.snap.gridInterval;
      const maxTime = state.totalDuration + 10;
      for (let t = 0; t <= maxTime; t += interval) {
        lines.push(t);
      }
      gridLines = lines;
    } else {
      gridLines = [];
    }

    // Clip edges
    if (state.project.snap.snapToClips) {
      const edges: TimeSeconds[] = [];
      for (const track of state.project.tracks) {
        for (const clip of track.clips) {
          edges.push(clip.startTime);
          edges.push(clip.startTime + clip.duration);
        }
      }
      clipEdges = [...new Set(edges)];
    } else {
      clipEdges = [];
    }

    // Active snap position in pixels
    activeSnapX =
      activeSnapTime !== null
        ? timeToPixels(activeSnapTime, pixelsPerSecond)
        : null;
  });

  // Determine snap type for styling
  function getSnapType(
    time: TimeSeconds
  ): "beat" | "clip" | "grid" | "playhead" {
    if (Math.abs(time - playheadPosition) < 0.01) return "playhead";
    if (downbeats.includes(time)) return "beat";
    if (clipEdges.includes(time)) return "clip";
    return "grid";
  }
</script>

<div class="snap-guides" style="height: {height}px">
  <!-- Beat marker guides (subtle, always visible when snapping to steps) -->
  {#if snapToSteps}
    {#each downbeats as beatTime}
      {@const x = timeToPixels(beatTime, pixelsPerSecond)}
      <div
        class="snap-guide beat"
        style="left: {x}px; height: {height}px"
      ></div>
    {/each}
  {/if}

  <!-- Grid guides (subtle, always visible when snapping to grid) -->
  {#if gridLines.length > 0}
    {#each gridLines as gridTime}
      {@const x = timeToPixels(gridTime, pixelsPerSecond)}
      <div
        class="snap-guide grid"
        style="left: {x}px; height: {height}px"
      ></div>
    {/each}
  {/if}

  <!-- Active snap indicator (bright, shown during drag) -->
  {#if activeSnapX !== null && activeSnapTime !== null}
    {@const snapType = getSnapType(activeSnapTime)}
    <div
      class="snap-guide active {snapType}"
      style="left: {activeSnapX}px; height: {height}px"
    >
      <div class="snap-label">{activeSnapTime.toFixed(2)}s</div>
    </div>
  {/if}
</div>

<style>
  .snap-guides {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 5;
    overflow: hidden;
  }

  .snap-guide {
    position: absolute;
    top: 0;
    width: 1px;
    transition: all var(--duration-fast) ease;
  }

  /* Beat marker guides - purple/info color */
  .snap-guide.beat {
    background: color-mix(in srgb, var(--semantic-info) 15%, transparent);
  }

  /* Grid guides - subtle theme stroke */
  .snap-guide.grid {
    background: var(--theme-stroke, var(--theme-card-bg));
  }

  /* Clip edge guides - accent */
  .snap-guide.clip {
    background: color-mix(in srgb, var(--theme-accent) 15%, transparent);
  }

  /* Active snap indicator - bright and prominent */
  .snap-guide.active {
    width: 2px;
    z-index: 10;
  }

  .snap-guide.active.beat {
    background: color-mix(in srgb, var(--semantic-info) 80%, white);
    box-shadow:
      0 0 10px color-mix(in srgb, var(--semantic-info) 60%, transparent),
      0 0 20px color-mix(in srgb, var(--semantic-info) 30%, transparent);
  }

  .snap-guide.active.clip {
    background: var(--theme-accent);
    box-shadow:
      0 0 10px color-mix(in srgb, var(--theme-accent) 60%, transparent),
      0 0 20px color-mix(in srgb, var(--theme-accent) 30%, transparent);
  }

  .snap-guide.active.grid {
    background: var(--theme-text);
    box-shadow:
      0 0 8px color-mix(in srgb, var(--theme-text, white) 40%, transparent),
      0 0 16px color-mix(in srgb, var(--theme-text, white) 20%, transparent);
  }

  .snap-guide.active.playhead {
    background: var(--theme-text);
    box-shadow:
      0 0 10px color-mix(in srgb, var(--theme-text, white) 60%, transparent),
      0 0 20px color-mix(in srgb, var(--theme-text, white) 30%, transparent);
  }

  .snap-label {
    position: absolute;
    top: 4px;
    left: 6px;
    padding: 3px 8px;
    background: var(--theme-panel-elevated-bg);
    border: 1px solid var(--theme-stroke, var(--theme-stroke));
    border-radius: 4px;
    font-size: var(--font-size-compact);
    font-weight: 600;
    color: var(--theme-text, white);
    white-space: nowrap;
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    box-shadow: 0 2px 6px var(--theme-shadow);
  }
</style>
