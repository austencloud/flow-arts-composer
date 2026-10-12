<script lang="ts">
  import { Plane, PLANE_COLORS } from "@austencloud/scene-3d";

  interface Props {
    leftPlane: Plane | null;
    rightPlane: Plane | null;
    visiblePlanes: ReadonlySet<Plane>;
  }

  let { leftPlane, rightPlane, visiblePlanes }: Props = $props();

  interface RingState {
    strokeWidth: number;
    dasharray: string | undefined;
    opacity: number;
  }

  // State is carried by width + dash + opacity together, never opacity alone -
  // PLANE_COLORS are WebGL scene colors and don't reliably clear contrast at
  // low opacity against either theme.
  function ringState(plane: Plane): RingState {
    if (leftPlane === plane || rightPlane === plane) {
      return { strokeWidth: 4, dasharray: undefined, opacity: 1 };
    }
    if (visiblePlanes.has(plane)) {
      return { strokeWidth: 3, dasharray: undefined, opacity: 0.8 };
    }
    return { strokeWidth: 2, dasharray: "5 5", opacity: 0.55 };
  }

  const floorState = $derived(ringState(Plane.FLOOR));
  const wheelState = $derived(ringState(Plane.WHEEL));
  const wallState = $derived(ringState(Plane.WALL));

  // Approximate projections of the six 45° fusion planes in this stylized
  // legend, all centered on the chest like wall/wheel. Wings genuinely rotate
  // in the screen plane (±45° around Z), so their tilt is geometrically
  // honest; shield and ramp pairs are indistinguishable head-on, so each pair
  // gets a small opposing tilt purely to keep simultaneous rings from
  // coinciding — color carries the identity.
  const FUSION_RINGS: { plane: Plane; rx: number; ry: number; tilt: number }[] =
    [
      { plane: Plane.RIGHT_SHIELD, rx: 32, ry: 46, tilt: 8 },
      { plane: Plane.LEFT_SHIELD, rx: 32, ry: 46, tilt: -8 },
      { plane: Plane.FORWARD_RAMP, rx: 46, ry: 30, tilt: -6 },
      { plane: Plane.BACKWARD_RAMP, rx: 46, ry: 30, tilt: 6 },
      { plane: Plane.RIGHT_WING, rx: 13, ry: 46, tilt: -45 },
      { plane: Plane.LEFT_WING, rx: 13, ry: 46, tilt: 45 },
    ];

  // Fusion rings appear only while active (hand-assigned or shown). The
  // resting legend stays the three primaries — nine dashed rings at once
  // would be unreadable at this size.
  const activeFusionRings = $derived(
    FUSION_RINGS.filter(
      ({ plane }) =>
        leftPlane === plane || rightPlane === plane || visiblePlanes.has(plane)
    )
  );
</script>

<!-- Isometric legend: wall faces the viewer, wheel is edge-on, floor lies flat.
     Decorative only - the plane matrix below already carries this information
     in accessible text, so this diagram is hidden from assistive tech. -->
<svg class="planes-diagram" viewBox="40 16 120 122" aria-hidden="true">
  <!-- Floor: flat ellipse at the feet -->
  <ellipse
    cx="100"
    cy="120"
    rx="58"
    ry="15"
    fill="none"
    class="plane-ring"
    style="--raw-color: {PLANE_COLORS[Plane.FLOOR]};"
    stroke-width={floorState.strokeWidth}
    stroke-dasharray={floorState.dasharray}
    opacity={floorState.opacity}
  />
  <!-- Wheel: edge-on vertical circle (narrow ellipse) -->
  <ellipse
    cx="100"
    cy="66"
    rx="12"
    ry="46"
    fill="none"
    class="plane-ring"
    style="--raw-color: {PLANE_COLORS[Plane.WHEEL]};"
    stroke-width={wheelState.strokeWidth}
    stroke-dasharray={wheelState.dasharray}
    opacity={wheelState.opacity}
  />
  <!-- Wall: circle facing the viewer -->
  <circle
    cx="100"
    cy="66"
    r="46"
    fill="none"
    class="plane-ring"
    style="--raw-color: {PLANE_COLORS[Plane.WALL]};"
    stroke-width={wallState.strokeWidth}
    stroke-dasharray={wallState.dasharray}
    opacity={wallState.opacity}
  />
  <!-- Fusion planes: drawn only while active, over the primary rings -->
  {#each activeFusionRings as { plane, rx, ry, tilt } (plane)}
    {@const state = ringState(plane)}
    <ellipse
      cx="100"
      cy="66"
      {rx}
      {ry}
      transform="rotate({tilt} 100 66)"
      fill="none"
      class="plane-ring"
      style="--raw-color: {PLANE_COLORS[plane]};"
      stroke-width={state.strokeWidth}
      stroke-dasharray={state.dasharray}
      opacity={state.opacity}
    />
  {/each}
  <!-- Performer: head + torso + legs, neutral color -->
  <g
    stroke="var(--theme-text-dim)"
    stroke-width="3"
    stroke-linecap="round"
    fill="none"
  >
    <circle cx="100" cy="42" r="7" fill="var(--theme-text-dim)" stroke="none" />
    <line x1="100" y1="50" x2="100" y2="92" />
    <line x1="100" y1="92" x2="90" y2="116" />
    <line x1="100" y1="92" x2="110" y2="116" />
    <line x1="100" y1="60" x2="86" y2="78" />
    <line x1="100" y1="60" x2="114" y2="78" />
  </g>
</svg>

<style>
  .planes-diagram {
    display: block;
    width: 100%;
    height: auto;
  }

  .plane-ring {
    stroke: color-mix(in srgb, var(--raw-color) 50%, var(--theme-text));
    transition:
      stroke-width var(--duration-fast) var(--ease-standard),
      opacity var(--duration-fast) var(--ease-standard);
  }
</style>
