<!--
  Level 2 guide compare - page-by-page proofing, mirroring level-1/book. OLD
  v0.5 proof (pdf.js canvases) on the left, the live Level2Document on the
  right, one page per side, Prev/Next stepping both in lockstep. The "Book"
  button flips through the rebuild with StPageFlip.

  Offset note: the rebuild keeps the original's page sequence 1:1 (cover +
  33 body pages, back matter parked), so the default offset is 0. Landscape
  originals are reflowed to portrait in the rebuild - expect intentional layout
  deltas on those pages (content parity is what's being proofed).
-->
<script lang="ts">
  import { t as translate } from "#lib/shared/i18n/i18n.svelte.js";
  import { onMount, tick } from "svelte";
  import "../../level-1/_styles/guide.css";
  import "../../level-1/_styles/guide-print.css";
  import { setGuidePrintMode } from "../../level-1/_data/guide-data-context";
  import GuidePage from "../../level-1/_components/GuidePage.svelte";
  import type { GuidePageMeta } from "../../level-1/_data/guide-manifest";
  import Level2Document from "../_components/Level2Document.svelte";
  import { BUILT2 } from "../_data/built-pages";

  setGuidePrintMode();

  const OLD_PDF = "/guides/_proof/level-2-v05.pdf";
  const PAGE_W = 816; // 8.5in @96dpi (GuidePage native width)
  const PAGE_H = 1056; // 11in

  let mode = $state<"compare" | "flip">("compare");
  // Front matter is just the cover, and the rebuild tracks the original 1:1,
  // so old index = new index (offset 0). Open on the first body page.
  let idx = $state(1);
  let offset = $state(0);
  let newCount = $state(0);
  let oldCount = $state(0);
  let scale = $state(0.5);

  let newWrap = $state<HTMLDivElement>();
  let leftWrap = $state<HTMLDivElement>();
  let paneEl = $state<HTMLDivElement>();
  let flipOpened = $state(false);

  function fit() {
    if (!paneEl) return;
    const w = paneEl.clientWidth - 24;
    const h = paneEl.clientHeight - 44;
    scale = Math.max(0.1, Math.min(w / PAGE_W, h / PAGE_H));
  }

  const go = (n: number) => (idx = Math.max(0, Math.min((newCount || 1) - 1, n)));

  $effect(() => {
    const w = newWrap;
    if (!w) return;
    const i = idx;
    w.querySelectorAll<HTMLElement>(".cmp-page").forEach((p, k) => {
      p.style.display = k === i ? "block" : "none";
    });
  });

  $effect(() => {
    const w = leftWrap;
    if (!w) return;
    const oi = idx + offset;
    const s = scale;
    w.querySelectorAll<HTMLCanvasElement>("canvas").forEach((c, k) => {
      c.style.display = k === oi ? "block" : "none";
      c.style.width = `${PAGE_W * s}px`;
    });
  });

  function onKey(e: KeyboardEvent) {
    if (mode !== "compare") return;
    if (e.key === "ArrowRight") go(idx + 1);
    else if (e.key === "ArrowLeft") go(idx - 1);
  }

  onMount(() => {
    newCount = newWrap?.querySelectorAll(".cmp-page").length ?? 0;
    fit();
    const ro = new ResizeObserver(fit);
    if (paneEl) ro.observe(paneEl);
    window.addEventListener("keydown", onKey);

    (async () => {
      const pdfjs = await import("pdfjs-dist");
      const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
      const dpr = window.devicePixelRatio || 1;
      const doc = await pdfjs.getDocument({ url: OLD_PDF }).promise;
      oldCount = doc.numPages;
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const base = page.getViewport({ scale: 1 });
        const vp = page.getViewport({ scale: (PAGE_W / base.width) * dpr });
        const canvas = document.createElement("canvas");
        canvas.width = vp.width;
        canvas.height = vp.height;
        canvas.className = "old-page";
        canvas.style.display = "none";
        canvas.style.width = `${PAGE_W * scale}px`;
        leftWrap?.appendChild(canvas);
        await page.render({ canvas, canvasContext: canvas.getContext("2d")!, viewport: vp }).promise;
      }
      const oi = idx + offset;
      leftWrap?.querySelectorAll<HTMLCanvasElement>("canvas").forEach((c, k) => {
        if (k === oi) c.style.display = "block";
      });
    })();

    return () => {
      ro.disconnect();
      window.removeEventListener("keydown", onKey);
    };
  });

  function flipbook(node: HTMLElement) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let pf: any;
    (async () => {
      const FLIP_W = 520;
      const FLIP_H = Math.round((FLIP_W * PAGE_H) / PAGE_W);
      const { PageFlip } = await import("page-flip/dist/js/page-flip.module.js");
      await tick();
      pf = new PageFlip(node, {
        width: FLIP_W,
        height: FLIP_H,
        size: "fixed",
        showCover: true,
        drawShadow: true,
        maxShadowOpacity: 0.5,
        flippingTime: 600,
        usePortrait: false,
        mobileScrollSupport: false,
      });
      pf.loadFromHTML(node.querySelectorAll(".page"));
    })();
    return {
      destroy() {
        try {
          pf?.destroy();
        } catch {
          /* already torn down */
        }
      },
    };
  }
</script>

<svelte:head>
  <title>{translate("guide_l2_print_compare_title")}</title>
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

{#snippet cmpPage(meta: GuidePageMeta)}
  <div class="cmp-page">
    <div class="cmp-scale">
      <div class="pg">
        <GuidePage title={meta.title} pageNumber={meta.pageNumber} fullBleed={meta.fullBleed}>
          {@render meta.content()}
        </GuidePage>
      </div>
    </div>
  </div>
{/snippet}

{#snippet flipPage(meta: GuidePageMeta)}
  <div class="page">
    <div class="scale">
      <div class="pg">
        <GuidePage title={meta.title} pageNumber={meta.pageNumber} fullBleed={meta.fullBleed}>
          {@render meta.content()}
        </GuidePage>
      </div>
    </div>
  </div>
{/snippet}

<div class="wrap">
  <div class="bar">
    <span class="t">Level 2 · {mode === "compare" ? translate("guide_l2_print_compare") : translate("guide_l2_print_book")}</span>

    {#if mode === "compare"}
      <div class="nav">
        <button onclick={() => go(idx - 1)} disabled={idx <= 0}>‹ {translate("guide_l2_print_prev")}</button>
        <span class="lbl">{translate("guide_l2_print_new")} {idx + 1}/{newCount} · {translate("guide_l2_print_old")} {Math.max(0, idx + offset) + 1}/{oldCount || "…"}</span>
        <button onclick={() => go(idx + 1)} disabled={idx >= newCount - 1}>{translate("guide_l2_print_next")} ›</button>
        <span class="dim">{translate("guide_l2_print_offset")}</span>
        <button class="sm" onclick={() => offset--} title={translate("guide_l2_print_old_page_minus")}>−</button>
        <button class="sm" onclick={() => offset++} title={translate("guide_l2_print_old_page_plus")}>+</button>
      </div>
    {/if}

    <div class="modes">
      <button class:on={mode === "compare"} onclick={() => (mode = "compare")}>{translate("guide_l2_print_compare")}</button>
      <button class:on={mode === "flip"} onclick={() => { flipOpened = true; mode = "flip"; }}>{translate("guide_l2_print_book")}</button>
    </div>
  </div>

  <div class="cmp" style="display:{mode === 'compare' ? 'grid' : 'none'}">
    <div class="pane" bind:this={paneEl}>
      <div class="cap">{translate("guide_l2_print_old")}: v0.5</div>
      <div class="oldwrap" bind:this={leftWrap}></div>
    </div>
    <div class="pane">
      <div class="cap">{translate("guide_l2_print_new")}: {translate("guide_l2_print_rebuild")}</div>
      <div class="newwrap" bind:this={newWrap} style="--s:{scale}">
        <Level2Document built={BUILT2} page={cmpPage} />
      </div>
    </div>
  </div>

  {#if flipOpened}
    <div class="flipmode" style="display:{mode === 'flip' ? 'flex' : 'none'}">
      <div class="flip" use:flipbook style="--s:{520 / PAGE_W}">
        <Level2Document built={BUILT2} page={flipPage} />
      </div>
    </div>
  {/if}
</div>

<style>
  .wrap { height: 100vh; display: flex; flex-direction: column; background: #15151c; color: #eaeaf2; font-family: system-ui, sans-serif; overflow: hidden; }
  .bar { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 8px 16px; border-bottom: 1px solid #2c2c38; flex: 0 0 auto; }
  .t { font-size: 13px; color: #cfcfe0; flex: 0 0 auto; }

  .nav { display: flex; align-items: center; gap: 8px; }
  .nav .lbl { font-size: 12px; color: #9a9ab0; min-width: 160px; text-align: center; font-variant-numeric: tabular-nums; }
  .nav .dim { font-size: 11px; color: #6f6f86; margin-left: 8px; }
  .bar button { font: 500 12px system-ui; padding: 6px 12px; border-radius: 999px; border: 1px solid #3a3a48; background: #26262f; color: #c8c8db; cursor: pointer; }
  .bar button:disabled { opacity: 0.4; cursor: default; }
  .bar button.sm { padding: 6px 10px; }
  .modes { display: flex; gap: 8px; flex: 0 0 auto; }
  .modes button.on { background: #3730a3; border-color: #3730a3; color: #fff; }

  .cmp { flex: 1 1 auto; min-height: 0; grid-template-columns: 1fr 1fr; gap: 1px; background: #2c2c38; }
  .pane { display: flex; flex-direction: column; min-height: 0; background: #1f1f27; padding: 8px 0; }
  .cap { flex: 0 0 auto; font-size: 12px; color: #9a9ab0; text-align: center; padding-bottom: 6px; }
  .oldwrap, .newwrap { flex: 1 1 auto; min-height: 0; display: flex; align-items: center; justify-content: center; overflow: hidden; }
  .oldwrap :global(canvas.old-page) { display: none; background: #fff; box-shadow: 0 2px 16px rgba(0, 0, 0, 0.45); }

  .cmp-page { display: none; width: calc(816px * var(--s)); height: calc(1056px * var(--s)); overflow: hidden; box-shadow: 0 2px 16px rgba(0, 0, 0, 0.45); }
  .cmp-scale { width: 816px; height: 1056px; transform: scale(var(--s)); transform-origin: top left; background: #fff; }
  .pg :global(.guide-page) { margin: 0; box-shadow: none; }

  .flipmode { flex: 1 1 auto; min-height: 0; align-items: center; justify-content: center; padding: 20px; }
  .flip { background: transparent; }
  .flip :global(.page) { background: #fff; overflow: hidden; box-sizing: border-box; }
  .flip .scale { width: 816px; height: 1056px; transform: scale(var(--s)); transform-origin: top left; }
</style>
