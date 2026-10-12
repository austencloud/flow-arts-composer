<script lang="ts">
  /**
   * Card parity viewer — Pair + diff-strip layout. Same run engine as
   * ParityHarness (Run button, AbortController, determinate progress,
   * window.__<resultKey> mirror), but presented for sustained looking: each
   * card row shows the MAIN and WORKER framed cards side-by-side at a
   * comfortable size with a slim diff strip (heat thumbnail + % / maxΔ badges).
   * Raw JSON lives in a collapsed footer. Cell order convention: [0]=MAIN,
   * [1]=WORKER, [2]=DIFF.
   */
  import type {
    ParityRun,
    ParityRow,
    ParityProgress,
    ParityVerdict,
  } from "./parity-types";
  import type { Snippet } from "svelte";

  interface Props {
    title: string;
    description: string;
    resultKey: string;
    controls?: Snippet;
    run: () => ParityRun;
  }
  let { title, description, resultKey, controls, run }: Props = $props();

  let running = $state(false);
  let rows = $state<ParityRow[]>([]);
  let progress = $state<ParityProgress | null>(null);
  let verdict = $state<ParityVerdict | null>(null);
  let abort: AbortController | null = null;

  function attach(node: HTMLElement, canvas: HTMLCanvasElement) {
    canvas.style.width = "100%";
    canvas.style.height = "auto";
    canvas.style.display = "block";
    node.appendChild(canvas);
    return {
      destroy() {
        if (canvas.parentNode === node) node.removeChild(canvas);
      },
    };
  }

  async function start() {
    if (running) return;
    abort?.abort();
    abort = new AbortController();
    running = true;
    rows = [];
    verdict = null;
    progress = { phase: "starting" };
    (window as unknown as Record<string, unknown>)["__" + resultKey] =
      undefined;
    try {
      const pipeline = run();
      const v = await pipeline.run({
        signal: abort.signal,
        onProgress: (p) => (progress = p),
        addRow: (r) => (rows = [...rows, r]),
      });
      verdict = v;
      (window as unknown as Record<string, unknown>)["__" + resultKey] =
        v.result;
    } catch (err) {
      verdict = {
        verdict: "FAIL",
        summary: "error: " + (err instanceof Error ? err.message : String(err)),
        gates: [],
        result: { error: String(err) },
      };
      console.error("[parity:" + resultKey + "]", err);
    } finally {
      running = false;
      progress = null;
    }
  }

  let pct = $derived(
    progress?.total
      ? Math.round(((progress.current ?? 0) / progress.total) * 100)
      : null
  );

  // Pull the named metrics in a stable order for the strip.
  function metricEntries(r: ParityRow): [string, number][] {
    return Object.entries(r.metrics);
  }
</script>

<div class="page">
  <!-- Sticky command bar -->
  <header class="bar">
    <div class="bar-left">
      <h1>{title}</h1>
      {#if verdict && verdict.verdict}
        <span
          class="pill"
          class:pass={verdict.verdict === "PASS"}
          class:fail={verdict.verdict === "FAIL"}
        >
          <span class="dot"></span>{verdict.verdict}
        </span>
        <span class="summary">{verdict.summary}</span>
      {/if}
    </div>
    <div class="bar-right">
      {@render controls?.()}
      <button class="run" onclick={start} disabled={running}
        >{running ? "running…" : "Run parity"}</button
      >
    </div>
  </header>

  {#if progress}
    <div class="progress">
      <div class="track">
        <div
          class="fill"
          class:indeterminate={pct === null}
          style={pct !== null ? `width:${pct}%` : ""}
        ></div>
      </div>
      <span class="ptext">
        {progress.phase}{#if progress.total}
          {progress.current ?? 0}/{progress.total}{/if}{#if progress.detail}: {progress.detail}{/if}
      </span>
    </div>
  {/if}

  {#if verdict && verdict.gates.length}
    <div class="gates">
      {#each verdict.gates as g (g.label)}
        <span class="gate" class:gp={g.pass} class:gf={!g.pass}
          >{g.label}: {g.detail}</span
        >
      {/each}
    </div>
  {/if}

  <p class="sub">{description}</p>

  <div class="rows">
    {#each rows as r (r.id)}
      <section class="card-row" class:bad={r.bad || !!r.error}>
        <div class="card-row-head">{r.title}</div>
        {#if r.error}
          <div class="row-error">{r.error}</div>
        {:else}
          <div class="pair">
            {#if r.cells[0]}
              <figure class="card-frame">
                <div class="card-canvas" use:attach={r.cells[0].canvas}></div>
                <figcaption>{r.cells[0].label}</figcaption>
              </figure>
            {/if}
            {#if r.cells[1]}
              <figure class="card-frame">
                <div class="card-canvas" use:attach={r.cells[1].canvas}></div>
                <figcaption>{r.cells[1].label}</figcaption>
              </figure>
            {/if}
            <div class="diff-strip">
              {#each metricEntries(r) as [k, v] (k)}
                <div class="metric">
                  <span class="mk">{k}</span><span class="mv"
                    >{typeof v === "number" ? v.toFixed(3) : v}</span
                  >
                </div>
              {/each}
              {#if r.cells[2]}
                <figure class="diff-thumb">
                  <div class="diff-canvas" use:attach={r.cells[2].canvas}></div>
                  <figcaption>{r.cells[2].label}</figcaption>
                </figure>
              {/if}
            </div>
          </div>
        {/if}
      </section>
    {/each}
  </div>

  {#if verdict}
    <details class="json-wrap">
      <summary>raw json</summary>
      <pre class="json" id="parity-summary">{JSON.stringify(
          verdict.result,
          null,
          2
        )}</pre>
    </details>
  {/if}
</div>

<style>
  .page {
    padding: 0 0 32px;
    background: #0d0d14;
    color: #eee;
    min-height: 100vh;
    font-family: system-ui, sans-serif;
  }
  .bar {
    position: sticky;
    top: 0;
    z-index: 5;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 12px 20px;
    background: rgba(13, 13, 20, 0.92);
    backdrop-filter: blur(8px);
    border-bottom: 1px solid #21212e;
    flex-wrap: wrap;
  }
  .bar-left {
    display: flex;
    align-items: center;
    gap: 14px;
    flex-wrap: wrap;
  }
  .bar-right {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }
  h1 {
    margin: 0;
    font-size: 18px;
    font-weight: 700;
  }
  .pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-weight: 700;
    font-size: 13px;
    letter-spacing: 0.04em;
    padding: 4px 12px;
    border-radius: 999px;
  }
  .pill .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: currentColor;
  }
  .pill.pass {
    background: #103021;
    color: #51cf66;
  }
  .pill.fail {
    background: #341414;
    color: #ff6b6b;
  }
  .summary {
    font-size: 13px;
    color: #b0b0c8;
    font-variant-numeric: tabular-nums;
  }
  .run {
    background: #4c6ef5;
    color: #fff;
    border: none;
    border-radius: 8px;
    padding: 8px 18px;
    font-size: 14px;
    cursor: pointer;
  }
  .run:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .progress {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 20px 0;
  }
  .track {
    flex: 1;
    height: 8px;
    background: #15152a;
    border-radius: 4px;
    overflow: hidden;
  }
  .fill {
    height: 100%;
    background: #4c6ef5;
    transition: width var(--duration-normal) var(--ease-standard);
  }
  .fill.indeterminate {
    width: 35%;
    animation: slide 1.1s ease-in-out infinite;
  }
  @keyframes slide {
    0% {
      margin-left: -35%;
    }
    100% {
      margin-left: 100%;
    }
  }
  .ptext {
    font-family: monospace;
    font-size: 12px;
    color: #ffd43b;
    white-space: nowrap;
  }
  .gates {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    padding: 10px 20px 0;
  }
  .gate {
    font-weight: 600;
    font-size: 11px;
    padding: 3px 8px;
    border-radius: 5px;
    font-variant-numeric: tabular-nums;
  }
  .gate.gp {
    background: #103021;
    color: #51cf66;
  }
  .gate.gf {
    background: #341414;
    color: #ff6b6b;
  }
  .sub {
    color: #8a8aa0;
    margin: 10px 20px 0;
    max-width: 80ch;
    font-size: 12px;
  }
  .rows {
    display: flex;
    flex-direction: column;
    gap: 18px;
    padding: 18px 20px 0;
  }
  .card-row {
    border: 1px solid #20202e;
    border-radius: 12px;
    padding: 14px 16px;
    background: #101019;
  }
  .card-row.bad {
    border-color: #7a2a2a;
    background: #1a1113;
  }
  .card-row-head {
    font-size: 13px;
    color: #c5c5dc;
    margin-bottom: 10px;
    font-weight: 600;
  }
  .row-error {
    color: #ff6b6b;
    font-family: monospace;
    font-size: 12px;
  }
  .pair {
    display: flex;
    gap: 18px;
    align-items: flex-start;
    flex-wrap: wrap;
  }
  .card-frame {
    margin: 0;
    flex: 1 1 280px;
    max-width: 360px;
    min-width: 220px;
  }
  /* Reserve the card box up front (MPC poker aspect) so the async canvas paint
     never reflows neighbors. */
  .card-canvas {
    aspect-ratio: 822 / 1122;
    width: 100%;
    border-radius: 6px;
    overflow: hidden;
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.45);
    background: #000;
  }
  .diff-strip {
    flex: 0 0 150px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .metric {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    font-size: 12px;
    background: #16161f;
    border: 1px solid #24243a;
    border-radius: 6px;
    padding: 5px 9px;
  }
  .mk {
    color: #8a8aa0;
  }
  .mv {
    color: #e6e6f0;
    font-variant-numeric: tabular-nums;
  }
  .diff-thumb {
    margin: 0;
  }
  .diff-canvas {
    aspect-ratio: 822 / 1122;
    width: 100%;
    border-radius: 4px;
    overflow: hidden;
    border: 1px solid #2a2a3a;
    background: #000;
  }
  figcaption {
    font-size: 11px;
    color: #8a8aa0;
    margin-top: 5px;
    text-align: center;
  }
  .json-wrap {
    margin: 22px 20px 0;
  }
  .json-wrap summary {
    cursor: pointer;
    color: #8a8aa0;
    font-size: 12px;
    user-select: none;
  }
  .json {
    background: #0c0c10;
    border: 1px solid #2a2a33;
    border-radius: 8px;
    padding: 12px;
    font-size: 12px;
    color: #b8c0cc;
    max-height: 360px;
    overflow: auto;
    white-space: pre-wrap;
    margin-top: 8px;
  }
</style>
