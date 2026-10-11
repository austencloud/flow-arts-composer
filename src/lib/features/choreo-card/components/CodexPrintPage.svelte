<script lang="ts">
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import CopiesSelect from "./print-preview/CopiesSelect.svelte";
  import { printPdfBlob } from "../services/print-blob";
  import {
    buildCodexSheetPDF,
    downloadCodexSheetPDF,
    codexSheetCount,
    type CodexPrintMode,
  } from "../services/codex-sheet-pdf";

  const PER_PAGE = 4;
  const COLS = 2;
  const FRONT_IMG = "/codex/front.png";
  const BACK_IMG = "/codex/back.png";

  let side = $state<CodexPrintMode>("combined");
  let copies = $state(PER_PAGE); // total identical cards; 4 = one full sheet
  let isPrinting = $state(false);
  let isExporting = $state(false);
  let error = $state<string | null>(null);

  const SIDE_OPTIONS: { value: CodexPrintMode; label: string; icon: string }[] = [
    { value: "fronts", label: "Fronts", icon: "fas fa-layer-group" },
    { value: "backs", label: "Backs", icon: "fas fa-rotate" },
    { value: "combined", label: "Combined", icon: "fas fa-book-open" },
  ];

  const sheetCount = $derived(codexSheetCount(copies));
  const blanks = $derived(sheetCount * PER_PAGE - copies);

  // Per-count waste readout for the CopiesSelect chip badges ("fits" / N blanks).
  function annotate(n: number) {
    const b = codexSheetCount(n) * PER_PAGE - n;
    return { blanks: b, perfect: b === 0 };
  }

  // Each sheet is a fixed 4-cell grid; cells beyond `copies` on the final sheet
  // render blank (matches the PDF, which leaves them empty).
  type Cell = { filled: boolean; index: number };
  function buildSheets(): Cell[][] {
    const sheets: Cell[][] = [];
    for (let s = 0; s < sheetCount; s++) {
      const remaining = copies - s * PER_PAGE;
      sheets.push(
        Array.from({ length: PER_PAGE }, (_, i) => ({ filled: i < remaining, index: i })),
      );
    }
    return sheets;
  }
  const sheets = $derived(buildSheets());

  // Back pages mirror columns for the long-edge duplex flip (same as the deck).
  const mirroredCol = (i: number) => COLS - 1 - (i % COLS);
  const rowOf = (i: number) => Math.floor(i / COLS);

  const printLabel = $derived(
    isPrinting
      ? "Preparing…"
      : side === "fronts" ? "Print Fronts"
      : side === "backs" ? "Print Backs"
      : "Print Combined",
  );
  const downloadLabel = $derived(
    isExporting
      ? "Preparing…"
      : side === "fronts" ? "Download Fronts"
      : side === "backs" ? "Download Backs"
      : "Download Combined",
  );

  async function handlePrint() {
    if (isPrinting || isExporting) return;
    isPrinting = true;
    error = null;
    try {
      const blob = await buildCodexSheetPDF({ mode: side, copies });
      printPdfBlob(blob);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      isPrinting = false;
    }
  }

  async function handleDownload() {
    if (isPrinting || isExporting) return;
    isExporting = true;
    error = null;
    try {
      await downloadCodexSheetPDF({ mode: side, copies }, `codex-${side}-${copies}.pdf`);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      isExporting = false;
    }
  }
</script>

<div class="codex-print">
  <header class="head">
    <h1>Codex Print</h1>
    <p class="lede">
      The full Double-Staff codex as cut-out reference cards. Four per sheet, double-sided:
      Types&nbsp;1–2 on the front, Types&nbsp;3–6 on the back, framed in the Choreo Cards rainbow.
    </p>
  </header>

  <div class="layout">
    <!-- ── Laid-out print preview, scoped by the selected side ── -->
    <div class="preview-pane">
      {#if side !== "backs"}
        {#each sheets as sheet, sheetIndex (sheetIndex)}
          <span class="page-label">Fronts · Types&nbsp;1–2 · Sheet {sheetIndex + 1} of {sheetCount}</span>
          <div class="page">
            <div class="page-guide page-guide-top">
              <span class="guide-text guide-bold">FRONTS · Sheet {sheetIndex + 1} of {sheetCount}</span>
            </div>
            <div class="page-grid">
              {#each sheet as cell (cell.index)}
                {#if cell.filled}
                  <div class="card-cell"><img src={FRONT_IMG} alt="Types 1–2 card front" /></div>
                {:else}
                  <div class="card-cell blank"></div>
                {/if}
              {/each}
            </div>
            <div class="page-guide page-guide-bottom">
              <span class="guide-text">FRONT SIDE</span>
              <span class="guide-text">Sheet {sheetIndex + 1} of {sheetCount}</span>
            </div>
          </div>
        {/each}
      {/if}

      {#if side !== "fronts"}
        {#each sheets as sheet, sheetIndex (sheetIndex)}
          <span class="page-label">Backs · Types&nbsp;3–6 · Sheet {sheetIndex + 1} of {sheetCount}</span>
          <div class="page">
            <div class="page-guide page-guide-top">
              <span class="guide-text guide-bold">BACKS · Sheet {sheetIndex + 1} of {sheetCount}</span>
            </div>
            <div class="page-grid">
              {#each sheet as cell (cell.index)}
                {#if cell.filled}
                  <div
                    class="card-cell"
                    style:grid-column={mirroredCol(cell.index) + 1}
                    style:grid-row={rowOf(cell.index) + 1}
                  ><img src={BACK_IMG} alt="Types 3–6 card back" /></div>
                {:else}
                  <div
                    class="card-cell blank"
                    style:grid-column={mirroredCol(cell.index) + 1}
                    style:grid-row={rowOf(cell.index) + 1}
                  ></div>
                {/if}
              {/each}
            </div>
            <div class="page-guide page-guide-bottom">
              <span class="guide-text">BACK SIDE: columns mirrored for long-edge flip</span>
              <span class="guide-text">↻ LONG EDGE</span>
            </div>
          </div>
        {/each}
      {/if}
    </div>

    <!-- ── Print sidebar (same controls as the deck releaser) ── -->
    <aside class="control-sidebar">
      <h3 class="section-label">Choose a side</h3>
      <SegmentedControl
        options={SIDE_OPTIONS}
        value={side}
        onchange={(v) => (side = v)}
        color="accent"
        size="sm"
      />
      <p class="side-hint">
        {#if side === "fronts"}Print these first, then flip the stack for the backs.
        {:else if side === "backs"}Print after the fronts. Columns mirrored for the long-edge flip.
        {:else}Fronts + flip instructions + backs, in one file.{/if}
      </p>

      <h3 class="section-label">Copies</h3>
      <CopiesSelect
        value={copies}
        onchange={(n) => (copies = n)}
        presets={[4, 8, 12, 24, 48]}
        perPage={PER_PAGE}
        {annotate}
      />
      <p class="sheet-readout">
        <strong>{sheetCount}</strong> sheet{sheetCount === 1 ? "" : "s"}
        {#if side === "combined"} of fronts + {sheetCount} of backs{/if}
        {#if blanks > 0}<span class="blanks"> · {blanks} blank cell{blanks === 1 ? "" : "s"} on the last sheet</span>{/if}
      </p>

      {#if error}
        <div class="error" role="alert">
          <i class="fas fa-exclamation-triangle" aria-hidden="true"></i> {error}
        </div>
      {/if}

      <div class="actions">
        <button class="action print-action" disabled={isPrinting || isExporting} onclick={handlePrint}>
          {#if isPrinting}<i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
          {:else}<i class="fas fa-print" aria-hidden="true"></i>{/if}
          <span>{printLabel}</span>
        </button>
        <button class="action download-action" disabled={isPrinting || isExporting} onclick={handleDownload}>
          {#if isExporting}<i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
          {:else}<i class="fas fa-download" aria-hidden="true"></i>{/if}
          <span>{downloadLabel}</span>
        </button>
      </div>

      <p class="workflow-tip">
        Print the fronts, flip your paper stack on the <strong>long edge</strong>, then print the backs.
        Set scale to <strong>Actual Size / 100%</strong>. Finished card: 4 × 5.25 in.
      </p>
    </aside>
  </div>
</div>

<style>
  .codex-print {
    display: flex;
    flex-direction: column;
    height: 100%;
    color: var(--theme-text, #fff);
    padding: clamp(12px, 2vw, 24px);
    box-sizing: border-box;
    overflow: hidden;
  }

  .head { flex-shrink: 0; }

  .head h1 {
    margin: 0 0 6px;
    font-size: clamp(1.3rem, 3vw, 1.9rem);
    font-weight: 700;
  }

  .lede {
    margin: 0 0 16px;
    max-width: 70ch;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
    line-height: 1.5;
  }

  .layout {
    display: grid;
    grid-template-columns: 1fr minmax(280px, 340px);
    gap: 20px;
    flex: 1;
    min-height: 0;
  }

  /* ── Preview (page sheets, matching the deck releaser) ── */
  .preview-pane {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 22px;
    overflow-y: auto;
    padding: 4px 8px 24px;
    min-height: 0;
  }

  .page-label {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    text-align: center;
    margin-top: 4px;
  }

  .page {
    position: relative;
    width: 100%;
    max-width: 560px;
    aspect-ratio: 8.5 / 11; /* US Letter portrait */
    background: var(--print-bg, #ffffff);
    border-radius: 4px;
    box-shadow: var(--shadow-card, 0 6px 24px rgba(0, 0, 0, 0.4));
    box-sizing: border-box;
    padding: calc(18 / 612 * 100%); /* MARGIN / PAGE_W */
  }

  .page-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-template-rows: 1fr 1fr;
    width: 100%;
    height: 100%;
    gap: 0; /* cards touch → shared cut seams */
  }

  /* Choreo Cards rainbow frame; white content inset; image centered. */
  .card-cell {
    padding: 4.5%;
    background: linear-gradient(
      to top,
      #cc0000 0%, #cc6600 14%, #cccc00 28%, #00cc00 42%,
      #00cc66 56%, #0066cc 70%, #0033cc 82%, #6600cc 100%
    );
    box-sizing: border-box;
    overflow: hidden;
  }

  .card-cell.blank {
    background: transparent;
    border: 1px dashed rgba(0, 0, 0, 0.12);
  }

  .card-cell img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
    background: #fff;
  }

  .page-guide {
    position: absolute;
    left: 6px;
    right: 6px;
    display: flex;
    justify-content: space-between;
    pointer-events: none;
  }

  .page-guide-top { top: 3px; }
  .page-guide-bottom { bottom: 3px; }

  .guide-text {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, #9a9a9a);
    font-family: Helvetica, Arial, sans-serif;
    letter-spacing: 0.02em;
    white-space: nowrap;
  }
  .guide-bold { font-weight: 600; }

  .control-sidebar {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 16px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 14px;
    overflow-y: auto;
    min-height: 0;
    align-self: start;
  }

  .section-label {
    margin: 4px 0 0;
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(255, 255, 255, 0.3);
  }

  .side-hint {
    margin: 0;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.4);
    min-height: 30px;
  }

  .sheet-readout {
    margin: 2px 0 0;
    font-size: 12px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    font-variant-numeric: tabular-nums;
  }
  .sheet-readout strong { color: var(--theme-text, #fff); }
  .blanks { color: rgba(255, 255, 255, 0.4); }

  .error {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    background: rgba(248, 113, 113, 0.08);
    border: 1px solid rgba(248, 113, 113, 0.2);
    border-radius: 8px;
    font-size: 13px;
    color: #f87171;
  }

  .actions {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 4px;
  }

  .action {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 14px 20px;
    min-height: 52px;
    font-size: 15px;
    font-weight: 700;
    font-family: inherit;
    color: #fff;
    border: none;
    border-radius: 12px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .action:disabled { opacity: 0.5; cursor: not-allowed; }

  .print-action { background: linear-gradient(135deg, #10b981, #059669); }
  .print-action:hover:not(:disabled) {
    background: linear-gradient(135deg, #34d399, #10b981);
    box-shadow: 0 4px 20px rgba(16, 185, 129, 0.3);
  }

  .download-action {
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.12);
    font-weight: 600;
    color: rgba(255, 255, 255, 0.85);
  }
  .download-action:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
  }

  .workflow-tip {
    margin: 4px 0 0;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.3);
    line-height: 1.5;
  }
  .workflow-tip strong { color: rgba(255, 255, 255, 0.6); }

  @media (max-width: 860px) {
    .codex-print { overflow-y: auto; }
    .layout { grid-template-columns: 1fr; }
    .preview-pane { overflow: visible; }
    .control-sidebar { overflow: visible; }
  }
</style>
