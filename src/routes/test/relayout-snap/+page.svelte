<script lang="ts">
  // Throwaway harness to reproduce + measure the ChoreoCard "instant layout
  // snap" when toggling Show-start-placement (and column count). Renders the REAL
  // ChoreoCard in a fixed centered pane (interactive contain sizing, NOT
  // forceContain) so the same relayoutCells + container-resize path the download
  // card uses runs here. A DevTools probe (window.__snap) samples the
  // preview-stack box + every cell rect across the toggle each animation frame.
  import ChoreoCard from "$lib/shared/sequence-viewer/components/ChoreoCard.svelte";
  import { loadCatalogs, loadCatalogSequences } from "$lib/features/choreo-card/services/catalog-loader";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";

  let seq = $state<SequenceData | null>(null);
  let err = $state<string>("");
  let includeStart = $state(true);
  let cols = $state<number | null>(null);
  let startLayout = $state<"row" | "column">("column");

  $effect(() => {
    (async () => {
      try {
        const cats = await loadCatalogs();
        if (!cats.length) { err = "no catalogs"; return; }
        // Prefer a 4-step sequence (matches the DJ screenshot: start col + QR + reflow)
        for (const c of cats) {
          const seqs = await loadCatalogSequences(c.id);
          const four = seqs.find((s) => (s.steps?.length ?? 0) === 4)
            ?? seqs.find((s) => (s.steps?.length ?? 0) >= 4 && (s.steps?.length ?? 0) <= 6);
          if (four) { seq = four; return; }
        }
        err = "no 4-6 step sequence found";
      } catch (e) {
        err = String(e);
      }
    })();
  });

  // window.__snap.run() toggles includeStart and samples rects every rAF for
  // ~700ms, returning { preview: [...frames], reflowingCells, summary }.
  function rects() {
    const stack = document.querySelector(".preview-stack") as HTMLElement | null;
    const cells = Array.from(document.querySelectorAll(".preview-stack .cell-flip-wrapper, .preview-stack .pictograph-cell")) as HTMLElement[];
    return {
      t: performance.now(),
      stack: stack ? snap(stack.getBoundingClientRect()) : null,
      cells: cells.slice(0, 40).map((c) => snap(c.getBoundingClientRect())),
    };
  }
  function snap(r: DOMRect) {
    return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) };
  }

  if (typeof window !== "undefined") {
    (window as any).__snap = {
      toggleStart: () => { includeStart = !includeStart; },
      setCols: (n: number | null) => { cols = n; },
      async run(action: "start" | "cols" = "start", colTo: number | null = 2) {
        const frames: any[] = [];
        const before = rects();
        // Trigger the change
        if (action === "start") includeStart = !includeStart;
        else cols = colTo;
        const deadline = performance.now() + 750;
        await new Promise<void>((resolve) => {
          function tick() {
            frames.push(rects());
            if (performance.now() < deadline) requestAnimationFrame(tick);
            else resolve();
          }
          requestAnimationFrame(tick);
        });
        const after = frames[frames.length - 1];
        // Did the stack box interpolate, or jump in one frame?
        const stackW = frames.map((f) => f.stack?.w).filter((v) => v != null);
        const distinctStackW = [...new Set(stackW)];
        const stackH = frames.map((f) => f.stack?.h).filter((v) => v != null);
        const distinctStackH = [...new Set(stackH)];
        return {
          action,
          beforeStack: before.stack,
          afterStack: after.stack,
          frameCount: frames.length,
          distinctStackWidths: distinctStackW.length,
          distinctStackHeights: distinctStackH.length,
          stackWidthSeries: distinctStackW,
          stackHeightSeries: distinctStackH,
          // First cell position series (does it interpolate?)
          firstCellYSeries: [...new Set(frames.map((f) => f.cells[0]?.y).filter((v) => v != null))],
          firstCellWSeries: [...new Set(frames.map((f) => f.cells[0]?.w).filter((v) => v != null))],
        };
      },
    };
  }
</script>

<svelte:head><title>Relayout Snap Harness</title></svelte:head>

<div class="harness">
  <div class="controls">
    <button id="toggle-start" onclick={() => (includeStart = !includeStart)}>
      Start: {includeStart ? "ON" : "OFF"}
    </button>
    <button onclick={() => (startLayout = startLayout === "column" ? "row" : "column")}>
      Layout: {startLayout}
    </button>
    <button onclick={() => (cols = cols === null ? 2 : cols === 2 ? 4 : null)}>
      Cols: {cols ?? "auto"}
    </button>
    <span class="status">{seq ? `seq ${seq.id} · ${seq.steps?.length} steps` : err || "loading…"}</span>
  </div>

  <div class="pane">
    {#if seq}
      <ChoreoCard
        sequence={seq}
        includeStartPlacement={includeStart}
        columnCount={cols}
        startPlacementLayoutOverride={startLayout}
        showQRCode={true}
        showWord={true}
        forceContain={false}
      />
    {/if}
  </div>
</div>

<style>
  .harness {
    min-height: 100vh;
    background: #0d0e12;
    color: #e0e0e0;
    font-family: system-ui, sans-serif;
    padding: 16px;
    box-sizing: border-box;
  }
  .controls { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-bottom: 14px; }
  button {
    min-height: 44px; padding: 8px 16px; border-radius: 8px;
    border: 1px solid #3a3d44; background: #23262d; color: #fff; font: inherit; cursor: pointer;
  }
  button:hover { background: #2c2f37; }
  .status { font-size: 13px; color: #9aa0a6; }
  /* Fixed centered pane so the card sizes via contain and we can see it move. */
  .pane {
    width: 520px;
    height: 640px;
    margin: 0 auto;
    border: 1px dashed #333;
    display: flex;
    align-items: center;
    justify-content: center;
  }
</style>
