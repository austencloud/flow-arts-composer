<!--
  Choreo Sheet — dev harness

  Drives the real pipeline end-to-end: load real public sequences → planSheet() +
  getSheetPageLayout() → live landscape preview (SheetPreviewPages) → Export PDF
  (downloadChoreoSheetPDF). Used to eyeball that 8 cells fit a row, 6 rows fit a
  page, long sequences wrap, short ones pad with blanks, and block separators read
  correctly — then open the exported PDF for the print result.

  Sequence sourcing mirrors src/routes/test/render-compare (PublicSequencesLoader:
  metadata, then loadFullSequenceData per word for populated steps).
-->
<script lang="ts">
  import { planSheet, planBands, buildBands } from "#lib/features/write/services/sheet-row-planner.js";
  import SheetReadingView from "#lib/features/write/components/sheet/SheetReadingView.svelte";
  import { getSheetPageLayout } from "#lib/features/write/domain/sheet-page-layout.js";
  import {
    DEFAULT_SHEET_LAYOUT,
    createEmptyChoreoSheet,
    createEmptyAnnotations,
    type CueMark,
    type NoteMark,
  } from "#lib/features/write/domain/types/choreo-sheet.js";
  import { downloadChoreoSheetPDF } from "#lib/features/write/services/sheet-pdf-exporter.js";
  import SheetPreviewPages from "#lib/features/write/components/sheet/SheetPreviewPages.svelte";
  import { PublicSequencesLoader } from "#lib/shared/browse/services/public-sequences-loader.js";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";

  let sequences = $state<SequenceData[]>([]);
  let status = $state("Idle — click Load Sequences.");
  let isLoading = $state(false);
  let isExporting = $state(false);
  let exportProgress = $state<{ done: number; total: number } | null>(null);

  // Columns is the knob that used to break annotations: it re-chunks every band,
  // so a note stored band-relative moved (or unpinned) when it changed. Notes and
  // cues now address an absolute step, so flipping this must leave them on the
  // same pictograph. Flip between 4/6/8 and watch them hold.
  let annotated = $state(false);
  let columns = $state(8);

  const COLUMN_ROWS: Record<number, number> = { 4: 3, 6: 4, 8: 6 };

  const layout = $derived({
    ...DEFAULT_SHEET_LAYOUT,
    columns,
    rowsPerPage: COLUMN_ROWS[columns] ?? 6,
    packing: annotated ? ("aligned" as const) : ("flow" as const),
    showCueRail: annotated,
    showNoteStrips: annotated,
  });
  const geo = $derived(getSheetPageLayout(layout));

  let cues = $state<CueMark[]>([]);
  let notes = $state<NoteMark[]>([]);

  const pages = $derived(planSheet(sequences, layout));
  const bandPages = $derived(annotated ? planBands({ sequences, geo, cues, notes }) : []);
  const annotations = $derived({ ...createEmptyAnnotations(), cues, notes });

  // Reading view: same buildBands, re-chunked at its own column count.
  let reading = $state(false);
  let stageWidth = $state(0);
  // 4 on a phone, 8 once there is room — wider screens get more pictographs,
  // never bigger ones. Mirrors ChoreoSheetView so the harness measures the app.
  const readingColumns = $derived(stageWidth > 0 && stageWidth >= 700 ? 8 : 4);
  const readingBands = $derived(
    buildBands({
      sequences,
      geo: getSheetPageLayout({ ...layout, columns: readingColumns }),
      cues,
      notes,
    })
  );
  const sequenceNames = $derived(
    Object.fromEntries(sequences.map((s) => [s.id, s.word ?? ""]))
  );

  // Seed annotations on the first loaded sequence at absolute steps, including
  // two cues four steps apart — at 8 columns they share one band and the rail
  // has to stack them rather than drop one.
  function seedAnnotations() {
    const first = sequences[0];
    if (!first) return;
    cues = [
      { sequenceId: first.id, stepIndex: 0, timestamp: "0:00", text: "verse" },
      { sequenceId: first.id, stepIndex: 4, timestamp: "0:04", text: "drop" },
    ];
    notes = [
      { id: "n1", sequenceId: first.id, stepIndex: 4, pinned: true, text: "left thumb roll" },
      { id: "n2", sequenceId: first.id, stepIndex: 6, pinned: true, text: "pass behind" },
      { id: "n3", sequenceId: first.id, stepIndex: 0, pinned: false, text: "breathe here" },
    ];
    annotated = true;
    status = "Seeded 2 cues + 3 notes on the first sequence. Flip columns — they stay on their steps.";
  }

  const setCue = (sequenceId: string, stepIndex: number, patch: Partial<CueMark>) => {
    const i = cues.findIndex((c) => c.sequenceId === sequenceId && c.stepIndex === stepIndex);
    if (i === -1) cues = [...cues, { sequenceId, stepIndex, timestamp: "", text: "", ...patch }];
    else cues = cues.map((c, j) => (j === i ? { ...c, ...patch } : c));
  };
  const addNote = (sequenceId: string, stepIndex: number, pinned: boolean) => {
    const id = crypto.randomUUID();
    notes = [...notes, { id, sequenceId, stepIndex, pinned, text: "" }];
    return id;
  };
  const setNote = (id: string, patch: { text?: string }) =>
    (notes = notes.map((n) => (n.id === id ? { ...n, ...patch } : n)));
  const removeNote = (id: string) => (notes = notes.filter((n) => n.id !== id));

  async function loadSequences() {
    if (isLoading) return;
    isLoading = true;
    status = "Loading public sequences from Firebase…";
    try {
      const loader = new PublicSequencesLoader();
      const metadata = await loader.loadSequenceMetadata();

      const hydrated: SequenceData[] = [];
      for (const meta of metadata.slice(0, 40)) {
        const data = await loader.loadFullSequenceData(meta.word);
        if (data?.steps?.length) hydrated.push(data);
        if (hydrated.length >= 24) break;
      }
      sequences = pickShowcase(hydrated);
      const lengths = sequences.map((s) => s.steps.length).join(", ");
      status = sequences.length
        ? `Loaded ${sequences.length} sequences (step counts: ${lengths}).`
        : "No public sequences with steps found.";
    } catch (err) {
      status = `Load error: ${String(err)}`;
      console.error("[choreo-sheet harness] load failed:", err);
    } finally {
      isLoading = false;
    }
  }

  // Bias the showcase toward proving wrap + pagination: include an 8-count and a
  // 16-count (or the longest >8 available) up front, then fill to ~8 with a
  // length spread.
  function pickShowcase(all: SequenceData[]): SequenceData[] {
    const chosen: SequenceData[] = [];
    const eight = all.find((s) => s.steps.length === 8);
    if (eight) chosen.push(eight);
    const long = all.find((s) => s.steps.length === 16) ?? all.find((s) => s.steps.length > 8);
    if (long && !chosen.includes(long)) chosen.push(long);
    for (const s of all) {
      if (chosen.length >= 8) break;
      if (!chosen.includes(s)) chosen.push(s);
    }
    return chosen;
  }

  async function exportPdf() {
    if (isExporting || sequences.length === 0) return;
    isExporting = true;
    exportProgress = { done: 0, total: 0 };
    try {
      // Throwaway sheet built from the loaded sequences' ids; the hydrated
      // sequences are passed directly so no library round-trip is needed.
      const sheet = {
        ...createEmptyChoreoSheet("test", "Harness"),
        sequenceIds: sequences.map((s) => s.id),
      };
      await downloadChoreoSheetPDF(sheet, sequences, "choreo-sheet-harness.pdf", (done, total) => {
        exportProgress = { done, total };
      });
      status = "PDF exported.";
    } catch (err) {
      status = `Export error: ${String(err)}`;
      console.error("[choreo-sheet harness] export failed:", err);
    } finally {
      isExporting = false;
      exportProgress = null;
    }
  }
</script>

<svelte:head><title>Choreo Sheet — Harness</title></svelte:head>

<div class="harness">
  <header>
    <h1>Choreo Sheet — Harness</h1>
    <p class="meta">
      {sequences.length} sequences → {pages.length} page(s) · cell {geo.cellSizePt.toFixed(1)}pt
      ({geo.columns}×{geo.rows} per page)
      {#if sequences.length}
        · ids: {sequences.map((s) => s.id ?? "∅").join(", ")}
      {/if}
    </p>
    <div class="controls">
      <button onclick={loadSequences} disabled={isLoading}>
        {isLoading ? "Loading…" : "Load Sequences"}
      </button>
      <button onclick={exportPdf} disabled={isExporting || sequences.length === 0}>
        {#if isExporting && exportProgress}
          Exporting… {exportProgress.done} / {exportProgress.total}
        {:else if isExporting}
          Exporting…
        {:else}
          Export PDF
        {/if}
      </button>
      <button onclick={seedAnnotations} disabled={sequences.length === 0}>Seed annotations</button>
      <button onclick={() => (annotated = !annotated)} disabled={sequences.length === 0}>
        {annotated ? "Annotated" : "Study"} view
      </button>
      <button
        class:active={reading}
        onclick={() => (reading = !reading)}
        disabled={sequences.length === 0}
      >
        {reading ? "Reading" : "Page"} mode
      </button>
      {#each [4, 6, 8] as c (c)}
        <button
          class:active={columns === c}
          onclick={() => (columns = c)}
          disabled={sequences.length === 0}
        >
          {c} cols
        </button>
      {/each}
    </div>
    <p class="status">{status}</p>
  </header>

  {#if reading}
    <div class="reading-stage" bind:clientWidth={stageWidth}>
      <SheetReadingView
        bands={readingBands}
        columns={readingColumns}
        {layout}
        sheetName="Harness"
        header={annotations.header}
        {sequenceNames}
        onSetCue={setCue}
        onAddNote={addNote}
        onSetNote={setNote}
        onRemoveNote={removeNote}
      />
    </div>
  {:else if annotated}
    <SheetPreviewPages
      {pages}
      {geo}
      {layout}
      {bandPages}
      {annotations}
      sheetName="Harness"
      onSetCue={setCue}
      onAddNote={addNote}
      onSetNote={setNote}
      onRemoveNote={removeNote}
    />
  {:else}
    <SheetPreviewPages {pages} {geo} {layout} />
  {/if}
</div>

<style>
  .harness {
    min-height: 100vh;
    padding: 24px;
    /* On a phone the harness must not add chrome the real stage doesn't have,
       or the measured cell size lies about the app. */
    @media (max-width: 700px) {
      padding: 8px;
    }
    background: var(--theme-bg, #14141f);
    color: var(--theme-text, #ffffff);
    font-family: system-ui, sans-serif;
  }

  h1 {
    margin: 0 0 4px;
    font-size: var(--font-size-xl, 22px);
  }

  .meta {
    margin: 0 0 16px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    font-size: var(--font-size-min, 14px);
  }

  .controls {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
    margin-bottom: 12px;
  }

  button {
    min-height: 44px;
    padding: 0 20px;
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    color: var(--theme-text, #ffffff);
    background: var(--theme-accent-bg, rgba(100, 180, 255, 0.22));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.18));
    border-radius: 8px;
    cursor: pointer;
    transition: background 0.15s ease, transform 0.15s ease;
  }

  button:hover:not(:disabled) {
    background: var(--theme-accent-bg-strong, rgba(100, 180, 255, 0.35));
    transform: translateY(-1px);
  }

  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  button.active {
    background: var(--theme-accent-bg-strong, rgba(100, 180, 255, 0.45));
    border-color: var(--theme-accent, rgba(100, 180, 255, 0.8));
  }

  .reading-stage {
    container-type: inline-size;
    container-name: reading-stage;
    width: 100%;
  }

  .status {
    margin: 0 0 20px;
    font-size: var(--font-size-compact, 13px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
  }
</style>
