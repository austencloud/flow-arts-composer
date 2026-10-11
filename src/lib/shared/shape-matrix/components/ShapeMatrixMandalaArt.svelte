<!-- src/lib/shared/shape-matrix/components/ShapeMatrixMandalaArt.svelte
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
  Crossfade primitive; a resize repaints the current image without one. -->
<script lang="ts">
  import Crossfade from "#lib/shared/components/Crossfade.svelte";
  import { claimedViewTransitionName } from "#lib/shared/transitions/claimed-view-transition-name.js";
  import { DURATION, STAGGER } from "#lib/shared/transitions/transitions.js";
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
  } = $props();

  let host = $state<HTMLDivElement | null>(null);
  let side = $state(0);
  const src = $derived(side > 0 ? paint(side) : "");

  $effect(() => {
    const node = host;
    if (!node) return;
    const measure = () => {
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
  {#if src}
    {#if instant}
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

  .mandala-art img.instant {
    position: absolute;
    inset: 0;
  }

  .mandala-art img {
    display: block;
    width: 100%;
    height: 100%;
    user-select: none;
    -webkit-user-drag: none;
  }
</style>
