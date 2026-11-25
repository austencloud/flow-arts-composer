<!-- packages/shape-engine/src/components/ShapeMatrixMandalaArt.svelte
  The one Shape Matrix mandala artwork primitive. A matrix tile and the
  detail hero's cold floor are two instances of THIS component, each asking
  the shared guide painter (shape-matrix-artwork.ts) for an image at its own
  measured pixel size — so the strokes are the animator's strokes at every
  size, never a scaled raster.

  `claim` stamps the shared `view-transition-name` through the name registry,
  so only the endpoint that currently owns the artwork carries it and the
  native shared-element transition can morph one instance into the other.

  It fills its parent (which must own a square box). A change of `artKey`
  (a different flower or pair) crossfades in place through the shared
  Crossfade primitive; a resize repaints the current image without one.

  `drawIn` draws the first picture on with the guide painter's reveal (the
  still's progressive twin) before the still shows. The reveal's last frame
  is the still, so the image takes over in the same frame with no fade. -->
<script lang="ts">
  import { untrack } from "svelte";
  import { Crossfade, motionDuration } from "@austencloud/motion";
  import { cubicInOut } from "svelte/easing";
  import type { MandalaArtDrawIn } from "../services/shape-matrix-draw-in";
  import { claimedViewTransitionName } from "#lib/shared/transitions/claimed-view-transition-name.js";
  import { DURATION, STAGGER } from "@austencloud/motion";
  import {
    registerMandalaArtMeasurer,
    SHAPE_MATRIX_ACTIVE_MANDALA_NAME,
  } from "../services/shape-matrix-artwork";

  let {
    paint,
    artKey,
    alt = "",
    claim = false,
    instant = false,
    drawIn,
  }: {
    /** Image source for a square of `sizePx` CSS pixels; "" paints nothing. */
    paint: (sizePx: number) => string;
    /** Identity of the artwork; changing it crossfades, resizing does not. */
    artKey: string;
    alt?: string;
    /** True on the ONE instance that owns the shared-element name right now. */
    claim?: boolean;
    /**
     * Show the current source with no crossfade. A shared-element transition
     * snapshots the element the frame it changes; a crossfade in progress
     * would put the OUTGOING image in that snapshot.
     */
    instant?: boolean;
    /** Draw the first picture on instead of fading it in. */
    drawIn?: MandalaArtDrawIn;
  } = $props();

  let host = $state<HTMLDivElement | null>(null);
  let side = $state(0);
  // A pane folded shut keeps the picture it had, at the size it had, and
  // paints nothing new: no resize repaint as its box shrinks to the tile's
  // smallest size on the way out, and no fresh pair painted at a size it is
  // about to leave. Unseen, those repaints cost the tap 50 ms. The pane
  // opening again measures its real size and paints once.
  let held = $state(false);
  let lastSrc = "";
  const src = $derived.by(() => {
    if (held && lastSrc) return lastSrc;
    lastSrc = side > 0 ? paint(side) : "";
    return lastSrc;
  });

  // svelte-ignore state_referenced_locally
  let drawing = $state(drawIn !== undefined);
  /* The still that follows a drawing shows at once; later pictures fade. */
  let drewKey = $state<string | null>(null);
  let drawCanvas = $state<HTMLCanvasElement | null>(null);
  $effect(() => {
    const canvas = drawCanvas;
    if (!drawing || !canvas || !(side > 0)) return;
    // A different flower draws from where this one had got to.
    void artKey;
    const spec = untrack(() => drawIn);
    // Tracked on purpose: the drawing starts once the page is shown.
    if (spec && !spec.shown()) return;
    const duration = spec ? motionDuration(spec.durationMs) : 0;
    /* Reduced motion, or the first fill already went past this tile: it
       shows its picture the ordinary way. */
    const due =
      spec !== undefined &&
      duration > 0 &&
      spec.timeline.elapsed() < spec.delayMs + duration;
    if (!due) {
      drawing = false;
      return;
    }
    const frame = spec.frame(canvas, side);
    if (!frame) {
      // No paths yet: wait for them. A canvas that can't draw: the still.
      // Only here is the still asked for before a drawing ends. Painting every
      // tile's picture up front held the first stroke back by the whole grid.
      if (src) drawing = false;
      return;
    }
    const finish = () => {
      drewKey = untrack(() => artKey);
      drawing = false;
    };
    const paintAt = (elapsed: number) => {
      const progress = (elapsed - spec.delayMs) / duration;
      // Before its turn a tile is empty: a stroke of no length would still
      // leave its round cap, a dot.
      if (progress > 0) frame.paint(cubicInOut(Math.min(1, progress)));
      return progress < 1;
    };
    // From where the timeline is, not from blank: geometry that changes
    // mid-draw (the prop's reach arriving) carries on drawing, unbroken.
    paintAt(spec.timeline.elapsed());
    return spec.timeline.subscribe((elapsed) => {
      const more = paintAt(elapsed);
      if (!more) finish();
      return more;
    });
  });

  $effect(() => {
    const node = host;
    if (!node) return;
    const measure = () => {
      held = node.closest("[data-pane-folded]") !== null;
      if (held) return;
      side = Math.round(Math.min(node.clientWidth, node.clientHeight));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(node);
    // The morph re-measures synchronously before its new-state capture; the
    // observer alone would report a frame too late (see shape-matrix-artwork).
    const unregister = registerMandalaArtMeasurer(measure);
    return () => {
      ro.disconnect();
      unregister();
    };
  });
</script>

<div
  class="mandala-art"
  bind:this={host}
  use:claimedViewTransitionName={{
    name: SHAPE_MATRIX_ACTIVE_MANDALA_NAME,
    enabled: claim,
  }}
>
  {#if drawing}
    <canvas class="draw-in" bind:this={drawCanvas} aria-hidden="true"></canvas>
  {:else if src}
    {#if instant || drewKey === artKey}
      <img class="instant" {src} {alt} draggable="false" />
    {:else}
      <Crossfade
        key={artKey}
        fill
        duration={DURATION.emphasis}
        delay={STAGGER.micro}
      >
        <img {src} {alt} draggable="false" />
      </Crossfade>
    {/if}
  {/if}
</div>

<style>
  .mandala-art {
    position: relative;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
  }

  .mandala-art img.instant,
  .mandala-art canvas.draw-in {
    position: absolute;
    inset: 0;
  }

  .mandala-art canvas.draw-in {
    display: block;
    width: 100%;
    height: 100%;
  }

  .mandala-art img {
    display: block;
    width: 100%;
    height: 100%;
    user-select: none;
    -webkit-user-drag: none;
  }
</style>
