<script lang="ts">
  import SheetPreviewPages from "./SheetPreviewPages.svelte";
  import SheetReadingView from "./SheetReadingView.svelte";
  import { getChoreoSheetContext } from "../../state/choreo-sheet-state.svelte";
  import { simplifyRepeatedWord } from "#lib/shared/foundation/utils/word-simplifier.js";
  import { onDestroy } from "svelte";
  import ShimmerBlock from "#lib/shared/components/loading/ShimmerBlock.svelte";
  import { shouldUseTwoUpSheetLayout } from "../../domain/sheet-workspace-layout";

  const ZOOM_STEPS = [1, 1.25, 1.5, 2, 3] as const;
  const { state: builder } = getChoreoSheetContext();
  let {
    viewMode,
    zoom = $bindable(),
    actStepIndex = null,
  }: {
    viewMode: "reading" | "page";
    zoom?: number;
    actStepIndex?: number | null;
  } = $props();
  const blocked = $derived(
    builder.roster.filter((r) => r.status === "missing" || r.status === "error")
  );
  const settled = $derived(
    builder.roster.every(
      (r) => r.status !== "loading" && r.status !== "retrying"
    )
  );
  const stageBlocked = $derived(
    builder.roster.length > 0 && settled && !builder.rosterComplete
  );
  const zoomIndex = $derived(
    Math.max(0, ZOOM_STEPS.indexOf(zoom as (typeof ZOOM_STEPS)[number]))
  );
  const zoomLabel = $derived(zoom === 1 ? "Fit" : `${Math.round(zoom * 100)}%`);
  let previewPane = $state<HTMLElement | undefined>();
  let stageWidth = $state(0);
  let stageHeight = $state(0);
  let remPx = 16;
  const pageCount = $derived(
    builder.layout.packing === "aligned"
      ? builder.bandPages.length
      : builder.pages.length
  );
  const twoUp = $derived.by(() => {
    return shouldUseTwoUpSheetLayout({
      zoom,
      pageCount,
      stageWidth,
      stageHeight,
      pageAspectRatio: builder.geo.pageWidthPt / builder.geo.pageHeightPt,
      rootFontSize: remPx,
    });
  });

  $effect(() => {
    if (!previewPane || typeof ResizeObserver === "undefined") return;
    const parsed = parseFloat(
      getComputedStyle(document.documentElement).fontSize
    );
    if (Number.isFinite(parsed) && parsed > 0) remPx = parsed;
    const read = (entry?: ResizeObserverEntry): void => {
      const box = entry?.contentBoxSize?.[0];
      stageWidth = box ? box.inlineSize : previewPane!.clientWidth;
      stageHeight = box ? box.blockSize : previewPane!.clientHeight;
    };
    const observer = new ResizeObserver((entries) => read(entries[0]));
    observer.observe(previewPane);
    read();
    return () => observer.disconnect();
  });

  let visiblePages = $state(new Set<number>());
  let pageObserver: IntersectionObserver | null = null;
  function observePage(
    element: HTMLElement,
    index: number
  ): { destroy: () => void } {
    element.dataset.pageIndex = String(index);
    if (!pageObserver && typeof IntersectionObserver !== "undefined") {
      pageObserver = new IntersectionObserver(
        (entries) => {
          const next = new Set(visiblePages);
          for (const entry of entries) {
            const pageIndex = Number(
              (entry.target as HTMLElement).dataset.pageIndex
            );
            if (entry.isIntersecting) next.add(pageIndex);
            else next.delete(pageIndex);
          }
          visiblePages = next;
        },
        { root: previewPane, rootMargin: "400px 0px", threshold: 0.01 }
      );
    }
    pageObserver?.observe(element);
    return { destroy: () => pageObserver?.unobserve(element) };
  }
  onDestroy(() => pageObserver?.disconnect());

  function pageCaption(index: number): string {
    const paper =
      builder.geo.orientation === "portrait" ? "Portrait" : "Landscape";
    return `Page ${index + 1} of ${pageCount} · Letter · ${paper}`;
  }
  function zoomBy(delta: number): void {
    const next =
      ZOOM_STEPS[
        Math.min(ZOOM_STEPS.length - 1, Math.max(0, zoomIndex + delta))
      ];
    if (next !== undefined) zoom = next;
  }
  function retry(): void {
    for (const row of blocked) void builder.retryHydration(row.id);
  }
  function remove(): void {
    for (const row of blocked) builder.removeById(row.id);
  }
</script>

<div class="preview-pane" bind:this={previewPane}>
  {#if stageBlocked}
    <div class="blocked" role="status">
      <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>
      <h3>
        {blocked.length} sequence{blocked.length === 1 ? "" : "s"} didn't load
      </h3>
      <p>
        The sheet stays blank until every row is resolved, so pages never
        renumber around a hole.
      </p>
      <ul>
        {#each blocked as row (row.id)}<li class="tka-font">
            {row.meta?.name ? simplifyRepeatedWord(row.meta.name) : row.id}
          </li>{/each}
      </ul>
      <div class="blocked-actions">
        <button onclick={retry}>Try again</button><button
          class="danger"
          onclick={remove}>Remove from sheet</button
        >
      </div>
    </div>
  {:else if viewMode === "reading"}
    <div class="reading-stage">
      <SheetReadingView
        bands={builder.readingBands}
        columns={builder.readingColumns}
        layout={builder.layout}
        sheetName={builder.sheet.name}
        header={builder.sheet.annotations.header}
        sequenceNames={builder.sequenceNames}
        {actStepIndex}
        onSetCue={builder.setCue}
        onAddNote={builder.addNote}
        onSetNote={builder.setNote}
        onRemoveNote={builder.removeNote}
      />
    </div>
  {:else if !builder.rosterComplete && builder.roster.length > 0}
    <div
      class="placeholder-page"
      style:aspect-ratio={`${builder.geo.pageWidthPt} / ${builder.geo.pageHeightPt}`}
    >
      <div
        class="placeholder-grid"
        style:grid-template-columns={`repeat(${builder.geo.columns}, 1fr)`}
      >
        {#each { length: builder.geo.rows * builder.geo.columns } as _}
          <div class="placeholder-cell">
            <ShimmerBlock circle height="70%" />
          </div>
        {/each}
      </div>
    </div>
  {:else}
    <SheetPreviewPages
      {zoom}
      pages={builder.pages}
      geo={builder.geo}
      layout={builder.layout}
      breakSequenceIds={builder.breakSequenceIds}
      selectedSequenceId={builder.selectedSequenceId}
      onSelectSequence={(id) => builder.toggleSequenceSelection(id)}
      onRemoveSequence={(id) => builder.removeById(id)}
      bandPages={builder.bandPages}
      annotations={builder.sheet.annotations}
      sheetName={builder.sheet.name}
      {actStepIndex}
      onSetCue={builder.setCue}
      onAddNote={builder.addNote}
      onSetNote={builder.setNote}
      onRemoveNote={builder.removeNote}
      onSetHeader={builder.setHeader}
      {twoUp}
      {visiblePages}
      {observePage}
      {pageCaption}
    />
  {/if}
  {#if builder.roster.length > 0 && !stageBlocked}<div class="stage-controls">
      <div class="zoom" role="group" aria-label="Stage zoom">
        <button
          onclick={() => zoomBy(-1)}
          disabled={zoomIndex === 0}
          aria-label="Zoom out"
          ><i class="fa-solid fa-minus" aria-hidden="true"></i></button
        ><button
          onclick={() => (zoom = 1)}
          disabled={zoom === 1}
          aria-label="Reset zoom to fit">{zoomLabel}</button
        ><button
          onclick={() => zoomBy(1)}
          disabled={zoomIndex === ZOOM_STEPS.length - 1}
          aria-label="Zoom in"
          ><i class="fa-solid fa-plus" aria-hidden="true"></i></button
        >
      </div>
    </div>{/if}
</div>

<style>
  .preview-pane {
    flex: 1;
    min-width: 0;
    container: sheet-stage/size;
    overflow: auto;
    border-radius: 8px;
    padding: var(--spacing-sm);
    --sheet-paper: #ffffff;
    --sheet-paper-border-faint: rgba(0, 0, 0, 0.06);
    --sheet-paper-border-strong: rgba(0, 0, 0, 0.4);
    --sheet-paper-shadow-contact: rgba(0, 0, 0, 0.5);
    --sheet-paper-shadow-drop: rgba(0, 0, 0, 0.45);
    --sheet-paper-shadow-halo: rgba(140, 160, 210, 0.07);
    background:
      radial-gradient(
        ellipse 62% 55% at 50% 44%,
        color-mix(in srgb, var(--theme-accent) 10%, transparent),
        transparent 70%
      ),
      var(--theme-background);
  }
  .preview-pane :global(.pages-scroll) {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    align-items: center;
    justify-content: safe center;
    min-height: 100%;
    padding-bottom: 1.5rem;
  }
  .preview-pane :global(.pages-scroll.zoomed) {
    justify-content: flex-start;
    align-items: safe center;
  }
  .preview-pane :global(.pages-scroll.two-up) {
    flex-flow: row wrap;
    justify-content: center;
    align-content: safe center;
    gap: 2rem;
  }
  .preview-pane :global(.pagefig) {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
    margin: 0;
    min-width: 0;
  }
  .preview-pane :global(.page-caption) {
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact);
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    white-space: nowrap;
  }
  .preview-pane :global(.page) {
    --print-border-faint: var(--sheet-paper-border-faint);
    --print-border-strong: var(--sheet-paper-border-strong);
    position: relative;
    width: calc(
      min(
          calc(100cqw - 4.5rem),
          calc((100cqh - 6rem) * var(--page-aspect, 1.294))
        ) *
        var(--zoom, 1)
    );
    max-width: none;
    flex: 0 0 auto;
    box-sizing: border-box;
    overflow: hidden;
    border-radius: 4px;
    background: var(--sheet-paper);
    box-shadow:
      0 1px 2px var(--sheet-paper-shadow-contact),
      0 12px 28px var(--sheet-paper-shadow-drop),
      0 34px 90px var(--sheet-paper-shadow-contact),
      0 0 120px var(--sheet-paper-shadow-halo);
  }
  .preview-pane :global(.pages-scroll.two-up .page) {
    width: min(
      calc((100cqw - 4.5rem - 2rem) / 2),
      calc((100cqh - 6rem) * var(--page-aspect, 1.294))
    );
  }
  .reading-stage {
    container: reading-stage/inline-size;
    width: 100%;
    --reading-paper: var(--sheet-paper);
  }
  .placeholder-page {
    position: relative;
    width: min(calc(100cqw - 4.5rem), calc((100cqh - 6rem) * 1.294));
    margin: auto;
    padding: 6%;
    border-radius: 4px;
    background: var(--sheet-paper);
    box-shadow: 0 12px 28px var(--sheet-paper-shadow-drop);
  }
  .placeholder-grid {
    display: grid;
    gap: 1%;
  }
  .placeholder-cell {
    display: flex;
    align-items: center;
    justify-content: center;
    aspect-ratio: 1;
    border: 1px solid var(--sheet-paper-border-faint);
    border-radius: 3px;
  }
  .stage-controls {
    position: sticky;
    bottom: var(--spacing-sm);
    z-index: 2;
    height: 0;
    display: flex;
    justify-content: center;
  }
  .zoom {
    display: flex;
    overflow: hidden;
    border: 1px solid var(--theme-stroke);
    border-radius: 8px;
    background: var(--theme-panel-bg);
    box-shadow: var(--shadow-card);
  }
  .zoom button {
    min-width: 44px;
    min-height: 44px;
    border: 0;
    background: transparent;
    color: var(--theme-text);
  }
  .zoom button:hover:not(:disabled) {
    background: var(--theme-card-bg-hover);
  }
  .blocked {
    max-width: 560px;
    margin: auto;
    padding: var(--spacing-xl);
    border: 1px solid color-mix(in srgb, var(--theme-danger) 32%, transparent);
    border-radius: 10px;
    background: var(--theme-panel-bg);
    color: var(--theme-text);
    text-align: center;
  }
  .blocked i {
    color: var(--theme-danger);
    font-size: 2rem;
  }
  .blocked ul {
    list-style: none;
    padding: 0;
  }
  .blocked-actions {
    display: flex;
    justify-content: center;
    gap: var(--spacing-sm);
  }
  .blocked button {
    min-height: 44px;
    padding: 0 var(--spacing-md);
    border: 1px solid var(--theme-stroke);
    border-radius: 7px;
    background: var(--theme-card-bg);
    color: var(--theme-text);
  }
  .blocked .danger {
    border-color: var(--theme-danger);
    color: var(--theme-danger);
  }
  :global(.choreo-sheet-view.is-wide) .preview-pane {
    padding: var(--spacing-md);
  }
  :global(.choreo-sheet-view.is-ultra-wide) .preview-pane {
    padding: var(--spacing-lg);
  }
  :global(.choreo-sheet-view.is-ultra-wide)
    .preview-pane
    :global(.pages-scroll) {
    gap: var(--spacing-xl);
  }
</style>
