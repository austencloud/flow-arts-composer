<script lang="ts">
  import { onMount } from "svelte";
  import CodexSheet from "./_components/CodexSheet.svelte";
  import { SHEETS } from "./_data/codex-groups";
  import GuideSeo from "../level-1/_components/GuideSeo.svelte";
  import { tDynamic } from "$lib/shared/i18n/i18n.svelte.js";

  function print() {
    window.print();
  }

  // Scale-to-fit-width (client-only) - same treatment as GuidePageHost's print-
  // sheet toggle: each artboard is a fixed 816x1056 (8.5x11in) print page that
  // otherwise renders at its native size regardless of viewport, floating tiny
  // in a wide/4K viewport. Shrinks below 816px available width (mobile),
  // upscales up to 1.9x above it (past that the raster gets soft, not crisp).
  // One shared scale for every sheet on the page - they're all the same
  // nominal size, so a single measurement covers all of them.
  let sheetsEl = $state<HTMLDivElement>();
  let scale = $state(1);
  // .sheets flex-centers each .sheet-wrap; .sheet-wrap is 816px wide but capped
  // at max-width: 100%, so on narrow viewports it shrinks to the viewport
  // instead of leaving an 816px layout box hanging past the right edge
  // (phantom horizontal scroll). That cap splits the geometry in two regimes,
  // exactly like GuidePageHost's margin:auto version:
  // - scale < 1 (viewport < 816): wrap hugs the viewport, .sheet-scale's
  //   top-left origin sits at 0, and the scaled-down sheet exactly spans the
  //   wrap - no shift needed.
  // - scale >= 1: wrap is the full 816 and flex-centered, but transform-origin:
  //   top left grows the sheet rightward from its already-centred left edge -
  //   shift left by half the EXTRA width the upscale adds (816 * (scale-1) / 2)
  //   to re-centre.
  const shiftPx = $derived(-408 * Math.max(0, scale - 1));

  onMount(() => {
    const fit = () => {
      if (!sheetsEl) return;
      scale = Math.min(sheetsEl.clientWidth / 816, 1.9);
    };
    fit();
    const ro = new ResizeObserver(fit);
    if (sheetsEl) ro.observe(sheetsEl);
    return () => ro.disconnect();
  });
</script>

<GuideSeo
  title={tDynamic("guide_codex_seo_title")}
  description={tDynamic("guide_codex_seo_description")}
  path="/guide/codex"
  breadcrumbs={[
    { name: tDynamic("guide_paths_home"), path: "/" },
    { name: tDynamic("guide_paths_part_of"), path: "/guide" },
    { name: tDynamic("guide_codex_title"), path: "/guide/codex" },
  ]}
/>

<div class="codex-print-root">
  <div class="toolbar">
    <button class="print-btn" onclick={print}>{tDynamic("guide_codex_print")}</button>
  </div>

  <div class="sheets" bind:this={sheetsEl}>
    {#each SHEETS as sheet, i (i)}
      <div class="sheet-wrap" style="height: {1056 * scale}px">
        <div class="sheet-scale" style="transform: translateX({shiftPx}px) scale({scale})">
          <CodexSheet {sheet} />
        </div>
      </div>
    {/each}
  </div>
</div>

<style>
  .codex-print-root {
    min-height: 100vh;
    background: #4a4f57;
    padding: 1.5rem 0 3rem;
  }

  .toolbar {
    position: sticky;
    top: 0;
    z-index: 10;
    display: flex;
    justify-content: center;
    padding: 0 0 1.25rem;
  }

  .print-btn {
    font: 600 0.95rem/1 system-ui, sans-serif;
    padding: 0.7rem 1.4rem;
    border: none;
    border-radius: 999px;
    background: #111;
    color: #fff;
    cursor: pointer;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
  }

  .print-btn:hover {
    background: #000;
  }

  .sheets {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.5rem;
  }

  /* Reserves the SCALED footprint (bound in the markup to 1056 * scale) so a
     stack of upscaled sheets doesn't overlap the next one down (transform
     doesn't affect layout). 816px matches .sheet-scale's own unscaled width so
     flex `align-items: center` on .sheets centers it; max-width keeps the
     layout box inside narrow viewports (the scaled-down sheet fits visually -
     without the cap the untransformed 816px box adds phantom horizontal
     scroll). */
  .sheet-wrap {
    width: 816px;
    max-width: 100%;
  }

  /* The actual print-page artboard: fixed native size, scaled to fit via
     transform (see shiftPx above for the centering compensation). */
  .sheet-scale {
    width: 816px;
    height: 1056px;
    transform-origin: top left;
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.4);
  }

  @media print {
    .codex-print-root {
      background: #fff;
      padding: 0;
    }
    .toolbar {
      display: none;
    }
    .sheets {
      gap: 0;
    }
    /* Printing always wants the native 1:1 page size, never the screen-fit
       scale (a wide-monitor 1.9x scale would print oversized/clipped) - the
       reserved height and transform are both screen-only concerns. */
    .sheet-wrap {
      width: auto;
      height: auto !important;
      break-after: page;
    }
    .sheet-wrap:last-child {
      break-after: auto;
    }
    .sheet-scale {
      transform: none !important;
      box-shadow: none;
    }
  }

  @page {
    size: letter portrait;
    margin: 0;
  }
</style>
