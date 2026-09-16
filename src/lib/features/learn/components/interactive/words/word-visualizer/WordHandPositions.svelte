<!--
WordHandPositions - Renders left and right hand positions with connection
-->
<script lang="ts">
  import {
    LEFT_HAND_COLOR,
    RIGHT_HAND_COLOR,
    PLACEMENT_COLORS,
  } from "../../../../domain/constants/word-visualizer-data";

  let {
    leftPos,
    rightPos,
  }: {
    leftPos: { x: number; y: number };
    rightPos: { x: number; y: number };
  } = $props();

  const areSamePos = $derived(
    Math.abs(leftPos.x - rightPos.x) < 5 && Math.abs(leftPos.y - rightPos.y) < 5
  );
</script>

<g class="hand-positions">
  {#if areSamePos}
    <!-- Both hands at same placement (Beta) -->
    <circle
      cx={leftPos.x}
      cy={leftPos.y}
      r="10"
      fill={PLACEMENT_COLORS.beta}
      class="hand-glow"
    />
    <circle
      cx={leftPos.x - 3}
      cy={leftPos.y}
      r="5"
      fill={LEFT_HAND_COLOR}
      class="hand-point"
    />
    <circle
      cx={leftPos.x + 3}
      cy={leftPos.y}
      r="5"
      fill={RIGHT_HAND_COLOR}
      class="hand-point"
    />
  {:else}
    <!-- Left hand -->
    <circle
      cx={leftPos.x}
      cy={leftPos.y}
      r="8"
      fill={LEFT_HAND_COLOR}
      class="hand-glow"
    />
    <circle
      cx={leftPos.x}
      cy={leftPos.y}
      r="5"
      fill={LEFT_HAND_COLOR}
      class="hand-point"
    />

    <!-- Right hand -->
    <circle
      cx={rightPos.x}
      cy={rightPos.y}
      r="8"
      fill={RIGHT_HAND_COLOR}
      class="hand-glow"
    />
    <circle
      cx={rightPos.x}
      cy={rightPos.y}
      r="5"
      fill={RIGHT_HAND_COLOR}
      class="hand-point"
    />

    <!-- Connection line -->
    <line
      x1={leftPos.x}
      y1={leftPos.y}
      x2={rightPos.x}
      y2={rightPos.y}
      stroke="var(--theme-stroke, rgba(255, 255, 255, 0.2))"
      stroke-width="1"
      stroke-dasharray="3 2"
      class="connection-line"
    />
  {/if}
</g>

<style>
  .hand-point {
    filter: drop-shadow(0 0 4px currentColor);
    transition: all var(--duration-instant) ease-out;
  }

  .hand-glow {
    opacity: 0.25;
    animation: handPulse 2s ease-in-out infinite;
  }

  @keyframes handPulse {
    0%,
    100% {
      opacity: 0.25;
    }
    50% {
      opacity: 0.4;
    }
  }

  .connection-line {
    animation: dashMove 1.5s linear infinite;
  }

  @keyframes dashMove {
    from {
      stroke-dashoffset: 0;
    }
    to {
      stroke-dashoffset: 10;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .hand-glow,
    .connection-line {
      animation: none;
    }
  }
</style>
