<!--
StaffGridPoint - Single grid point with label and interactivity
-->
<script lang="ts">
  import { tDynamic } from "$lib/shared/i18n/i18n.svelte.js";
  import type {
    GridPoint,
    HandPosition,
  } from "../../../../domain/constants/staff-visualizer-data";

  let {
    position,
    point,
    showLabel = true,
    interactive = false,
    onclick,
  }: {
    position: HandPosition;
    point: GridPoint;
    showLabel?: boolean;
    interactive?: boolean;
    onclick?: () => void;
  } = $props();

  function handleKeydown(e: KeyboardEvent) {
    if ((e.key === "Enter" || e.key === " ") && onclick) {
      onclick();
    }
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<g
  class="grid-point"
  class:clickable={interactive}
  {onclick}
  role={interactive ? "button" : "img"}
  tabindex={interactive ? 0 : -1}
  aria-label={tDynamic("learn_staff_position_aria", {
    position: tDynamic(`learn_staff_cardinal_${position}`),
  })}
  onkeydown={interactive ? handleKeydown : undefined}
>
  <!-- Base point -->
  <circle
    cx={point.x}
    cy={point.y}
    r="4"
    fill="var(--theme-stroke-strong, rgba(255, 255, 255, 0.3))"
    class="outer-point"
  />

  <!-- Point label -->
  {#if showLabel}
    <text
      x={point.x}
      y={point.y + (point.y < 50 ? -10 : 16)}
      text-anchor="middle"
      class="point-label"
      fill="var(--theme-text-dim)"
      font-size="6"
      font-weight="600"
    >
      {tDynamic(`learn_staff_cardinal_${position}`)}
    </text>
  {/if}
</g>

<style>
  .grid-point {
    cursor: default;
  }

  .grid-point.clickable {
    cursor: pointer;
  }

  .grid-point.clickable:hover .outer-point {
    fill: var(--theme-text, rgba(255, 255, 255, 0.6));
    transform: scale(1.2);
    transform-origin: center;
  }

  .outer-point {
    transition: all var(--duration-normal) ease;
  }

  .point-label {
    pointer-events: none;
    user-select: none;
  }
</style>
