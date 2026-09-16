<!--
  /test/glossary-codex — direction-A harness for the glossary Letter Codex.

  Approved direction (2026-08-23): one canonical Guide sheet page at a time on
  the left, with a compact variations panel on the right. Narrow screens get a
  dedicated variation view instead of two crammed panes.

  Guide-native by construction: the sheet is the SAME non-embed CodexSheet the
  /guide/codex print route renders (its own white letter-paper artboard, Georgia
  italic titles), sitting on the same #4a4f57 desk. The variations panel is a
  second sheet of the same paper. Variations render through GuidePictograph in
  printMode — the exact pipeline behind every sheet cell — so there is one
  rendering path and one look.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import CodexSheet from "../../(public)/guide/codex/_components/CodexSheet.svelte";
  import {
    SHEET1,
    SHEET2,
    type CodexSheetDef,
  } from "../../(public)/guide/codex/_data/codex-groups";
  import {
    SequenceSelection,
    setSequenceSelection,
  } from "$lib/shared/selection/sequence-selection.svelte";
  import "$lib/shared/selection/selection.css";
  import { letterQueryHandler } from "$lib/shared/pictograph/tka-glyph/services/letter-query-handler";
  import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
  import GuidePictograph from "../../(public)/guide/level-1/_components/GuidePictograph.svelte";
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";

  const SHEETS: { def: CodexSheetDef; label: string }[] = [
    { def: SHEET1, label: "Types 1–2" },
    { def: SHEET2, label: "Types 3–6" },
  ];

  // cell id ("Σ--0") ↔ letter ("Σ-"), across both sheets.
  const LETTER_BY_CELL = new Map<string, string>(
    SHEETS.flatMap(({ def }) =>
      def.types.flatMap((t) => t.boxes.flatMap((b) => b.cells.map((c) => [c.id, c.label] as const)))
    )
  );

  // Selection ring on sheet cells — the shared primitive CodexCell already
  // consumes; providing the context (plus selection.css above, which overlays
  // the hit target on the cell) is all it takes.
  const selection = new SequenceSelection();
  setSequenceSelection(selection);

  let sheetIndex = $state(0);
  let selectedLetter = $state("A");
  selection.select("A-0");

  let allPictographs = $state<PictographData[]>([]);
  let isLoading = $state(true);
  let loadError = $state(false);

  const variations = $derived(allPictographs.filter((p) => p.letter === selectedLetter));

  async function load(): Promise<void> {
    isLoading = true;
    loadError = false;
    try {
      allPictographs = await letterQueryHandler.getAllPictographVariations(GridMode.DIAMOND);
    } catch (e) {
      console.error("glossary-codex harness: variations failed to load", e);
      loadError = true;
    } finally {
      isLoading = false;
    }
  }

  // Layout: side-by-side above the seam, dedicated views below it.
  let rootEl = $state<HTMLDivElement>();
  let stacked = $state(false);
  let mobileView = $state<"sheet" | "variations">("sheet");

  // Scale-to-fit for the 816px-native sheet artboard (same treatment as the
  // /guide/codex route): shrink below 816px available, upscale to 1.9x above.
  let sheetPaneEl = $state<HTMLDivElement>();
  let scale = $state(1);
  const shiftPx = $derived(-408 * Math.max(0, scale - 1));

  // The variations paper is 816-native too and gets the SAME transform
  // treatment, so both papers grow in lockstep on wide screens instead of the
  // right one freezing at 1080p proportions. Its height varies with content
  // (8- vs 16-variation letters), so the reserved footprint comes from the
  // paper's measured untransformed layout height.
  let varPaneEl = $state<HTMLDivElement>();
  let varPaperEl = $state<HTMLElement>();
  let varScale = $state(1);
  let varPaperH = $state(0);
  const varShiftPx = $derived(-408 * Math.max(0, varScale - 1));

  function selectCell(id: string): void {
    const letter = LETTER_BY_CELL.get(id);
    if (!letter) return;
    selectedLetter = letter;
    selection.select(id);
    if (stacked) mobileView = "variations";
  }

  function backToSheet(): void {
    mobileView = "sheet";
  }

  function fit(): void {
    if (rootEl) stacked = rootEl.clientWidth < 980;
    if (sheetPaneEl) {
      // 32px of pane padding stays out of the artboard budget.
      scale = Math.min(Math.max(sheetPaneEl.clientWidth - 32, 240) / 816, 1.9);
    }
    if (varPaneEl) {
      // Upscale-only (floor 1): below native width the paper reflows fluidly
      // (2-column grid) instead of transform-shrinking its type unreadably.
      varScale = Math.min(Math.max((varPaneEl.clientWidth - 32) / 816, 1), 1.9);
    }
    if (varPaperEl) varPaperH = varPaperEl.offsetHeight;
  }

  onMount(() => {
    void load();
  });

  // Panes mount and unmount with the stacked-view swap, so the observer set is
  // rebuilt whenever any bound element changes — a mount-time-only observer
  // would miss panes that appear later.
  $effect(() => {
    const els = [rootEl, sheetPaneEl, varPaneEl, varPaperEl].filter(
      (el): el is HTMLElement => !!el
    );
    fit();
    const ro = new ResizeObserver(fit);
    els.forEach((el) => ro.observe(el));
    return () => ro.disconnect();
  });
</script>

<svelte:head>
  <title>Glossary Letter Codex — harness</title>
</svelte:head>

<div class="codex-desk" bind:this={rootEl}>
  <div class="toolbar">
    <div class="toolbar-switch">
      <SegmentedControl
        options={SHEETS.map((s, i) => ({ value: i, label: s.label }))}
        value={sheetIndex}
        onchange={(v) => (sheetIndex = v as number)}
        color="accent"
        size="sm"
      />
    </div>
  </div>

  <div class="panes" class:stacked>
    {#if !stacked || mobileView === "sheet"}
      <div class="sheet-pane" bind:this={sheetPaneEl}>
        <div class="sheet-wrap" style="height: {1056 * scale}px">
          <div class="sheet-scale" style="transform: translateX({shiftPx}px) scale({scale})">
            <CodexSheet sheet={SHEETS[sheetIndex]!.def} onCellSelect={selectCell} />
          </div>
        </div>
      </div>
    {/if}

    {#if !stacked || mobileView === "variations"}
      <div class="var-pane" aria-busy={isLoading} bind:this={varPaneEl}>
        <div class="var-wrap" style="height: {varPaperH * varScale}px">
          <div
            class="var-scale"
            style="transform: translateX({varShiftPx}px) scale({varScale})"
          >
            <section class="var-paper" bind:this={varPaperEl}>
          <header class="var-head">
            {#if stacked}
              <button type="button" class="back-btn" onclick={backToSheet}>
                <i class="fas fa-arrow-left" aria-hidden="true"></i>
                Codex
              </button>
            {/if}
            <span class="var-letter tka-font">{selectedLetter}</span>
            <h2 class="var-title">
              {#if !isLoading && !loadError}
                {variations.length} variation{variations.length === 1 ? "" : "s"}
              {:else}
                Variations
              {/if}
            </h2>
          </header>

          {#if isLoading}
            <div class="state-message">
              <i class="fas fa-circle-notch fa-spin" aria-hidden="true"></i>
              Loading variations…
            </div>
          {:else if loadError}
            <div class="state-message">
              <span>The variations did not load.</span>
              <button type="button" class="retry-btn" onclick={load}>Try again</button>
            </div>
          {:else if variations.length === 0}
            <div class="state-message">No variations for “{selectedLetter}”.</div>
          {:else}
            <div class="var-grid">
              {#each variations as pictograph, index (pictograph.id ?? index)}
                <figure class="var-cell">
                  <GuidePictograph
                    data={pictograph}
                    size="sm"
                    showGrid={true}
                    showArrows={true}
                    showTKA={true}
                    showTnD={false}
                    showElemental={false}
                    showPlacements={false}
                    showReversals={false}
                    showNonRadialPoints={false}
                    printMode={true}
                    darkMode={false}
                    eager={true}
                  />
                  <figcaption class="visually-hidden">
                    {selectedLetter} variation {index + 1}
                  </figcaption>
                </figure>
              {/each}
            </div>
          {/if}
            </section>
          </div>
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  /* Same desk the /guide/codex print route paints behind its sheets. */
  .codex-desk {
    min-height: 100vh;
    background: #4a4f57;
    display: flex;
    flex-direction: column;
    padding-bottom: 3rem;
  }

  .toolbar {
    position: sticky;
    top: 0;
    z-index: 10;
    display: flex;
    justify-content: center;
    padding: 1.25rem 1rem;
  }
  /* SegmentedControl fills its container (width: 100%); size the container to
     the two short labels, not the viewport. */
  .toolbar-switch {
    width: min(100%, 22rem);
  }

  .panes {
    flex: 1;
    display: grid;
    grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr);
    align-items: start;
    min-height: 0;
  }
  .panes.stacked {
    grid-template-columns: minmax(0, 1fr);
  }

  .sheet-pane {
    padding: 0 1rem;
    display: flex;
    justify-content: center;
    align-items: flex-start;
  }
  .sheet-wrap {
    width: 816px;
    max-width: 100%;
  }
  .sheet-scale {
    width: 816px;
    height: 1056px;
    transform-origin: top left;
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.4);
  }

  .var-pane {
    padding: 0 1rem;
    display: flex;
    justify-content: center;
    container-type: inline-size;
  }

  .var-wrap {
    width: 816px;
    max-width: 100%;
  }
  .var-scale {
    width: 100%;
    transform-origin: top left;
  }

  /* The variations panel is another sheet of the same paper — white, shadowed,
     Georgia-serif headed — so the two panes read as one guide spread. */
  .var-paper {
    width: 100%;
    max-width: 816px;
    box-sizing: border-box;
    background: #fff;
    color: #111;
    padding: 0.4in 0.45in 0.5in;
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.4);
  }

  .var-head {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.75rem;
    border-bottom: 2px solid #111;
    padding-bottom: 0.4rem;
    margin-bottom: 0.9rem;
  }
  /* Reserved letter slot ("A" vs "Σ-" differ in width) so the heading text
     never shifts when the selection changes. */
  .var-letter {
    min-width: 2.4em;
    font-size: 2.2rem;
    line-height: 1;
    color: #1a1a1a;
  }
  .var-title {
    margin: 0;
    font-family: Georgia, "Times New Roman", serif;
    font-style: italic;
    font-weight: 600;
    font-size: 1.4rem;
    color: #1a1a1a;
    font-variant-numeric: tabular-nums;
  }

  .back-btn {
    display: inline-flex;
    align-items: center;
    flex-shrink: 0;
    gap: 0.45rem;
    min-height: 44px;
    padding: 0.35rem 1rem;
    border: none;
    border-radius: 999px;
    background: #111;
    color: #fff;
    font: 600 0.85rem/1 system-ui, sans-serif;
    cursor: pointer;
  }
  .back-btn:hover {
    background: #000;
  }

  /* 2 or 4 columns only: dataframe letters carry 8 or 16 variations, so both
     counts divide evenly — no orphan rows at any width (3 would orphan). Cells
     match the sheet's table look: flush 1px borders, white paper, no fills. */
  .var-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 160px));
    justify-content: center;
    gap: 0;
  }
  @container (min-width: 44rem) {
    .var-grid {
      grid-template-columns: repeat(4, minmax(0, 160px));
    }
  }

  .var-cell {
    margin: 0;
    aspect-ratio: 1;
    box-sizing: border-box;
    border: 1px solid #2b2b2b;
    margin-inline-end: -1px;
    margin-block-end: -1px;
    overflow: hidden;
    --pictograph-border: none;
  }
  .var-cell :global(.guide-pictograph) {
    width: 100%;
    height: 100%;
    gap: 0;
  }
  .var-cell :global(.pictograph-wrapper) {
    width: 100%;
    height: 100%;
    max-width: none;
  }

  .state-message {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    min-height: 14rem;
    padding: 2rem 1rem;
    color: #555;
    font-family: Georgia, "Times New Roman", serif;
    font-style: italic;
    text-align: center;
  }
  .retry-btn {
    min-height: 44px;
    padding: 0.6rem 1.2rem;
    border: none;
    border-radius: 999px;
    background: #111;
    color: #fff;
    font: 600 0.85rem/1 system-ui, sans-serif;
    cursor: pointer;
  }
  .retry-btn:hover {
    background: #000;
  }

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
</style>
