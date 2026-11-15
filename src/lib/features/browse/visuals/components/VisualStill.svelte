<!--
  VisualStill.svelte — every still in Browse > Visuals goes through here: the
  walls, the front doors, the stage's first frame and the piece page's first
  frame.

  The stored poster (the envelope's posterUrl) is drawn on its own dark tile,
  so the page behind never shows through the artwork, and it is lifted to the
  brightness and colour the moving piece has. One recipe per kind, no
  per-piece cases; the recipe values were tuned against the real posters:

  - A tunnel poster has a transparent ground and its artwork fills only the
    middle ~58% of the square, so it is scaled up to fill the tile. Its strokes
    can be very thin and low in opacity (alpha is not touched by brightness),
    so the crisp layer thickens them with small white drop-shadows.
  - A mandala poster is drawn on a solid dark ground. It blends onto the tile
    with `screen`, so only the strokes lift; the ground drops out.

  Both kinds get a bloom layer: the same picture blurred, in the artwork's own
  colours, under the crisp one. That is the soft glow, and it never needs the
  artwork's colour spelled out.

  The square box is reserved before the image arrives and nothing spins once a
  poster URL exists; the picture fades in over the empty tile. A piece with no
  poster at all keeps the quiet pending mark.
-->
<script lang="ts">
  interface Props {
    /** The stored poster. Absent: the tile shows the pending mark. */
    src?: string;
    kind: "tunnel" | "mandala";
    /** `square` is its own 1:1 box; `fill` takes the box its parent gives it
     *  (the stage), so the artwork is contained inside that box. */
    shape?: "square" | "fill";
    /** Edge to edge: no rounding and no hairline. */
    flush?: boolean;
  }

  const { src, kind, shape = "square", flush = false }: Props = $props();

  let loaded = $state(false);
  let artEl = $state<HTMLImageElement | null>(null);

  // A cached image can finish before the handler is attached.
  $effect(() => {
    if (!src) {
      loaded = false;
      return;
    }
    loaded = !!artEl?.complete && artEl.naturalWidth > 0;
  });
</script>

<span
  class="still"
  class:fill={shape === "fill"}
  class:flush
  data-kind={kind}
>
  {#if src}
    <img
      class="bloom"
      class:loaded
      {src}
      alt=""
      aria-hidden="true"
      draggable="false"
    />
    <img
      bind:this={artEl}
      class="art"
      class:loaded
      {src}
      alt=""
      loading="lazy"
      draggable="false"
      onload={() => (loaded = true)}
    />
  {:else}
    <span class="pending" aria-hidden="true">
      <i class="fas fa-circle-notch"></i>
    </span>
  {/if}
</span>

<style>
  /* A host lifts the artwork (a hover) by setting --still-lift above 1, and
     rounds a small tile less with --still-radius. */
  .still {
    position: relative;
    display: block;
    width: 100%;
    aspect-ratio: 1;
    overflow: hidden;
    /* The tile blends its own artwork; nothing outside it takes part. */
    isolation: isolate;
    /* Near black, from the theme's own text colour. */
    background: var(--surface-panel-floor);
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.09));
    border-radius: var(--still-radius, 16px);
    box-sizing: border-box;
  }

  .still.fill {
    height: 100%;
    aspect-ratio: auto;
  }

  .still.flush {
    border: none;
    border-radius: 0;
  }

  img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: contain;
    opacity: 0;
    user-select: none;
    pointer-events: none;
    transition:
      opacity var(--duration-fast) var(--ease-standard),
      filter var(--duration-fast) var(--ease-standard);
  }

  img.loaded.art {
    opacity: 1;
  }

  /* The tunnel recipe. */
  [data-kind="tunnel"] img {
    transform: scale(1.55);
  }

  [data-kind="tunnel"] .art {
    filter: brightness(calc(1.55 * var(--still-lift, 1)))
      saturate(1.9) drop-shadow(0 0 0.6px #fff) drop-shadow(0 0 0.6px #fff)
      drop-shadow(0 0 3px rgb(255 255 255 / 0.5));
  }

  [data-kind="tunnel"] .bloom {
    filter: blur(8px) brightness(2.4) saturate(2.8);
  }

  /* The mandala recipe. */
  [data-kind="mandala"] .art {
    filter: brightness(calc(1.35 * var(--still-lift, 1))) saturate(1.7);
    mix-blend-mode: screen;
  }

  [data-kind="mandala"] .bloom {
    filter: blur(8px) brightness(1.8) saturate(2.4);
    mix-blend-mode: screen;
  }

  img.loaded.bloom {
    opacity: 0.5;
  }

  [data-kind="mandala"] img.loaded.bloom {
    opacity: 0.6;
  }

  .pending {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--theme-text-muted, #9aa6b8);
    font-size: var(--font-size-xl, 1.25rem);
    opacity: 0.7;
  }

  @media (prefers-reduced-motion: reduce) {
    img {
      transition: none;
    }
  }
</style>
