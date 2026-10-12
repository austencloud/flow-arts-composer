<!--
MotionGridSvg - SVG grid with motion arrows and hand positions
-->
<script lang="ts">
  import {
    GRID_POINTS_4,
    LEFT_HAND_COLOR,
    RIGHT_HAND_COLOR,
    getArrowPath,
    getLabelOffset,
    type HandPosition4,
    type MotionType,
  } from "../../../../domain/constants/motion-visualizer-data";

  let {
    leftStart,
    leftEnd,
    rightStart,
    rightEnd,
    leftMotion,
    rightMotion,
    leftCurrentPos,
    rightCurrentPos,
    animating,
    animationProgress,
    showLabels = true,
  }: {
    leftStart: HandPosition4;
    leftEnd: HandPosition4;
    rightStart: HandPosition4;
    rightEnd: HandPosition4;
    leftMotion: MotionType;
    rightMotion: MotionType;
    leftCurrentPos: { x: number; y: number };
    rightCurrentPos: { x: number; y: number };
    animating: boolean;
    animationProgress: number;
    showLabels?: boolean;
  } = $props();

  const showArrows = $derived(!animating || animationProgress < 1);
</script>

<svg viewBox="0 0 100 100" class="motion-grid">
  <!-- Grid diamond -->
  <polygon
    points="50,15 85,50 50,85 15,50"
    fill="none"
    stroke="var(--theme-stroke-strong)"
    stroke-width="0.5"
  />

  <!-- Grid lines -->
  <line
    x1="50"
    y1="15"
    x2="50"
    y2="85"
    stroke="var(--theme-stroke)"
    stroke-width="0.5"
  />
  <line
    x1="15"
    y1="50"
    x2="85"
    y2="50"
    stroke="var(--theme-stroke)"
    stroke-width="0.5"
  />

  <!-- Arrow markers -->
  <defs>
    <marker
      id="arrow-left"
      markerWidth="6"
      markerHeight="6"
      refX="5"
      refY="3"
      orient="auto"
    >
      <polygon points="0,0 6,3 0,6" fill={LEFT_HAND_COLOR} opacity="0.7" />
    </marker>
    <marker
      id="arrow-right"
      markerWidth="6"
      markerHeight="6"
      refX="5"
      refY="3"
      orient="auto"
    >
      <polygon points="0,0 6,3 0,6" fill={RIGHT_HAND_COLOR} opacity="0.7" />
    </marker>
  </defs>

  <!-- Motion arrows -->
  {#if showArrows}
    {#if leftMotion !== "static"}
      <path
        d={getArrowPath(leftStart, leftEnd)}
        stroke={LEFT_HAND_COLOR}
        stroke-width="1.5"
        fill="none"
        opacity="0.5"
        stroke-dasharray="3 2"
        marker-end="url(#arrow-left)"
      />
    {/if}
    {#if rightMotion !== "static"}
      <path
        d={getArrowPath(rightStart, rightEnd)}
        stroke={RIGHT_HAND_COLOR}
        stroke-width="1.5"
        fill="none"
        opacity="0.5"
        stroke-dasharray="3 2"
        marker-end="url(#arrow-right)"
      />
    {/if}
  {/if}

  <!-- Grid points -->
  {#each Object.entries(GRID_POINTS_4) as [key, point]}
    {@const labelOffset = getLabelOffset(key)}
    <g class="grid-point">
      <circle
        cx={point.x}
        cy={point.y}
        r="3"
        fill="var(--theme-stroke-strong, rgba(255, 255, 255, 0.25))"
      />
      {#if showLabels}
        <text
          x={point.x + labelOffset.x}
          y={point.y + labelOffset.y}
          text-anchor="middle"
          fill="var(--theme-text-dim, rgba(255, 255, 255, 0.4))"
          font-size="5"
          font-weight="600"
        >
          {key}
        </text>
      {/if}
    </g>
  {/each}

  <!-- Center point -->
  <circle cx="50" cy="50" r="2" fill="var(--theme-stroke-strong)" />

  <!-- Left hand -->
  <circle
    cx={leftCurrentPos.x}
    cy={leftCurrentPos.y}
    r="10"
    fill={LEFT_HAND_COLOR}
    class="hand-glow"
  />
  <circle
    cx={leftCurrentPos.x}
    cy={leftCurrentPos.y}
    r="6"
    fill={LEFT_HAND_COLOR}
    class="hand-point"
  />

  <!-- Right hand -->
  <circle
    cx={rightCurrentPos.x}
    cy={rightCurrentPos.y}
    r="10"
    fill={RIGHT_HAND_COLOR}
    class="hand-glow"
  />
  <circle
    cx={rightCurrentPos.x}
    cy={rightCurrentPos.y}
    r="6"
    fill={RIGHT_HAND_COLOR}
    class="hand-point"
  />
</svg>

<style>
  .motion-grid {
    width: 100%;
    max-width: 260px;
    height: auto;
    aspect-ratio: 1;
  }

  .hand-glow {
    opacity: 0.2;
    animation: pulseGlow 2s ease-in-out infinite;
  }

  @keyframes pulseGlow {
    0%,
    100% {
      opacity: 0.2;
    }
    50% {
      opacity: 0.35;
    }
  }

  .hand-point {
    filter: drop-shadow(0 0 4px currentColor);
    transition:
      cx var(--duration-instant) linear,
      cy var(--duration-instant) linear;
  }

  @media (prefers-reduced-motion: reduce) {
    .hand-glow {
      animation: none;
    }
  }
</style>
