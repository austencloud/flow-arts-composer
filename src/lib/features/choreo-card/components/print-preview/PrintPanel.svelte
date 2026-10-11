<script lang="ts">
  import {
    getPageLayout,
    PAPER_SIZES,
    type CardSizeId,
    type PaperSizeId,
  } from "../../domain/card-sizes";
  import { TND_ELEMENTS, type TnDElement } from "../../domain/tnd-element";
  import type { PrintPDFMode } from "../../services/print-pdf-exporter";
  import FilterChipBase from "#lib/shared/browse/components/filter-chips/FilterChipBase.svelte";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import type { PrintSide } from "./print-side";
  import ExportTakeover from "#lib/shared/video-export/components/ExportTakeover.svelte";

  interface Props {
    cardCount: number;
    tndElements?: (TnDElement | undefined)[];
    cardSize: CardSizeId;
    /** Sheet stock the counts describe. Defaults to Letter. */
    paperSize?: PaperSizeId;
    copies?: number;
    groupByElement?: boolean;
    includeHowToRead: boolean;
    onIncludeHowToReadChange: (include: boolean) => void;
    theme: string;
    /** Controlled side selection (lifted to the tab so the preview can scope). */
    selectedSide: PrintSide;
    onSideChange: (side: PrintSide) => void;
    isExporting: boolean;
    isPrinting?: boolean;
    /** Cards still rasterizing — block print/export so a half-rendered deck
     *  can't be sent to the printer (or cached as a stale PDF). */
    isRendering?: boolean;
    exportProgress: number;
    exportTotal: number;
    exportError: string;
    onPrint: (mode: PrintPDFMode) => void;
    /** Print a one-page scaling test sheet (card grid outlines + inch ruler)
     *  for the current paper. Omit to hide the button. */
    onPrintTest?: () => void;
    onExportPDF: (mode: PrintPDFMode, copies: number) => void;
    onExportZIP: () => void;
    /** Download fronts + backs as two separate PDF files at once. */
    onExportBoth?: () => void;
  }

  let {
    cardCount,
    tndElements = [],
    cardSize,
    paperSize = "letter",
    copies = 1,
    groupByElement = true,
    includeHowToRead,
    onIncludeHowToReadChange,
    theme,
    selectedSide,
    onSideChange,
    isExporting,
    isPrinting = false,
    isRendering = false,
    exportProgress,
    exportTotal,
    exportError,
    onPrint,
    onPrintTest,
    onExportPDF,
    onExportZIP,
    onExportBoth,
  }: Props = $props();

  const busy = $derived(isExporting || isPrinting || isRendering);
  const printable = $derived(selectedSide !== "zip");
  const layout = $derived(getPageLayout(cardSize, paperSize));

  // Sheets = Σ over colors of ceil(colorCount * copies / cardsPerPage); each
  // color pads to whole sheets. Normal-fill (or untagged) → flat count.
  const sheetCount = $derived.by(() => {
    const perPage = layout.cardsPerPage;
    const tagged = tndElements.filter((e): e is TnDElement => !!e);
    if (!groupByElement || tagged.length === 0) {
      return Math.ceil((cardCount * copies) / perPage);
    }
    const counts = new Map<string, number>();
    let untagged = 0;
    for (const el of tndElements) {
      if (el) counts.set(el.element, (counts.get(el.element) ?? 0) + 1);
      else untagged++;
    }
    let sheets = 0;
    for (const c of counts.values())
      sheets += Math.ceil((c * copies) / perPage);
    if (untagged) sheets += Math.ceil((untagged * copies) / perPage);
    return sheets;
  });

  // Every deck also ships the "How to Read" insert on its own leading sheet(s):
  // one insert per copy, padded to whole sheets. Mirrors the insert block in
  // exportHomePrintPDF — these labels must agree with the file it produces.
  const insertSheets = $derived(Math.ceil(copies / layout.cardsPerPage));
  const totalSheets = $derived(
    sheetCount + (includeHowToRead ? insertSheets : 0)
  );

  const elementCounts = $derived.by(() => {
    const counts = new Map<string, { element: TnDElement; count: number }>();
    for (const el of tndElements) {
      if (!el) continue;
      const entry = counts.get(el.element);
      if (entry) entry.count++;
      else counts.set(el.element, { element: el, count: 1 });
    }
    return TND_ELEMENTS.filter((e) => counts.has(e.element)).map((e) => {
      const { element, count } = counts.get(e.element)!;
      return { element, count };
    });
  });

  const SIDE_OPTIONS: {
    id: PrintSide;
    label: string;
    getDetail: () => string;
    getHint: () => string;
  }[] = [
    {
      id: "fronts",
      label: "Fronts",
      getDetail: () => `${totalSheets} sheets`,
      getHint: () => "Print these first, then flip the stack for the backs.",
    },
    {
      id: "backs",
      label: "Backs",
      getDetail: () => `${totalSheets} sheets`,
      getHint: () =>
        "Print after the fronts. Columns mirrored for the long-edge flip.",
    },
    // fronts + ONE flip separator + backs. The exporter adds a single
    // instruction page, not two (see home-print-insert-card.test.ts).
    {
      id: "combined",
      label: "Combined",
      getDetail: () => `${totalSheets * 2 + 1} pages`,
      getHint: () => "Fronts + flip instructions + backs, in one file.",
    },
    {
      id: "zip",
      label: "Images",
      getDetail: () => `${(cardCount + (includeHowToRead ? 1 : 0)) * 2} PNGs`,
      getHint: () =>
        "Individual files for MPC or custom layouts. Download only.",
    },
  ];
  const sideChoices = SIDE_OPTIONS.map((option) => ({
    value: option.id,
    label: option.label,
  }));

  const selectedOption = $derived(
    SIDE_OPTIONS.find((f) => f.id === selectedSide)!
  );

  const printLabel = $derived.by(() => {
    if (isPrinting) return "Preparing…";
    switch (selectedSide) {
      case "fronts":
        return "Print Fronts";
      case "backs":
        return "Print Backs";
      case "combined":
        return "Print Combined";
      default:
        return "Print";
    }
  });

  const downloadLabel = $derived.by(() => {
    if (isExporting) {
      return exportTotal > 0
        ? `Exporting ${exportProgress} / ${exportTotal}…`
        : "Preparing…";
    }
    return `Download ${selectedOption.label}`;
  });

  function handlePrint() {
    if (busy || !printable) return;
    onPrint(selectedSide as PrintPDFMode);
  }

  function handleExport() {
    if (busy) return;
    if (selectedSide === "zip") onExportZIP();
    else onExportPDF(selectedSide, Math.max(1, Math.floor(copies || 1)));
  }
</script>

<div class="print-panel">
  {#if elementCounts.length > 0 && groupByElement}
    <div class="elements" aria-label="Element breakdown">
      {#each elementCounts as { element, count }}
        <div
          class="element-pill"
          style="--el-color: {element.accentColor}"
          title="{element.element}: {count} card{count === 1 ? '' : 's'}"
        >
          <img
            src={element.iconPath}
            alt={element.element}
            class="element-icon"
            width="16"
            height="16"
          />
          <span class="element-count">{count}</span>
        </div>
      {/each}
    </div>
  {/if}

  <h3 class="section-label">Print output</h3>
  <div class="output-picker">
    <SegmentedControl
      options={sideChoices}
      value={selectedSide}
      onchange={onSideChange}
      color="accent"
      size="sm"
      semantics="radiogroup"
      ariaLabel="Print output"
    />
  </div>
  <div class="output-summary">
    <strong>{selectedOption.getDetail()}</strong>
    <span>{selectedOption.getHint()}</span>
  </div>

  <div class="extra-card">
    <div class="extra-copy">
      <span class="extra-label">Deck extras</span>
      <span class="extra-hint"
        >Adds one reference card to each printed deck.</span
      >
    </div>
    <FilterChipBase
      mode="toggle"
      size="sm"
      label="How to Read"
      active={includeHowToRead}
      chipColor="var(--theme-accent, #8b5cf6)"
      ariaLabel={includeHowToRead
        ? "Remove the How to Read card"
        : "Include the How to Read card"}
      onclick={() => onIncludeHowToReadChange(!includeHowToRead)}
    />
  </div>

  {#if exportError}
    <div class="error" role="alert">
      <i class="fas fa-exclamation-triangle" aria-hidden="true"></i>
      {exportError}
    </div>
  {/if}

  <div class="checklist" aria-label="Print dialog checklist">
    <span class="checklist-title">Print dialog checklist</span>
    <ul class="checklist-items">
      <li>
        <i class="fas fa-file" aria-hidden="true"></i>
        Paper size: <strong>{PAPER_SIZES[paperSize].label}</strong>
      </li>
      <li>
        <i class="fas fa-expand" aria-hidden="true"></i>
        Scale: <strong>100% / Actual size</strong> — never “Fit to page”
      </li>
      {#if paperSize === "superb"}
        <li>
          <i class="fas fa-print" aria-hidden="true"></i>
          Printer: <strong>rear feed · Cardstock · Thick Paper on</strong>
        </li>
      {/if}
    </ul>
    {#if onPrintTest}
      <button
        class="test-sheet-btn"
        disabled={busy}
        onclick={() => {
          if (!busy) onPrintTest?.();
        }}
        title="One page: card grid outlines + an inch ruler. Print it on scrap paper and measure the ruler before spending card stock."
      >
        <i class="fas fa-ruler-horizontal" aria-hidden="true"></i>
        <span>Print test sheet on scrap paper</span>
      </button>
    {/if}
  </div>

  <div class="actions">
    <button
      class="action print-action"
      disabled={busy || !printable || cardCount === 0}
      title={!printable
        ? "Card images can't be sent to a printer. Download instead."
        : undefined}
      onclick={handlePrint}
    >
      {#if isPrinting}<i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
      {:else}<i class="fas fa-print" aria-hidden="true"></i>{/if}
      <span>{printLabel}</span>
    </button>
    <button
      class="action download-action"
      disabled={busy}
      onclick={handleExport}
    >
      {#if isExporting}<i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
      {:else}<i class="fas fa-download" aria-hidden="true"></i>{/if}
      <span>{downloadLabel}</span>
    </button>
    {#if onExportBoth}
      <button
        class="action download-action both-action"
        disabled={busy}
        onclick={() => {
          if (!busy) onExportBoth?.();
        }}
        title="Download the fronts and the backs as two separate PDF files"
      >
        <i class="fas fa-clone" aria-hidden="true"></i>
        <span>Download Fronts + Backs</span>
      </button>
    {/if}
  </div>

  <p class="workflow-tip">
    Lays out on <strong>{PAPER_SIZES[paperSize].label}</strong> paper. Print the
    fronts, flip your paper stack on the <strong>long edge</strong>, then print
    the backs.
  </p>
</div>

<!-- Deck render / PDF / ZIP all run off a single awaited exporter call that takes
     no abort token, so Cancel is shown disabled with the reason. Wiring a real
     abort means threading `shouldCancel` through exportDeckPDF / exportDeckZIP /
     exportFixedSheetBatchPDF. -->
<ExportTakeover
  phase={busy ? "capturing" : "idle"}
  progress={exportTotal > 0 ? exportProgress / exportTotal : 0}
  phaseLabel={isPrinting
    ? "Preparing print sheets..."
    : isRendering
      ? "Rendering cards..."
      : "Building download..."}
  detail={exportTotal > 0 ? `Card ${exportProgress} / ${exportTotal}` : null}
  onCancel={() => {}}
  cancelDisabledReason="Deck rendering runs in one pass and can't be stopped part-way."
  label="Preparing the deck"
/>

<style>
  .print-panel {
    display: flex;
    flex-direction: column;
    gap: var(--settings-spacing-md, 14px);
    padding: var(--settings-spacing-md, 16px);
    overflow-y: auto;
    min-height: 0;
  }

  .elements {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    justify-content: center;
  }

  .element-pill {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    background: color-mix(in srgb, var(--el-color) 10%, transparent);
    border: 1px solid color-mix(in srgb, var(--el-color) 25%, transparent);
    border-radius: 20px;
  }

  .element-icon {
    width: 14px;
    height: 14px;
    object-fit: contain;
  }

  .element-count {
    font-size: 12px;
    font-weight: 600;
    color: var(--el-color);
    font-variant-numeric: tabular-nums;
  }

  .section-label {
    margin: 0;
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.45));
  }

  .output-picker {
    min-width: 0;
  }

  .output-summary {
    display: grid;
    gap: 3px;
    min-height: 3.25rem;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.62));
    font-size: var(--font-size-compact, 12px);
    line-height: 1.45;
  }

  .output-summary strong {
    color: var(--theme-text, #fff);
    font-size: var(--font-size-min, 14px);
    font-variant-numeric: tabular-nums;
  }

  .extra-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 12px;
  }

  .extra-copy {
    display: grid;
    gap: 3px;
    min-width: 0;
  }

  .extra-label {
    color: var(--theme-text, #fff);
    font-size: var(--font-size-min, 14px);
    font-weight: 650;
  }

  .extra-hint {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    font-size: var(--font-size-compact, 12px);
    line-height: 1.35;
  }

  .error {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    background: color-mix(
      in srgb,
      var(--semantic-error, #f87171) 8%,
      transparent
    );
    border: 1px solid
      color-mix(in srgb, var(--semantic-error, #f87171) 20%, transparent);
    border-radius: 8px;
    font-size: var(--font-size-min, 14px);
    color: var(--semantic-error, #f87171);
  }

  .checklist {
    display: grid;
    gap: 8px;
    padding: 12px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 12px;
  }

  .checklist-title {
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.45));
  }

  .checklist-items {
    display: grid;
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.62));
    line-height: 1.4;
  }

  .checklist-items li {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }

  .checklist-items i {
    width: 14px;
    flex-shrink: 0;
    text-align: center;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.4));
  }

  .checklist-items strong {
    color: var(--theme-text, #fff);
    font-weight: 600;
  }

  .test-sheet-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: var(--min-touch-target, 44px);
    padding: 10px 14px;
    font-size: var(--font-size-compact, 13px);
    font-weight: 600;
    font-family: inherit;
    color: rgba(255, 255, 255, 0.85);
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 10px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .test-sheet-btn:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.1);
    color: var(--theme-text, #fff);
  }

  .test-sheet-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .actions {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .action {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 14px 20px;
    min-height: 52px;
    font-size: var(--font-size-min, 15px);
    font-weight: 700;
    font-family: inherit;
    color: var(--theme-text, #fff);
    border: none;
    border-radius: 12px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .action:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .print-action {
    background: linear-gradient(
      135deg,
      var(--semantic-success, #10b981),
      #059669
    );
  }

  .print-action:hover:not(:disabled) {
    background: linear-gradient(
      135deg,
      #34d399,
      var(--semantic-success, #10b981)
    );
    box-shadow: 0 4px 20px
      color-mix(in srgb, var(--semantic-success, #10b981) 30%, transparent);
  }

  .download-action {
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.12);
    font-weight: 600;
    color: rgba(255, 255, 255, 0.85);
  }

  .download-action:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.1);
    color: var(--theme-text, #fff);
  }

  .workflow-tip {
    margin: 0;
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.45));
    line-height: 1.5;
  }
  .workflow-tip strong {
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.68));
  }
</style>
