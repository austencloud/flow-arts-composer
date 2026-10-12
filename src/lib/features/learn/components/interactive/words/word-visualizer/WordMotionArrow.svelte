<!--
WordMotionArrow - Renders a curved motion arrow between positions
-->
<script lang="ts">
  import {
    getMotionArrowPath,
    type HandPosition8,
    type MotionType,
  } from "../../../../domain/constants/word-visualizer-data";

  let {
    startPos,
    endPos,
    motionType,
    color,
  }: {
    startPos: HandPosition8;
    endPos: HandPosition8;
    motionType: MotionType;
    color: string;
  } = $props();

  const path = $derived(getMotionArrowPath(startPos, endPos, motionType));
</script>

{#if startPos !== endPos && path}
  <path
    d={path}
    stroke={color}
    stroke-width="2"
    fill="none"
    opacity="0.6"
    stroke-linecap="round"
    class="motion-arrow"
  />
{/if}

<style>
  .motion-arrow {
    animation: arrowDraw var(--duration-scene) var(--ease-standard-out);
  }

  @keyframes arrowDraw {
    from {
      stroke-dasharray: 100;
      stroke-dashoffset: 100;
    }
    to {
      stroke-dasharray: 100;
      stroke-dashoffset: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .motion-arrow {
      animation: none;
    }
  }
</style>
