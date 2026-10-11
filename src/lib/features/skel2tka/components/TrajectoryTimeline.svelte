<!--
  TrajectoryTimeline - SVG chart showing grid positions over time

  Plots blue and red hand grid locations across the video timeline.
  X-axis = time, Y-axis = grid location (mapped to numeric values).
  Renders as a step chart since positions are discrete.
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import type { HandTimeline } from "../domain/models";
  import type { GridLocation } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";

  interface Props {
    timeline: HandTimeline;
  }

  const { timeline }: Props = $props();

  // Map grid locations to Y positions for the chart
  const LOCATION_Y: Record<string, number> = {
    n: 0,
    ne: 1,
    e: 2,
    se: 3,
    s: 4,
    sw: 5,
    w: 6,
    nw: 7,
    c: 8,
  };

  const LOCATION_LABELS: Record<string, string> = {
    n: "N",
    ne: "NE",
    e: "E",
    se: "SE",
    s: "S",
    sw: "SW",
    w: "W",
    nw: "NW",
    c: "C",
  };

  const SVG_WIDTH = 800;
  const SVG_HEIGHT = 240;
  const MARGIN = { top: 20, right: 20, bottom: 30, left: 40 };
  const CHART_WIDTH = SVG_WIDTH - MARGIN.left - MARGIN.right;
  const CHART_HEIGHT = SVG_HEIGHT - MARGIN.top - MARGIN.bottom;

  const NUM_LOCATIONS = 9;

  /** Convert a timestamp to X pixel coordinate */
  function timeToX(t: number): number {
    if (timeline.duration === 0) return MARGIN.left;
    return MARGIN.left + (t / timeline.duration) * CHART_WIDTH;
  }

  /** Convert a grid location to Y pixel coordinate */
  function locationToY(loc: GridLocation): number {
    const index = LOCATION_Y[loc] ?? 4;
    return MARGIN.top + (index / (NUM_LOCATIONS - 1)) * CHART_HEIGHT;
  }

  /** Build SVG path data for step chart */
  function buildPath(hand: "left" | "right"): string {
    const points: Array<{ x: number; y: number }> = [];

    for (const frame of timeline.frames) {
      const detected = frame[hand];
      if (!detected || detected.confidence < 0.5) continue;

      const x = timeToX(frame.timestamp);
      const y = locationToY(detected.quadrant);
      points.push({ x, y });
    }

    if (points.length === 0) return "";

    // Build step path (horizontal then vertical)
    const first = points[0]!;
    let d = `M ${first.x} ${first.y}`;
    for (let i = 1; i < points.length; i++) {
      const pt = points[i]!;
      d += ` H ${pt.x} V ${pt.y}`;
    }
    return d;
  }

  const leftPath = $derived(buildPath("left"));
  const rightPath = $derived(buildPath("right"));

  /** Y-axis tick labels */
  const yTicks = $derived(
    Object.entries(LOCATION_LABELS).map(([key, label]) => ({
      y: MARGIN.top + ((LOCATION_Y[key] ?? 0) / (NUM_LOCATIONS - 1)) * CHART_HEIGHT,
      label,
    }))
  );

  /** X-axis time ticks (every second or adaptive) */
  const xTicks = $derived(() => {
    const dur = timeline.duration;
    if (dur <= 0) return [];
    const step = dur <= 10 ? 1 : dur <= 30 ? 2 : 5;
    const ticks: Array<{ x: number; label: string }> = [];
    for (let t = 0; t <= dur; t += step) {
      ticks.push({ x: timeToX(t), label: `${t}s` });
    }
    return ticks;
  });
</script>

<div class="timeline-container">
  <svg viewBox="0 0 {SVG_WIDTH} {SVG_HEIGHT}" class="timeline-svg">
    <!-- Grid lines -->
    {#each yTicks as tick}
      <line
        x1={MARGIN.left}
        y1={tick.y}
        x2={SVG_WIDTH - MARGIN.right}
        y2={tick.y}
        class="grid-line"
      />
      <text x={MARGIN.left - 6} y={tick.y + 4} class="y-label">{tick.label}</text>
    {/each}

    <!-- X-axis ticks -->
    {#each xTicks() as tick}
      <text x={tick.x} y={SVG_HEIGHT - 6} class="x-label">{tick.label}</text>
    {/each}

    <!-- Left hand path -->
    {#if leftPath}
      <path d={leftPath} class="hand-path blue-path" />
    {/if}

    <!-- Right hand path -->
    {#if rightPath}
      <path d={rightPath} class="hand-path red-path" />
    {/if}
  </svg>

  <div class="legend">
    <span class="legend-item">
      <span class="legend-dot blue-dot"></span> {t('skel2tka_blue_hand')}
    </span>
    <span class="legend-item">
      <span class="legend-dot red-dot"></span> {t('skel2tka_red_hand')}
    </span>
  </div>
</div>

<style>
  .timeline-container {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .timeline-svg {
    width: 100%;
    max-width: 800px;
    height: auto;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border-radius: 8px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  .grid-line {
    stroke: var(--theme-stroke, rgba(255, 255, 255, 0.08));
    stroke-width: 0.5;
  }

  .y-label {
    fill: var(--theme-text-muted, rgba(255, 255, 255, 0.4));
    font-size: 10px;
    text-anchor: end;
    dominant-baseline: middle;
  }

  .x-label {
    fill: var(--theme-text-muted, rgba(255, 255, 255, 0.4));
    font-size: 10px;
    text-anchor: middle;
  }

  .hand-path {
    fill: none;
    stroke-width: 2;
    stroke-linecap: round;
  }

  .blue-path {
    stroke: var(--prop-blue, #4a90d9);
    opacity: 0.85;
  }

  .red-path {
    stroke: var(--prop-red, #d94a4a);
    opacity: 0.85;
  }

  .legend {
    display: flex;
    gap: 16px;
    justify-content: center;
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.5));
  }

  .legend-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
  }

  .blue-dot {
    background: var(--prop-blue, #4a90d9);
  }

  .red-dot {
    background: var(--prop-red, #d94a4a);
  }
</style>
