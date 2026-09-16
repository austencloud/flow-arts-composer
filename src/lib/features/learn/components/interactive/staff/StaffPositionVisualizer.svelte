<!--
StaffPositionVisualizer - Interactive grid showing staff prop orientations
Shows staffs positioned on the 4-point diamond grid with thumb end markers.
Demonstrates Alpha, Beta, Gamma positions with thumb orientations (in, out, mixed).
-->
<script lang="ts">
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import type { HapticFeedback } from "$lib/shared/application/services/haptic-feedback";
  import {
    GRID_POINTS,
    LEFT_STAFF_COLOR,
    RIGHT_STAFF_COLOR,
    getPlacementType,
    getStaffEndpoints,
    type HandPosition,
    type ThumbOrientation,
    type PlacementType,
    type RotationType,
  } from "../../../domain/constants/staff-visualizer-data";
  import StaffPlacementBadge from "./staff-visualizer/StaffPlacementBadge.svelte";
  import StaffLegend from "./staff-visualizer/StaffLegend.svelte";
  import StaffRotationIndicator from "./staff-visualizer/StaffRotationIndicator.svelte";
  import StaffElement from "./staff-visualizer/StaffElement.svelte";
  import StaffGridPoint from "./staff-visualizer/StaffGridPoint.svelte";
  import RotationArcs from "./staff-visualizer/RotationArcs.svelte";

  let {
    leftPosition = $bindable<HandPosition>("N"),
    rightPosition = $bindable<HandPosition>("S"),
    leftThumbOrientation = $bindable<ThumbOrientation>("in"),
    rightThumbOrientation = $bindable<ThumbOrientation>("in"),
    showLabels = true,
    highlightType = null as PlacementType | null,
    showRotationPath = false,
    rotationType = "none" as RotationType,
    animating = false,
    interactive = false,
    onPositionChange,
  } = $props<{
    leftPosition?: HandPosition;
    rightPosition?: HandPosition;
    leftThumbOrientation?: ThumbOrientation;
    rightThumbOrientation?: ThumbOrientation;
    showLabels?: boolean;
    highlightType?: PlacementType | null;
    showRotationPath?: boolean;
    rotationType?: RotationType;
    animating?: boolean;
    interactive?: boolean;
    onPositionChange?: (
      leftPos: HandPosition,
      rightPos: HandPosition,
      leftThumb: ThumbOrientation,
      rightThumb: ThumbOrientation
    ) => void;
  }>();

  const hapticService = getHapticFeedback();

  const currentPlacementType = $derived(
    getPlacementType(leftPosition, rightPosition)
  );
  const leftStaff = $derived(
    getStaffEndpoints(leftPosition, leftThumbOrientation)
  );
  const rightStaff = $derived(
    getStaffEndpoints(rightPosition, rightThumbOrientation)
  );

  function handlePointClick(point: HandPosition) {
    if (!interactive) return;
    hapticService?.trigger("selection");
  }
</script>

<div class="staff-visualizer" class:interactive class:animating>
  <!-- Placement type badge -->
  {#if highlightType || currentPlacementType}
    <StaffPlacementBadge type={highlightType || currentPlacementType} />
  {/if}

  <!-- Grid SVG -->
  <svg viewBox="0 0 100 100" class="staff-grid">
    <!-- Grid lines (subtle diamond shape) -->
    <g class="grid-lines" opacity="0.2">
      <line x1="50" y1="15" x2="85" y2="50" stroke="white" stroke-width="0.5" />
      <line x1="85" y1="50" x2="50" y2="85" stroke="white" stroke-width="0.5" />
      <line x1="50" y1="85" x2="15" y2="50" stroke="white" stroke-width="0.5" />
      <line x1="15" y1="50" x2="50" y2="15" stroke="white" stroke-width="0.5" />
    </g>

    <!-- Center point -->
    <circle
      cx="50"
      cy="50"
      r="3"
      fill="var(--theme-stroke, rgba(255, 255, 255, 0.4))"
      class="center-point"
    />

    <!-- Grid points -->
    {#each Object.entries(GRID_POINTS) as [key, point]}
      <StaffGridPoint
        position={key as HandPosition}
        {point}
        showLabel={showLabels}
        {interactive}
        onclick={() => handlePointClick(key as HandPosition)}
      />
    {/each}

    <!-- Rotation path arcs -->
    {#if showRotationPath && rotationType !== "none"}
      <RotationArcs {leftPosition} {rightPosition} {rotationType} />
    {/if}

    <!-- Left Staff -->
    <StaffElement
      endpoints={leftStaff}
      color={LEFT_STAFF_COLOR}
      isAnimating={animating}
    />

    <!-- Right Staff -->
    <StaffElement
      endpoints={rightStaff}
      color={RIGHT_STAFF_COLOR}
      isAnimating={animating}
    />
  </svg>

  <!-- Thumb orientation legend -->
  <StaffLegend
    {leftPosition}
    {rightPosition}
    {leftThumbOrientation}
    {rightThumbOrientation}
  />

  <!-- Rotation type indicator -->
  {#if showRotationPath && rotationType !== "none"}
    <StaffRotationIndicator
      rotationType={rotationType as "prospin" | "antispin"}
    />
  {/if}
</div>

<style>
  .staff-visualizer {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    padding: 1rem;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.03));
    border: 1px solid var(--theme-stroke);
    border-radius: 16px;
  }

  .staff-visualizer.interactive {
    border-color: color-mix(in srgb, var(--prop-blue, #4a9eff) 30%, transparent);
  }

  .staff-grid {
    width: 100%;
    max-width: 280px;
    height: auto;
    aspect-ratio: 1;
  }

  .center-point {
    animation: centerPulse 2s ease-in-out infinite;
  }

  @keyframes centerPulse {
    0%,
    100% {
      opacity: 0.4;
      r: 3;
    }
    50% {
      opacity: 0.6;
      r: 4;
    }
  }

  @media (max-width: 400px) {
    .staff-visualizer {
      padding: 0.75rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .center-point {
      animation: none;
    }
  }
</style>
