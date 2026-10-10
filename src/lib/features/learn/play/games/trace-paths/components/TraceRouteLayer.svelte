<!--
TraceRouteLayer — everything the player looks at while tracing, drawn inside the
pictograph's own 950x950 coordinate space.

It renders as a bare <g>, so the parent's <svg viewBox="0 0 950 950"> is the one
coordinate system in play. Route geometry arrives normalized (0..1 of the stage)
from the converter, so the only transform here is x*950 — no second coordinate
table, no re-derived curve. The line drawn and the line graded are the same
points.

Three things it is careful about:

- HAND IDENTITY IS NEVER COLOR ALONE. Blue draws a circle target with a "B",
  red draws a square target with an "R". Someone who can't separate the two hues
  still reads the round.
- THE NEXT TARGET IS BIGGER THAN A FINGERTIP, and its label is pushed outward
  from the stage centre so the hand approaching it cannot cover the thing it
  needs to see. The route ahead stays at full strength; the part already drawn
  dims.
- REDUCED MOTION AND LOW STIMULUS ARE HONORED HERE, not faked. Reduced motion
  means no traveling preview, no draw-on, no pulse: static marks and opacity.
  Low stimulus additionally drops the glow.
-->
<script lang="ts">
  import { HandSide } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
  import type {
    NormalizedPoint,
    TraceHand,
    TraceSegment,
  } from "../domain/trace-types";
  import {
    segmentEndPoint,
    segmentStartPoint,
  } from "../state/trace-paths-state.svelte";

  interface TapWaypoint {
    hand: TraceHand;
    beatIndex: number;
    at: NormalizedPoint;
  }

  interface Props {
    /** Which hands this particular stage draws. One in split mode, both on a shared grid. */
    hands: TraceHand[];
    /** The beat currently being traced, per hand. */
    segments: Partial<Record<TraceHand, TraceSegment>>;
    /** Per-hand ephemeral fingertip trail, render-only. */
    trail: (hand: TraceHand) => readonly NormalizedPoint[];
    armed: Partial<Record<TraceHand, boolean>>;
    /** Beginner challenges keep the rail up; later challenges fade it once the hands are set. */
    showRoute: boolean;
    /** True while the player is still placing fingers — the start targets lead. */
    isArming: boolean;
    reducedMotion: boolean;
    lowStimulus: boolean;
    /**
     * How many 950-space units one CSS pixel covers on this stage. Used to hold
     * targets at a real 44px minimum however large or small the stage renders.
     */
    unitsPerCssPx: number;
    /** Tap Route mode only: the ordered waypoints and how far the player has got. */
    tapRouteMode?: boolean;
    tapWaypoints?: TapWaypoint[];
    tapProgress?: number;
  }

  let {
    hands,
    segments,
    trail,
    armed,
    showRoute,
    isArming,
    reducedMotion,
    lowStimulus,
    unitsPerCssPx,
    tapRouteMode = false,
    tapWaypoints = [],
    tapProgress = 0,
  }: Props = $props();

  const STAGE = 950;
  const CENTRE = 475;

  /** Half of the 44px touch-target floor, expressed in stage units. */
  const touchFloorRadius = $derived(Math.max(8, 22 * unitsPerCssPx));

  function toStage(point: NormalizedPoint): { x: number; y: number } {
    return { x: point.x * STAGE, y: point.y * STAGE };
  }

  function polyline(points: readonly NormalizedPoint[]): string {
    return points.map((p) => `${p.x * STAGE},${p.y * STAGE}`).join(" ");
  }

  function routePoints(segment: TraceSegment): readonly NormalizedPoint[] {
    return segment.kind === "move" ? segment.expectedPath : [];
  }

  /**
   * Push a label away from the stage centre. Targets sit on the grid ring, so
   * "outward" is reliably the side a hand is not coming from — which is the
   * whole point of putting the callout there.
   */
  function outward(point: { x: number; y: number }, distance: number) {
    const dx = point.x - CENTRE;
    const dy = point.y - CENTRE;
    const length = Math.hypot(dx, dy);
    if (length < 1) return { x: point.x, y: point.y - distance };
    return {
      x: point.x + (dx / length) * distance,
      y: point.y + (dy / length) * distance,
    };
  }

  function handClass(hand: TraceHand): string {
    return hand === HandSide.LEFT ? "blue" : "red";
  }

  /** The persistent glyph that travels with the color. Never the color alone. */
  function handGlyph(hand: TraceHand): string {
    return hand === HandSide.LEFT ? "B" : "R";
  }
</script>

<g
  class="trace-route"
  class:low-stimulus={lowStimulus}
  class:static-marks={reducedMotion}
>
  {#each hands as hand (hand)}
    {@const segment = segments[hand]}
    {#if segment}
      {@const start = toStage(segmentStartPoint(segment))}
      {@const end = toStage(segmentEndPoint(segment))}
      {@const path = routePoints(segment)}
      {@const isArmed = armed[hand] === true}
      {@const drawn = trail(hand)}

      <!-- The route rail. Kept up on beginner challenges; on the rest it fades once
           the hand is armed, so the player finishes from memory. -->
      {#if path.length >= 2 && (showRoute || !isArmed)}
        <polyline
          class="rail {handClass(hand)}"
          class:faded={!showRoute && isArmed}
          points={polyline(path)}
          fill="none"
        />
      {/if}

      <!-- What the finger has actually drawn so far. Render-only. -->
      {#if drawn.length >= 2}
        <polyline
          class="drawn {handClass(hand)}"
          points={polyline(drawn)}
          fill="none"
        />
      {/if}

      <!-- Start target. Leads while arming, then recedes to a quiet anchor. -->
      <g
        class="target start {handClass(hand)}"
        class:lead={isArming && !isArmed}
      >
        {#if hand === HandSide.LEFT}
          <circle
            cx={start.x}
            cy={start.y}
            r={Math.max(touchFloorRadius, 44)}
            class="target-ring"
          />
        {:else}
          <rect
            x={start.x - Math.max(touchFloorRadius, 44)}
            y={start.y - Math.max(touchFloorRadius, 44)}
            width={Math.max(touchFloorRadius, 44) * 2}
            height={Math.max(touchFloorRadius, 44) * 2}
            rx={Math.max(touchFloorRadius, 44) * 0.28}
            class="target-ring"
          />
        {/if}
        <text
          class="target-glyph"
          x={outward(start, Math.max(touchFloorRadius, 44) + 34).x}
          y={outward(start, Math.max(touchFloorRadius, 44) + 34).y}
          text-anchor="middle"
          dominant-baseline="central">{handGlyph(hand)}</text
        >
      </g>

      <!-- End target. Oversized, and only once the hand is on its way, so the
           two targets never compete for attention at the same moment. -->
      {#if segment.kind === "move" && isArmed}
        <g class="target end {handClass(hand)}">
          {#if hand === HandSide.LEFT}
            <circle
              cx={end.x}
              cy={end.y}
              r={Math.max(touchFloorRadius, 48)}
              class="target-ring"
            />
          {:else}
            <rect
              x={end.x - Math.max(touchFloorRadius, 48)}
              y={end.y - Math.max(touchFloorRadius, 48)}
              width={Math.max(touchFloorRadius, 48) * 2}
              height={Math.max(touchFloorRadius, 48) * 2}
              rx={Math.max(touchFloorRadius, 48) * 0.28}
              class="target-ring"
            />
          {/if}
          <text
            class="target-glyph"
            x={outward(end, Math.max(touchFloorRadius, 48) + 34).x}
            y={outward(end, Math.max(touchFloorRadius, 48) + 34).y}
            text-anchor="middle"
            dominant-baseline="central">{handGlyph(hand)}</text
          >
        </g>
      {/if}

      <!-- A hold reads as "stay here", so it gets a distinct static bracket
           rather than a target the player would try to travel to. -->
      {#if segment.kind === "hold"}
        <circle
          class="hold-zone {handClass(hand)}"
          cx={start.x}
          cy={start.y}
          r={Math.max(touchFloorRadius, 56)}
        />
      {/if}
    {/if}
  {/each}

  <!-- Tap Route mode: the same route as numbered stops. No dragging, no second
       pointer, and the numbers make the ORDER explicit rather than implied. -->
  {#if tapRouteMode}
    <!-- Filtered to the hands THIS stage draws, exactly like the route loop
         above. The waypoint list is the whole round's, and a stop only responds
         on the grid that owns it — drawing red's stops on blue's panel puts
         live-looking numbers on a surface that silently ignores them. `index` stays
         the list-wide index so the printed number still reads as true order. -->
    {#each tapWaypoints as waypoint, index (waypoint.hand + "-" + waypoint.beatIndex)}
      {#if hands.includes(waypoint.hand)}
        {@const at = toStage(waypoint.at)}
        {@const done = index < tapProgress}
        {@const next = index === tapProgress}
        <g class="tap-stop {handClass(waypoint.hand)}" class:done class:next>
          <circle cx={at.x} cy={at.y} r={Math.max(touchFloorRadius, 44)} />
          <text
            x={at.x}
            y={at.y}
            text-anchor="middle"
            dominant-baseline="central">{index + 1}</text
          >
        </g>
      {/if}
    {/each}
  {/if}
</g>

<style>
  .trace-route {
    /* Drawing only. The stage element above owns every pointer event so a
       capture is never stolen by an SVG child mid-stroke. */
    pointer-events: none;
  }

  /* Hand colors pair with the shape/label glyphs above — never used alone. */
  .blue {
    --hand-color: var(--prop-blue, #3575e2);
  }

  .red {
    --hand-color: var(--prop-red, #ed1c24);
  }

  .rail {
    stroke: var(--hand-color);
    stroke-width: 26;
    stroke-linecap: round;
    stroke-linejoin: round;
    opacity: 0.32;
    transition: opacity var(--duration-normal) ease-out;
  }

  .rail.faded {
    opacity: 0.1;
  }

  .drawn {
    stroke: var(--hand-color);
    stroke-width: 16;
    stroke-linecap: round;
    stroke-linejoin: round;
    opacity: 0.9;
  }

  /* The glow is atmosphere, not information — Low Stimulus removes it and
     nothing about the route becomes harder to read. */
  .trace-route:not(.low-stimulus) .drawn {
    filter: drop-shadow(
      0 0 10px color-mix(in srgb, var(--hand-color) 55%, transparent)
    );
  }

  .target-ring {
    fill: color-mix(in srgb, var(--hand-color) 12%, transparent);
    stroke: var(--hand-color);
    stroke-width: 8;
  }

  .target.start .target-ring {
    stroke-dasharray: 18 14;
  }

  .target.lead .target-ring {
    fill: color-mix(in srgb, var(--hand-color) 26%, transparent);
    stroke-width: 12;
  }

  /* Only the target still waiting for a finger animates, and only when motion
     is allowed. It is a slow breath, never a strobe. */
  .trace-route:not(.static-marks) .target.lead .target-ring {
    animation: target-breath 2.4s ease-in-out infinite;
  }

  @keyframes target-breath {
    0%,
    100% {
      opacity: 0.75;
    }
    50% {
      opacity: 1;
    }
  }

  .target-glyph {
    fill: var(--hand-color);
    font-size: 46px;
    font-weight: 800;
    font-family:
      system-ui,
      -apple-system,
      sans-serif;
    paint-order: stroke;
    stroke: var(--theme-panel-bg, rgba(0, 0, 0, 0.65));
    stroke-width: 6;
  }

  .hold-zone {
    fill: none;
    stroke: var(--hand-color);
    stroke-width: 6;
    stroke-dasharray: 4 22;
    stroke-linecap: round;
    opacity: 0.85;
  }

  .tap-stop circle {
    fill: color-mix(in srgb, var(--hand-color) 14%, transparent);
    stroke: var(--hand-color);
    stroke-width: 6;
    opacity: 0.5;
  }

  .tap-stop.next circle {
    fill: color-mix(in srgb, var(--hand-color) 32%, transparent);
    stroke-width: 12;
    opacity: 1;
  }

  .tap-stop.done circle {
    opacity: 0.25;
  }

  .tap-stop text {
    fill: var(--theme-text, #fff);
    font-size: 40px;
    font-weight: 700;
    font-family:
      system-ui,
      -apple-system,
      sans-serif;
  }

  .tap-stop.done text {
    opacity: 0.4;
  }

  /* The OS-challenge preference is honored even when the in-game switch is off —
     the switch can only ever add restraint, never remove it. */
  @media (prefers-reduced-motion: reduce) {
    .target.lead .target-ring {
      animation: none;
    }

    .rail {
      transition: none;
    }
  }
</style>
