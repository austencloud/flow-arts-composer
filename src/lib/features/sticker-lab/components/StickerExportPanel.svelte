<script lang="ts">
  import { getStickerLabContext } from "../context/sticker-lab-context";
  import SheetSizePicker from "./SheetSizePicker.svelte";
  import { StickerSheetPdfExporter } from "../services/sticker-sheet-pdf-exporter";
  import {
    getPrimitivePaths,
    loadPrimitivePaths,
  } from "../state/mandala-paths-cache.svelte";
  import { showToast } from "#lib/shared/toast/state/toast-state.svelte.js";
  import ExportTakeover from "#lib/shared/video-export/components/ExportTakeover.svelte";

  const stickerState = getStickerLabContext();
  const exporter = new StickerSheetPdfExporter();

  let isExporting = $state(false);
  let isPreparing = $state(false);

  const totalCount = $derived(
    stickerState.sheet.stickers.reduce((sum, s) => sum + s.copies, 0)
  );
  const canExport = $derived(totalCount > 0 && !isExporting && !isPreparing);

  async function downloadPdf() {
    if (!canExport) return;
    // Hydrate the mandala-paths cache for every sticker on the sheet before
    // handing it to the exporter, whose lookup is synchronous.
    isPreparing = true;
    try {
      await Promise.all(
        stickerState.sheet.stickers.map((s) =>
          loadPrimitivePaths(s.primitiveRef)
        )
      );
    } catch (err) {
      console.error("[StickerExportPanel] preload failed:", err);
      showToast("Failed to prepare stickers. Check console.", "error");
      isPreparing = false;
      return;
    }
    isPreparing = false;

    isExporting = true;
    try {
      const bytes = await exporter.export(stickerState.sheet, {
        getPaths: getPrimitivePaths,
      });
      // Cast to ArrayBuffer slice - Uint8Array.buffer can be SharedArrayBuffer in the
      // DOM type lib, but pdf-lib always returns plain ArrayBuffer-backed bytes.
      const blob = new Blob([bytes as unknown as Uint8Array<ArrayBuffer>], {
        type: "application/pdf",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      a.download = `TKA-Stickers-${stickerState.sheet.name.replace(/\s+/g, "_")}-${stamp}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      showToast("Sticker sheet PDF exported", "success");
    } catch (err) {
      console.error("[StickerExportPanel] export failed:", err);
      showToast("PDF export failed. Check console.", "error");
    } finally {
      isExporting = false;
    }
  }
</script>

<div class="panel">
  <SheetSizePicker
    value={stickerState.sheet.sheetSize}
    onChange={(s) => stickerState.setSheetSize(s)}
  />

  <div class="summary">
    <div><span class="num">{totalCount}</span> total stickers</div>
  </div>

  <button class="primary" disabled={!canExport} onclick={downloadPdf}>
    {#if isPreparing}
      Preparing…
    {:else if isExporting}
      Exporting…
    {:else}
      Download PDF
    {/if}
  </button>

  <details class="help">
    <summary>How to print</summary>
    <div class="help-content">
      <h4>StickerYou - Make Your Own Page</h4>
      <p>
        Go to stickeryou.com, pick "Custom Stickers Sticker Sheet," upload the
        PDF, and order. Supports single mixed sheets.
      </p>

      <h4>StickerApp - Custom sheets</h4>
      <p>
        Go to stickerapp.com, pick "Sticker sheet," upload the PDF. Select
        quantity 1 if doing a one-off.
      </p>

      <h4>Silhouette Cameo 5 - Print & Cut</h4>
      <p>
        Open Silhouette Studio, import the PDF, send the art layer to a printer
        with sticker paper loaded, load the printed sheet into the Cameo for
        cutting. Registration marks are included.
      </p>

      <h4>Self-print + circle punch</h4>
      <p>
        Print the PDF on sticker paper. Use a 3" circle punch over each cut-line
        guide. Trim sheet edges with your guillotine.
      </p>
    </div>
  </details>
</div>

<!-- `exporter.export()` is a single pdf-lib call with no abort hook, so Cancel
     is shown disabled with the reason rather than pretending to stop it. -->
<ExportTakeover
  phase={isPreparing || isExporting ? "capturing" : "idle"}
  progress={0}
  phaseLabel={isPreparing ? "Preparing stickers..." : "Building PDF..."}
  onCancel={() => {}}
  cancelDisabledReason="This PDF is built in one pass and can't be stopped part-way."
  label="Exporting sticker sheet"
/>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
    height: 100%;
  }

  .summary {
    padding: var(--spacing-md);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border-radius: var(--radius-2026-sm);
    color: var(--theme-text, white);
    font-size: var(--font-size-sm);
  }
  .summary .num {
    font-weight: 600;
    font-size: var(--font-size-base);
    margin-right: var(--spacing-xs);
  }

  .primary {
    min-height: var(--min-touch-target);
    padding: var(--spacing-sm) var(--spacing-md);
    background: var(--theme-accent, #8b5cf6);
    color: white;
    border: none;
    border-radius: var(--radius-2026-sm);
    cursor: pointer;
    font-size: var(--font-size-sm);
    font-weight: 600;
    transition: opacity var(--duration-fast);
  }
  .primary:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .help {
    margin-top: auto;
    font-size: var(--font-size-sm);
    color: var(--theme-text-dim);
  }
  .help summary {
    cursor: pointer;
    padding: var(--spacing-sm) 0;
    min-height: var(--min-touch-target);
    display: flex;
    align-items: center;
  }
  .help-content h4 {
    margin: var(--spacing-md) 0 var(--spacing-xs);
    font-size: var(--font-size-sm);
    color: var(--theme-text, white);
  }
  .help-content p {
    margin: 0;
    font-size: var(--font-size-compact);
    line-height: 1.5;
  }
</style>
