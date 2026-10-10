<script lang="ts">
  import { onDestroy } from "svelte";
  import { GridLocation } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
  import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
  import GridSvg from "#lib/shared/pictograph/grid/components/GridSvg.svelte";
  import type { DetectedPosition } from "#lib/shared/train/domain/detection-frame.js";

  interface Props {
    leftPosition: DetectedPosition | null;
    rightPosition: DetectedPosition | null;
    expectedLeft: GridLocation | null;
    expectedRight: GridLocation | null;
    showExpected?: boolean;
    bpm?: number;
    isPerforming?: boolean;
    gridScale?: number;
    gridMode?: GridMode;
  }

  let {
    leftPosition = null,
    rightPosition = null,
    expectedLeft = null,
    expectedRight = null,
    showExpected = true,
    bpm = 60,
    isPerforming = false,
    gridScale = 1.0,
    gridMode = GridMode.DIAMOND,
  }: Props = $props();

  // Grid coordinate system (950x950 centered at 475,475)
  const GRID_SIZE = 950;
  const GRID_CENTER = 475;
  const GRID_RADIUS = 360; // Radius to outer points

  // Map GridLocation to SVG coordinates (matching the "normal" hand points in diamond_grid.svg)
  // These are the non-strict hand point positions on the 950x950 grid
  const locationCoords: Record<GridLocation, { x: number; y: number }> = {
    [GridLocation.NORTH]: { x: 475, y: 331.9 }, // n_diamond_hand_point
    [GridLocation.NORTHEAST]: { x: 618.1, y: 331.9 }, // ne_diamond_layer2_point
    [GridLocation.EAST]: { x: 618.1, y: 475 }, // e_diamond_hand_point
    [GridLocation.SOUTHEAST]: { x: 618.1, y: 618.1 }, // se_diamond_layer2_point
    [GridLocation.SOUTH]: { x: 475, y: 618.1 }, // s_diamond_hand_point
    [GridLocation.SOUTHWEST]: { x: 331.9, y: 618.1 }, // sw_diamond_layer2_point
    [GridLocation.WEST]: { x: 331.9, y: 475 }, // w_diamond_hand_point
    [GridLocation.NORTHWEST]: { x: 331.9, y: 331.9 }, // nw_diamond_layer2_point
    [GridLocation.CENTER]: { x: 475, y: 475 }, // Center of grid
  };

  // Angles for each grid location (radians, 0 = East, counter-clockwise)
  const locationAngles: Record<GridLocation, number> = {
    [GridLocation.EAST]: 0,
    [GridLocation.NORTHEAST]: Math.PI / 4,
    [GridLocation.NORTH]: Math.PI / 2,
    [GridLocation.NORTHWEST]: (3 * Math.PI) / 4,
    [GridLocation.WEST]: Math.PI,
    [GridLocation.SOUTHWEST]: (5 * Math.PI) / 4,
    [GridLocation.SOUTH]: (3 * Math.PI) / 2,
    [GridLocation.SOUTHEAST]: (7 * Math.PI) / 4,
    [GridLocation.CENTER]: 0,
  };

  // Radius from center to hand points
  const ANIMATION_RADIUS = 143.1; // Distance from center (475) to hand points

  // Animation state for expected position indicators
  let animatedLeftPos = $state<{ x: number; y: number } | null>(null);
  let animatedRightPos = $state<{ x: number; y: number } | null>(null);

  // Animation tracking
  let leftAnimTarget: GridLocation | null = null;
  let leftAnimStartAngle: number = 0;
  let leftAnimTargetAngle: number = 0;
  let leftAnimStartTime: number = 0;
  let leftCurrentAngle: number = 0; // Track current angle for continuity

  let rightAnimTarget: GridLocation | null = null;
  let rightAnimStartAngle: number = 0;
  let rightAnimTargetAngle: number = 0;
  let rightAnimStartTime: number = 0;
  let rightCurrentAngle: number = 0; // Track current angle for continuity

  let animationFrameId: number | null = null;

  // Calculate animation duration based on BPM
  // During performance: 80% of beat duration for smooth continuous motion
  // Manual: fixed 300ms for responsive feel
  function getAnimationDuration(): number {
    if (isPerforming) {
      return (60 / bpm) * 1000 * 0.8;
    }
    return 300;
  }

  // Convert angle to x,y coordinates on the octagon
  function angleToCoords(angle: number): { x: number; y: number } {
    return {
      x: GRID_CENTER + Math.cos(angle) * ANIMATION_RADIUS,
      y: GRID_CENTER - Math.sin(angle) * ANIMATION_RADIUS, // SVG y is inverted
    };
  }

  // Find shortest angular distance (handles wraparound)
  function shortestAngleDelta(from: number, to: number): number {
    let delta = to - from;
    // Normalize to [-PI, PI]
    while (delta > Math.PI) delta -= 2 * Math.PI;
    while (delta < -Math.PI) delta += 2 * Math.PI;
    return delta;
  }

  // Start animation loop
  function startAnimationLoop() {
    if (animationFrameId !== null) return;

    function animate() {
      const now = performance.now();
      const duration = getAnimationDuration();
      let stillAnimating = false;

      // Animate the left-hand position
      if (leftAnimTarget !== null) {
        const elapsed = now - leftAnimStartTime;
        const progress = Math.min(elapsed / duration, 1.0);

        // Linear interpolation for consistent motion during performance
        const delta = shortestAngleDelta(
          leftAnimStartAngle,
          leftAnimTargetAngle
        );
        leftCurrentAngle = leftAnimStartAngle + delta * progress;
        animatedLeftPos = angleToCoords(leftCurrentAngle);

        if (progress >= 1.0) {
          leftCurrentAngle = leftAnimTargetAngle;
          animatedLeftPos = locationCoords[leftAnimTarget];
          leftAnimTarget = null;
        } else {
          stillAnimating = true;
        }
      }

      // Animate the right-hand position
      if (rightAnimTarget !== null) {
        const elapsed = now - rightAnimStartTime;
        const progress = Math.min(elapsed / duration, 1.0);

        const delta = shortestAngleDelta(
          rightAnimStartAngle,
          rightAnimTargetAngle
        );
        rightCurrentAngle = rightAnimStartAngle + delta * progress;
        animatedRightPos = angleToCoords(rightCurrentAngle);

        if (progress >= 1.0) {
          rightCurrentAngle = rightAnimTargetAngle;
          animatedRightPos = locationCoords[rightAnimTarget];
          rightAnimTarget = null;
        } else {
          stillAnimating = true;
        }
      }

      if (stillAnimating) {
        animationFrameId = requestAnimationFrame(animate);
      } else {
        animationFrameId = null;
      }
    }

    animationFrameId = requestAnimationFrame(animate);
  }

  // Track last expected positions to detect changes
  let lastExpectedLeft: GridLocation | null = null;
  let lastExpectedRight: GridLocation | null = null;

  // Detect left-hand position changes and start animation
  $effect(() => {
    const target = expectedLeft;

    if (target !== lastExpectedLeft) {
      if (target !== null) {
        // Use tracked current angle, or initialize from last/target position
        if (lastExpectedLeft === null) {
          // First position - initialize current angle
          leftCurrentAngle = locationAngles[target];
        }

        leftAnimStartAngle = leftCurrentAngle;
        leftAnimTargetAngle = locationAngles[target];
        leftAnimStartTime = performance.now();
        leftAnimTarget = target;

        startAnimationLoop();
      } else {
        animatedLeftPos = null;
        leftAnimTarget = null;
      }
      lastExpectedLeft = target;
    }
  });

  // Detect right-hand position changes and start animation
  $effect(() => {
    const target = expectedRight;

    if (target !== lastExpectedRight) {
      if (target !== null) {
        // Use tracked current angle, or initialize from last/target position
        if (lastExpectedRight === null) {
          // First position - initialize current angle
          rightCurrentAngle = locationAngles[target];
        }

        rightAnimStartAngle = rightCurrentAngle;
        rightAnimTargetAngle = locationAngles[target];
        rightAnimStartTime = performance.now();
        rightAnimTarget = target;

        startAnimationLoop();
      } else {
        animatedRightPos = null;
        rightAnimTarget = null;
      }
      lastExpectedRight = target;
    }
  });

  // Cleanup on destroy
  onDestroy(() => {
    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
  });

  // Convert normalized coordinates (0-1) to grid SVG coordinates
  function normalizedToGrid(x: number, y: number): { x: number; y: number } {
    return {
      x: x * GRID_SIZE,
      y: y * GRID_SIZE,
    };
  }

  // Check if detected matches expected
  function isCorrect(
    detected: GridLocation | undefined,
    expected: GridLocation | null
  ): boolean {
    if (!detected || !expected) return false;
    return detected === expected;
  }

  // Get status color based on correctness
  function getStatusColor(
    detected: DetectedPosition | null,
    expected: GridLocation | null
  ): string {
    if (!detected) return "transparent";
    if (!expected || !showExpected) return "white"; // No expectation, just show detected
    return isCorrect(detected.quadrant, expected)
      ? "var(--semantic-success)"
      : "var(--semantic-error)"; // green or red
  }

  // Derived correctness states
  const leftCorrect = $derived(
    leftPosition && expectedLeft
      ? isCorrect(leftPosition.quadrant, expectedLeft)
      : null
  );
  const rightCorrect = $derived(
    rightPosition && expectedRight
      ? isCorrect(rightPosition.quadrant, expectedRight)
      : null
  );
</script>

<div
  class="grid-overlay-container"
  class:mode-diamond={gridMode === GridMode.DIAMOND}
  class:mode-box={gridMode === GridMode.BOX}
>
  <!-- Debug overlay - matches camera coordinates exactly (0-100%) -->
  <svg class="debug-overlay" viewBox="0 0 100 100" preserveAspectRatio="none">
    <!-- Detected left-hand debug landmarks -->
    {#if leftPosition?.debug}
      {@const wrist = leftPosition.debug.wrist}
      {@const finger = leftPosition.debug.middleFingerTip}
      {@const palm = leftPosition.debug.palmCenter}

      <!-- Line connecting wrist to finger base -->
      <line
        x1={wrist.x * 100}
        y1={wrist.y * 100}
        x2={finger.x * 100}
        y2={finger.y * 100}
        stroke="var(--semantic-info)"
        stroke-width="0.3"
        stroke-dasharray="1,1"
        opacity="0.7"
      />

      <!-- Wrist - Yellow circle -->
      <circle
        cx={wrist.x * 100}
        cy={wrist.y * 100}
        r="1.5"
        fill="var(--semantic-warning)"
        stroke="#000"
        stroke-width="0.3"
      />
      <text
        x={wrist.x * 100}
        y={wrist.y * 100 - 3}
        text-anchor="middle"
        fill="var(--semantic-warning)"
        font-size="2.5"
        font-weight="bold">W</text
      >

      <!-- Middle finger base - Green circle -->
      <circle
        cx={finger.x * 100}
        cy={finger.y * 100}
        r="1.5"
        fill="var(--semantic-success)"
        stroke="#000"
        stroke-width="0.3"
      />
      <text
        x={finger.x * 100}
        y={finger.y * 100 - 3}
        text-anchor="middle"
        fill="var(--semantic-success)"
        font-size="2.5"
        font-weight="bold">F</text
      >

      <!-- Palm center (calculated) - Blue circle -->
      <circle
        cx={palm.x * 100}
        cy={palm.y * 100}
        r="2.5"
        fill="var(--semantic-info)"
        stroke="white"
        stroke-width="0.4"
      />
      <text
        x={palm.x * 100}
        y={palm.y * 100 - 4}
        text-anchor="middle"
        fill="var(--semantic-info)"
        font-size="2.5"
        font-weight="bold">P</text
      >
    {/if}

    <!-- Detected right-hand debug landmarks -->
    {#if rightPosition?.debug}
      {@const wrist = rightPosition.debug.wrist}
      {@const finger = rightPosition.debug.middleFingerTip}
      {@const palm = rightPosition.debug.palmCenter}

      <!-- Line connecting wrist to finger base -->
      <line
        x1={wrist.x * 100}
        y1={wrist.y * 100}
        x2={finger.x * 100}
        y2={finger.y * 100}
        stroke="var(--semantic-error)"
        stroke-width="0.3"
        stroke-dasharray="1,1"
        opacity="0.7"
      />

      <!-- Wrist - Yellow circle -->
      <circle
        cx={wrist.x * 100}
        cy={wrist.y * 100}
        r="1.5"
        fill="var(--semantic-warning)"
        stroke="#000"
        stroke-width="0.3"
      />
      <text
        x={wrist.x * 100}
        y={wrist.y * 100 - 3}
        text-anchor="middle"
        fill="var(--semantic-warning)"
        font-size="2.5"
        font-weight="bold">W</text
      >

      <!-- Middle finger base - Green circle -->
      <circle
        cx={finger.x * 100}
        cy={finger.y * 100}
        r="1.5"
        fill="var(--semantic-success)"
        stroke="#000"
        stroke-width="0.3"
      />
      <text
        x={finger.x * 100}
        y={finger.y * 100 - 3}
        text-anchor="middle"
        fill="var(--semantic-success)"
        font-size="2.5"
        font-weight="bold">F</text
      >

      <!-- Palm center (calculated) - Red circle -->
      <circle
        cx={palm.x * 100}
        cy={palm.y * 100}
        r="2.5"
        fill="var(--semantic-error)"
        stroke="white"
        stroke-width="0.4"
      />
      <text
        x={palm.x * 100}
        y={palm.y * 100 - 4}
        text-anchor="middle"
        fill="var(--semantic-error)"
        font-size="2.5"
        font-weight="bold">P</text
      >
    {/if}
  </svg>

  <!-- Grid overlay - 1:1 aspect ratio centered, scalable -->
  <svg
    class="grid-overlay"
    viewBox="0 0 950 950"
    preserveAspectRatio="xMidYMid slice"
    style="transform: scale({gridScale})"
  >
    <!-- Use the existing GridSvg component (no background overlay) -->
    <GridSvg {gridMode} showNonRadialPoints={true} />

    <!-- Expected position indicators (dashed circles) - animated -->
    {#if showExpected}
      {#if animatedLeftPos}
        {@const strokeColor =
          leftCorrect === true
            ? "var(--semantic-success)"
            : leftCorrect === false
              ? "var(--semantic-error)"
              : "var(--semantic-info)"}
        {@const fillColor =
          leftCorrect === true ? "rgba(34, 197, 94, 0.2)" : "none"}
        <circle
          cx={animatedLeftPos.x}
          cy={animatedLeftPos.y}
          r="40"
          fill={fillColor}
          stroke={strokeColor}
          stroke-width="4"
          stroke-dasharray={leftCorrect === true ? "0" : "20,10"}
          opacity={leftCorrect === true ? "1.0" : "0.7"}
          class="expected-indicator"
        />
      {/if}
      {#if animatedRightPos}
        {@const strokeColor =
          rightCorrect === true
            ? "var(--semantic-success)"
            : rightCorrect === false
              ? "var(--semantic-error)"
              : "var(--semantic-error)"}
        {@const fillColor =
          rightCorrect === true ? "rgba(34, 197, 94, 0.2)" : "none"}
        <circle
          cx={animatedRightPos.x}
          cy={animatedRightPos.y}
          r="40"
          fill={fillColor}
          stroke={strokeColor}
          stroke-width="4"
          stroke-dasharray={rightCorrect === true ? "0" : "20,10"}
          opacity={rightCorrect === true ? "1.0" : "0.7"}
          class="expected-indicator"
        />
      {/if}
    {/if}

    <!-- Detected left hand - Quadrant indicator at the hand point -->
    {#if leftPosition}
      {@const quadrantPos = locationCoords[leftPosition.quadrant]}
      <circle
        cx={quadrantPos.x}
        cy={quadrantPos.y}
        r="35"
        fill="var(--semantic-info)"
        stroke="white"
        stroke-width="4"
      />
      <text
        x={quadrantPos.x}
        y={quadrantPos.y + 8}
        text-anchor="middle"
        dominant-baseline="middle"
        fill="white"
        font-size="32"
        font-weight="bold"
      >
        L
      </text>
    {/if}

    <!-- Detected right hand - Quadrant indicator at the hand point -->
    {#if rightPosition}
      {@const quadrantPos = locationCoords[rightPosition.quadrant]}
      <circle
        cx={quadrantPos.x}
        cy={quadrantPos.y}
        r="35"
        fill="var(--semantic-error)"
        stroke="white"
        stroke-width="4"
      />
      <text
        x={quadrantPos.x}
        y={quadrantPos.y + 8}
        text-anchor="middle"
        dominant-baseline="middle"
        fill="white"
        font-size="32"
        font-weight="bold"
      >
        R
      </text>
    {/if}
  </svg>
</div>

<style>
  .grid-overlay-container {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 10;
  }

  /* Debug overlay - stretches to fill entire container to match camera feed */
  .debug-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 20;
  }

  /* Grid overlay - centered 1:1 aspect ratio */
  .grid-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 15;
  }

  /* Show the outer points (big circles at edges) */
  .grid-overlay :global(#n_diamond_outer_point),
  .grid-overlay :global(#e_diamond_outer_point),
  .grid-overlay :global(#s_diamond_outer_point),
  .grid-overlay :global(#w_diamond_outer_point) {
    fill: #000 !important;
    opacity: 0.9;
  }

  /* Make ALL grid points black and visible by default */
  .grid-overlay :global(.normal-hand-point) {
    fill: #000 !important;
    opacity: 0.9;
  }

  .grid-overlay :global(.normal-layer2-point) {
    fill: #000 !important;
    opacity: 0.9;
  }

  /* DIAMOND mode: Show only cardinal points (N, E, S, W) - hide intercardinal */
  .mode-diamond .grid-overlay :global(.normal-layer2-point) {
    display: none;
  }

  /* BOX mode: Show only intercardinal points (NE, SE, SW, NW) - hide cardinal */
  .mode-box .grid-overlay :global(.normal-hand-point) {
    display: none;
  }

  .grid-overlay :global(#center_point) {
    fill: #000 !important;
    opacity: 0.9;
  }

  /* Hide strict points */
  .grid-overlay :global(.strict-hand-point),
  .grid-overlay :global(.strict-layer2-point) {
    display: none;
  }

  /* Animation for correct position indicator */
  @keyframes pulse-success {
    0%,
    100% {
      opacity: 1;
      transform: scale(1);
    }
    50% {
      opacity: 0.8;
      transform: scale(1.1);
    }
  }

  .expected-indicator {
    /* Only transition color/opacity changes, not position (handled by JS animation) */
    transition:
      fill 0.3s ease,
      stroke 0.3s ease,
      opacity 0.3s ease,
      stroke-dasharray 0.3s ease;
  }
</style>
