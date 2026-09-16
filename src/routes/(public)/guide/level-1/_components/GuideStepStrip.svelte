<script lang="ts">
  /**
   * One sequence as a start box + a NEAT grid of fused step rows. The start
   * position is never mixed into the step flow: it takes its own leading
   * COLUMN (a separate framed cell, top-aligned like the card's top-left
   * start) or its own ROW above the steps - whichever leaves the steps in
   * fewer, wider rows. The steps prefer the WIDEST fitting layout (one row
   * when it fits, else the widest even divisor: 16 → 8×2 before 4×4) - this
   * is a wide band, not a portrait card, so width is used before height and
   * rows always stack in aligned columns.
   *
   * The step block is ONE solid rounded rectangle - cells flush with hairline
   * seams in BOTH axes (the choreo card grid), step labels drawn inside their
   * cells (the card's step-number convention) so nothing splits the block
   * apart - and nothing ever scrolls sideways (a single scrollable row
   * survives only as the SSR/no-JS fallback).
   *
   * Cells are real GuidePictographs: each carries its synchronous
   * describePictograph aria-label, so the notation lands in SSR HTML and the
   * strip is crawlable by construction.
   */
  import GuidePictograph from "./GuidePictograph.svelte";
  import { isStartBox } from "../_data/guide-sequence-adapter";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
  import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
  import type { PictographRender } from "../_data/guide-content-blocks";
  import type { Snippet } from "svelte";

  let {
    items,
    stepLabels,
    caption,
    render,
    picTheme = "light",
    startAside,
    activeBeat = null,
  }: {
    items: PictographData[];
    /** Per-cell labels ("Start", "1", …), parallel to `items`. Omitted → unlabeled. */
    stepLabels?: string[];
    /** Optional figcaption under the strip. */
    caption?: string;
    /** Flow render hints; defaults match FlowFrame's long-standing behavior. */
    render?: PictographRender;
    picTheme?: "light" | "dark";
    /**
     * Content for the start ROW: rendered beside the start box, filling the
     * band the tab layout leaves free (a sequence's label/caption). Providing
     * it forces the tab layout - the start box fused onto the grid's top-left
     * - so the text always has that band to live in.
     */
    startAside?: Snippet;
    /**
     * The beat currently playing (0 = start box, 1..N = steps), from the
     * showcase's live scrub/playback position. Rings that cell with the
     * existing `.guide-step-active` style (guide.css - the same ring the
     * companion's click-to-animate uses). null (default) = no highlight, so
     * every existing caller (FlowFrame) renders byte-identical.
     */
    activeBeat?: number | null;
  } = $props();

  const r = $derived({
    propType: render?.propType ?? PropType.HAND,
    showTKA: render?.showTKA ?? true,
    showPlacements: render?.showPlacements ?? false,
    showElemental: render?.showElemental ?? false,
    showReversals: render?.showReversals ?? false,
    showNonRadialPoints: render?.showNonRadialPoints ?? false,
  });

  const MIN_CELL = 104;
  const MAX_CELL = 132;
  const START_GAP_PX = 10; // must match .unit's column gap below

  const startBox = $derived(
    items.length && isStartBox(items[0] as unknown as StepData) ? items[0]! : null
  );
  const steps = $derived(startBox ? items.slice(1) : items);
  /** Label index offset: step i's label lives at stepLabels[offset + i]. */
  const labelOffset = $derived(startBox ? 1 : 0);

  type Mode = "scroll" | "column" | "row" | "none";
  const chunk = (list: PictographData[], size: number): PictographData[][] => {
    const rows: PictographData[][] = [];
    for (let start = 0; start < list.length; start += size) rows.push(list.slice(start, start + size));
    return rows;
  };

  let measuredW = $state(0);

  const layout = $derived.by(() => {
    const n = steps.length;
    if (!n) return { mode: "none" as Mode, rows: [] as PictographData[][], cols: 1, cellW: 0 };
    if (!measuredW) return { mode: "scroll" as Mode, rows: [steps], cols: n, cellW: 0 };
    // This is a WIDE band, not a portrait card: prefer the WIDEST layout that
    // fits - one row when it fits, else the widest EVEN divisor of the step
    // count (16 → 8×2 before 4×4) so rows always stack in aligned columns.
    // Balanced-ceiling fallback only for counts with no fitting divisor.
    const neatCols = (maxCols: number): number => {
      const cap = Math.max(1, maxCols);
      if (n <= cap) return n;
      for (let c = cap; c >= 2; c--) if (n % c === 0) return c;
      return Math.ceil(n / Math.ceil(n / cap));
    };
    if (startBox) {
      const rowCols = neatCols(Math.floor(measuredW / MIN_CELL));
      const rowLayout = () => ({
        mode: "row" as Mode,
        rows: chunk(steps, rowCols),
        cols: rowCols,
        cellW: Math.min(MAX_CELL, Math.floor(measuredW / rowCols)),
      });
      // A start-row aside (the sequence's label) forces the TAB layout - the
      // start box fused to the grid's top-left with the text beside it.
      if (startAside) return rowLayout();
      // Otherwise: own COLUMN or own ROW - whichever leaves the steps in
      // fewer, wider rows. Ties go to the column (the start then leads the
      // reading direction, the card's top-left corner).
      const colCols = neatCols(Math.floor((measuredW - START_GAP_PX) / MIN_CELL) - 1);
      const colCellW = Math.min(MAX_CELL, Math.floor((measuredW - START_GAP_PX) / (colCols + 1)));
      const colFits = colCellW >= MIN_CELL;
      const columnWins = colFits && Math.ceil(n / colCols) <= Math.ceil(n / rowCols);
      if (columnWins) {
        return { mode: "column" as Mode, rows: chunk(steps, colCols), cols: colCols, cellW: colCellW };
      }
      return rowLayout();
    }
    const cols = neatCols(Math.floor(measuredW / MIN_CELL));
    return {
      mode: "none" as Mode,
      rows: chunk(steps, cols),
      cols,
      cellW: Math.min(MAX_CELL, Math.floor(measuredW / cols)),
    };
  });

  const cellWidth = $derived(layout.cellW ? `${layout.cellW}px` : undefined);
</script>

{#snippet stepCell(pos: PictographData, label: string | undefined, beatNumber: number | null = null)}
  <div class="strip-cell" style:width={cellWidth}>
    <div class="pic-card" class:guide-step-active={activeBeat != null && beatNumber === activeBeat}>
      <GuidePictograph
        data={pos}
        size="sm"
        eager
        forceTheme={picTheme}
        propType={r.propType}
        showTKA={r.showTKA}
        showPlacements={r.showPlacements}
        showElemental={r.showElemental}
        showReversals={r.showReversals}
        showNonRadialPoints={r.showNonRadialPoints}
      />
      {#if label}
        <!-- Inside the cell (the card's step-number convention) so labels never
             break the fused grid apart. -->
        <span class="strip-step">{label}</span>
      {/if}
    </div>
  </div>
{/snippet}

<figure class="guide-step-strip" role="group" aria-label={caption ?? "Sequence"} bind:clientWidth={measuredW}>
  {#if layout.mode === "scroll"}
    <!-- Pre-measurement fallback (SSR / no-JS): aside above, everything in one
         scrollable row rather than overflowing the page. Vanishes once measured. -->
    {#if startAside}<div class="start-aside bare">{@render startAside()}</div>{/if}
    <div class="strip scroll">
      {#each items as pos, n (pos.id ?? n)}
        {@render stepCell(pos, stepLabels?.[n], startBox ? n : n + 1)}
      {/each}
    </div>
  {:else}
    <div class="unit" class:start-column={layout.mode === "column"} class:start-tab={layout.mode === "row"}>
      {#if startBox && layout.mode === "column"}
        <div class="start-slot">
          {@render stepCell(startBox, stepLabels?.[0], 0)}
        </div>
      {:else if startBox}
        <!-- The tab: start box fused onto the grid's top-left, the label
             filling the band beside it. -->
        <div class="start-row">
          <div class="start-slot">
            {@render stepCell(startBox, stepLabels?.[0], 0)}
          </div>
          {#if startAside}<div class="start-aside">{@render startAside()}</div>{/if}
        </div>
      {:else if startAside}
        <div class="start-aside bare">{@render startAside()}</div>
      {/if}
      <div class="rows">
        {#each layout.rows as row, ri (ri)}
          <div class="strip">
            {#each row as pos, ci (pos.id ?? ri * layout.cols + ci)}
              {@render stepCell(pos, stepLabels?.[labelOffset + ri * layout.cols + ci], ri * layout.cols + ci + 1)}
            {/each}
          </div>
        {/each}
      </div>
    </div>
  {/if}
  {#if caption}<figcaption>{caption}</figcaption>{/if}
</figure>

<style>
  .guide-step-strip {
    margin: 1.5rem auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.6rem;
    max-width: 100%;
    min-width: 0;
    width: 100%;
  }

  /* Start + steps. Column mode: start cell leads, top-aligned with the first
     step row (the card's top-left start). Row mode: start anchored to the
     grid's LEADING edge above it (the card's row-0 start), never adrift in
     the middle. */
  .unit {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 10px; /* START_GAP_PX */
    max-width: 100%;
  }
  .unit.start-column {
    flex-direction: row;
    justify-content: center;
  }
  /* Tab layout: the start box sits ON the grid (no gap - the grid's top edge
     is the shared hairline seam), its label filling the band beside it. */
  .unit.start-tab {
    gap: 0;
  }
  .start-row {
    /* The tab stays PINNED to the grid (flex-end) even when the label beside
       it is taller; the label centres itself in the band. */
    display: flex;
    align-items: flex-end;
    gap: 1.1rem;
    width: 100%;
    min-width: 0;
  }
  .start-aside {
    flex: 1 1 0;
    min-width: 0;
    align-self: center;
  }
  .start-aside.bare {
    flex: none;
    width: 100%;
    margin-bottom: 0.4rem;
  }
  /* The tab itself: framed on top and sides, OPEN at the bottom (the grid's
     top border closes it as a seam), top corners rounded only. */
  .start-tab .start-slot .pic-card {
    border: 1px solid var(--seam, color-mix(in oklab, var(--ink, #1a1a1a) 16%, transparent));
    border-block-end: none;
    border-radius: 12px 12px 0 0;
  }
  /* The grid corner under the tab squares off so tab + grid read as one shape. */
  .start-tab .strip:first-child .strip-cell:first-child .pic-card {
    border-start-start-radius: 0;
  }
  /* Rows fuse VERTICALLY too - the whole step block is one solid rounded
     rectangle with hairline seams in both axes, exactly the choreo card grid. */
  .rows {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0;
    max-width: 100%;
    min-width: 0;
  }
  /* One fused bar: steps flush, hairline seams, outer corners rounded. */
  .strip {
    --seam: color-mix(in oklab, var(--ink, #1a1a1a) 16%, transparent);
    display: flex;
    gap: 0;
    max-width: 100%;
  }
  .strip.scroll {
    overflow-x: auto;
    padding: 0.25rem 0.25rem 0.6rem;
    scroll-snap-type: x proximity;
    justify-content: safe center;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: thin;
  }
  .strip-cell {
    flex: 0 0 auto;
    width: clamp(104px, 30vw, 132px);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.3rem;
    scroll-snap-align: center;
  }
  /* The step label lives INSIDE its cell (the card's step-number convention),
     top-left, quiet - so labels never split the fused grid into loose bars. */
  .strip-step {
    position: absolute;
    top: 0.3rem;
    inset-inline-start: 0.45rem;
    font-size: 0.68rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--ink-dim, #555);
    font-variant-numeric: tabular-nums;
    pointer-events: none;
  }
  /* Each step box carries its LEADING seam (inline) and its BOTTOM edge; the
     first row adds the top edge, each row's last cell the trailing edge - one
     continuous frame with hairline seams in both axes, closed even when a
     fallback layout leaves the last row short. */
  .pic-card {
    position: relative;
    width: 100%;
    border-block-end: 1px solid var(--seam, color-mix(in oklab, var(--ink, #1a1a1a) 16%, transparent));
    border-inline-start: 1px solid var(--seam, color-mix(in oklab, var(--ink, #1a1a1a) 16%, transparent));
    overflow: hidden;
    box-shadow: 0 1px 4px color-mix(in oklab, var(--ink, #1a1a1a) 7%, transparent);
  }
  .strip:first-child .pic-card {
    border-block-start: 1px solid var(--seam, color-mix(in oklab, var(--ink, #1a1a1a) 16%, transparent));
  }
  .strip-cell:last-child .pic-card {
    border-inline-end: 1px solid var(--seam, color-mix(in oklab, var(--ink, #1a1a1a) 16%, transparent));
  }
  /* Only the BLOCK's four outer corners round. */
  .strip:first-child .strip-cell:first-child .pic-card {
    border-start-start-radius: 12px;
  }
  .strip:first-child .strip-cell:last-child .pic-card {
    border-start-end-radius: 12px;
  }
  .strip:last-child .strip-cell:first-child .pic-card {
    border-end-start-radius: 12px;
  }
  .strip:last-child .strip-cell:last-child .pic-card {
    border-end-end-radius: 12px;
  }
  /* The start box is a complete little frame of its own (full border, all four
     corners) - overrides the fused-grid edge rules above. */
  .start-slot .pic-card {
    border: 1px solid var(--seam, color-mix(in oklab, var(--ink, #1a1a1a) 16%, transparent));
    border-radius: 12px;
  }
  .pic-card :global(.guide-pictograph) {
    width: 100%;
  }
  .pic-card :global(.pictograph-wrapper) {
    max-width: none !important;
  }
  figcaption {
    font-size: 1rem;
    font-style: italic;
    color: var(--ink-dim, #555);
    text-align: center;
    line-height: 1.4;
  }
</style>
