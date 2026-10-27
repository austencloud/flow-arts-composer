<!--
  Sizes the figures inside it so the whole screen fills the box it is given:
  a 4K window gets large pictographs, an iPhone SE gets them as large as the
  screen allows, and the page never scrolls. Only figure sizes read the scale
  (`--fit`); prose and controls keep their type roles (fit-scale.ts).

  When even the smallest figures overflow, the box pans inside itself and the
  page still does not move. Content that grows later (pictographs prepare
  after mount, web fonts arrive) refits.
-->
<script lang="ts">
  import type { Snippet } from "svelte";
  import { onMount } from "svelte";
  import { FIT_MAX_SCALE, FIT_MIN_SCALE, fitScaleAsync } from "./fit-scale";

  let {
    children,
    min = FIT_MIN_SCALE,
    max = FIT_MAX_SCALE,
    scale = $bindable(1),
    fits = $bindable(true),
    /** Changes when the content swaps, so the box refits at once. */
    contentKey,
    panScale = 0.8,
  }: {
    children: Snippet;
    min?: number;
    max?: number;
    scale?: number;
    fits?: boolean;
    contentKey?: unknown;
    /** The scale used when the content pans because nothing fits. */
    panScale?: number;
  } = $props();

  let area = $state<HTMLDivElement>();
  let inner = $state<HTMLDivElement>();
  let fitted = false;
  // Hidden until the first fit lands, so the search's trial sizes never show.
  let ready = $state(false);
  let lastHeight = -1;
  let lastArea = "";
  let raf = 0;

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
    const result = await fitScaleAsync(
      async (s) => {
        apply(s);
        await settle();
        // The screen swapped away mid-search; the cancel check ends it.
        if (!inner) return { height: 0, overflowsWidth: false };
        return {
          height: inner.offsetHeight,
          overflowsWidth: overflowsWidth(inner),
        };
      },
      ah,
      () => mine !== generation || !inner,
      min,
      max
    );
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
    fitted = true;
    fitting = false;
    ready = true;
  }

  function schedule(): void {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      void fit();
    });
  }

  onMount(() => {
    void fit();
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

<div class="fit-area" class:pans={!fits} bind:this={area}>
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
