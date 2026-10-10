<!--
LessonGridDisplay - Theme-aware grid visualization for lessons
Shows diamond or box grid respecting user's theme settings.
Uses the actual GridSvg component for consistency with the rest of the app.
-->
<script lang="ts">
  import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
  import GridSvg from "#lib/shared/pictograph/grid/components/GridSvg.svelte";

  type GridType = "diamond" | "box" | "merged";
  type SizeType = "small" | "medium" | "large";

  interface LabelPosition {
    x: number;
    y: number;
  }

  let {
    type = "diamond",
    showLabels = false,
    labels = null,
    size = "medium",
    pulsing = false,
    animateEntrance = false,
  } = $props<{
    type?: GridType;
    showLabels?: boolean;
    labels?: Record<string, LabelPosition> | null;
    size?: SizeType;
    pulsing?: boolean;
    /** Animate points appearing one by one (pedagogical entrance) */
    animateEntrance?: boolean;
  }>();

  const gridMode = $derived(type === "box" ? GridMode.BOX : GridMode.DIAMOND);
  const showMerged = $derived(type === "merged");

  // Label positions for diamond mode (N, E, S, W)
  const diamondLabels: Record<string, LabelPosition> = {
    N: { x: 475, y: 80 },
    E: { x: 870, y: 485 },
    S: { x: 475, y: 890 },
    W: { x: 80, y: 485 },
  };

  // Label positions for box mode (NE, SE, SW, NW)
  const boxLabels: Record<string, LabelPosition> = {
    NE: { x: 730, y: 200 },
    SE: { x: 750, y: 770 },
    SW: { x: 200, y: 770 },
    NW: { x: 200, y: 200 },
  };

  const effectiveLabels = $derived(
    labels ?? (type === "box" ? boxLabels : diamondLabels)
  );

  // Get size class based on size prop
  const sizeClass = $derived(
    size === "small"
      ? "grid-small"
      : size === "large"
        ? "grid-large"
        : "grid-medium"
  );
</script>

<div class="lesson-grid-display {sizeClass}" class:pulsing class:animate-entrance={animateEntrance}>
  <svg viewBox="0 0 950 950" class="grid-svg">
    <!-- Background that respects light/dark mode -->
    <rect class="grid-background" width="950" height="950" rx="8" />

    {#if showMerged}
      <!-- Show both diamond and box grids overlaid for 8-point view -->
      <g class="merged-grids">
        <!-- Diamond grid (N, E, S, W points) -->
        <GridSvg gridMode={GridMode.DIAMOND} />
        <!-- Box grid (NE, SE, SW, NW points) - rendered on top -->
        <GridSvg gridMode={GridMode.BOX} />
      </g>
    {:else}
      <GridSvg {gridMode} />
    {/if}

    <!-- Direction labels -->
    {#if showLabels && effectiveLabels}
      <g class="direction-labels">
        {#each Object.entries(effectiveLabels) as [label, pos]}
          {@const position = pos as LabelPosition}
          <text
            x={position.x}
            y={position.y}
            text-anchor="middle"
            dominant-baseline="middle"
            class="direction-label"
          >
            {label}
          </text>
        {/each}
      </g>
    {/if}
  </svg>
</div>

<style>
  .lesson-grid-display {
    display: flex;
    justify-content: center;
    align-items: center;
    width: 100%;
  }

  .grid-svg {
    width: 100%;
    height: auto;
    aspect-ratio: 1;
    border-radius: 8px;
    overflow: hidden;
  }

  /* Background respects light/dark mode - matches PictographRenderer */
  .grid-background {
    fill: var(--lm-pictograph-bg, #ffffff);
    transition: fill var(--duration-fast) ease-out;
  }

  :global(:root.dark) .grid-background {
    fill: var(--dm-pictograph-bg, #0a0a0f);
  }

  /* ============================================
     Animated Entrance - Points appear one by one
     Teaches "4-point grid" through animation
     ============================================ */

  /* Hide all points initially when animate-entrance is active */
  .animate-entrance :global(#center_point),
  .animate-entrance :global(#n_diamond_outer_point),
  .animate-entrance :global(#e_diamond_outer_point),
  .animate-entrance :global(#s_diamond_outer_point),
  .animate-entrance :global(#w_diamond_outer_point),
  .animate-entrance :global(.normal-hand-point),
  .animate-entrance :global(line) {
    opacity: 0;
    transform-origin: center;
    transform-box: fill-box;
  }

  /* Pop-in animation */
  @keyframes pointPopIn {
    0% {
      opacity: 0;
      transform: scale(0);
    }
    60% {
      opacity: 1;
      transform: scale(1.3);
    }
    80% {
      transform: scale(0.9);
    }
    100% {
      opacity: 1;
      transform: scale(1);
    }
  }

  /* Fade in for lines */
  @keyframes linesFadeIn {
    0% {
      opacity: 0;
    }
    100% {
      opacity: 1;
    }
  }

  /* Staggered entrance: Center first, then N, E, S, W */
  .animate-entrance :global(#center_point) {
    animation: pointPopIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) var(--duration-normal) forwards;
  }

  .animate-entrance :global(#n_diamond_outer_point) {
    animation: pointPopIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) 0.5s forwards;
  }

  .animate-entrance :global(#e_diamond_outer_point) {
    animation: pointPopIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) 0.7s forwards;
  }

  .animate-entrance :global(#s_diamond_outer_point) {
    animation: pointPopIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) 0.9s forwards;
  }

  .animate-entrance :global(#w_diamond_outer_point) {
    animation: pointPopIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) 1.1s forwards;
  }

  /* Hand points appear after outer points */
  .animate-entrance :global(.normal-hand-point) {
    animation: pointPopIn var(--duration-dramatic) cubic-bezier(0.34, 1.56, 0.64, 1) 1.4s forwards;
  }

  /* Lines fade in last */
  .animate-entrance :global(line) {
    animation: linesFadeIn 0.6s ease-out 1.6s forwards;
  }

  /* Size variants - applied to the container */
  .grid-small .grid-svg {
    max-width: 180px;
  }

  .grid-medium .grid-svg {
    max-width: 280px;
  }

  .grid-large .grid-svg {
    max-width: 380px;
  }

  /* Pulsing animation for emphasis */
  .pulsing .grid-svg {
    animation: gentle-pulse 2s ease-in-out infinite;
  }

  @keyframes gentle-pulse {
    0%,
    100% {
      transform: scale(1);
    }
    50% {
      transform: scale(1.02);
      box-shadow: 0 4px 16px
        color-mix(in srgb, var(--theme-accent) 20%, transparent);
    }
  }

  /* Direction labels */
  .direction-label {
    font-size: var(--font-size-3xl);
    font-weight: 700;
    fill: var(--theme-text, #374151);
    font-family:
      system-ui,
      -apple-system,
      sans-serif;
  }

  :global(:root.dark) .direction-label {
    fill: var(--theme-text-dim, #9ca3af);
  }

  /* Responsive */
  @media (max-width: 600px) {
    .grid-small .grid-svg {
      max-width: 140px;
    }

    .grid-medium .grid-svg {
      max-width: 220px;
    }

    .grid-large .grid-svg {
      max-width: 300px;
    }

    .direction-label {
      font-size: var(--font-size-3xl);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .pulsing .grid-svg {
      animation: none;
    }
  }
</style>
