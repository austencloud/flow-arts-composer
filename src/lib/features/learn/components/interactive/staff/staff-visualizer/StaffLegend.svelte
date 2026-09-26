<!--
StaffLegend - Legend showing left/right staff position and thumb orientation
-->
<script lang="ts">
  import { tDynamic } from "$lib/shared/i18n/i18n.svelte.js";
  import {
    LEFT_STAFF_COLOR,
    RIGHT_STAFF_COLOR,
    type HandPosition,
    type ThumbOrientation,
  } from "../../../../domain/constants/staff-visualizer-data";

  let {
    leftPosition,
    rightPosition,
    leftThumbOrientation,
    rightThumbOrientation,
  }: {
    leftPosition: HandPosition;
    rightPosition: HandPosition;
    leftThumbOrientation: ThumbOrientation;
    rightThumbOrientation: ThumbOrientation;
  } = $props();
</script>

<div class="thumb-legend">
  <div class="legend-item left">
    <div class="legend-color" style="background: {LEFT_STAFF_COLOR}"></div>
    <span
      >{tDynamic("learn_staff_left_position", {
        position: tDynamic(`learn_staff_cardinal_${leftPosition}`),
      })}</span
    >
    <span class="thumb-label"
      >{tDynamic(
        leftThumbOrientation === "in"
          ? "learn_staff_thumb_in"
          : "learn_staff_thumb_out"
      )}</span
    >
  </div>
  <div class="legend-item right">
    <div class="legend-color" style="background: {RIGHT_STAFF_COLOR}"></div>
    <span
      >{tDynamic("learn_staff_right_position", {
        position: tDynamic(`learn_staff_cardinal_${rightPosition}`),
      })}</span
    >
    <span class="thumb-label"
      >{tDynamic(
        rightThumbOrientation === "in"
          ? "learn_staff_thumb_in"
          : "learn_staff_thumb_out"
      )}</span
    >
  </div>
</div>

<style>
  .thumb-legend {
    display: flex;
    gap: 1.5rem;
    flex-wrap: wrap;
    justify-content: center;
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.8125rem;
    color: var(--theme-text, rgba(255, 255, 255, 0.8));
  }

  .legend-color {
    width: 12px;
    height: 12px;
    border-radius: 3px;
  }

  .thumb-label {
    font-size: 0.75rem;
    color: var(--theme-text-dim);
    padding: 0.125rem 0.5rem;
    background: var(--theme-card-bg);
    border-radius: 4px;
  }

  @media (max-width: 400px) {
    .thumb-legend {
      flex-direction: column;
      gap: 0.5rem;
    }

    .legend-item {
      width: 100%;
      justify-content: center;
    }
  }
</style>
