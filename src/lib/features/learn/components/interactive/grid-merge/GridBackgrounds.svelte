<!--
  GridBackgrounds - The 3 background rectangles for grid merge animation
  - merged-bg: Single background for intro/merged phases
  - diamond-bg: Left/top background for split phases
  - box-bg: Right/bottom background for split phases
-->
<script lang="ts">
  import { GRID, type Phase } from "./grid-merge-constants";

  let { phase } = $props<{ phase: Phase }>();

  const isSplit = $derived(
    phase === "split" ||
      phase === "diamond-labels" ||
      phase === "box-labels" ||
      phase === "split-highlight"
  );
</script>

<g
  class="backgrounds"
  class:split={isSplit}
  class:merged={phase === "merged" || phase === "intro"}
>
  <!-- Single background for intro/merged -->
  <rect
    class="bg merged-bg"
    x="0"
    y="0"
    width={GRID.SIZE}
    height={GRID.SIZE}
    rx="16"
  />

  <!-- Split backgrounds -->
  <rect
    class="bg diamond-bg"
    x="0"
    y="0"
    width={GRID.SIZE}
    height={GRID.SIZE}
    rx="16"
  />
  <rect
    class="bg box-bg"
    x="0"
    y="0"
    width={GRID.SIZE}
    height={GRID.SIZE}
    rx="16"
  />
</g>

<style>
  .bg {
    fill: var(--theme-card-bg, rgba(0, 0, 0, 0.4));
    stroke: var(--theme-stroke, rgba(255, 255, 255, 0.15));
    stroke-width: 2;
    transform-origin: var(--grid-center) var(--grid-center);
    will-change: transform, opacity;
    transition:
      transform var(--merge-duration)
        var(--merge-easing-soft, var(--merge-easing)),
      opacity calc(var(--merge-duration) * 0.6) var(--ease-standard-out);
  }

  /* Merged state - single centered background */
  .merged .merged-bg {
    opacity: 1;
  }

  .merged .diamond-bg,
  .merged .box-bg {
    opacity: 0;
  }

  /* Split state - two side-by-side backgrounds */
  .split .merged-bg {
    opacity: 0;
  }

  .split .diamond-bg {
    opacity: 1;
    transform: translate(var(--split-offset-x-neg), var(--split-offset-y-neg))
      scale(0.5);
  }

  .split .box-bg {
    opacity: 1;
    transform: translate(var(--split-offset-x), var(--split-offset-y))
      scale(0.5);
  }
</style>
