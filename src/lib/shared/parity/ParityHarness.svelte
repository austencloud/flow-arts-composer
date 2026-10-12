<script lang="ts">
  /**
   * Reusable parity test shell. Owns the generic UI/state — Run button, running
   * state, a determinate progress bar fed by onProgress, the verdict banner with
   * per-gate chips, an incrementally-growing N-column result grid, the summary
   * JSON block, and the window.__<resultKey> mirror. Pages supply only a controls
   * snippet and a run() that returns a ParityRun.
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

  function attach(node: HTMLDivElement, canvas: HTMLCanvasElement) {
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
</script>

<div class="page">
  <h1>{title}</h1>
  <p class="sub">{description}</p>

  <div class="controls">
    {@render controls?.()}
    <button onclick={start} disabled={running}
      >{running ? "running…" : "Run parity"}</button
    >
  </div>

  {#if progress}
    <div class="progress">
      <div class="bar">
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

  {#if verdict && verdict.verdict}
    <div
      class="verdict"
      class:pass={verdict.verdict === "PASS"}
      class:fail={verdict.verdict === "FAIL"}
    >
      <span class="v">{verdict.verdict}</span>: {verdict.summary}
      {#if verdict.gates.length}
        <div class="gates">
          {#each verdict.gates as g (g.label)}
            <span class="gate" class:gp={g.pass} class:gf={!g.pass}
              >{g.label}: {g.detail}</span
            >
          {/each}
        </div>
      {/if}
    </div>
  {/if}

  {#if verdict}
    <pre class="json" id="parity-summary">{JSON.stringify(
        verdict.result,
        null,
        2
      )}</pre>
  {/if}

  {#each rows as r (r.id)}
    <div class="row" class:bad={r.bad || !!r.error}>
      <div class="row-head">
        {r.title}
        {#each Object.entries(r.metrics) as [k, v] (k)}<span class="metric">
            · {k} {typeof v === "number" ? v.toFixed(3) : v}</span
          >{/each}
        {#if r.error}<span class="err"> · {r.error}</span>{/if}
      </div>
      <div class="cells">
        {#each r.cells as cell (cell.label)}
          <figure>
            <div use:attach={cell.canvas}></div>
            <figcaption>{cell.label}</figcaption>
          </figure>
        {/each}
      </div>
    </div>
  {/each}
</div>

<style>
  .page {
    padding: 20px;
    background: #0d0d14;
    color: #eee;
    min-height: 100vh;
    font-family: system-ui, sans-serif;
  }
  h1 {
    margin: 0 0 4px;
  }
  .sub {
    color: #8a8aa0;
    margin: 0 0 16px;
    max-width: 70ch;
    font-size: 13px;
  }
  .controls {
    display: flex;
    gap: 14px;
    align-items: center;
    flex-wrap: wrap;
    margin-bottom: 12px;
  }
  button {
    background: #4c6ef5;
    color: #fff;
    border: none;
    border-radius: 6px;
    padding: 8px 18px;
    font-size: 14px;
    cursor: pointer;
  }
  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .progress {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 12px;
  }
  .bar {
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
  .verdict {
    font-weight: 700;
    font-size: 18px;
    padding: 10px 14px;
    border-radius: 8px;
    margin-bottom: 12px;
  }
  .verdict.pass {
    background: #133a1f;
    color: #51cf66;
  }
  .verdict.fail {
    background: #3a1313;
    color: #ff6b6b;
  }
  .verdict .v {
    letter-spacing: 0.05em;
  }
  .gates {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin-top: 6px;
  }
  .gate {
    font-weight: 600;
    font-size: 11px;
    padding: 3px 8px;
    border-radius: 5px;
  }
  .gate.gp {
    background: #133a1f;
    color: #51cf66;
  }
  .gate.gf {
    background: #3a1313;
    color: #ff6b6b;
  }
  .json {
    background: #0c0c10;
    border: 1px solid #2a2a33;
    border-radius: 8px;
    padding: 12px;
    font-size: 12px;
    color: #b8c0cc;
    max-height: 240px;
    overflow: auto;
    white-space: pre-wrap;
    margin-bottom: 16px;
  }
  .row {
    margin-bottom: 18px;
    border: 1px solid #2a2a40;
    border-radius: 8px;
    padding: 10px;
    background: #11111f;
  }
  .row.bad {
    border-color: #7a2a2a;
    background: #1a1113;
  }
  .row-head {
    font-family: monospace;
    font-size: 12px;
    color: #b0b0c8;
    margin-bottom: 8px;
  }
  .metric {
    color: #8a8aa0;
  }
  .err {
    color: #ff6b6b;
  }
  .cells {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
  }
  figure {
    margin: 0;
    width: 280px;
  }
  figure :global(canvas) {
    width: 280px;
    height: auto;
    border: 1px solid #333;
    background: #000;
  }
  figcaption {
    font-size: 11px;
    color: #888;
    margin-top: 4px;
    text-align: center;
  }
</style>
