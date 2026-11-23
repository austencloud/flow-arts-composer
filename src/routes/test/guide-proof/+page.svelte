<script lang="ts">
  /**
   * Guide proofing viewer — old v0.5 vs current Level 1 PDF, side by side,
   * page by page, for human parity proofing (NOT an automated pixel-diff gate;
   * the two PDFs have different page counts).
   *
   * Two modes:
   *   • side-by-side — one shared scroll container, two columns (scroll is
   *     inherently synced). A page-offset nudge shifts the right column down/up
   *     by whole pages so mismatched page counts can be aligned by hand.
   *   • overlay — superimpose a single page pair with an opacity slider to check
   *     one page's alignment precisely.
   *
   * Spec: docs/superpowers/specs/2026-06-21-guide-proof-reprint-loop-design.md
   */
  import { onMount, tick } from "svelte";
  import * as pdfjsLib from "pdfjs-dist";
  import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

  pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

  const OLD_URL = "/guides/_proof/level-1-v05.pdf";
  const NEW_URL = "/guides/level-1.pdf";
  const COLUMN_WIDTH = 460; // CSS px per page column

  type Doc = {
    pdf: import("pdfjs-dist").PDFDocumentProxy;
    pages: number;
    aspect: number; // height / width of page 1
  };

  let status = $state<"loading" | "ready" | "missing-old" | "error">("loading");
  let errorMsg = $state("");
  let oldDoc = $state<Doc | null>(null);
  let newDoc = $state<Doc | null>(null);

  let mode = $state<"side" | "overlay">("side");
  let offset = $state(0); // whole-page shift applied to the RIGHT (current) column
  let overlayPage = $state(1); // 1-based page index used in overlay mode
  let overlayOpacity = $state(0.5);

  const dpr = typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) : 1;

  async function loadDoc(url: string): Promise<Doc | null> {
    const head = await fetch(url, { method: "HEAD" });
    if (!head.ok) return null;
    const pdf = await pdfjsLib.getDocument({ url }).promise;
    const page1 = await pdf.getPage(1);
    const vp = page1.getViewport({ scale: 1 });
    return { pdf, pages: pdf.numPages, aspect: vp.height / vp.width };
  }

  onMount(async () => {
    try {
      const [o, n] = await Promise.all([loadDoc(OLD_URL), loadDoc(NEW_URL)]);
      if (!n) {
        status = "error";
        errorMsg = `Current PDF not found at ${NEW_URL}. Run \`npm run guide:pdf\` first.`;
        return;
      }
      newDoc = n;
      if (!o) {
        oldDoc = null;
        status = "missing-old";
        return;
      }
      oldDoc = o;
      status = "ready";
    } catch (e) {
      status = "error";
      errorMsg = e instanceof Error ? e.message : String(e);
    }
  });

  /** Render one page of a doc into a canvas at COLUMN_WIDTH, crisp for DPR. */
  async function renderPage(doc: Doc, pageNum: number, canvas: HTMLCanvasElement) {
    const page = await doc.pdf.getPage(pageNum);
    const base = page.getViewport({ scale: 1 });
    const scale = (COLUMN_WIDTH / base.width) * dpr;
    const vp = page.getViewport({ scale });
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = Math.floor(vp.width);
    canvas.height = Math.floor(vp.height);
    canvas.style.width = `${COLUMN_WIDTH}px`;
    canvas.style.height = `${Math.floor(vp.width === 0 ? 0 : (vp.height / vp.width) * COLUMN_WIDTH)}px`;
    await page.render({ canvas, canvasContext: ctx, viewport: vp }).promise;
  }

  /**
   * Lazy page action — renders the canvas when it scrolls near the viewport.
   * Guards against double-render and stale doc/pageNum via a rendered flag.
   */
  function lazyPage(canvas: HTMLCanvasElement, params: { doc: Doc; pageNum: number }) {
    let rendered = false;
    const root = canvas.closest(".scroll") as HTMLElement | null;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !rendered) {
          rendered = true;
          renderPage(params.doc, params.pageNum, canvas).catch((e) =>
            console.error("[guide-proof] render", params.pageNum, e),
          );
        }
      },
      { root, rootMargin: "600px 0px" },
    );
    io.observe(canvas);
    return { destroy: () => io.disconnect() };
  }

  /** Overlay mode renders eagerly into two stacked canvases whenever page changes. */
  let overlayOldCanvas = $state<HTMLCanvasElement | null>(null);
  let overlayNewCanvas = $state<HTMLCanvasElement | null>(null);

  async function renderOverlay() {
    await tick();
    if (oldDoc && overlayOldCanvas && overlayPage <= oldDoc.pages) {
      await renderPage(oldDoc, overlayPage, overlayOldCanvas);
    }
    if (newDoc && overlayNewCanvas && overlayPage <= newDoc.pages) {
      await renderPage(newDoc, overlayPage, overlayNewCanvas);
    }
  }

  $effect(() => {
    if (mode === "overlay" && status === "ready") {
      overlayPage; // track
      renderOverlay();
    }
  });

  const maxPages = $derived(Math.max(oldDoc?.pages ?? 0, newDoc?.pages ?? 0));
  // Right column visual shift: offset whole pages * (page height + gap).
  const rightShiftPx = $derived(
    (newDoc ? newDoc.aspect * COLUMN_WIDTH + 16 : 0) * offset,
  );
</script>

<svelte:head><title>Guide Proof — old v0.5 vs current</title></svelte:head>

<div class="page">
  <header class="bar">
    <div class="left">
      <h1>Guide Proof</h1>
      <span class="sub">Level 1 — old v0.5 vs current</span>
      {#if oldDoc && newDoc}
        <span class="counts">old {oldDoc.pages}p · current {newDoc.pages}p</span>
      {/if}
    </div>
    <div class="right">
      <div class="seg">
        <button class:active={mode === "side"} onclick={() => (mode = "side")}>Side by side</button>
        <button class:active={mode === "overlay"} onclick={() => (mode = "overlay")} disabled={!oldDoc}>Overlay</button>
      </div>
      {#if mode === "side" && oldDoc}
        <div class="nudge">
          <span>current offset</span>
          <button onclick={() => (offset -= 1)} aria-label="shift current up">−</button>
          <span class="off-val">{offset > 0 ? "+" : ""}{offset}</span>
          <button onclick={() => (offset += 1)} aria-label="shift current down">+</button>
        </div>
      {/if}
      {#if mode === "overlay" && oldDoc}
        <div class="ovctl">
          <button onclick={() => (overlayPage = Math.max(1, overlayPage - 1))} aria-label="previous page">◀</button>
          <span class="off-val">p{overlayPage}/{maxPages}</span>
          <button onclick={() => (overlayPage = Math.min(maxPages, overlayPage + 1))} aria-label="next page">▶</button>
          <input type="range" min="0" max="1" step="0.02" bind:value={overlayOpacity} aria-label="overlay opacity" />
          <span class="off-val">{Math.round(overlayOpacity * 100)}%</span>
        </div>
      {/if}
    </div>
  </header>

  {#if status === "loading"}
    <div class="msg">Loading PDFs…</div>
  {:else if status === "error"}
    <div class="msg err">{errorMsg}</div>
  {:else if status === "missing-old" && newDoc}
    <div class="msg warn">
      Old v0.5 reference not found at <code>{OLD_URL}</code>. It's local-only (gitignored).
      Copy it in:<br />
      <code>cp /tmp/level-1-v05-backup.pdf static/guides/_proof/level-1-v05.pdf</code><br />
      Showing current PDF only ({newDoc.pages} pages).
    </div>
    <div class="scroll solo">
      <div class="col">
        {#each Array(newDoc.pages) as _, i (i)}
          <div class="pagewrap"><canvas use:lazyPage={{ doc: newDoc, pageNum: i + 1 }}></canvas></div>
        {/each}
      </div>
    </div>
  {:else if status === "ready" && oldDoc && newDoc}
    {#if mode === "side"}
      <div class="scroll">
        <div class="cols">
          <div class="col">
            <div class="colhead">old v0.5</div>
            {#each Array(oldDoc.pages) as _, i (i)}
              <div class="pagewrap"><canvas use:lazyPage={{ doc: oldDoc, pageNum: i + 1 }}></canvas></div>
            {/each}
          </div>
          <div class="col" style="transform: translateY({rightShiftPx}px)">
            <div class="colhead">current</div>
            {#each Array(newDoc.pages) as _, i (i)}
              <div class="pagewrap"><canvas use:lazyPage={{ doc: newDoc, pageNum: i + 1 }}></canvas></div>
            {/each}
          </div>
        </div>
      </div>
    {:else}
      <div class="overlay-stage">
        <div class="overlay-pair">
          <canvas bind:this={overlayNewCanvas} class="ov-base"></canvas>
          <canvas bind:this={overlayOldCanvas} class="ov-top" style="opacity: {overlayOpacity}"></canvas>
        </div>
        <p class="ovhint">old (red-tinted, on top) over current — drag opacity to blend</p>
      </div>
    {/if}
  {/if}
</div>

<style>
  .page {
    min-height: 100vh;
    background: #0d0d14;
    color: #eee;
    font-family: system-ui, sans-serif;
    display: flex;
    flex-direction: column;
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
  .left { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
  h1 { margin: 0; font-size: 18px; font-weight: 700; }
  .sub { font-size: 13px; color: #9494ad; }
  .counts { font-size: 12px; color: #6b6b8a; font-variant-numeric: tabular-nums; }
  .right { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
  .seg { display: inline-flex; border: 1px solid #2a2a3a; border-radius: 8px; overflow: hidden; }
  .seg button {
    background: transparent;
    color: #b0b0c8;
    border: none;
    padding: 6px 12px;
    font-size: 13px;
    cursor: pointer;
  }
  .seg button.active { background: #4c6ef5; color: #fff; }
  .seg button:disabled { opacity: 0.4; cursor: not-allowed; }
  .nudge, .ovctl { display: inline-flex; align-items: center; gap: 8px; font-size: 12px; color: #9494ad; }
  .nudge button, .ovctl button {
    width: 28px;
    height: 28px;
    border-radius: 6px;
    border: 1px solid #2a2a3a;
    background: #16161f;
    color: #e6e6f0;
    cursor: pointer;
    font-size: 14px;
  }
  .off-val { font-variant-numeric: tabular-nums; min-width: 3ch; text-align: center; color: #e6e6f0; }
  .ovctl input[type="range"] { width: 120px; }

  .msg { padding: 24px 20px; font-size: 14px; color: #b0b0c8; }
  .msg.err { color: #ff6b6b; font-family: monospace; }
  .msg.warn { color: #ffd43b; line-height: 1.7; }
  .msg code { background: #16161f; padding: 2px 6px; border-radius: 4px; color: #c7d2fe; }

  .scroll { flex: 1; overflow: auto; padding: 20px; }
  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; justify-items: center; align-items: start; }
  .scroll.solo .col { align-items: center; }
  .col { display: flex; flex-direction: column; gap: 16px; align-items: center; }
  .colhead {
    position: sticky;
    top: 0;
    font-size: 12px;
    font-weight: 600;
    color: #8a8aa0;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    padding-bottom: 4px;
  }
  .pagewrap {
    background: #fff;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
    border-radius: 2px;
    overflow: hidden;
    min-height: 40px;
  }
  canvas { display: block; }

  .overlay-stage { flex: 1; overflow: auto; padding: 24px; display: flex; flex-direction: column; align-items: center; gap: 12px; }
  .overlay-pair { position: relative; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6); background: #fff; }
  .ov-base { display: block; }
  .ov-top {
    position: absolute;
    inset: 0;
    /* tint the old layer so divergence pops */
    filter: sepia(1) saturate(4) hue-rotate(-20deg);
    mix-blend-mode: normal;
  }
  .ovhint { font-size: 12px; color: #8a8aa0; }
  /* the first row clears a phone's status bar; nothing moves when --safe-top is 0 */
  .page {
    border-top: var(--safe-top) solid transparent;
  }
</style>
