<!--
  Codex Wall Poster - dev tool (lives under (public)/codex so it inherits
  the bare public layout reset; the root app-shell layout would redirect a
  non-module URL via module-state).

  v1 of the printable-for-the-wall direction: the Level 1 guide's Double-Staff
  Codex, re-flowed from the guide's two 8.5×11 sheets into ONE tall single sheet
  you hang on a wall. Reuses the real render wholesale - CodexSheet → CodexBox →
  CodexCell, fed by the same SHEET1/SHEET2 defs the printable codex route
  uses - so cell content can never drift from the guide. The only new thing here
  is the tall single-column arrangement + an exact-height print page.

  This IS the prod home (/codex/poster); the toolbar is dev-only chrome to
  strip once the tall layout is dialed in.
-->
<script lang="ts">
  import CodexSheet from "../_components/CodexSheet.svelte";
  import { SHEET1, SHEET2, type CodexSheetDef } from "../_data/codex-groups";

  // The full codex = both guide sheets' types (1–2 then 3–6) stacked into one
  // continuous tall sheet. CodexSheet's `min-height: 11in` is only a floor, so
  // feeding it every type just grows the sheet taller - no page breaks.
  const poster: CodexSheetDef = {
    title: SHEET1.title,
    types: [...SHEET1.types, ...SHEET2.types],
  };

  let zoom = $state(0.5); // preview scale only - does not affect print output

  // Measure the rendered sheet so print produces ONE exact-height tall page
  // instead of a guessed size with trailing whitespace.
  let sheetEl = $state<HTMLElement | null>(null);
  let pageHeightIn = $state(11);
  const PAGE_WIDTH_IN = 8.5; // CodexSheet is authored at 8.5in wide

  function measure() {
    if (!sheetEl) return;
    // scrollHeight is the unscaled content height in CSS px; 96px = 1in.
    pageHeightIn = Math.ceil((sheetEl.scrollHeight / 96) * 100) / 100;
  }

  $effect(() => {
    if (!sheetEl) return;
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(sheetEl);
    return () => ro.disconnect();
  });

  function print() {
    window.print();
  }
</script>

<svelte:head>
  <title>Codex Wall Poster: dev tool</title>
  <meta name="robots" content="noindex, nofollow" />
  <!-- Exact tall single page for Print / Save PDF. -->
  {@html `<style>@media print { @page { size: ${PAGE_WIDTH_IN}in ${pageHeightIn}in; margin: 0; } }</style>`}
</svelte:head>

<div class="root">
  <header class="toolbar">
    <div class="title">
      <strong>Codex Wall Poster</strong>
      <span class="dev">dev tool · reuses codex render</span>
    </div>
    <div class="controls">
      <label class="ctl">
        Zoom
        <input type="range" min="0.2" max="1" step="0.05" bind:value={zoom} />
        <span class="val">{Math.round(zoom * 100)}%</span>
      </label>
      <span class="readout">{PAGE_WIDTH_IN}″ × {pageHeightIn}″ tall</span>
      <button class="print" onclick={print}>Print / Save PDF</button>
    </div>
  </header>

  <div class="stage">
    <div class="scaler" style:transform="scale({zoom})">
      <div class="sheet-frame" bind:this={sheetEl}>
        <CodexSheet sheet={poster} />
      </div>
    </div>
  </div>
</div>

<style>
  .root {
    min-height: 100vh;
    background: #3c4047;
    display: flex;
    flex-direction: column;
  }

  .toolbar {
    position: sticky;
    top: 0;
    z-index: 10;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
    padding: 0.75rem 1.25rem;
    background: rgba(18, 20, 24, 0.92);
    backdrop-filter: blur(8px);
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  .title {
    display: flex;
    flex-direction: column;
    line-height: 1.25;
    color: #fff;
    font: 0.95rem/1.25 system-ui, sans-serif;
  }
  .title .dev {
    font-size: 0.72rem;
    color: rgba(255, 255, 255, 0.5);
  }

  .controls {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  .ctl {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    color: rgba(255, 255, 255, 0.8);
    font: 0.8rem/1 system-ui, sans-serif;
  }
  .ctl .val {
    min-width: 3ch;
    font-variant-numeric: tabular-nums;
    text-align: right;
  }

  .readout {
    color: rgba(255, 255, 255, 0.6);
    font: 600 0.78rem/1 ui-monospace, monospace;
    font-variant-numeric: tabular-nums;
  }

  .print {
    font: 600 0.82rem/1 system-ui, sans-serif;
    padding: 0.55rem 1rem;
    border-radius: 999px;
    cursor: pointer;
    border: 1px solid #111;
    background: #111;
    color: #fff;
  }
  .print:hover {
    background: #000;
  }

  .stage {
    flex: 1;
    overflow: auto;
    padding: 2rem;
    display: flex;
    justify-content: center;
  }

  .scaler {
    transform-origin: top center;
  }

  .sheet-frame {
    position: relative;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45);
  }

  @media print {
    .toolbar,
    .stage {
      padding: 0;
    }
    .root {
      background: #fff;
    }
    .toolbar {
      display: none;
    }
    .scaler {
      transform: none !important;
    }
    .sheet-frame {
      box-shadow: none;
    }
  }
</style>
