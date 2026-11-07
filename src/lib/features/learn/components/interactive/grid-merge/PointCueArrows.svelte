<!--
  PointCueArrows - Little arrows that pull a first-timer's eye to the highlighted
  points. The accent tint alone was too easy to miss.

  One arrow per highlighted point, on the radial line and just outside it. Each
  arrow is drawn once, pointing down at the origin, then placed by its group.
-->
<script lang="ts">
  import { opaqueFade } from "#lib/shared/transitions/motion.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";
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

  // The gap runs from the point's middle to the arrow's tip.
  const CENTER_TIP_GAP = 34;
  const HAND_TIP_GAP = GRID.HAND_POINT_RADIUS + 24;
  const OUTER_TIP_GAP = GRID.POINT_RADIUS + 34;
  // The hand points sit on the cardinals, so the center's arrow takes a diagonal.
  const CENTER_BEARING = 45;

  type CueArrow = {
    id: string;
    x: number;
    y: number;
    bearing: number;
    tipGap: number;
  };

  // The point lists run N, E, S, W, a quarter turn apart.
  function cardinalArrows(
    points: readonly { id: string; x: number; y: number }[],
    tipGap: number
  ): CueArrow[] {
    return points.map((point, i) => ({ ...point, bearing: i * 90, tipGap }));
  }

  const arrows = $derived.by((): CueArrow[] => {
    if (phase !== "diamond" && phase !== "merged" && phase !== "box") return [];
    if (highlightPhase === "center") {
      return [
        {
          id: "center",
          x: GRID.CENTER,
          y: GRID.CENTER,
          bearing: CENTER_BEARING,
          tipGap: CENTER_TIP_GAP,
        },
      ];
    }
    if (highlightPhase === "hand") {
      return cardinalArrows(CARDINAL_HAND, HAND_TIP_GAP);
    }
    if (highlightPhase === "outer") {
      return cardinalArrows(CARDINAL_OUTER, OUTER_TIP_GAP);
    }
    return [];
  });

  // The box is the same points turned 45 degrees, so the arrows turn with them.
  const layerTransform = $derived(
    phase === "box" ? `rotate(45 ${GRID.CENTER} ${GRID.CENTER})` : undefined
  );
</script>

<!-- Keyed on the highlight, so the arrows just left fade out on their own while
     the next set starts from its own hidden first frame. -->
{#each arrows.length > 0 ? [highlightPhase] : [] as highlight (highlight)}
  <g
    class="point-cue-arrows"
    transform={layerTransform}
    aria-hidden="true"
    out:opaqueFade={{ duration: DURATION.fast }}
  >
    {#each arrows as arrow, i (arrow.id)}
      <g
        transform="translate({arrow.x} {arrow.y}) rotate({arrow.bearing}) translate(0 {-arrow.tipGap})"
      >
        <path
          class="cue-arrow"
          style="--cue-index: {i}"
          d="M0 -60 L0 0 M-20 -20 L0 0 L20 -20"
        />
      </g>
    {/each}
  </g>
{/each}

<style>
  .point-cue-arrows {
    pointer-events: none;
  }

  .cue-arrow {
    fill: none;
    stroke: var(--theme-accent, #22d3ee);
    stroke-width: 12;
    stroke-linecap: round;
    stroke-linejoin: round;
    /* Waits for the point's own highlight pulse, so the arrow arrives after the
       point lights up, not with it. */
    animation: cueArrowLoop 1600ms var(--merge-easing)
      calc(
        var(--highlight-duration) + var(--stagger-relaxed) * var(--cue-index)
      )
      infinite both;
  }

  /* Up is away from the point, because each arrow is drawn pointing down at it. */
  @keyframes cueArrowLoop {
    0% {
      opacity: 0;
      transform: translateY(-18px);
    }
    35%,
    60% {
      opacity: 1;
      transform: translateY(0);
    }
    100% {
      opacity: 0;
      transform: translateY(-18px);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .cue-arrow {
      animation: none;
    }
  }
</style>
