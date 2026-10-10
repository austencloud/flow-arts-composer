<!--
  SheetPreviewPages.svelte

  On-screen landscape preview of a choreo sheet. Mirrors the print-preview page
  frame (PrintPreviewPages.svelte) but landscape (aspect-ratio 11/8.5) and
  grid-spec driven instead of card-inches driven. Each page is a fixed-aspect
  white .page; each row is its own CSS grid of `columns` square cells so block
  separators can span the full row width. Cells render LIVE via
  PictographContainer (the same smart wrapper WorkspaceGrid / the viewer use)
  with the locked sheet visibility — instant + crisp, no worker cold-start.

  Layout + visual parity with the PDF comes from both consuming the same
  planSheet() rows, getSheetPageLayout() geometry, and SHEET_CELL_VISIBILITY.

  Reuse note: PictographContainer (not StepCell) is the cell — StepCell wraps it
  with interactive button/selection/haptic/context-menu machinery and renders
  with the GLOBAL visibility settings, neither of which suits a 48-cell static
  print grid; StepStrip is a sliding focus carousel, not a static grid.

  Virtualization: only pages near the viewport mount their pictograph cells (one
  shared IntersectionObserver, project pattern from PropAwareThumbnail). Off-screen
  pages keep their aspect-ratio frame and empty cell boxes, so toggling never
  shifts layout (no-layout-shift) while capping live-component count.

  Stage fit: the page's on-screen size comes from the stage container
  (`sheet-stage`, container-type: size on the host's preview pane). The base is
  Fit — the page fills the stage's LIMITING dimension, so the whole sheet is
  visible — and `zoom` scales up from there, scrolling the stage. No magic
  max-width, so the sheet grows with the workspace at 4K instead of freezing at
  a desktop cap. Physical geometry, the planner, and the PDF are untouched: this
  only changes how LARGE the same page is drawn.
-->
<script lang="ts">
  import { flip } from "svelte/animate";
  import {
    flyFade,
    growFade,
    flipDuration,
  } from "#lib/shared/transitions/motion.js";
  import type {
    SheetPage,
    SheetCell,
    SheetBand,
    SheetBandPage,
    ResolvedNote,
  } from "../../services/sheet-row-planner";
  import type { SheetPageGeometry } from "../../domain/sheet-page-layout";
  import type {
    ChoreoSheetLayout,
    ChoreoSheetAnnotations,
    SheetHeader,
  } from "../../domain/types/choreo-sheet";
  import { SHEET_CELL_VISIBILITY } from "../../services/sheet-cell-config";
  import SheetPreviewCell from "./SheetPreviewCell.svelte";
  import SheetHeaderEditor from "./SheetHeaderEditor.svelte";

  let {
    pages,
    geo,
    layout,
    breakSequenceIds = new Set<string>(),
    selectedSequenceId = null,
    onSelectSequence,
    onRemoveSequence,
    // ── Annotated ("aligned") branch ────────────────────────────────────────
    bandPages = [],
    annotations,
    sheetName = "",
    onSetCue,
    onAddNote,
    onSetNote,
    onRemoveNote,
    onSetHeader,
    actStepIndex = null,
    zoom = 1,
    twoUp = false,
    visiblePages,
    observePage = () => ({ destroy() {} }),
    pageCaption = (index) => `Page ${index + 1}`,
  }: {
    pages: SheetPage[];
    geo: SheetPageGeometry;
    layout: ChoreoSheetLayout;
    /** Sequence ids whose block does NOT connect to the sequence above it. */
    breakSequenceIds?: Set<string>;
    /** The currently-selected sequence block (whole-sequence select-then-remove). */
    selectedSequenceId?: string | null;
    onSelectSequence?: (sequenceId: string) => void;
    onRemoveSequence?: (sequenceId: string) => void;
    /** Row-aligned, height-packed pages — only consumed when packing="aligned". */
    bandPages?: SheetBandPage[];
    /** Cue/note/header annotations for the aligned branch. */
    annotations?: ChoreoSheetAnnotations;
    /** The act/sheet name, shown in the page-1 title block. */
    sheetName?: string;
    onSetCue?: (
      sequenceId: string,
      stepIndex: number,
      patch: { timestamp?: string; text?: string }
    ) => void;
    onAddNote?: (
      sequenceId: string,
      stepIndex: number,
      pinned: boolean
    ) => string;
    onSetNote?: (id: string, patch: { text?: string }) => void;
    onRemoveNote?: (id: string) => void;
    onSetHeader?: (patch: Partial<SheetHeader>) => void;
    /**
     * The act's current step while it plays, 0-based into the concatenated act
     * sequence. The cell whose `actStepIndex` matches lights up; earlier cells
     * dim as played. null when not playing — nothing is highlighted.
     */
    actStepIndex?: number | null;
    /**
     * One entry per roster row while the sheet is still hydrating. Drives the
     * reserved skeleton page: the sheet's real geometry, filled with shimmer, so
     * the moment the real cells arrive nothing moves. Omit (or pass empty) once
     * the roster is complete — the planned pages take over.
     */
    /**
     * Scale factor on the fitted page. 1 = Fit: the whole sheet sits in the
     * stage's limiting dimension, which is the baseline the sheet is designed
     * around. Above 1 the page grows past the stage and the stage scrolls — for
     * reading Compact pictographs, not for composition.
     *
     * (This replaced a "page | width" toggle. Fit-width was `stage width` and
     * fit-page was `min(stage width, stage height × aspect)`, so whenever width
     * was the binding constraint — every landscape sheet on a normal workspace —
     * the two produced an identical page and the control did nothing.)
     */
    zoom?: number;
    twoUp?: boolean;
    visiblePages?: ReadonlySet<number>;
    observePage?: (
      element: HTMLElement,
      index: number
    ) => { destroy: () => void };
    pageCaption?: (index: number) => string;
  } = $props();

  // Header for the title block / running header (aligned branch only).
  const header = $derived(annotations?.header);
  const renderedPages = $derived(
    visiblePages ??
      new Set(
        Array.from(
          { length: Math.max(pages.length, bandPages.length) },
          (_, i) => i
        )
      )
  );
  // Column indices for the note-strip's per-count add affordances.
  const columnIndexes = $derived(
    Array.from({ length: geo.columns }, (_, i) => i)
  );

  // `count` is resolved by the planner from the note's absolute step index, so
  // both branches read the same derived value the PDF exporter reads — a note
  // can never classify differently on screen vs paper. A null count is a
  // full-width bullet (unpinned, or anchored past a shortened sequence).
  function pinnedNotes(band: SheetBand): ResolvedNote[] {
    return band.notes.filter((n) => n.count != null);
  }
  function bulletNotes(band: SheetBand): ResolvedNote[] {
    return band.notes.filter((n) => n.count == null);
  }

  // Act playback highlight. The planner stamps every cell with its position in
  // the act — the same numbering `buildActSequence` produces — so matching the
  // player's reported step is a direct comparison, no per-surface mapping.
  function isActCurrent(cell: SheetCell): boolean {
    return actStepIndex !== null && cell.actStepIndex === actStepIndex;
  }
  function isActPlayed(cell: SheetCell): boolean {
    return (
      actStepIndex !== null &&
      cell.actStepIndex !== null &&
      cell.actStepIndex < actStepIndex
    );
  }

  /**
   * The rail's editable slots for a band.
   *
   * Always at least one — anchored to the band's first step, so an un-cued band
   * still offers somewhere to type. Widening the pictograph size merges two rows
   * into one band, and each merged row's cue keeps its own slot rather than one
   * of them silently vanishing; extras carry the count they sit on so it's
   * obvious why the band has two.
   */
  function railSlots(band: SheetBand) {
    const primary =
      band.cues.find((c) => c.stepIndex === band.firstStepIndex) ?? null;
    const extras = band.cues.filter((c) => c.stepIndex !== band.firstStepIndex);
    return [
      { stepIndex: band.firstStepIndex, cue: primary, count: 0 },
      ...extras.map((c) => ({
        stepIndex: c.stepIndex,
        cue: c,
        count: c.stepIndex - band.firstStepIndex + 1,
      })),
    ];
  }

  // PictographContainer takes a boolean showHandPoints; the locked config carries
  // the richer "all" | "active" | "none". Map "none" → hidden, everything else on.
  const showHandPoints = SHEET_CELL_VISIBILITY.handPointVisibility !== "none";

  // Geometry → CSS. The centered grid box equals the page's usable area, so a
  // column track is one cell and the gaps are the gutter. Percentages resolve
  // against the row container's width (column-gap) and the page height (row-gap),
  // and since the page has a fixed aspect ratio both axes scale together — the
  // gutter stays visually equal on both. Square cells (aspect-ratio:1) mean
  // neither axis reflows the other.
  const gridWidthPt = $derived(
    geo.columns * geo.cellSizePt + (geo.columns - 1) * geo.gutterPt
  );
  const gridHeightPt = $derived(
    geo.rows * geo.cellSizePt + (geo.rows - 1) * geo.gutterPt
  );
  const marginXPct = $derived((geo.marginXPt / geo.pageWidthPt) * 100);
  const marginYPct = $derived((geo.marginYPt / geo.pageHeightPt) * 100);
  const colGapPct = $derived((geo.gutterPt / gridWidthPt) * 100);
  const rowGapPct = $derived((geo.gutterPt / gridHeightPt) * 100);
  const pageAspect = $derived(`${geo.pageWidthPt} / ${geo.pageHeightPt}`);
  // Same ratio as a bare number, for the fit math in calc() (aspect-ratio takes
  // the `a / b` form; calc() multiplication wants the scalar).
  const pageAspectRatio = $derived(geo.pageWidthPt / geo.pageHeightPt);

  // Sequences flow continuously, so a boundary falls on the sequence-start CELL
  // (it can land mid-row), not on a whole row. All three marks are per-cell.

  // A break: the sequence starting here doesn't connect to the one before it. A
  // warning, so it draws regardless of the group-separator style.
  function isCellBreak(cell: SheetCell): boolean {
    return (
      cell.isSequenceStart &&
      !!cell.sequenceId &&
      breakSequenceIds.has(cell.sequenceId)
    );
  }

  // A separator: a divider at each sequence start (except the sheet's very first
  // cell). Only the "rule" style draws it.
  function isCellSeparator(cell: SheetCell, isFirstCell: boolean): boolean {
    return (
      layout.groupSeparator === "rule" && cell.isSequenceStart && !isFirstCell
    );
  }
</script>

{#if layout.packing === "aligned"}
  {#if bandPages.length === 0}
    <p class="empty" transition:flyFade>No sequences yet.</p>
  {:else}
    <div
      class="pages-scroll"
      class:zoomed={zoom !== 1}
      style:--zoom={zoom}
      class:two-up={twoUp}
      style="--page-aspect: {pageAspectRatio};"
    >
      {#each bandPages as page (page.pageIndex)}
        <figure
          class="pagefig"
          in:flyFade|global={{
            y: 12,
            delay: Math.min(page.pageIndex * 60, 240),
          }}
        >
          <div
            class="page annotated"
            class:no-rail={!layout.showCueRail}
            class:no-strip={!layout.showNoteStrips}
            use:observePage={page.pageIndex}
            style="aspect-ratio: {pageAspect}; --pt: calc(100cqw / {geo.pageWidthPt}); --rail-w: calc({geo.railWidthPt} * var(--pt)); --gutter: calc({geo.gutterPt} * var(--pt)); --strip-h: calc({geo.stripBaseHeightPt} * var(--pt)); --margin: calc({geo.marginYPt} * var(--pt)); --band-gap: calc({geo.interBandGutterPt} * var(--pt));"
          >
            <div class="pad">
              {#if header?.showTitleBlock || page.pageIndex > 0}<SheetHeaderEditor
                  readonly
                  {sheetName}
                  {header}
                  pageIndex={page.pageIndex}
                  startTimestamp={page.bands[0]?.cues[0]?.timestamp ?? ""}
                />{/if}

              <div class="bands">
                {#each page.bands as band, bi (band.key)}
                  <div
                    class="band"
                    animate:flip={{ duration: flipDuration() }}
                    in:flyFade={{ y: 8 }}
                    out:growFade={{ axis: "y" }}
                  >
                    {#if layout.showCueRail}
                      <div class="rail">
                        {#each railSlots(band) as slot (slot.stepIndex)}
                          <div class="rail-slot">
                            {#if slot.count > 0}
                              <span class="rail-count" aria-hidden="true"
                                >·{slot.count}</span
                              >
                            {/if}
                            <input
                              class="ts-input"
                              value={slot.cue?.timestamp ?? ""}
                              placeholder="0:00"
                              aria-label={slot.count > 0
                                ? `Cue timestamp at count ${slot.count}`
                                : "Cue timestamp"}
                              oninput={(e) =>
                                onSetCue?.(band.sequenceId, slot.stepIndex, {
                                  timestamp: e.currentTarget.value,
                                })}
                            />
                            <textarea
                              class="cue-input"
                              rows="1"
                              value={slot.cue?.text ?? ""}
                              placeholder="cue…"
                              aria-label={slot.count > 0
                                ? `Cue text at count ${slot.count}`
                                : "Cue text"}
                              oninput={(e) =>
                                onSetCue?.(band.sequenceId, slot.stepIndex, {
                                  text: e.currentTarget.value,
                                })}
                            ></textarea>
                          </div>
                        {/each}
                      </div>
                    {/if}
                    <div class="band-body">
                      <div
                        class="cells"
                        style="grid-template-columns: repeat({geo.columns}, 1fr); gap: var(--gutter);"
                      >
                        {#each band.cells as cell, ci (ci)}
                          <SheetPreviewCell
                            {cell}
                            {layout}
                            {showHandPoints}
                            visible={renderedPages.has(page.pageIndex)}
                            isBreak={isCellBreak(cell)}
                            isSeparator={isCellSeparator(
                              cell,
                              page.pageIndex === 0 && bi === 0 && ci === 0
                            )}
                            isActCurrent={isActCurrent(cell)}
                            isActPlayed={isActPlayed(cell)}
                            {selectedSequenceId}
                            {onSelectSequence}
                            {onRemoveSequence}
                          />
                        {/each}
                      </div>
                      {#if layout.showNoteStrips}
                        <div class="strip">
                          <!-- Behind the notes: one clickable column per count. Clicking an
                             empty column pins a fresh note under that count. -->
                          <div
                            class="add-cols"
                            style="grid-template-columns: repeat({geo.columns}, 1fr);"
                          >
                            {#each columnIndexes as ci (ci)}
                              <button
                                type="button"
                                class="add-col"
                                aria-label={`Add note under count ${ci + 1}`}
                                onclick={() =>
                                  onAddNote?.(
                                    band.sequenceId,
                                    band.firstStepIndex + ci,
                                    true
                                  )}
                              ></button>
                            {/each}
                          </div>
                          <div class="pins">
                            {#each pinnedNotes(band) as note (note.id)}
                              <div
                                class="pin"
                                style="--pin-offset: calc({(note.count ?? 1) -
                                  1} * ({geo.cellSizePt} + {geo.gutterPt}) * var(--pt));"
                              >
                                <input
                                  class="pin-input"
                                  value={note.text}
                                  placeholder="note…"
                                  aria-label={`Note at count ${note.count}`}
                                  oninput={(e) =>
                                    onSetNote?.(note.id, {
                                      text: e.currentTarget.value,
                                    })}
                                />
                                <button
                                  type="button"
                                  class="note-remove"
                                  aria-label="Remove note"
                                  onclick={() => onRemoveNote?.(note.id)}
                                >
                                  <i
                                    class="fa-solid fa-xmark"
                                    aria-hidden="true"
                                  ></i>
                                </button>
                              </div>
                            {/each}
                          </div>
                          <div class="bullets">
                            {#each bulletNotes(band) as note (note.id)}
                              <div class="bullet-row">
                                <span class="bullet-dot" aria-hidden="true"
                                  >•</span
                                >
                                <input
                                  class="bullet-input"
                                  value={note.text}
                                  placeholder="note…"
                                  aria-label="Note"
                                  oninput={(e) =>
                                    onSetNote?.(note.id, {
                                      text: e.currentTarget.value,
                                    })}
                                />
                                <button
                                  type="button"
                                  class="note-remove"
                                  aria-label="Remove note"
                                  onclick={() => onRemoveNote?.(note.id)}
                                >
                                  <i
                                    class="fa-solid fa-xmark"
                                    aria-hidden="true"
                                  ></i>
                                </button>
                              </div>
                            {/each}
                            <button
                              type="button"
                              class="add-note"
                              onclick={() =>
                                onAddNote?.(
                                  band.sequenceId,
                                  band.firstStepIndex,
                                  false
                                )}
                            >
                              <i class="fa-solid fa-plus" aria-hidden="true"
                              ></i> note
                            </button>
                          </div>
                        </div>
                      {/if}
                    </div>
                  </div>
                {/each}
              </div>
            </div>
          </div>
          <figcaption class="page-caption">
            {pageCaption(page.pageIndex)}
          </figcaption>
        </figure>
      {/each}
    </div>
  {/if}
{:else if pages.length === 0}
  <p class="empty" transition:flyFade>No sequences yet.</p>
{:else}
  <div
    class="pages-scroll"
    class:zoomed={zoom !== 1}
    style:--zoom={zoom}
    class:two-up={twoUp}
    style="--page-aspect: {pageAspectRatio};"
  >
    {#each pages as page, pi (pi)}
      <figure
        class="pagefig"
        in:flyFade|global={{ y: 12, delay: Math.min(pi * 60, 240) }}
      >
        <div
          class="page"
          use:observePage={pi}
          style="aspect-ratio: {pageAspect};"
        >
          <div
            class="grid-area"
            style="inset: {marginYPct}% {marginXPct}%; row-gap: {rowGapPct}%;"
          >
            {#each page.rows as row, ri (ri)}
              <div
                class="sheet-row"
                style="grid-template-columns: repeat({geo.columns}, 1fr); column-gap: {colGapPct}%;"
              >
                {#each row.cells as cell, ci (ci)}
                  <SheetPreviewCell
                    {cell}
                    {layout}
                    {showHandPoints}
                    visible={renderedPages.has(pi)}
                    isBreak={isCellBreak(cell)}
                    isSeparator={isCellSeparator(
                      cell,
                      pi === 0 && ri === 0 && ci === 0
                    )}
                    isActCurrent={isActCurrent(cell)}
                    isActPlayed={isActPlayed(cell)}
                    {selectedSequenceId}
                    {onSelectSequence}
                    {onRemoveSequence}
                  />
                {/each}
              </div>
            {/each}
          </div>
        </div>
        <figcaption class="page-caption">{pageCaption(pi)}</figcaption>
      </figure>
    {/each}
  </div>
{/if}

<style>
  /* The usable grid area, centered on the page via the margin insets. Rows stack
     top-down; each row stretches to the full width (its grid handles columns). */
  .grid-area {
    position: absolute;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    justify-content: flex-start;
  }

  .sheet-row {
    position: relative;
    display: grid;
    width: 100%;
  }

  .empty {
    text-align: center;
    color: var(--theme-text-dim);
    font-size: var(--font-size-min, 14px);
    padding: 40px 0;
  }

  /* ── Annotated ("aligned") branch ─────────────────────────────────────────
     A container-query context makes 1 PDF point resolve to a fixed fraction of
     the (fluid) page width via --pt = 100cqw / pageWidthPt, so every pt-based
     size below scales exactly with the sheet the way the PDF export does — no
     magic screen pixels. Print-fixed ink/accent tokens (like the .page border
     tokens) never track the app theme. */
  .page.annotated {
    container-type: inline-size;
    --print-ink: #1a1a1a;
    --print-ink-soft: #333333;
    --print-ink-faint: #555555;
    --print-accent: #6ea8fe;
    --print-accent-bg: rgba(110, 168, 254, 0.1);
  }

  .pad {
    position: absolute;
    inset: var(--margin);
    color: var(--print-ink);
    font-family: Georgia, "Times New Roman", serif;
  }

  /* Bands flow top-down; a growing note strip pushes later bands DOWN, never
     shifts a sibling sideways (no-layout-shift by construction). */
  .band {
    display: grid;
    grid-template-columns: var(--rail-w) 1fr;
    column-gap: calc(6 * var(--pt));
  }
  .no-rail .band {
    grid-template-columns: 1fr;
  }
  .band + .band {
    margin-top: var(--band-gap);
  }

  .rail {
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding-right: calc(6 * var(--pt));
    border-right: 1px solid var(--print-border-faint);
  }
  /* One slot per cue. A band usually holds exactly one, so a lone slot is
     visually identical to the single-cue rail it replaced; the gap and the
     count marker only appear once a merged band actually stacks two. */
  .rail-slot {
    display: flex;
    flex-direction: column;
    position: relative;
  }
  .rail-slot + .rail-slot {
    margin-top: calc(5 * var(--pt));
    padding-top: calc(5 * var(--pt));
    border-top: 1px dashed var(--print-border-faint);
  }
  .rail-count {
    position: absolute;
    top: calc(4 * var(--pt));
    right: 0;
    font-family: Georgia, serif;
    font-size: calc(7.5 * var(--pt));
    font-variant-numeric: tabular-nums;
    color: var(--print-ink-soft);
    opacity: 0.65;
    pointer-events: none;
  }
  .ts-input {
    font-family: Georgia, serif;
    font-style: italic;
    font-size: calc(11 * var(--pt));
    font-variant-numeric: tabular-nums;
  }
  .cue-input {
    font-family: Georgia, serif;
    font-style: italic;
    font-size: calc(10.5 * var(--pt));
    color: var(--print-ink-soft);
    line-height: 1.25;
    margin-top: calc(2 * var(--pt));
    resize: none;
    overflow: hidden;
    /* Auto-grow to fit the cue text without a manual resize handler. */
    field-sizing: content;
  }

  .band-body {
    min-width: 0;
  }
  .cells {
    display: grid;
  }

  /* Note strip: a half-cell floor that grows with stacked bullets. */
  .strip {
    position: relative;
    min-height: var(--strip-h);
    margin-top: calc(2 * var(--pt));
    border-top: 1px dashed var(--print-border-faint);
    font-family: "Segoe UI", Roboto, sans-serif;
  }
  .add-cols {
    position: absolute;
    inset: 0;
    display: grid;
    z-index: 0;
  }
  .add-col {
    border: 0;
    background: transparent;
    cursor: pointer;
    transition: background-color var(--duration-fast, 0.12s) ease;
  }
  .add-col:hover {
    background: var(--print-accent-bg);
  }

  .bullets {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    padding-top: calc(2 * var(--pt));
  }
  .bullet-row {
    display: flex;
    align-items: center;
    gap: calc(2 * var(--pt));
    width: 100%;
  }
  .bullet-dot {
    font-size: calc(10.5 * var(--pt));
    color: var(--print-ink);
  }
  .bullet-input {
    flex: 1;
    min-width: 0;
    font-family: inherit;
    font-size: calc(10.5 * var(--pt));
    font-style: italic;
    color: var(--print-ink);
  }

  /* One line per pinned note, stacked — `estimateBandHeight` already reserves a
     line for each, and the PDF draws them the same way. Overlaying them all at
     one top made adjacent counts collide. */
  .pins {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    padding-top: calc(2 * var(--pt));
  }
  .pin {
    display: flex;
    align-items: center;
    gap: calc(2 * var(--pt));
    margin-left: var(--pin-offset, 0px);
    /* Never past the right edge of the grid, matching the PDF's truncation. */
    max-width: calc(100% - var(--pin-offset, 0px));
    padding: 1px calc(3 * var(--pt));
    border-left: 1.5px solid var(--print-accent);
    background: var(--print-accent-bg);
    white-space: nowrap;
  }
  .pin-input {
    min-width: 0;
    font-family: inherit;
    font-size: calc(9.5 * var(--pt));
    color: var(--print-ink-soft);
    text-overflow: ellipsis;
  }

  /* Interactive chrome keeps a 44px touch floor even on the scaled sheet. */
  .note-remove {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: var(--min-touch-target, 44px);
    min-height: var(--min-touch-target, 44px);
    border: 0;
    background: transparent;
    color: var(--print-ink-faint);
    font-size: calc(9 * var(--pt));
    cursor: pointer;
  }
  .note-remove:hover {
    color: var(--theme-danger);
  }
  .add-note {
    display: inline-flex;
    align-items: center;
    gap: calc(2 * var(--pt));
    min-height: var(--min-touch-target, 44px);
    margin-top: calc(2 * var(--pt));
    padding: 0 calc(6 * var(--pt));
    border: 1px dashed var(--print-border-faint);
    border-radius: 6px;
    background: transparent;
    color: var(--print-ink-faint);
    font-family: inherit;
    font-size: calc(9.5 * var(--pt));
    cursor: pointer;
  }
  .add-note:hover {
    border-color: var(--print-accent);
    color: var(--print-ink);
  }

  @media (prefers-reduced-motion: reduce) {
    .hdr-inline,
    .tag,
    .ts-input,
    .cue-input,
    .pin-input,
    .bullet-input,
    .add-col {
      transition: none;
    }
  }
</style>
