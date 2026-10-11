<!--
  PathMiniViz.svelte

  Small SVG showing the dots and connecting lines of a hand path.
  Renders in a 100x100 viewBox; caller controls the rendered size via CSS.
-->
<script lang="ts">
  import type { GridLocation } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";

  interface Props {
    locations: readonly GridLocation[];
    /** Highlight color for the path line and dots. Defaults to current text color. */
    color?: string;
    /** Dot radius in SVG units. */
    dotRadius?: number;
  }

  const { locations, color = "currentColor", dotRadius = 5 }: Props = $props();

  // Simple fixed coordinate map within a 100×100 viewBox.
  // Perimeter positions sit ~10–15 units from the edge; center at (50, 50).
  const COORDS: Record<string, { x: number; y: number }> = {
    n:  { x: 50, y: 10 },
    ne: { x: 85, y: 15 },
    e:  { x: 90, y: 50 },
    se: { x: 85, y: 85 },
    s:  { x: 50, y: 90 },
    sw: { x: 15, y: 85 },
    w:  { x: 10, y: 50 },
    nw: { x: 15, y: 15 },
    c:  { x: 50, y: 50 },
  };

  // Map locations to coordinates, skipping any unknown values.
  const points = $derived(
    locations
      .map((loc) => COORDS[loc as string])
      .filter((p): p is { x: number; y: number } => p !== undefined)
  );

  // Build a polyline points string: "x1,y1 x2,y2 ..."
  const polylinePoints = $derived(
    points.map((p) => `${p.x},${p.y}`).join(" ")
  );

  // Whether the path forms a closed loop (start === end location).
  const isClosed = $derived(
    locations.length >= 2 && locations[0] === locations[locations.length - 1]
  );
</script>

<svg
  viewBox="0 0 100 100"
  xmlns="http://www.w3.org/2000/svg"
  aria-hidden="true"
  class="path-mini-viz"
>
  <!-- Connection lines -->
  {#if points.length >= 2}
    {#if isClosed}
      <polygon
        points={polylinePoints}
        fill="none"
        stroke={color}
        stroke-width="3"
        stroke-linejoin="round"
        opacity="0.6"
      />
    {:else}
      <polyline
        points={polylinePoints}
        fill="none"
        stroke={color}
        stroke-width="3"
        stroke-linejoin="round"
        stroke-linecap="round"
        opacity="0.6"
      />
    {/if}
  {/if}

  <!-- Start dot (larger, filled) -->
  {#if points.length >= 1 && points[0] !== undefined}
    <circle
      cx={points[0].x}
      cy={points[0].y}
      r={dotRadius + 1}
      fill={color}
      opacity="0.9"
    />
  {/if}

  <!-- Intermediate and end dots -->
  {#each points.slice(1) as point, i (i)}
    <circle
      cx={point.x}
      cy={point.y}
      r={dotRadius}
      fill={color}
      opacity={i === points.length - 2 ? 0.9 : 0.6}
    />
  {/each}
</svg>

<style>
  .path-mini-viz {
    display: block;
    width: 100%;
    height: 100%;
  }
</style>
