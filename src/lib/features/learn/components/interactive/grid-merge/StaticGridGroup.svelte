<!--
  StaticGridGroup - The "diamond" grid that stays stationary (no rotation)
  Contains center point + cardinal outer/hand points at N/E/S/W positions
  In split phases: positioned left/top, scaled 0.5
  In merged phase: centered, full scale, overlays with rotating grid
  Hidden in intro phase (rotating grid shows the diamond initially)
-->
<script lang="ts">
  import {
    GRID,
    CARDINAL_OUTER,
    CARDINAL_HAND,
    type Phase,
    type HighlightPhase,
  } from "./grid-merge-constants";

  let { phase, highlightPhase = "none" } = $props<{
    phase: Phase;
    highlightPhase?: HighlightPhase;
  }>();

  const isSplit = $derived(
    phase === "split" ||
      phase === "diamond-labels" ||
      phase === "box-labels" ||
      phase === "split-highlight"
  );

  const isIntro = $derived(phase === "intro");
  const isMerged = $derived(phase === "merged");
  const isDimmed = $derived(phase === "box-labels");
</script>

<g
  class="static-grid"
  class:intro={isIntro}
  class:split={isSplit}
  class:merged={isMerged}
  class:dimmed={isDimmed}
  class:highlight-center={highlightPhase === "center"}
  class:highlight-hand={highlightPhase === "hand"}
  class:highlight-outer={highlightPhase === "outer"}
>
  <!-- Static center point (duplicate for diamond side when split) -->
  <circle
    class="center-point"
    cx={GRID.CENTER}
    cy={GRID.CENTER}
    r={GRID.CENTER_POINT_RADIUS}
  />

  <!-- Static cardinal outer points -->
  {#each CARDINAL_OUTER as point, i}
    <circle
      class="outer-point"
      cx={point.x}
      cy={point.y}
      r={GRID.POINT_RADIUS}
      data-index={i}
    />
  {/each}

  <!-- Static cardinal hand points -->
  {#each CARDINAL_HAND as point, i}
    <circle
      class="hand-point"
      cx={point.x}
      cy={point.y}
      r={GRID.HAND_POINT_RADIUS}
      data-index={i}
    />
  {/each}
</g>

<style>
  .static-grid {
    transform-origin: var(--grid-center) var(--grid-center);
    will-change: transform, opacity;
    transition:
      transform var(--merge-duration) var(--merge-easing),
      opacity var(--merge-duration) var(--ease-standard-out);
  }

  /* Points base styling - uses theme variables for light/dark mode */
  .center-point {
    fill: var(--theme-text-dim, #9ca3af);
    transform-box: fill-box;
    transform-origin: center;
    opacity: 0;
    transform: scale(0);
    transition:
      fill var(--highlight-duration) var(--ease-standard-out),
      opacity var(--highlight-duration) var(--ease-standard-out),
      transform var(--entrance-duration) var(--merge-easing);
  }

  .outer-point {
    fill: var(--theme-text-dim, #9ca3af);
    stroke: var(--theme-text-dim, #9ca3af);
    stroke-width: 13;
    stroke-miterlimit: 10;
    fill-opacity: 1;
    stroke-opacity: 0;
    transform-box: fill-box;
    transform-origin: center;
    opacity: 0;
    transform: scale(0);
    transition:
      fill var(--highlight-duration) var(--ease-standard-out),
      stroke var(--highlight-duration) var(--ease-standard-out),
      fill-opacity var(--duration-normal) var(--ease-standard-out),
      stroke-opacity var(--duration-normal) var(--ease-standard-out),
      opacity var(--highlight-duration) var(--ease-standard-out),
      transform var(--entrance-duration) var(--merge-easing);
  }

  .hand-point {
    fill: var(--theme-text-tertiary, #6b7280);
    transform-box: fill-box;
    transform-origin: center;
    opacity: 0;
    transform: scale(0);
    transition:
      fill var(--highlight-duration) var(--ease-standard-out),
      opacity var(--highlight-duration) var(--ease-standard-out),
      transform var(--entrance-duration) var(--merge-easing);
  }

  /* === INTRO: Hidden (rotating grid shows diamond) === */
  .intro {
    opacity: 0;
  }

  /* === SPLIT: Left/top, scaled === */
  .split {
    transform: translate(var(--split-offset-x-neg), var(--split-offset-y-neg))
      scale(0.5);
  }

  .split .center-point,
  .split .outer-point,
  .split .hand-point {
    opacity: 1;
    transform: scale(1);
  }

  /* Dimmed during box-labels phase */
  .dimmed {
    opacity: 0.5;
  }

  /* === MERGED: Centered, full scale === */
  .merged {
    transform: translate(0, 0) scale(1);
  }

  .merged .center-point {
    /* Hide duplicate center in merged (rotating grid has one) */
    opacity: 0;
  }

  .merged .outer-point,
  .merged .hand-point {
    opacity: 1;
    transform: scale(1);
  }

  /* Dim non-highlighted point types */
  .highlight-center .outer-point,
  .highlight-center .hand-point,
  .highlight-hand .outer-point,
  .highlight-hand .center-point,
  .highlight-outer .center-point,
  .highlight-outer .hand-point {
    opacity: 0.25;
  }

  /* Center highlighted */
  .highlight-center .center-point {
    opacity: 1;
    fill: var(--theme-accent, #22d3ee);
    animation: highlightPulse var(--highlight-duration) var(--merge-easing)
      forwards;
  }

  /* Hand points highlighted with stagger */
  .highlight-hand .hand-point {
    opacity: 1;
    fill: var(--theme-accent, #22d3ee);
    animation: highlightPulse var(--highlight-duration) var(--merge-easing)
      forwards;
  }
  .highlight-hand .hand-point[data-index="0"] {
    animation-delay: 0ms;
  }
  .highlight-hand .hand-point[data-index="1"] {
    animation-delay: var(--stagger-relaxed);
  }
  .highlight-hand .hand-point[data-index="2"] {
    animation-delay: calc(var(--stagger-relaxed) * 2);
  }
  .highlight-hand .hand-point[data-index="3"] {
    animation-delay: calc(var(--stagger-relaxed) * 3);
  }

  /* Outer points highlighted with stagger (filled style for diamond) */
  .highlight-outer .outer-point {
    opacity: 1;
    fill: var(--theme-accent, #22d3ee);
    fill-opacity: 1;
    stroke-opacity: 0;
    animation: highlightPulse var(--highlight-duration) var(--merge-easing)
      forwards;
  }
  .highlight-outer .outer-point[data-index="0"] {
    animation-delay: 0ms;
  }
  .highlight-outer .outer-point[data-index="1"] {
    animation-delay: var(--stagger-relaxed);
  }
  .highlight-outer .outer-point[data-index="2"] {
    animation-delay: calc(var(--stagger-relaxed) * 2);
  }
  .highlight-outer .outer-point[data-index="3"] {
    animation-delay: calc(var(--stagger-relaxed) * 3);
  }

  @keyframes highlightPulse {
    0% {
      transform: scale(1);
    }
    30% {
      transform: scale(1.3);
    }
    60% {
      transform: scale(0.95);
    }
    100% {
      transform: scale(1);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .static-grid,
    .center-point,
    .outer-point,
    .hand-point {
      transition: none;
    }
  }

  /* Accessibility: Respect user's motion preferences (WCAG AAA) */
  @media (prefers-reduced-motion: reduce) {
    .center-point {
      animation: none;
    }
    .hand-point {
      animation: none;
    }
    .outer-point {
      animation: none;
    }
  }
</style>
