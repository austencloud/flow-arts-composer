<script lang="ts">
  /**
   * StepGrid - Visual beat and measure markers for timeline tracks
   *
   * Renders vertical lines at beat/measure positions:
   * - Measure lines: Thick, prominent
   * - Beat lines: Medium weight
   * - Subdivision lines: Thin, only at high zoom
   */

  import type { TimeSignatureKey } from "#lib/shared/foundation/domain/models/time-signature.js";
  import type { TimeSeconds } from "#lib/shared/animation-engine/domain/timeline-types.js";
  import {
    calculateStepMarkers,
    calculateMeasureMarkers,
    calculateSubdivisionMarkers,
    type StepMarker,
    type MeasureMarker,
    type SubdivisionMarker,
  } from "#lib/shared/animation-engine/timeline/services/step-grid-calculator.js";
  import { timeToPixels } from "#lib/shared/animation-engine/domain/timeline-types.js";

  interface Props {
    bpm: number;
    timeSignature: TimeSignatureKey;
    duration: TimeSeconds;
    pixelsPerSecond: number;
    /** Optional: only render markers within this visible range for performance */
    visibleStart?: TimeSeconds;
    visibleEnd?: TimeSeconds;
    /** Show subdivision lines (typically only at high zoom) */
    showSubdivisions?: boolean;
  }

  let {
    bpm,
    timeSignature,
    duration,
    pixelsPerSecond,
    visibleStart = 0,
    visibleEnd,
    showSubdivisions = false,
  }: Props = $props();

  // Only show subdivisions at high zoom levels (> 100px per second)
  const shouldShowSubdivisions = $derived(
    showSubdivisions && pixelsPerSecond > 100
  );

  // Calculate markers based on BPM and time signature
  const beatMarkers = $derived.by(() => {
    if (bpm <= 0) return [];

    const allMarkers = calculateStepMarkers(bpm, duration, timeSignature);

    // Filter to visible range if specified
    const end = visibleEnd ?? duration;
    return allMarkers.filter(
      (m) => m.time >= visibleStart && m.time <= end
    );
  });

  const measureMarkers = $derived.by(() => {
    if (bpm <= 0) return [];

    const allMarkers = calculateMeasureMarkers(bpm, duration, timeSignature);

    // Filter to visible range if specified
    const end = visibleEnd ?? duration;
    return allMarkers.filter(
      (m) => m.time >= visibleStart && m.time <= end
    );
  });

  const subdivisionMarkers = $derived.by(() => {
    if (bpm <= 0 || !shouldShowSubdivisions) return [];

    const allMarkers = calculateSubdivisionMarkers(
      bpm,
      duration,
      timeSignature,
      4 // 16th note subdivisions
    );

    // Filter to visible range if specified
    const end = visibleEnd ?? duration;
    return allMarkers.filter(
      (m) => m.time >= visibleStart && m.time <= end
    );
  });

  // Convert time to pixel position
  function getPosition(time: TimeSeconds): number {
    return timeToPixels(time, pixelsPerSecond);
  }
</script>

<div class="step-grid" aria-hidden="true">
  <!-- Subdivision lines (thinnest, only at high zoom) -->
  {#if shouldShowSubdivisions}
    {#each subdivisionMarkers as marker (marker.time)}
      <div
        class="grid-line subdivision"
        style="left: {getPosition(marker.time)}px"
      ></div>
    {/each}
  {/if}

  <!-- Beat lines (medium weight) -->
  {#each beatMarkers as marker (marker.time)}
    {#if !marker.isMeasureStart}
      <div
        class="grid-line beat"
        class:strong={marker.isStrongBeat}
        style="left: {getPosition(marker.time)}px"
      ></div>
    {/if}
  {/each}

  <!-- Measure lines (thickest, with labels) -->
  {#each measureMarkers as marker (marker.time)}
    <div
      class="grid-line measure"
      style="left: {getPosition(marker.time)}px"
    >
      <span class="measure-label">{marker.measure}</span>
    </div>
  {/each}
</div>

<style>
  .step-grid {
    position: absolute;
    inset: 0;
    pointer-events: none;
    overflow: hidden;
  }

  .grid-line {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 1px;
    transform: translateX(-0.5px);
  }

  /* Subdivision lines - very subtle */
  .grid-line.subdivision {
    background: var(--theme-stroke, rgba(255, 255, 255, 0.05));
    opacity: 0.3;
  }

  /* Beat lines - subtle but visible */
  .grid-line.beat {
    background: var(--theme-stroke, rgba(255, 255, 255, 0.1));
    opacity: 0.5;
  }

  .grid-line.beat.strong {
    opacity: 0.7;
  }

  /* Measure lines - prominent */
  .grid-line.measure {
    background: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
    width: 2px;
    opacity: 0.8;
  }

  /* Measure number label */
  .measure-label {
    position: absolute;
    top: 4px;
    left: 6px;
    font-size: 10px;
    font-weight: 600;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.4));
    font-family: "SF Mono", "Monaco", "Consolas", monospace;
    white-space: nowrap;
    user-select: none;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
  }
</style>
