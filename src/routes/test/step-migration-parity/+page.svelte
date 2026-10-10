<script lang="ts">
  /**
   * StepData -> Step Migration Parity Harness (manual browser front-end)
   *
   * Purpose: prove a data-model / derivation refactor (the StepData->Step
   * unification, or any hydrate/deriveSteps/render change) does NOT move a single
   * pixel of any pictograph. This is the safety net that turns the migration from
   * "multi-week and scary" into "codemod it, run this, read the number."
   *
   * The render+hash+diff pipeline lives in the SHARED core
   * ($lib/shared/render/parity/render-parity-core) — the same code the
   * automated wave gate runs (tests/render-parity/, npm run
   * test:render-parity[:capture|:compare]). This page is the interactive
   * front-end: live sequences from the public gallery, IndexedDB baseline,
   * visual drift triptychs.
   *
   * How it works:
   *   1. Capture Baseline — load N real public sequences, FREEZE them in
   *      IndexedDB, then render every step through the real pipeline
   *      (hydrate -> step -> PictographData -> prepare -> Canvas2DDirectRenderer)
   *      and store each render as lossless ImageData.
   *   2. (do the migration — change types / hydrate / render code)
   *   3. Compare — re-run the SAME frozen inputs through the pipeline with the
   *      now-current code and pixelmatch each render against its baseline. Frozen
   *      inputs guarantee identical source data before/after; the only variable is
   *      the code. Any non-zero diff is a real regression, shown baseline|now|diff.
   *   4. Self-check — render the set twice in one pass to prove the renderer is
   *      deterministic (so a post-migration diff is signal, not AA noise).
   */
  import { onMount } from "svelte";
  import { PublicSequencesLoader } from "#lib/shared/browse/services/public-sequences-loader.js";
  import {
    renderStepSet,
    diffImageData,
    imageDataToPngDataUrl,
    PARITY_SIZE as SIZE,
    DRIFT_THRESHOLD,
    PIPELINE_VERSION,
    type RenderedStep,
  } from "#lib/shared/render/parity/render-parity-core.js";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";

  const DEFAULT_COUNT = 25;

  let seqCount = $state(DEFAULT_COUNT);
  let status = $state(
    "Idle. Capture a baseline before migrating, compare after."
  );
  let busy = $state(false);
  let progress = $state({ current: 0, total: 0 });
  let baselineInfo = $state<{
    sequences: number;
    steps: number;
    capturedAt: string;
  } | null>(null);

  type DriftRow = {
    key: string;
    word: string;
    stepIndex: number;
    letter: string;
    diffPercent: number;
    baselineUrl: string;
    currentUrl: string;
    diffUrl: string;
  };
  let compareSummary = $state<{
    steps: number;
    worst: number;
    changed: number;
    capturedAt: string;
  } | null>(null);
  let driftRows = $state<DriftRow[]>([]);
  let selfCheck = $state<{ steps: number; worst: number } | null>(null);

  // ─── IndexedDB (single baseline record) ────────────────────────────────────
  const DB_NAME = "step-migration-parity";
  const STORE = "baseline";
  const REC_KEY = "current";

  function openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  type BaselineRecord = {
    inputs: SequenceData[];
    size: number;
    images: Record<string, ImageData>;
    capturedAt: string;
    /** Render-pipeline version the baseline was captured under (v1 baselines
     * predate the field — arrows/props/reversal dots didn't render then). */
    pipelineVersion?: number;
  };

  async function saveBaseline(rec: BaselineRecord): Promise<void> {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(rec, REC_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }

  async function loadBaseline(): Promise<BaselineRecord | null> {
    const db = await openDb();
    const rec = await new Promise<BaselineRecord | null>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(REC_KEY);
      req.onsuccess = () => resolve((req.result as BaselineRecord) ?? null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return rec;
  }

  // ─── Render pipeline (SHARED core — identical for baseline + compare, and
  // identical to the automated wave gate in tests/render-parity/) ─────────────

  async function renderSet(inputs: SequenceData[]): Promise<RenderedStep[]> {
    progress = { current: 0, total: 0 };
    return renderStepSet(inputs, {
      size: SIZE,
      onProgress: (current, total) => {
        progress = { current, total };
      },
    });
  }

  function diff(
    a: ImageData,
    b: ImageData
  ): { percent: number; diffUrl: string } {
    const d = diffImageData(a, b);
    return {
      percent: d.percent,
      diffUrl: d.diffImage ? imageDataToPngDataUrl(d.diffImage) : "",
    };
  }

  const imageDataToUrl = imageDataToPngDataUrl;


  async function loadInputs(n: number): Promise<SequenceData[]> {
    const loader = new PublicSequencesLoader();
    const meta = await loader.loadSequenceMetadata();
    // Spread the sample across the whole corpus for letter/type/grid diversity,
    // deterministically (same indices every capture).
    const take = Math.min(n, meta.length);
    const stride = take > 0 ? meta.length / take : 1;
    const picked = Array.from(
      { length: take },
      (_, i) => meta[Math.min(Math.floor(i * stride), meta.length - 1)]!
    );
    const inputs: SequenceData[] = [];
    for (let i = 0; i < picked.length; i++) {
      status = `Loading sequence ${i + 1}/${picked.length}: ${picked[i]!.word}...`;
      const full = await loader.loadFullSequenceData(picked[i]!.word);
      if (full && full.steps && full.steps.length > 0) inputs.push(full);
    }
    return inputs;
  }

  // ─── Actions ────────────────────────────────────────────────────────────────

  async function captureBaseline() {
    if (busy) return;
    busy = true;
    driftRows = [];
    compareSummary = null;
    try {
      status = "Loading real sequences to freeze as the baseline input set...";
      const inputs = await loadInputs(seqCount);
      if (inputs.length === 0)
        throw new Error("No public sequences with steps loaded.");
      status = `Rendering baseline for ${inputs.length} sequences...`;
      const rendered = await renderSet(inputs);
      const images: Record<string, ImageData> = {};
      for (const r of rendered) images[r.key] = r.image;
      const capturedAt = new Date().toISOString();
      await saveBaseline({
        inputs,
        size: SIZE,
        images,
        capturedAt,
        pipelineVersion: PIPELINE_VERSION,
      });
      baselineInfo = {
        sequences: inputs.length,
        steps: rendered.length,
        capturedAt,
      };
      status = `Baseline captured: ${rendered.length} pictographs from ${inputs.length} sequences. Now do the migration, then Compare.`;
    } catch (e) {
      status = `Capture failed: ${e instanceof Error ? e.message : String(e)}`;
    } finally {
      busy = false;
    }
  }

  async function compare() {
    if (busy) return;
    busy = true;
    driftRows = [];
    compareSummary = null;
    try {
      const base = await loadBaseline();
      if (!base)
        throw new Error(
          "No baseline captured yet. Capture one first (pre-migration)."
        );
      if ((base.pipelineVersion ?? 1) !== PIPELINE_VERSION) {
        throw new Error(
          `Baseline was captured under render-pipeline v${base.pipelineVersion ?? 1}, current is v${PIPELINE_VERSION} — recapture before comparing.`
        );
      }
      status = "Re-rendering the frozen input set with current code...";
      const rendered = await renderSet(base.inputs);
      const rows: DriftRow[] = [];
      let worst = 0;
      let changed = 0;
      for (const r of rendered) {
        const baseImg = base.images[r.key];
        if (!baseImg) continue;
        const d = diff(baseImg, r.image);
        worst = Math.max(worst, d.percent);
        if (d.percent > DRIFT_THRESHOLD) {
          changed++;
          rows.push({
            key: r.key,
            word: r.word,
            stepIndex: r.stepIndex,
            letter: r.letter,
            diffPercent: d.percent,
            baselineUrl: imageDataToUrl(baseImg),
            currentUrl: imageDataToUrl(r.image),
            diffUrl: d.diffUrl,
          });
        }
      }
      rows.sort((a, b) => b.diffPercent - a.diffPercent);
      driftRows = rows;
      compareSummary = {
        steps: rendered.length,
        worst,
        changed,
        capturedAt: base.capturedAt,
      };
      status =
        changed === 0
          ? `PARITY: ${rendered.length} pictographs, 0 drifted (worst ${worst}%). Migration is pixel-clean.`
          : `DRIFT: ${changed}/${rendered.length} pictographs changed (worst ${worst}%). See below.`;
    } catch (e) {
      status = `Compare failed: ${e instanceof Error ? e.message : String(e)}`;
    } finally {
      busy = false;
    }
  }

  // Prove the renderer is deterministic: render the frozen set twice, diff pairs.
  async function runSelfCheck() {
    if (busy) return;
    busy = true;
    selfCheck = null;
    try {
      const base = await loadBaseline();
      const inputs = base?.inputs ?? (await loadInputs(Math.min(seqCount, 8)));
      if (inputs.length === 0) throw new Error("No inputs to self-check.");
      status =
        "Self-check: rendering the set twice to measure renderer determinism...";
      const a = await renderSet(inputs);
      const b = await renderSet(inputs);
      const bByKey = new Map(b.map((r) => [r.key, r.image]));
      let worst = 0;
      for (const r of a) {
        const other = bByKey.get(r.key);
        if (!other) continue;
        worst = Math.max(worst, diff(r.image, other).percent);
      }
      selfCheck = { steps: a.length, worst };
      status = `Self-check: ${a.length} pictographs, worst self-diff ${worst}% (${
        worst <= DRIFT_THRESHOLD
          ? "deterministic — drift will be real signal"
          : "NON-deterministic — tighten before trusting compare"
      }).`;
    } catch (e) {
      status = `Self-check failed: ${e instanceof Error ? e.message : String(e)}`;
    } finally {
      busy = false;
    }
  }

  onMount(async () => {
    const base = await loadBaseline();
    if (base) {
      baselineInfo = {
        sequences: base.inputs.length,
        steps: Object.keys(base.images).length,
        capturedAt: base.capturedAt,
      };
      status =
        "Baseline found. Do the migration, then Compare (or Capture again to reset).";
    }
  });
</script>

<svelte:head><title>Step Migration Parity Harness</title></svelte:head>

<div class="wrap">
  <h1>StepData → Step Migration Parity</h1>
  <p class="sub">
    Renders real sequences through the live pipeline (hydrate → prepare →
    <code>Canvas2DDirectRenderer</code>, arrows + props + reversal dots
    included) and pixel-diffs before/after a refactor. Frozen inputs = the only
    variable is your code. Same shared core as the automated wave gate (<code
      >npm run test:render-parity</code
    >).
  </p>

  <div class="controls">
    <label>
      Sequences
      <input
        type="number"
        min="1"
        max="120"
        bind:value={seqCount}
        disabled={busy}
      />
    </label>
    <button onclick={captureBaseline} disabled={busy}>
      {busy ? "Working…" : "1 · Capture Baseline"}
    </button>
    <button onclick={compare} disabled={busy}
      >2 · Compare (after migration)</button
    >
    <button class="ghost" onclick={runSelfCheck} disabled={busy}
      >Self-check determinism</button
    >
  </div>

  {#if busy && progress.total > 0}
    <div class="bar">
      <div
        class="fill"
        style="width:{(progress.current / progress.total) * 100}%"
      ></div>
    </div>
    <div class="muted">{progress.current}/{progress.total} pictographs</div>
  {/if}

  <div class="status">{status}</div>

  {#if baselineInfo}
    <div class="pill">
      Baseline: {baselineInfo.steps} pictographs · {baselineInfo.sequences} sequences
      · {baselineInfo.capturedAt.slice(0, 19).replace("T", " ")}
    </div>
  {/if}
  {#if selfCheck}
    <div
      class="pill"
      class:good={selfCheck.worst <= DRIFT_THRESHOLD}
      class:bad={selfCheck.worst > DRIFT_THRESHOLD}
    >
      Self-diff worst: {selfCheck.worst}% over {selfCheck.steps} renders
    </div>
  {/if}

  {#if compareSummary}
    <div
      class="summary"
      class:good={compareSummary.changed === 0}
      class:bad={compareSummary.changed > 0}
    >
      {#if compareSummary.changed === 0}
        ✅ PARITY — {compareSummary.steps} pictographs, 0 drifted (worst {compareSummary.worst}%).
        The refactor moved zero pixels.
      {:else}
        ⚠ DRIFT — {compareSummary.changed}/{compareSummary.steps} changed, worst {compareSummary.worst}%.
      {/if}
    </div>
  {/if}

  {#if driftRows.length > 0}
    <div class="grid">
      {#each driftRows as row (row.key)}
        <div class="drift">
          <div class="drift-head">
            <span class="w">{row.word}</span>
            <span class="s">step {row.stepIndex + 1} · {row.letter}</span>
            <span class="p">{row.diffPercent}%</span>
          </div>
          <div class="three">
            <figure>
              <img
                src={row.baselineUrl}
                alt="baseline"
                width={SIZE}
                height={SIZE}
              />
              <figcaption>baseline</figcaption>
            </figure>
            <figure>
              <img
                src={row.currentUrl}
                alt="current"
                width={SIZE}
                height={SIZE}
              />
              <figcaption>now</figcaption>
            </figure>
            <figure>
              <img src={row.diffUrl} alt="diff" width={SIZE} height={SIZE} />
              <figcaption>diff</figcaption>
            </figure>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .wrap {
    padding: 24px;
    background: #0d0d12;
    color: #e6e6ea;
    min-height: 100vh;
    font-family: system-ui, sans-serif;
  }
  h1 {
    margin: 0 0 4px;
    font-size: 20px;
  }
  .sub {
    color: #8a8a96;
    margin: 0 0 20px;
    max-width: 780px;
    line-height: 1.5;
  }
  code {
    background: #1c1c26;
    padding: 1px 5px;
    border-radius: 4px;
    font-size: 12px;
  }
  .controls {
    display: flex;
    gap: 12px;
    align-items: center;
    flex-wrap: wrap;
    margin-bottom: 16px;
  }
  label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: #8a8a96;
  }
  input[type="number"] {
    width: 72px;
    padding: 8px;
    background: #1c1c26;
    color: #fff;
    border: 1px solid #34343f;
    border-radius: 6px;
    font-variant-numeric: tabular-nums;
  }
  button {
    padding: 10px 16px;
    background: #4c6ef5;
    color: #fff;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
  }
  button:hover:not(:disabled) {
    background: #3b5bdb;
  }
  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  button.ghost {
    background: transparent;
    border: 1px solid #34343f;
    color: #c6c6d0;
  }
  .bar {
    height: 8px;
    background: #1c1c26;
    border-radius: 4px;
    overflow: hidden;
    margin: 8px 0 4px;
  }
  .fill {
    height: 100%;
    background: #51cf66;
    transition: width 0.15s;
  }
  .muted {
    color: #6a6a76;
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }
  .status {
    padding: 10px 14px;
    background: #16161e;
    border-radius: 6px;
    margin: 12px 0;
    font-size: 14px;
  }
  .pill {
    display: inline-block;
    padding: 5px 10px;
    background: #16161e;
    border: 1px solid #2a2a36;
    border-radius: 999px;
    font-size: 12px;
    margin: 0 8px 8px 0;
  }
  .pill.good,
  .summary.good {
    border-color: #2b8a3e;
    color: #69db7c;
  }
  .pill.bad,
  .summary.bad {
    border-color: #c92a2a;
    color: #ff8787;
  }
  .summary {
    padding: 14px 16px;
    border: 1px solid;
    border-radius: 8px;
    margin: 12px 0 20px;
    font-size: 15px;
  }
  .grid {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .drift {
    background: #12121a;
    border: 1px solid #2a2a36;
    border-radius: 8px;
    padding: 12px;
  }
  .drift-head {
    display: flex;
    gap: 12px;
    align-items: baseline;
    margin-bottom: 8px;
  }
  .drift-head .w {
    font-weight: 700;
    color: #4c6ef5;
    text-transform: uppercase;
  }
  .drift-head .s {
    color: #8a8a96;
    font-size: 13px;
  }
  .drift-head .p {
    margin-left: auto;
    color: #ff8787;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .three {
    display: flex;
    gap: 8px;
  }
  figure {
    margin: 0;
  }
  figure img {
    display: block;
    border: 1px solid #2a2a36;
    border-radius: 4px;
    background: #000;
    width: 224px;
    height: 224px;
  }
  figcaption {
    text-align: center;
    font-size: 11px;
    color: #6a6a76;
    margin-top: 4px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
</style>
