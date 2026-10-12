<script lang="ts">
  import {
    CARD_SIZES,
    getPageLayout,
    type CardSizeId,
  } from "../../domain/card-sizes";
  import { TND_ELEMENTS, type TnDElement } from "../../domain/tnd-element";
  import type { PrintPDFMode } from "../../services/print-pdf-exporter";
  import CardSizeToggle from "../card-preview/CardSizeToggle.svelte";

  type ExportFormat = "fronts" | "backs" | "combined" | "zip";

  interface Props {
    title: string;
    subtitle?: string;
    cardCount: number;
    tndElements?: (TnDElement | undefined)[];
    cardSize: CardSizeId;
    /** Copies per card, chosen on the deck-viewer toolbar. Drives the estimate
     *  and the export; this dialog only reflects it (no control here). */
    copies?: number;
    /** When false, sheets fill in order (colors may share a sheet) — relaxes the
     *  one-color-per-sheet rule, so the estimate is a flat card count. */
    groupByElement?: boolean;
    theme: string;
    isExporting: boolean;
    /** True while the print PDF is being built for the OS print dialog. */
    isPrinting?: boolean;
    exportProgress: number;
    exportTotal: number;
    exportError: string;
    onExportPDF: (mode: PrintPDFMode, copies: number) => void;
    onExportZIP: () => void;
    /** Build the selected side's PDF and open the browser print dialog directly.
     *  Omit to hide the Print action (download-only callers). */
    onPrint?: (mode: PrintPDFMode) => void;
    onCardSizeChange: (size: CardSizeId) => void;
    onClose: () => void;
  }

  let {
    title,
    subtitle = "",
    cardCount,
    tndElements = [],
    cardSize,
    copies = 1,
    groupByElement = true,
    theme,
    isExporting,
    isPrinting = false,
    exportProgress,
    exportTotal,
    exportError,
    onExportPDF,
    onExportZIP,
    onPrint,
    onCardSizeChange,
    onClose,
  }: Props = $props();

  const busy = $derived(isExporting || isPrinting);

  let selectedFormat = $state<ExportFormat>("fronts");

  // The Card-Images zip can't be sent to a paper printer; everything else is a PDF.
  const canPrint = $derived(!!onPrint);
  const printable = $derived(selectedFormat !== "zip");

  const sizeSpec = $derived(CARD_SIZES[cardSize]);
  const layout = $derived(getPageLayout(cardSize));

  // Sheets = Σ over colors of ceil(colorCount * copies / cardsPerPage), because
  // each color is padded to whole sheets. Normal-fill (or untagged) → flat count.
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

  const elementCounts = $derived.by(() => {
    const counts = new Map<string, { element: TnDElement; count: number }>();
    for (const el of tndElements) {
      if (!el) continue;
      const entry = counts.get(el.element);
      if (entry) entry.count++;
      else counts.set(el.element, { element: el, count: 1 });
    }
    const perPage = layout.cardsPerPage;
    return TND_ELEMENTS.filter((e) => counts.has(e.element)).map((e) => {
      const { element, count } = counts.get(e.element)!;
      return { element, count, sheets: Math.ceil((count * copies) / perPage) };
    });
  });

  const FORMAT_OPTIONS: {
    id: ExportFormat;
    icon: string;
    label: string;
    getDetail: () => string;
    getHint: () => string;
  }[] = [
    {
      id: "fronts",
      icon: "fa-layer-group",
      label: "Fronts",
      getDetail: () => `${sheetCount} sheets`,
      getHint: () => "Print these first, then flip the stack for the backs.",
    },
    {
      id: "backs",
      icon: "fa-rotate",
      label: "Backs",
      getDetail: () => `${sheetCount} sheets`,
      getHint: () =>
        "Print after the fronts. Columns mirrored for the long-edge flip.",
    },
    {
      id: "combined",
      icon: "fa-book-open",
      label: "Combined",
      getDetail: () => `${sheetCount * 2 + 2} pages`,
      getHint: () =>
        "Fronts + flip instructions + backs + finishing tips, in one file.",
    },
    {
      id: "zip",
      icon: "fa-images",
      label: "Images",
      getDetail: () => `${cardCount * 2} PNGs`,
      getHint: () =>
        "Individual files for MPC or custom layouts. Download only.",
    },
  ];

  const selectedOption = $derived(
    FORMAT_OPTIONS.find((f) => f.id === selectedFormat)!
  );

  const printLabel = $derived.by(() => {
    if (isPrinting) return "Preparing…";
    switch (selectedFormat) {
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
    if (busy || !onPrint || !printable) return;
    onPrint(selectedFormat as PrintPDFMode);
  }

  function handleExport() {
    if (busy) return;
    if (selectedFormat === "zip") onExportZIP();
    else onExportPDF(selectedFormat, Math.max(1, Math.floor(copies || 1)));
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape" && !busy) onClose();
  }

  function handleBackdropClick(e: MouseEvent) {
    if (
      (e.target as HTMLElement).classList.contains("dialog-backdrop") &&
      !busy
    ) {
      onClose();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="dialog-backdrop" role="presentation" onclick={handleBackdropClick}>
  <div
    class="dialog"
    role="dialog"
    aria-modal="true"
    aria-labelledby="print-dialog-title"
  >
    <button
      class="close-btn"
      onclick={onClose}
      disabled={busy}
      aria-label="Close"
    >
      <i class="fas fa-times" aria-hidden="true"></i>
    </button>

    <!-- Header -->
    <div class="header">
      <h2 id="print-dialog-title">{title}</h2>
      {#if subtitle}
        <p class="subtitle">{subtitle}</p>
      {/if}
    </div>

    <div class="dialog-body">
      <!-- Left: deck summary + element breakdown -->
      <section class="col col-info" aria-label="Deck summary">
        <div class="summary">
          <div class="summary-row">
            <span class="summary-label">Cards</span>
            <span class="summary-value">{cardCount}</span>
          </div>
          <div class="summary-row">
            <span class="summary-label">Sheets</span>
            <span class="summary-value"
              >{sheetCount} ({layout.cols}&times;{layout.rows} per sheet)</span
            >
          </div>
          <div class="summary-row">
            <span class="summary-label">Size</span>
            <span class="summary-value">
              <CardSizeToggle selected={cardSize} onchange={onCardSizeChange} />
            </span>
          </div>
          <div class="summary-row">
            <span class="summary-label">Copies / card</span>
            <span class="summary-value"
              >{copies}<span class="inline-hint">set on the toolbar</span></span
            >
          </div>
          <div class="summary-row">
            <span class="summary-label">Theme</span>
            <span class="summary-value theme-badge">{theme}</span>
          </div>
        </div>

        {#if elementCounts.length > 0 && groupByElement}
          <div class="elements" aria-label="Element breakdown">
            {#each elementCounts as { element, count, sheets }}
              <div
                class="element-pill"
                style="--el-color: {element.accentColor}"
                title="{count} card{count === 1
                  ? ''
                  : 's'} × {copies} = {sheets} sheet{sheets === 1 ? '' : 's'}"
              >
                <img
                  src={element.iconPath}
                  alt={element.element}
                  class="element-icon"
                  width="16"
                  height="16"
                />
                <span class="element-count">{count} · {sheets}sh</span>
              </div>
            {/each}
          </div>
        {/if}
      </section>

      <!-- Right: what to print/download + actions -->
      <section class="col col-actions" aria-label="Print and export">
        <h3 class="section-label">Choose a side</h3>
        <div class="format-grid" role="radiogroup" aria-label="Print format">
          {#each FORMAT_OPTIONS as opt (opt.id)}
            <button
              class="format-card"
              class:selected={selectedFormat === opt.id}
              role="radio"
              aria-checked={selectedFormat === opt.id}
              onclick={() => {
                selectedFormat = opt.id;
              }}
            >
              <i class="fas {opt.icon} format-icon" aria-hidden="true"></i>
              <span class="format-label">{opt.label}</span>
              <span class="format-detail">{opt.getDetail()}</span>
            </button>
          {/each}
        </div>
        <p class="format-hint">{selectedOption.getHint()}</p>

        {#if exportError}
          <div class="error" role="alert">
            <i class="fas fa-exclamation-triangle" aria-hidden="true"></i>
            {exportError}
          </div>
        {/if}

        <div class="action-row">
          {#if canPrint}
            <button
              class="action print-action"
              disabled={busy || !printable || cardCount === 0}
              title={!printable
                ? "Card images can't be sent to a printer. Download instead."
                : undefined}
              onclick={handlePrint}
            >
              {#if isPrinting}
                <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
              {:else}
                <i class="fas fa-print" aria-hidden="true"></i>
              {/if}
              <span>{printLabel}</span>
            </button>
          {/if}
          <button
            class="action download-action"
            class:full={!canPrint}
            disabled={busy}
            onclick={handleExport}
          >
            {#if isExporting}
              <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
            {:else}
              <i class="fas fa-download" aria-hidden="true"></i>
            {/if}
            <span>{downloadLabel}</span>
          </button>
        </div>

        <p class="workflow-tip">
          Print the fronts, flip your paper stack on the <strong
            >long edge</strong
          >, then print the backs.
        </p>
      </section>
    </div>
  </div>
</div>

<style>
  .dialog-backdrop {
    position: fixed;
    inset: 0;
    z-index: var(--z-modal, 9000);
    background: rgba(0, 0, 0, 0.85);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    animation: fadeIn var(--duration-fast) var(--ease-standard-out);
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .dialog {
    position: relative;
    background: var(--theme-panel-bg, #151520);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 16px;
    padding: 28px 32px 32px;
    width: min(900px, 100%);
    max-height: 90vh;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .close-btn {
    position: absolute;
    top: 16px;
    right: 16px;
    width: 36px;
    height: 36px;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: rgba(255, 255, 255, 0.35);
    font-size: 16px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition:
      background var(--duration-fast),
      color var(--duration-fast),
      opacity var(--duration-fast);
  }

  .close-btn:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.06);
    color: rgba(255, 255, 255, 0.7);
  }

  .close-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .header {
    text-align: center;
    padding-right: 36px;
  }

  .header h2 {
    margin: 0;
    font-size: 22px;
    font-weight: 700;
    color: var(--theme-text, #fff);
    font-family: "JetBrains Mono", monospace;
  }

  .subtitle {
    margin: 4px 0 0;
    font-size: 14px;
    color: rgba(255, 255, 255, 0.45);
  }

  /* Two columns on wide screens so the dialog fills instead of stranding a tall
     narrow strip in the middle of a 4K display. Single column when narrow. */
  .dialog-body {
    display: grid;
    grid-template-columns: 1fr 1.2fr;
    gap: 24px;
    align-items: start;
  }

  .col {
    display: flex;
    flex-direction: column;
    gap: 16px;
    min-width: 0;
  }

  .summary {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 14px 16px;
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 10px;
  }

  .summary-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 28px;
  }

  .summary-label {
    font-size: 13px;
    color: rgba(255, 255, 255, 0.4);
  }

  .summary-value {
    display: inline-flex;
    align-items: baseline;
    gap: 8px;
    font-size: 13px;
    color: rgba(255, 255, 255, 0.8);
    font-variant-numeric: tabular-nums;
  }

  .inline-hint {
    font-size: var(--font-size-compact, 12px);
    font-weight: 400;
    color: rgba(255, 255, 255, 0.3);
  }

  .theme-badge {
    text-transform: capitalize;
    padding: 2px 10px;
    background: color-mix(
      in srgb,
      var(--theme-accent, #8b5cf6) 12%,
      transparent
    );
    border: 1px solid
      color-mix(in srgb, var(--theme-accent, #8b5cf6) 25%, transparent);
    border-radius: 6px;
    font-size: 12px;
    color: #a78bfa;
  }

  .elements {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .element-pill {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 4px 10px;
    background: color-mix(in srgb, var(--el-color) 10%, transparent);
    border: 1px solid color-mix(in srgb, var(--el-color) 25%, transparent);
    border-radius: 20px;
  }

  .element-icon {
    width: 16px;
    height: 16px;
    object-fit: contain;
  }

  .element-count {
    font-size: 13px;
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
    color: rgba(255, 255, 255, 0.3);
  }

  .format-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }

  .format-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 14px 12px;
    background: rgba(255, 255, 255, 0.02);
    border: 1.5px solid rgba(255, 255, 255, 0.08);
    border-radius: 10px;
    color: rgba(255, 255, 255, 0.5);
    font: inherit;
    cursor: pointer;
    transition:
      background var(--duration-fast),
      border-color var(--duration-fast),
      color var(--duration-fast);
  }

  .format-card:hover {
    background: rgba(255, 255, 255, 0.04);
    border-color: rgba(255, 255, 255, 0.15);
    color: rgba(255, 255, 255, 0.7);
  }

  .format-card.selected {
    background: color-mix(
      in srgb,
      var(--theme-accent, #8b5cf6) 10%,
      transparent
    );
    border-color: color-mix(
      in srgb,
      var(--theme-accent, #8b5cf6) 50%,
      transparent
    );
    color: var(--theme-text, #fff);
  }

  .format-icon {
    font-size: 20px;
  }

  .format-card.selected .format-icon {
    color: #a78bfa;
  }

  .format-label {
    font-size: 13px;
    font-weight: 600;
  }

  .format-detail {
    font-size: var(--font-size-compact, 12px);
    font-weight: 400;
    opacity: 0.6;
    font-variant-numeric: tabular-nums;
  }

  .format-hint {
    margin: 0;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.4);
    min-height: 32px;
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
    font-size: 13px;
    color: var(--semantic-error, #f87171);
  }

  /* Print + Download sit side by side — the two actions a user chooses between. */
  .action-row {
    display: flex;
    gap: 10px;
  }

  .action {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    flex: 1;
    padding: 14px 20px;
    min-height: 52px;
    font-size: 15px;
    font-weight: 700;
    font-family: inherit;
    color: var(--theme-text, #fff);
    border: none;
    border-radius: 12px;
    cursor: pointer;
    transition:
      opacity var(--duration-fast),
      transform var(--duration-fast);
  }

  .action:active:not(:disabled) {
    transform: translateY(0);
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
    transform: translateY(-1px);
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
    transform: translateY(-1px);
  }

  /* No print path (download-only callers): Download becomes the primary action. */
  .download-action.full {
    background: linear-gradient(135deg, var(--theme-accent, #7c3aed), #6d28d9);
    border: none;
    font-weight: 700;
    color: var(--theme-text, #fff);
  }

  .download-action.full:hover:not(:disabled) {
    background: linear-gradient(135deg, var(--theme-accent, #8b5cf6), #7c3aed);
    box-shadow: 0 4px 20px
      color-mix(in srgb, var(--theme-accent, #7c3aed) 30%, transparent);
  }

  .workflow-tip {
    margin: 0;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.3);
    line-height: 1.5;
  }

  .workflow-tip strong {
    color: rgba(255, 255, 255, 0.6);
  }

  @media (max-width: 760px) {
    .dialog {
      padding: 20px;
      gap: 16px;
      width: 100%;
    }

    .dialog-body {
      grid-template-columns: 1fr;
      gap: 16px;
    }

    .header h2 {
      font-size: 18px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .dialog-backdrop {
      animation: none;
    }
    .action:hover:not(:disabled) {
      transform: none;
    }
  }
</style>
