<!--
  Trace Paths — hub preview. Acts out the mechanic in miniature: the route
  appears on the grid, then a fingertip walks it end to end, in order.

  Both the route and the grid dots are the REAL geometry — `sampleSegmentPath`
  is the same sampler the game grades against, and the hand points come from
  the grid-coordinate SSOT. So the card can never advertise a curve or a grid
  the game doesn't actually use. Order and direction are the whole point of
  this game, so the preview draws itself start → end rather than fading a
  finished line in.

  Pure CSS motion over a static SVG path — no rAF, nothing to clean up.
-->
<script lang="ts">
  import {
    GridLocation,
    GridMode,
  } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
  import { createGridPointData } from "#lib/shared/pictograph/grid/utils/grid-coordinate-utils.js";
  import {
    sampleSegmentPath,
    STAGE_UNITS,
  } from "../../games/trace-paths/services/trace-path-sampler";

  let { accent }: { accent: string } = $props();

  /* The sampler and the grid both work in 950-unit stage space; the SVG below
     uses a 0..100 viewBox, so everything scales through here on the way out. */
  const toViewBox = (v: number) => (v * 100) / STAGE_UNITS;

  /* One arc between adjacent points (the hand travels around the circle)
     rather than a dash through the middle — the curve is what makes this game
     read as tracing rather than tapping two dots. */
  const route = sampleSegmentPath(GridLocation.NORTH, GridLocation.EAST);

  /* sampleSegmentPath already normalized to 0..1, so these only need the
     viewBox scale, not the stage divide. */
  const routePath = route
    .map(
      (p, i) =>
        `${i === 0 ? "M" : "L"}${(p.x * 100).toFixed(2)} ${(p.y * 100).toFixed(2)}`
    )
    .join(" ");

  /* Real diamond hand points, so the dots sit exactly where the route's
     endpoints land instead of near them. */
  const handPoints = (() => {
    const grid = createGridPointData(GridMode.DIAMOND);
    return Object.values(grid.allHandPointsNormal)
      .map((p) => p.coordinates)
      .filter((c): c is { x: number; y: number } => c !== null)
      .map((c) => ({ x: toViewBox(c.x), y: toViewBox(c.y) }));
  })();

  const start = route[0];
</script>

<div class="stage" style="--accent: {accent}" aria-hidden="true">
  <svg class="grid" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
    <!-- The hand points the route runs between, so the curve reads as living
         on a grid instead of floating. -->
    {#each handPoints as p (`${p.x}-${p.y}`)}
      <circle class="point" cx={p.x} cy={p.y} r="2.6" />
    {/each}

    <!-- Ghost of the full route, then the drawn line on top of it. -->
    <path class="route-ghost" d={routePath} />
    <!-- pathLength=1 normalizes the dash math, so the draw animation works for
         any sampled curve without measuring the path in JS. -->
    <path class="route" d={routePath} pathLength="1" />

    {#if start}
      <circle class="cap" cx={start.x * 100} cy={start.y * 100} r="3.4" />
      <!-- The fingertip rides the same path the line is drawing. offset-path
           needs the geometry as a CSS value, hence the inline custom prop. -->
      <circle class="tip" r="4.6" style="--route: path('{routePath}')" />
    {/if}
  </svg>
</div>

<style>
  .stage {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .grid {
    height: 82%;
    aspect-ratio: 1;
    overflow: visible;
  }

  .point {
    fill: var(--theme-text-dim, rgba(255, 255, 255, 0.28));
  }

  .route-ghost,
  .route {
    fill: none;
    stroke-linecap: round;
    stroke-width: 3;
  }

  .route-ghost {
    stroke: rgba(255, 255, 255, 0.12);
  }

  .route {
    stroke: var(--accent);
    stroke-dasharray: 1;
    stroke-dashoffset: 1;
    animation: draw 4s ease-in-out infinite;
  }

  .cap {
    fill: var(--accent);
  }

  .tip {
    fill: #fff;
    offset-path: var(--route);
    offset-rotate: 0deg;
    animation: travel 4s ease-in-out infinite;
  }

  @keyframes draw {
    0%,
    8% {
      stroke-dashoffset: 1;
    }
    62%,
    88% {
      stroke-dashoffset: 0;
    }
    100% {
      stroke-dashoffset: 0;
    }
  }

  @keyframes travel {
    0%,
    8% {
      offset-distance: 0%;
      opacity: 0;
    }
    12% {
      opacity: 1;
    }
    62%,
    88% {
      offset-distance: 100%;
      opacity: 1;
    }
    100% {
      offset-distance: 100%;
      opacity: 0;
    }
  }

  /* Reduced motion: show the finished route and where it starts. The card
     still says "you draw this line", it just doesn't move to say it. */
  @media (prefers-reduced-motion: reduce) {
    .route,
    .tip {
      animation: none;
    }

    .route {
      stroke-dashoffset: 0;
    }

    .tip {
      offset-distance: 100%;
      opacity: 1;
    }
  }
</style>
