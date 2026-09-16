<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
  import CardInspectModal from "../CardInspectModal.svelte";
  import FestivalSamplerSheetPreview from "./FestivalSamplerSheetPreview.svelte";
  import {
    FESTIVAL_SAMPLER_MAX_PACKS,
    FESTIVAL_SAMPLER_NAME,
    renderFestivalSamplerBatch,
    type FestivalSamplerPack,
    type FestivalSamplerPair,
  } from "../../services/festival-sampler-renderer";
  import {
    exportCalibrationPDF,
    exportFixedSheetBatchPDF,
    type PrintPDFMode,
  } from "../../services/print-pdf-exporter";
  import { printPdfBlob } from "../../services/print-blob";
  import { exportDeckZIP } from "../../services/print-zip-exporter";
  import { downloadBlobToDisk } from "$lib/shared/foundation/services/file-downloader";
  import { createFestivalSamplerPrintState } from "./state/festival-sampler-print-state.svelte";
  import { canvasToBlob } from "../../services/DeckCardBlobCache";

  interface Props {
    onExit: () => void;
    onReviewTurns?: () => void;
  }

  let { onExit, onReviewTurns }: Props = $props();

  const OUTPUT_OPTIONS = [
    { value: "combined", label: "Duplex" },
    { value: "fronts", label: "Fronts" },
    { value: "backs", label: "Backs" },
  ];
  const PACK_COUNT_PRESETS = [10, 30, 60];
  type PackQuantityMode = "10" | "30" | "60" | "custom";
  const PACK_QUANTITY_OPTIONS: Array<{
    value: PackQuantityMode;
    label: string;
  }> = [
    { value: "10", label: "10" },
    { value: "30", label: "30" },
    { value: "60", label: "60" },
    { value: "custom", label: "Custom" },
  ];
  const printSettings = createFestivalSamplerPrintState(
    typeof window === "undefined" ? null : window.localStorage,
    FESTIVAL_SAMPLER_MAX_PACKS
  );

  let packs = $state<FestivalSamplerPack[]>([]);
  let output = $state<PrintPDFMode>("combined");
  let status = $state("Loading the festival sampler…");
  let progress = $state(0);
  let progressTotal = $state(0);
  let error = $state("");
  let isWorking = $state(false);
  let customPackCount = $state(printSettings.packCount);
  let quantityMode = $state<PackQuantityMode>(
    PACK_COUNT_PRESETS.includes(printSettings.packCount)
      ? (String(printSettings.packCount) as PackQuantityMode)
      : "custom"
  );
  let inspectedPair = $state<FestivalSamplerPair | null>(null);
  let inspectedFrontImageUrl = $state<string | null>(null);
  let inspectedBackImageUrl = $state<string | null>(null);
  let lastInspectTrigger: HTMLButtonElement | null = null;
  let inspectRequest = 0;

  const packCount = $derived(printSettings.packCount);
  const visiblePackSlots = $derived.by(() => {
    const packsByNumber = new Map(
      packs.map((pack) => [pack.packNumber, pack] as const)
    );
    return Array.from(
      { length: packCount },
      (_, index) => packsByNumber.get(index + 1) ?? null
    );
  });
  const visiblePacks = $derived(
    visiblePackSlots.filter(
      (pack): pack is FestivalSamplerPack => pack !== null
    )
  );
  const ready = $derived(visiblePacks.length === packCount);
  const selectedSheets = $derived(visiblePacks.map((pack) => pack.pairs));
  const archivePairs = $derived.by(() => {
    const seen = new Set<HTMLCanvasElement>();
    return selectedSheets.flat().filter((pair) => {
      if (seen.has(pair.front)) return false;
      seen.add(pair.front);
      return true;
    });
  });
  const pageCount = $derived((output === "combined" ? 2 : 1) * packCount);
  const outputLabel = $derived(
    output === "combined" ? "Duplex" : output === "fronts" ? "Fronts" : "Backs"
  );
  const batchLabel = $derived(
    output === "combined"
      ? `${packCount} unique packs`
      : `${packCount} ${output === "fronts" ? "front" : "back"} sheets`
  );
  const displayStatus = $derived(
    ready && status.endsWith("unique packs ready to print")
      ? `${packCount} unique packs ready to print`
      : status
  );

  onMount(() => {
    let cancelled = false;
    void renderFestivalSamplerBatch(
      FESTIVAL_SAMPLER_MAX_PACKS,
      (next) => {
        if (cancelled) return;
        progress = next.current;
        progressTotal = next.total;
        status = next.label;
      },
      (readyPack) => {
        if (cancelled) return;
        packs = [
          ...packs.filter((pack) => pack.packNumber !== readyPack.packNumber),
          readyPack,
        ].sort((a, b) => a.packNumber - b.packNumber);
      }
    )
      .then((rendered) => {
        if (cancelled) return;
        packs = rendered;
        status = `${packCount} unique packs ready to print`;
      })
      .catch((cause) => {
        if (cancelled) return;
        error = cause instanceof Error ? cause.message : String(cause);
        status = "Could not render the festival sampler";
      });
    return () => {
      cancelled = true;
    };
  });

  function releaseInspectImages(): void {
    if (inspectedFrontImageUrl) URL.revokeObjectURL(inspectedFrontImageUrl);
    if (inspectedBackImageUrl) URL.revokeObjectURL(inspectedBackImageUrl);
    inspectedFrontImageUrl = null;
    inspectedBackImageUrl = null;
  }

  async function inspectCard(
    pair: FestivalSamplerPair,
    trigger: HTMLButtonElement
  ): Promise<void> {
    const request = ++inspectRequest;
    lastInspectTrigger = trigger;
    const [frontBlob, backBlob] = await Promise.all([
      canvasToBlob(pair.front),
      canvasToBlob(pair.back),
    ]);
    if (request !== inspectRequest) return;

    releaseInspectImages();
    inspectedFrontImageUrl = URL.createObjectURL(frontBlob);
    inspectedBackImageUrl = URL.createObjectURL(backBlob);
    inspectedPair = pair;
  }

  function closeInspector(): void {
    inspectRequest++;
    inspectedPair = null;
    releaseInspectImages();
    requestAnimationFrame(() => lastInspectTrigger?.focus());
  }

  onDestroy(() => {
    inspectRequest++;
    releaseInspectImages();
    lastInspectTrigger = null;
  });

  async function buildPdf(mode: PrintPDFMode): Promise<Blob> {
    return exportFixedSheetBatchPDF(
      selectedSheets,
      FESTIVAL_SAMPLER_NAME,
      "poker",
      (current) => {
        progress = current;
      },
      mode,
      {
        paperSize: "letter",
        meta: {
          title: FESTIVAL_SAMPLER_NAME,
          subject: `${packCount} unique nine-card home-print festival handouts`,
          keywords: ["festival", "sampler", "poker cards", "duplex"],
          deckSummary:
            "8 sample cards + signup · Unique assortment · Long-edge duplex",
        },
      }
    );
  }

  async function handlePrint(): Promise<void> {
    if (!ready || isWorking) return;
    isWorking = true;
    error = "";
    status = `Preparing ${batchLabel}…`;
    try {
      const blob = await buildPdf(output);
      printPdfBlob(blob);
      status = "Print dialog opened";
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
      status = "Could not prepare the print file";
    } finally {
      isWorking = false;
    }
  }

  async function handleDownloadPdf(): Promise<void> {
    if (!ready || isWorking) return;
    isWorking = true;
    error = "";
    status = `Building ${batchLabel}…`;
    try {
      const blob = await buildPdf(output);
      await downloadBlobToDisk(
        blob,
        `Festival_Sampler_2026_${packCount}_${outputLabel}.pdf`
      );
      status = "PDF downloaded";
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
      status = "Could not build the PDF";
    } finally {
      isWorking = false;
    }
  }

  async function handleDownloadImages(): Promise<void> {
    if (!ready || isWorking) return;
    isWorking = true;
    error = "";
    status = "Building card image archive…";
    try {
      const blob = await exportDeckZIP(
        archivePairs,
        "Festival_Sampler_2026_unique_cards"
      );
      await downloadBlobToDisk(blob, "Festival_Sampler_2026_cards.zip");
      status = "Card images downloaded";
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
      status = "Could not build the image archive";
    } finally {
      isWorking = false;
    }
  }

  async function handleTestSheet(): Promise<void> {
    if (isWorking) return;
    isWorking = true;
    error = "";
    status = "Preparing the scale test…";
    try {
      printPdfBlob(await exportCalibrationPDF("poker", "letter"));
      status = "Scale-test print dialog opened";
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
      status = "Could not prepare the scale test";
    } finally {
      isWorking = false;
    }
  }

  function selectQuantityMode(mode: PackQuantityMode): void {
    quantityMode = mode;
    if (mode === "custom") {
      printSettings.packCount = customPackCount;
      return;
    }
    printSettings.packCount = Number(mode);
  }

  function setCustomPackCount(value: number): void {
    quantityMode = "custom";
    printSettings.packCount = value;
    customPackCount = printSettings.packCount;
  }
</script>

<div class="festival-print" data-testid="festival-sampler-print-view">
  <main class="preview-area">
    <header class="preview-header">
      <div class="header-actions">
        <button class="back-button" type="button" onclick={onExit}>
          <i class="fas fa-arrow-left" aria-hidden="true"></i>
          Deck Releaser
        </button>
        {#if onReviewTurns}
          <button
            class="review-turns-button"
            type="button"
            onclick={onReviewTurns}
          >
            <i class="fas fa-code-branch" aria-hidden="true"></i>
            Review turn patterns
          </button>
        {/if}
      </div>
      <div class="title-block">
        <span class="eyebrow">Ready-to-print job</span>
        <h1>{FESTIVAL_SAMPLER_NAME}</h1>
        <p>1 signup card + 8 sample choreo cards</p>
      </div>
      <div class="job-status" class:ready aria-live="polite">
        {#if !ready && !error}
          <i class="fas fa-circle-notch fa-spin" aria-hidden="true"></i>
        {:else if ready}
          <i class="fas fa-check-circle" aria-hidden="true"></i>
        {/if}
        <span>{displayStatus}</span>
        {#if !ready && !error}
          <small>{progress} / {progressTotal}</small>
        {/if}
      </div>
    </header>

    {#if error}
      <div class="error" role="alert">
        <i class="fas fa-exclamation-triangle" aria-hidden="true"></i>
        <span>{error}</span>
      </div>
    {/if}

    <section class="pack-list" aria-label="All festival sampler packs">
      {#each visiblePackSlots as pack, index (index)}
        {@const packNumber = index + 1}
        <article class="pack-row" aria-busy={!pack}>
          <header class="pack-heading">
            <h2>Pack {String(packNumber).padStart(2, "0")}</h2>
          </header>
          <div class="pack-sheets">
            <section
              class="sheet-block"
              aria-label={`Pack ${packNumber} fronts`}
            >
              <div class="sheet-heading">
                <strong>Fronts</strong>
                <span>Select a card</span>
              </div>
              <FestivalSamplerSheetPreview
                pairs={pack?.pairs ?? null}
                side="front"
                {packNumber}
                onCardClick={inspectCard}
              />
            </section>
            <section
              class="sheet-block"
              aria-label={`Pack ${packNumber} backs`}
            >
              <div class="sheet-heading">
                <strong>Backs</strong>
                <span>Select a card</span>
              </div>
              <FestivalSamplerSheetPreview
                pairs={pack?.pairs ?? null}
                side="back"
                {packNumber}
                onCardClick={inspectCard}
              />
            </section>
          </div>
        </article>
      {/each}
    </section>
  </main>

  <aside class="print-sidebar" aria-label="Festival sampler print controls">
    <section class="job-summary">
      <span class="summary-icon"
        ><i class="fas fa-layer-group" aria-hidden="true"></i></span
      >
      <div>
        <strong>{packCount} unique packs</strong>
        <span>Letter · Poker 2.5″ × 3.5″</span>
      </div>
    </section>

    <section class="control-section">
      <h2>Pack quantity</h2>
      <div class="quantity-control">
        <SegmentedControl
          options={PACK_QUANTITY_OPTIONS}
          value={quantityMode}
          onchange={selectQuantityMode}
          color="accent"
          size="sm"
          semantics="radiogroup"
          ariaLabel="Pack quantity"
        />
        <label class="custom-quantity">
          <span>Custom pack count</span>
          <input
            id="festival-sampler-pack-count"
            name="festival-sampler-pack-count"
            type="number"
            min="1"
            max={FESTIVAL_SAMPLER_MAX_PACKS}
            step="1"
            value={customPackCount}
            disabled={quantityMode !== "custom"}
            aria-label="Number of festival sample packs"
            onchange={(event) => {
              setCustomPackCount(Number(event.currentTarget.value));
            }}
          />
        </label>
      </div>
      <p class="quantity-note">
        Every numbered pack has a different eight-card assortment. Keep printer
        copies at 1.
      </p>
    </section>

    <section class="control-section">
      <h2>Print output</h2>
      <SegmentedControl
        options={OUTPUT_OPTIONS}
        value={output}
        onchange={(value) => {
          output = value as PrintPDFMode;
        }}
        color="accent"
        size="sm"
        semantics="radiogroup"
        ariaLabel="Print output"
      />
      <div class="output-detail">
        <strong>{pageCount} {pageCount === 1 ? "page" : "pages"}</strong>
        <span>
          {output === "combined"
            ? "Each front is followed immediately by its matching mirrored back."
            : output === "fronts"
              ? "Print this side first."
              : "Use after flipping the front sheet on its long edge."}
        </span>
      </div>
    </section>

    <section class="checklist">
      <h2>Print dialog</h2>
      <ul>
        <li>
          <i class="fas fa-file" aria-hidden="true"></i><span
            >Paper: <strong>Letter</strong></span
          >
        </li>
        <li>
          <i class="fas fa-expand" aria-hidden="true"></i><span
            >Scale: <strong>100% / Actual size</strong></span
          >
        </li>
        <li>
          <i class="fas fa-layer-group" aria-hidden="true"></i><span
            >Copies: <strong>1</strong></span
          >
        </li>
        {#if output === "combined"}
          <li>
            <i class="fas fa-copy" aria-hidden="true"></i><span
              >Two-sided: <strong>Flip on long edge</strong></span
            >
          </li>
        {/if}
      </ul>
      <button
        type="button"
        class="test-button"
        disabled={isWorking}
        onclick={handleTestSheet}
      >
        <i class="fas fa-ruler-horizontal" aria-hidden="true"></i>
        Print scale test on scrap paper
      </button>
    </section>

    <div class="actions">
      <button
        type="button"
        class="primary-action"
        disabled={!ready || isWorking}
        onclick={handlePrint}
      >
        <i
          class={isWorking ? "fas fa-circle-notch fa-spin" : "fas fa-print"}
          aria-hidden="true"
        ></i>
        Print {batchLabel}
      </button>
      <button
        type="button"
        class="secondary-action"
        disabled={!ready || isWorking}
        onclick={handleDownloadPdf}
      >
        <i class="fas fa-file-pdf" aria-hidden="true"></i>
        Download {batchLabel} PDF
      </button>
      <button
        type="button"
        class="secondary-action"
        disabled={!ready || isWorking}
        onclick={handleDownloadImages}
      >
        <i class="fas fa-images" aria-hidden="true"></i>
        Download unique card images
      </button>
    </div>

    <p class="copy-note">
      This job contains {pageCount} numbered pages for {batchLabel}. Printing
      more than one copy in the system dialog duplicates the full run.
    </p>
  </aside>
</div>

{#if inspectedPair && inspectedFrontImageUrl && inspectedBackImageUrl}
  <CardInspectModal
    sequence={inspectedPair.renderMeta?.sequence ?? null}
    frontImageUrl={inspectedFrontImageUrl}
    backImageUrl={inspectedBackImageUrl}
    leftPropType={inspectedPair.renderMeta?.options.leftPropType}
    rightPropType={inspectedPair.renderMeta?.options.rightPropType}
    includeStartPlacement={true}
    onClose={closeInspector}
  />
{/if}

<style>
  .festival-print {
    --min-touch-target: 44px;

    container-type: inline-size;
    display: flex;
    height: 100%;
    min-height: 0;
    color: var(--theme-text, #f7f7fb);
    font-variant-numeric: tabular-nums;
  }

  .preview-area {
    display: block;
    flex: 1;
    min-width: 0;
    min-height: 0;
    overflow-y: auto;
    box-sizing: border-box;
    padding: clamp(18px, 2vw, 32px);
    background: transparent;
  }

  .preview-header {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 18px;
    max-width: var(--shell-w, min(1720px, 92vw));
    margin: 0 auto 24px;
  }

  button {
    min-height: var(--min-touch-target);
    border: 0;
    border-radius: 10px;
    color: inherit;
    font: inherit;
    font-weight: 700;
    cursor: pointer;
  }

  button:focus-visible {
    outline: 3px solid var(--theme-accent, #8b5cf6);
    outline-offset: 2px;
  }

  button:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }

  .back-button {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 0 14px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.07));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
  }

  .header-actions {
    display: grid;
    gap: 8px;
  }

  .review-turns-button {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 0 14px;
    background: color-mix(
      in srgb,
      var(--theme-accent, #8b5cf6) 22%,
      transparent
    );
    border: 1px solid
      color-mix(in srgb, var(--theme-accent, #8b5cf6) 48%, transparent);
  }

  .review-turns-button:hover:not(:disabled) {
    filter: brightness(1.1);
  }

  .back-button:hover:not(:disabled),
  .secondary-action:hover:not(:disabled),
  .test-button:hover:not(:disabled) {
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.22));
    filter: brightness(1.08);
  }

  .title-block h1,
  .title-block p,
  .title-block .eyebrow {
    margin: 0;
  }

  .eyebrow {
    display: block;
    margin-bottom: 3px !important;
    color: var(--theme-accent, #a78bfa);
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .title-block h1 {
    font-size: clamp(22px, 2vw, 32px);
    line-height: 1.1;
  }

  .title-block p {
    margin-top: 5px;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.64));
    font-size: 14px;
  }

  .job-status {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 42px;
    padding: 0 13px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: 999px;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.7));
    font-size: 13px;
  }

  .job-status.ready {
    border-color: color-mix(
      in srgb,
      var(--semantic-success, #10b981) 55%,
      transparent
    );
    color: var(--semantic-success, #34d399);
  }

  .job-status small {
    color: inherit;
    opacity: 0.7;
  }

  .error {
    display: flex;
    gap: 10px;
    max-width: 900px;
    margin: 0 auto 20px;
    padding: 14px;
    border: 1px solid
      color-mix(in srgb, var(--semantic-error, #ef4444) 55%, transparent);
    border-radius: 10px;
    background: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 10%,
      transparent
    );
    color: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 55%,
      var(--theme-text, #fff)
    );
  }

  .pack-list {
    display: grid;
    gap: clamp(28px, 3vw, 48px);
    max-width: var(--shell-w, min(1720px, 92vw));
    width: 100%;
    margin: 0 auto;
    padding-bottom: clamp(24px, 4vw, 64px);
  }

  .pack-row {
    display: grid;
    gap: 10px;
    padding-top: clamp(18px, 2vw, 28px);
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
  }

  .pack-row:first-child {
    padding-top: 0;
    border-top: 0;
  }

  .pack-heading {
    display: flex;
    align-items: baseline;
    gap: 16px;
  }

  .pack-heading h2 {
    margin: 0;
    color: var(--theme-text, #fff);
    font-size: 16px;
    letter-spacing: 0.06em;
  }

  .pack-sheets {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: start;
    gap: clamp(12px, 2vw, 28px);
  }

  .sheet-block {
    display: grid;
    gap: 8px;
    justify-items: center;
    justify-self: center;
    width: min(100%, calc(68svh * 0.772727));
    min-width: 0;
  }

  .sheet-heading {
    display: flex;
    justify-content: space-between;
    width: 100%;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.62));
    font-size: 13px;
  }

  .sheet-heading strong {
    color: var(--theme-text, #fff);
    font-size: 15px;
  }

  .print-sidebar {
    width: clamp(320px, 18vw, 400px);
    flex: 0 0 auto;
    overflow-y: auto;
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
    border-left: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  .job-summary,
  .control-section,
  .checklist,
  .actions,
  .copy-note {
    margin: 0;
    padding: 18px;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.09));
  }

  .job-summary {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .summary-icon {
    display: grid;
    width: 42px;
    height: 42px;
    place-items: center;
    border-radius: 11px;
    background: color-mix(
      in srgb,
      var(--theme-accent, #8b5cf6) 18%,
      transparent
    );
    color: var(--theme-accent, #a78bfa);
  }

  .job-summary div,
  .output-detail {
    display: grid;
    gap: 3px;
  }

  .job-summary span,
  .output-detail span,
  .copy-note {
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.62));
    font-size: 13px;
    line-height: 1.45;
  }

  h2 {
    margin: 0 0 12px;
    font-size: 13px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .output-detail {
    margin-top: 12px;
    padding: 12px;
    border-radius: 9px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.05));
  }

  .quantity-control {
    display: grid;
    gap: 10px;
  }

  .custom-quantity {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 82px;
    align-items: center;
    gap: 10px;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.62));
    font-size: var(--font-size-compact, 0.75rem);
  }

  .custom-quantity input {
    width: 100%;
    min-height: 44px;
    box-sizing: border-box;
    padding: 0 10px;
    appearance: textfield;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: 9px;
    color: var(--theme-text, #fff);
    font: inherit;
    font-size: 15px;
    font-weight: 700;
  }

  .custom-quantity input::-webkit-inner-spin-button,
  .custom-quantity input::-webkit-outer-spin-button {
    margin: 0;
    appearance: none;
  }

  .custom-quantity input:focus-visible {
    outline: 3px solid var(--theme-accent, #8b5cf6);
    outline-offset: 2px;
  }

  .custom-quantity input:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }

  .quantity-note {
    margin: 10px 0 0;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.62));
    font-size: 12px;
    line-height: 1.45;
  }

  .checklist ul {
    display: grid;
    gap: 10px;
    margin: 0 0 14px;
    padding: 0;
    list-style: none;
  }

  .checklist li {
    display: flex;
    align-items: center;
    gap: 9px;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.7));
    font-size: 13px;
  }

  .checklist li i {
    width: 18px;
    color: var(--theme-accent, #a78bfa);
    text-align: center;
  }

  .test-button,
  .secondary-action {
    width: 100%;
    padding: 10px 13px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
  }

  .actions {
    display: grid;
    gap: 10px;
  }

  .primary-action,
  .secondary-action,
  .test-button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 9px;
  }

  .primary-action {
    min-height: 50px;
    padding: 11px 15px;
    background: color-mix(
      in srgb,
      var(--semantic-success, #10b981) 68%,
      var(--theme-shadow, #000)
    );
    color: var(--theme-text-on-accent, #fff);
  }

  .primary-action:hover:not(:disabled) {
    filter: brightness(1.08);
  }

  .copy-note {
    border-bottom: 0;
  }

  @media (min-width: 2600px) {
    .festival-print {
      --font-size-compact: 14px;
      --font-size-min: 16px;
      --min-touch-target: 52px;
    }

    .preview-area {
      padding: 3rem;
    }

    .preview-header {
      gap: 1.5rem;
      margin-bottom: 2rem;
    }

    .title-block h1 {
      font-size: 2.5rem;
    }

    .title-block p,
    .job-status,
    .sheet-heading,
    .job-summary span,
    .output-detail span,
    .copy-note,
    .checklist li {
      font-size: 1rem;
    }

    .eyebrow,
    h2 {
      font-size: 0.9rem;
    }

    .job-status {
      min-height: 3.25rem;
      padding-inline: 1rem;
    }

    .pack-heading h2,
    .sheet-heading strong {
      font-size: 1.1rem;
    }

    .print-sidebar {
      width: clamp(440px, 13vw, 520px);
    }

    .job-summary,
    .control-section,
    .checklist,
    .actions,
    .copy-note {
      padding: 1.5rem;
    }

    .quantity-note {
      font-size: 0.85rem;
    }

    .primary-action,
    .secondary-action,
    .test-button,
    .custom-quantity input {
      min-height: 3.25rem;
      font-size: 1rem;
    }
  }

  @media (max-width: 700px) {
    .festival-print {
      flex-direction: column;
      overflow-y: auto;
    }

    .preview-area {
      display: block;
      flex: none;
      overflow: visible;
    }

    .print-sidebar {
      width: auto;
      overflow: visible;
      border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
      border-left: 0;
    }

    .sheet-block {
      width: 100%;
    }
  }

  @media (min-width: 701px) and (max-width: 1100px) {
    .preview-header {
      grid-template-columns: 1fr;
    }

    .header-actions,
    .back-button,
    .job-status {
      justify-self: start;
    }
  }

  @media (max-width: 620px) {
    .preview-header {
      grid-template-columns: 1fr;
    }

    .header-actions,
    .back-button,
    .job-status {
      justify-self: start;
    }

    .preview-area {
      padding: 14px;
    }

    .pack-list {
      gap: 28px;
    }

    .sheet-heading span {
      display: none;
    }
  }

  @media (min-width: 621px) and (max-height: 600px) {
    .preview-area {
      flex: 1 1 auto;
      height: 100%;
      overflow-y: auto;
      padding: 10px 16px;
    }

    .preview-header {
      grid-template-columns: auto minmax(0, 1fr);
      gap: 12px;
      max-width: none;
      margin: 0 0 8px;
    }

    .title-block .eyebrow,
    .title-block p,
    .job-status {
      display: none;
    }

    .title-block h1 {
      font-size: 20px;
    }

    .sheet-block {
      width: min(100%, calc(62svh * 0.772727));
    }

    .sheet-heading span {
      display: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    :global(.fa-spin) {
      animation: none;
    }
  }
</style>
