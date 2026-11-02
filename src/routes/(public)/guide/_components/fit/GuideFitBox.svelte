<!--
  Sizes the figures inside it so the whole screen fills the box it is given:
  a 4K window gets large pictographs, an iPhone SE gets them as large as the
  screen allows, and the page never scrolls. Only figure sizes read the scale
  (`--fit`); prose and controls keep their type roles (fit-scale.ts).

  When even the smallest figures overflow, the box pans inside itself and the
  page still does not move. Content that grows later (pictographs prepare
  after mount, web fonts arrive) refits.

  The reader never watches the search. The first fit waits briefly for the
  web fonts, so they rarely land after it. A later refit with the box the
  same size keeps the scale when it still fits and fills the box, and
  otherwise searches out of sight and fades back in; only a resize, which
  the reader is causing, searches in view.

  A search in a box the size of the last one that landed (the next topic in
  the same window, the next screen) starts from that scale, so similar
  content lands in a probe or two instead of the full bisection.
-->
<script lang="ts" module>
  // The last fit that landed, in any box: a page change in the same window
  // seeds the next page's search with it.
  let lastFit: { area: string; scale: number } | null = null;
</script>

<script lang="ts">
  import type { Snippet } from "svelte";
  import { onMount } from "svelte";
  import {
    FIT_MAX_SCALE,
    FIT_MIN_SCALE,
    fitScaleAsync,
    fitScaleFromSeedAsync,
  } from "./fit-scale";

  let {
    children,
    min = FIT_MIN_SCALE,
    max = FIT_MAX_SCALE,
    scale = $bindable(1),
    fits = $bindable(true),
    /** Changes when the content swaps, so the box refits at once. */
    contentKey,
    panScale = 0.8,
    top = false,
    onready,
  }: {
    children: Snippet;
    min?: number;
    max?: number;
    scale?: number;
    fits?: boolean;
    contentKey?: unknown;
    /** The scale used when the content pans because nothing fits. */
    panScale?: number;
    /** Stand the content at the top of the box, the leftover height under
        it, instead of centring it. */
    top?: boolean;
    /** Called each time a fit lands and the content shows. */
    onready?: () => void;
  } = $props();

  let area = $state<HTMLDivElement>();
  let inner = $state<HTMLDivElement>();
  let fitted = false;
  // Hidden until the first fit lands, so the search's trial sizes never show.
  let ready = $state(false);
  let lastHeight = -1;
  let lastArea = "";
  let raf = 0;
  // Set once the first fit may run (after the short wait for fonts).
  let started = false;

  // A refit keeps the current scale when the content still fills at least
  // this share of the box's height. The search lands a step or two short of
  // a full box, so a few pixels of growth or shrinkage never set it off.
  const KEEP_FILL = 0.9;
  // How long the first fit waits for web fonts before going ahead.
  const FONT_WAIT_MS = 800;

  // A pictograph's drawing bleeds a few pixels past its cell by design.
  const WIDTH_SLACK = 16;
  // Wider than the box: a drawn figure (pictograph, canvas, image) sticks
  // out past either edge. scrollWidth would also count the visually hidden
  // notation text, which is wide but never seen.
  function overflowsWidth(box: HTMLElement): boolean {
    const r = box.getBoundingClientRect();
    for (const el of box.querySelectorAll("svg, canvas, img")) {
      const e = el.getBoundingClientRect();
      if (e.width < 1) continue;
      // Parked off screen on purpose (an offscreen render pass), not a
      // figure sticking out.
      if (e.right < 0 || e.left > window.innerWidth) continue;
      if (e.right > r.right + WIDTH_SLACK || e.left < r.left - WIDTH_SLACK)
        return true;
    }
    return false;
  }

  function apply(s: number): void {
    inner?.style.setProperty("--fit", String(s));
  }

  // Each probe waits two frames: a step strip picks its columns from its
  // measured width after the scale changes, and the height only means
  // something once it has.
  const settle = () =>
    new Promise<void>((r) =>
      requestAnimationFrame(() => requestAnimationFrame(() => r()))
    );
  let generation = 0;
  let fitting = false;

  async function fit(): Promise<void> {
    if (!area || !inner) return;
    const aw = area.clientWidth;
    const ah = area.clientHeight;
    if (aw < 10 || ah < 10) return;
    const mine = ++generation;
    fitting = true;
    // The box is the size it was at the last fit: the content moved on its
    // own (fonts, a pictograph finished). Keep the scale when it still fits
    // and fills the box; otherwise search out of sight.
    if (ready && lastArea === `${aw}x${ah}`) {
      const height = inner.offsetHeight;
      // A panning screen stays at its pan scale while it still overflows.
      const keeps = !fits
        ? height > ah + 0.5
        : !overflowsWidth(inner) &&
          height <= ah + 0.5 &&
          (scale >= max || height >= ah * KEEP_FILL);
      if (keeps) {
        lastHeight = height;
        fitting = false;
        return;
      }
      ready = false;
    }
    const probe = async (s: number) => {
      apply(s);
      await settle();
      // The screen swapped away mid-search; the cancel check ends it.
      if (!inner) return { height: 0, overflowsWidth: false };
      return {
        height: inner.offsetHeight,
        overflowsWidth: overflowsWidth(inner),
      };
    };
    const stale = () => mine !== generation || !inner;
    const seed = lastFit?.area === `${aw}x${ah}` ? lastFit.scale : null;
    const result =
      seed === null
        ? await fitScaleAsync(probe, ah, stale, min, max)
        : await fitScaleFromSeedAsync(probe, ah, stale, seed, min, max);
    if (!result || !inner) return;
    // Even the smallest figures overflow: the box pans anyway, so draw them
    // at a size that reads on a phone instead of the floor.
    const final = result.fits ? result.scale : Math.max(min, panScale);
    apply(final);
    scale = final;
    fits = result.fits;
    await settle();
    if (mine !== generation || !inner) return;
    lastHeight = inner.offsetHeight;
    lastArea = `${aw}x${ah}`;
    if (result.fits) lastFit = { area: lastArea, scale: final };
    fitted = true;
    fitting = false;
    ready = true;
    onready?.();
  }

  function schedule(): void {
    if (raf || !started) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      void fit();
    });
  }

  onMount(() => {
    // Fonts that land after the first fit change the text's height and
    // force a second fit; give them a moment to arrive first.
    const fontsReady = document.fonts?.ready ?? Promise.resolve();
    void Promise.race([
      fontsReady,
      new Promise((r) => setTimeout(r, FONT_WAIT_MS)),
    ]).then(() => {
      started = true;
      if (!fitted && !fitting) void fit();
    });
    // The box changed size (window, rotation, fold): refit.
    const areaObserver = new ResizeObserver(() => {
      if (!area) return;
      if (`${area.clientWidth}x${area.clientHeight}` !== lastArea) schedule();
    });
    // The content changed height on its own (a pictograph finished, a pool
    // example swapped): refit. fit() records the height it settled on, so its
    // own changes do not loop.
    const contentObserver = new ResizeObserver(() => {
      if (!inner || !fitted || fitting) return;
      if (Math.abs(inner.offsetHeight - lastHeight) > 1) schedule();
    });
    if (area) areaObserver.observe(area);
    if (inner) contentObserver.observe(inner);
    void document.fonts?.ready.then(() => schedule());
    return () => {
      areaObserver.disconnect();
      contentObserver.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  });

  $effect(() => {
    void contentKey;
    if (fitted) schedule();
  });
</script>

<div class="fit-area" class:pans={!fits} class:top bind:this={area}>
  <div class="fit-content" class:ready bind:this={inner}>
    {@render children()}
  </div>
</div>

<style>
  .fit-area {
    position: relative;
    display: grid;
    align-content: safe center;
    width: 100%;
    height: 100%;
    min-height: 0;
    overflow: hidden;
  }
  .fit-area.top {
    align-content: start;
  }
  /* Even the smallest figures overflow: the content pans inside its own
     area; the page itself never scrolls. */
  .fit-area.pans {
    align-content: start;
    overflow-y: auto;
    overscroll-behavior: contain;
  }
  .fit-content {
    --fit: 1;
    opacity: 0;
    width: 100%;
    min-width: 0;
    /* Container queries inside (SequenceShowcase, the grid reference) read
       this box. */
    container-type: inline-size;
  }
  .fit-content.ready {
    opacity: 1;
    transition: opacity var(--duration-fast) var(--ease-standard);
  }
</style>
