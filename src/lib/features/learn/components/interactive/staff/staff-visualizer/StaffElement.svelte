<!--
StaffElement - Renders a single staff prop with thumb marker
-->
<script lang="ts">
  import type { StaffEndpoints } from "../../../../domain/constants/staff-visualizer-data";

  let {
    endpoints,
    color,
    isAnimating = false,
  }: {
    endpoints: StaffEndpoints;
    color: string;
    isAnimating?: boolean;
  } = $props();

  const thumbAngle = $derived(
    Math.atan2(
      endpoints.pinkyY - endpoints.thumbY,
      endpoints.pinkyX - endpoints.thumbX
    )
  );
  const perpAngle = $derived(thumbAngle + Math.PI / 2);
  const markerLen = 6;
</script>

<g class="staff" class:animating={isAnimating}>
  <!-- Staff body -->
  <line
    x1={endpoints.thumbX}
    y1={endpoints.thumbY}
    x2={endpoints.pinkyX}
    y2={endpoints.pinkyY}
    stroke={color}
    stroke-width="4"
    stroke-linecap="round"
    style="filter: drop-shadow(0 0 4px {color}80)"
  />
  <!-- Thumb end marker (perpendicular line) -->
  <line
    x1={endpoints.thumbX - markerLen * Math.cos(perpAngle)}
    y1={endpoints.thumbY - markerLen * Math.sin(perpAngle)}
    x2={endpoints.thumbX + markerLen * Math.cos(perpAngle)}
    y2={endpoints.thumbY + markerLen * Math.sin(perpAngle)}
    stroke={color}
    stroke-width="3"
    stroke-linecap="round"
  />
  <!-- Thumb indicator label -->
  <text
    x={endpoints.thumbX + 8 * Math.cos(perpAngle + Math.PI / 4)}
    y={endpoints.thumbY + 8 * Math.sin(perpAngle + Math.PI / 4)}
    font-size="4"
    fill={color}
    opacity="0.8"
  >
    T
  </text>
</g>

<style>
  .staff {
    /* The group itself has no changing CSS properties; its SVG lines own the motion. */
  }

  .staff.animating line {
    transition:
      x1 var(--duration-dramatic) var(--ease-standard),
      y1 var(--duration-dramatic) var(--ease-standard),
      x2 var(--duration-dramatic) var(--ease-standard),
      y2 var(--duration-dramatic) var(--ease-standard),
      stroke var(--duration-dramatic) var(--ease-standard);
  }

  @media (prefers-reduced-motion: reduce) {
    .staff.animating line {
      transition: none;
    }
  }
</style>
