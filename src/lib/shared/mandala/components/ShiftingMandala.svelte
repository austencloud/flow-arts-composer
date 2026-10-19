<script lang="ts">
  /**
   * A mandala that shifts from one sequence to the next on the beat.
   *
   * The picture is a pure function of `beats`: the parent owns the clock (the
   * post's time, a test page's play loop) and this component only draws. One
   * effect paints synchronously whenever an input changes, then stamps the
   * canvas with `stamp` so an export surface can wait for the frame it asked
   * for.
   */
  import {
    DEFAULT_MANDALA_LOOK,
    DEFAULT_MANDALA_SHIFT,
    MANDALA_DEFAULT_BEATS_PER_BAR,
    type MandalaLook,
    type MandalaShift,
  } from "../domain/mandala-shift-types";
  import {
    drawShiftingMandalaFrame,
    prepareShiftingMandala,
    shiftingMandalaFrameAt,
    type ShiftingMandalaScratch,
    type ShiftingMandalaSource,
  } from "../services/mandala-shift-render";
  import { prefersReducedMotion } from "#lib/shared/3d/environments/primitives/motion-preference.js";

  interface Props {
    sources: readonly ShiftingMandalaSource[];
    shift?: MandalaShift;
    look?: MandalaLook;
    /** Fractional beats from the clip's anchor. */
    beats: number;
    beatsPerBar?: number;
    /** Written to `data-frame` after each draw, for an export surface to wait on. */
    stamp?: string;
    /** Backing store while exporting; otherwise the box at device resolution. */
    exportSize?: { width: number; height: number } | null;
    reducedMotion?: boolean;
  }

  let {
    sources,
    shift = DEFAULT_MANDALA_SHIFT,
    look = DEFAULT_MANDALA_LOOK,
    beats,
    beatsPerBar = MANDALA_DEFAULT_BEATS_PER_BAR,
    stamp,
    exportSize = null,
    reducedMotion = prefersReducedMotion(),
  }: Props = $props();

  // The viewer's cap: the glow pass is the cost, and it grows with the pixels.
  const MAX_BACKING = 2160;

  let canvas = $state<HTMLCanvasElement | null>(null);
  let boxWidth = $state(0);
  let boxHeight = $state(0);
  let scratch: ShiftingMandalaScratch | null = null;

  const prepared = $derived(prepareShiftingMandala(sources, look.shape));

  function backingStore(): { width: number; height: number; scale: number } {
    if (exportSize) {
      return {
        width: Math.max(1, Math.round(exportSize.width)),
        height: Math.max(1, Math.round(exportSize.height)),
        scale: Math.min(exportSize.width / Math.max(1, boxWidth), exportSize.height / Math.max(1, boxHeight)),
      };
    }
    const dpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
    const scale = Math.min(dpr, MAX_BACKING / Math.max(1, boxWidth, boxHeight));
    return {
      width: Math.max(1, Math.round(boxWidth * scale)),
      height: Math.max(1, Math.round(boxHeight * scale)),
      scale,
    };
  }

  $effect(() => {
    const target = canvas;
    if (!target || boxWidth <= 0 || boxHeight <= 0) return;
    const frame = shiftingMandalaFrameAt(prepared, shift, look, beats, beatsPerBar, reducedMotion);
    const store = backingStore();
    if (target.width !== store.width || target.height !== store.height) {
      target.width = store.width;
      target.height = store.height;
    }
    const ctx = target.getContext("2d");
    if (!ctx) return;
    if (
      typeof OffscreenCanvas !== "undefined" &&
      (!scratch || scratch.a.width !== store.width || scratch.a.height !== store.height)
    ) {
      scratch = {
        a: new OffscreenCanvas(store.width, store.height),
        b: new OffscreenCanvas(store.width, store.height),
      };
    }
    ctx.setTransform(store.scale, 0, 0, store.scale, 0, 0);
    drawShiftingMandalaFrame(
      ctx,
      frame,
      store.width / store.scale,
      store.height / store.scale,
      look.lineWeight,
      scratch ?? undefined
    );
    if (stamp !== undefined) target.dataset.frame = stamp;
  });
</script>

<div class="shifting-mandala" bind:clientWidth={boxWidth} bind:clientHeight={boxHeight}>
  <canvas bind:this={canvas} data-shifting-mandala aria-hidden="true"></canvas>
</div>

<style>
  .shifting-mandala {
    display: block;
    width: 100%;
    height: 100%;
    overflow: hidden;
  }
  canvas {
    display: block;
    width: 100%;
    height: 100%;
  }
</style>
