<script lang="ts">
  import type { StageFloorSpeedSample } from "../domain/stage-timeline-projection";
  import { floorSpeedPath } from "../domain/stage-timeline-projection";

  interface Props {
    samples: readonly StageFloorSpeedSample[];
    currentBeat: number;
    currentSpeed: number;
    maxBeat: number;
    maxSpeed: number;
    pixelsPerBeat: number;
  }

  let {
    samples,
    currentBeat,
    currentSpeed,
    maxBeat,
    maxSpeed,
    pixelsPerBeat,
  }: Props = $props();

  const path = $derived(floorSpeedPath(samples, maxBeat, maxSpeed));
  const cursorTop = $derived(
    92 - Math.max(0, Math.min(1, currentSpeed / Math.max(0.001, maxSpeed))) * 84
  );
</script>

<div class="motion-lane" aria-hidden="true">
  <svg
    viewBox="0 0 {maxBeat} 100"
    preserveAspectRatio="none"
    style:width="{maxBeat * pixelsPerBeat}px"
  >
    <path class="baseline" d="M 0 99 L {maxBeat} 99"></path>
    <path class="speed-line" d={path}></path>
  </svg>
  <span
    class="speed-cursor"
    style:left="{currentBeat * pixelsPerBeat}px"
    style:top="{cursorTop}%"
  ></span>
</div>

<style>
  .motion-lane {
    position: absolute;
    inset: 0;
    overflow: hidden;
    background: linear-gradient(
      180deg,
      color-mix(in srgb, var(--performer-color) 8%, transparent),
      transparent 65%
    );
  }

  svg {
    display: block;
    width: 100%;
    height: 100%;
    overflow: visible;
  }

  path {
    fill: none;
    vector-effect: non-scaling-stroke;
  }

  .baseline {
    stroke: color-mix(in srgb, var(--performer-color) 20%, transparent);
    stroke-width: 1;
  }

  .speed-line {
    stroke: var(--performer-color);
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 2.5;
    filter: drop-shadow(0 0 0.25rem var(--performer-color));
  }

  .speed-cursor {
    position: absolute;
    z-index: 2;
    width: 0.72rem;
    height: 0.72rem;
    border: 2px solid white;
    border-radius: 999px;
    background: var(--performer-color);
    box-shadow: 0 0 0.6rem var(--performer-color);
    transform: translate(-50%, -50%);
    transition: top var(--duration-instant) linear;
  }

  @media (prefers-reduced-motion: reduce) {
    .speed-cursor {
      transition: none;
    }
  }
</style>
