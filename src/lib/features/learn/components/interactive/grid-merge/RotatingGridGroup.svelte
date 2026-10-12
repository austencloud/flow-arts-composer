<!--
  RotatingGridGroup - The "box" grid that rotates 45 degrees
  Contains center point + cardinal outer/hand points that rotate together
  In split phases: positioned right/bottom, rotated 45deg, scaled 0.5
  In merged phase: centered, rotated 45deg, full scale
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
  const isDimmed = $derived(phase === "diamond-labels");
</script>

<g
  class="rotating-grid"
  class:intro={isIntro}
  class:split={isSplit}
  class:merged={isMerged}
  class:dimmed={isDimmed}
  class:highlight-center={highlightPhase === "center"}
  class:highlight-hand={highlightPhase === "hand"}
  class:highlight-outer={highlightPhase === "outer"}
>
  <!-- Center point -->
  <circle
    class="center-point"
    cx={GRID.CENTER}
    cy={GRID.CENTER}
    r={GRID.CENTER_POINT_RADIUS}
  />

  <!-- Cardinal outer points (rotate with grid) -->
  {#each CARDINAL_OUTER as point, i}
    <circle
      class="outer-point"
      cx={point.x}
      cy={point.y}
      r={GRID.POINT_RADIUS}
      data-index={i}
    />
  {/each}

  <!-- Cardinal hand points (rotate with grid) -->
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
  .rotating-grid {
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
    fill-opacity: 0;
    stroke-opacity: 1;
    transform-box: fill-box;
    transform-origin: center;
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
    transition:
      fill var(--highlight-duration) var(--ease-standard-out),
      opacity var(--highlight-duration) var(--ease-standard-out),
      transform var(--entrance-duration) var(--merge-easing);
  }

  /* === INTRO: No rotation, points animate in === */
  .intro {
    transform: rotate(0deg);
  }

  .intro .center-point,
  .intro .outer-point,
  .intro .hand-point {
    opacity: 0;
    transform: scale(0);
    animation: pointPop var(--entrance-duration) var(--merge-easing) forwards;
  }

  .intro .center-point {
    animation-delay: 0s;
  }
  .intro .outer-point[data-index="0"] {
    animation-delay: var(--duration-instant);
  }
  .intro .outer-point[data-index="1"] {
    animation-delay: var(--duration-normal);
  }
  .intro .outer-point[data-index="2"] {
    animation-delay: var(--duration-emphasis);
  }
  .intro .outer-point[data-index="3"] {
    animation-delay: var(--duration-dramatic);
  }
  .intro .hand-point[data-index="0"] {
    animation-delay: var(--duration-dramatic);
  }
  .intro .hand-point[data-index="1"] {
    animation-delay: calc(var(--duration-dramatic) + var(--duration-normal));
  }
  .intro .hand-point[data-index="2"] {
    animation-delay: calc(var(--duration-normal) * 3);
  }
  .intro .hand-point[data-index="3"] {
    animation-delay: calc(var(--duration-dramatic) + var(--duration-fast) * 2);
  }

  /* === SPLIT: Right/bottom, rotated, scaled === */
  .split {
    transform: translate(var(--split-offset-x), var(--split-offset-y))
      rotate(45deg) scale(0.5);
  }

  .split .center-point,
  .split .outer-point,
  .split .hand-point {
    animation: none;
    opacity: 1;
    transform: scale(1);
  }

  /* Dimmed during diamond-labels phase */
  .dimmed {
    opacity: 0.5;
  }

  /* === MERGED: Centered, rotated === */
  .merged {
    transform: rotate(45deg);
  }

  .merged .center-point,
  .merged .outer-point,
  .merged .hand-point {
    animation: none;
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
    animation-delay: var(--duration-fast);
  }
  .highlight-hand .hand-point[data-index="3"] {
    animation-delay: calc(var(--stagger-relaxed) * 3);
  }

  /* Outer points highlighted with stagger (outlined style for box) */
  .highlight-outer .outer-point {
    opacity: 1;
    stroke: var(--theme-accent, #22d3ee);
    fill-opacity: 0;
    stroke-opacity: 1;
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
    animation-delay: var(--duration-fast);
  }
  .highlight-outer .outer-point[data-index="3"] {
    animation-delay: calc(var(--stagger-relaxed) * 3);
  }

  @keyframes pointPop {
    0% {
      opacity: 0;
      transform: scale(0);
    }
    70% {
      opacity: 1;
      transform: scale(1.15);
    }
    100% {
      opacity: 1;
      transform: scale(1);
    }
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
    .rotating-grid,
    .center-point,
    .outer-point,
    .hand-point {
      transition: none;
    }

    .intro .center-point,
    .intro .outer-point,
    .intro .hand-point {
      animation: none;
      opacity: 1;
      transform: scale(1);
    }
  }
</style>
