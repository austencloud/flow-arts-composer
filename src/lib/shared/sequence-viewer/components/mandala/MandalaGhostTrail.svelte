<!--
  MandalaGhostTrail.svelte

  The afterimage behind the live mandala. Each ghost is one canvas holding a
  copy of an earlier live frame, turned to the spin it had then and fading by
  age. The canvases are created once, sized once, and redrawn in place, so a
  running trail allocates nothing per frame. The parent feeds frames through
  `capture`, from the live mandala's own frame loop.
-->
<script lang="ts">
  import { untrack } from "svelte";
  import {
    MANDALA_GHOST_INTERVAL_MS,
    MANDALA_TRAIL_MAX,
    MandalaGhostRing,
    clampTrailLength,
    mandalaGhostOpacity,
  } from "#lib/shared/mandala/domain/mandala-ghost-ring.js";

  interface Props {
    enabled: boolean;
    length: number;
    /** CSS size of the live mandala, in pixels. */
    size: number;
    /** Lighten where ghosts overlap (dark stages); plain fading on light ones. */
    additive?: boolean;
  }

  let { enabled, length, size, additive = true }: Props = $props();

  // Ghosts are faint and soft, so their copies are kept smaller than the live
  // canvas: at most this many pixels on a side, which bounds the trail to about
  // 30 MB at its longest.
  const MAX_GHOST_BACKING = 720;

  const ring = new MandalaGhostRing(length);
  const canvases: (HTMLCanvasElement | undefined)[] = $state(
    Array.from({ length: MANDALA_TRAIL_MAX }, () => undefined)
  );
  const slotIndices = Array.from({ length: MANDALA_TRAIL_MAX }, (_, i) => i);

  function hideAll(): void {
    for (const canvas of canvases) {
      if (canvas) canvas.style.opacity = "0";
    }
  }

  const shownLength = $derived(clampTrailLength(length));

  $effect(() => {
    const next = shownLength;
    untrack(() => {
      ring.setLength(next);
      hideAll();
    });
  });

  // Turning the trail off stops new captures and lets the layer fade out with
  // the last ghosts still on it; turning it on starts from an empty trail.
  $effect(() => {
    const on = enabled;
    untrack(() => {
      ring.clear();
      if (on) hideAll();
    });
  });

  /** Fades every held ghost to its current age. */
  function fade(now: number): void {
    for (let index = 0; index < ring.length; index++) {
      const canvas = canvases[index];
      if (!canvas) continue;
      const slot = ring.slot(index);
      canvas.style.opacity = slot
        ? String(mandalaGhostOpacity(now - slot.capturedAt))
        : "0";
    }
  }

  /** Takes a frame from the live canvas when one is due, then refades. */
  export function capture(
    source: HTMLCanvasElement,
    rotationDeg: number,
    now: number
  ): void {
    if (!enabled) return;
    if (ring.isDue(now, MANDALA_GHOST_INTERVAL_MS) && source.width > 0) {
      const index = ring.push(rotationDeg, now);
      const target = canvases[index];
      if (target) {
        const side = Math.min(MAX_GHOST_BACKING, source.width);
        if (target.width !== side || target.height !== side) {
          target.width = side;
          target.height = side;
        }
        const ctx = target.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, side, side);
          ctx.drawImage(source, 0, 0, side, side);
        }
        target.style.transform = `rotate(${rotationDeg}deg)`;
      }
    }
    fade(now);
  }
</script>

<div
  class="ghost-layer"
  class:on={enabled}
  class:additive
  style:width="{size}px"
  style:height="{size}px"
  aria-hidden="true"
>
  {#each slotIndices.slice(0, shownLength) as index (index)}
    <canvas class="ghost" bind:this={canvases[index]}></canvas>
  {/each}
</div>

<style>
  .ghost-layer {
    position: absolute;
    pointer-events: none;
    opacity: 0;
    transition: opacity var(--duration-emphasis) var(--ease-standard-out);
  }
  .ghost-layer.on {
    opacity: 1;
  }

  .ghost {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    opacity: 0;
  }

  /* Overlapping ghosts add up like light on film on a dark stage. */
  .ghost-layer.additive .ghost {
    mix-blend-mode: screen;
  }

  @media (prefers-reduced-motion: reduce) {
    .ghost-layer {
      transition: none;
    }
  }
</style>
