<script lang="ts">
  import { onMount } from "svelte";
  import { TND_ELEMENTS } from "#lib/features/choreo-card/domain/tnd-element.js";
  import { STICKER_TILE_SIZE_PX, STICKER_DPI } from "#lib/features/sticker-lab/domain/sticker-constants.js";
  import {
    renderElementStickerSVG,
    type ElementStickerOptions,
    type StickerBgStyle,
    type StickerRingColor,
  } from "./element-sticker-render";
  import { exportElementStickerPdf, type ElementStickerJob } from "./element-sticker-pdf";
  import { ensureCardFonts } from "#lib/shared/render/services/gelasio-fonts.js";
  import {
    LABEL_TEMPLATE_PRESETS,
    TEMPLATE_C006_STANDARD,
    computeLabelCenters,
    type LabelTemplate,
  } from "./label-template";

  const ELEMENTS = TND_ELEMENTS;
  const TILE_IN = STICKER_TILE_SIZE_PX / STICKER_DPI; // 3.2" (3" art + 0.1" bleed/side)

  // Six distinct sticker treatments to choose from.
  const VARIATIONS: { id: string; name: string; blurb: string; opts: ElementStickerOptions }[] = [
    { id: "halo", name: "Soft Halo", blurb: "Gradient bloom, no ring", opts: { bgStyle: "gradient", tintStrength: 0.35, ring: false, ringWidth: 0, ringColor: "accent", iconScale: 0.66, showLabel: false } },
    { id: "badge", name: "Badge Ring", blurb: "White field, bold accent ring", opts: { bgStyle: "white", tintStrength: 0.3, ring: true, ringWidth: 32, ringColor: "accent", iconScale: 0.56, showLabel: false } },
    { id: "disc", name: "Tinted Disc", blurb: "Saturated fill, deep hairline", opts: { bgStyle: "tint", tintStrength: 0.55, ring: true, ringWidth: 12, ringColor: "dark", iconScale: 0.6, showLabel: false } },
    { id: "double", name: "Double Ring", blurb: "Accent + deep concentric rings", opts: { bgStyle: "gradient", tintStrength: 0.3, ring: true, ringWidth: 22, ringColor: "accent", iconScale: 0.54, showLabel: false, innerHairline: true } },
    { id: "plate", name: "Named Plate", blurb: "Ringed, TnD family below", opts: { bgStyle: "gradient", tintStrength: 0.4, ring: true, ringWidth: 24, ringColor: "accent", iconScale: 0.5, showLabel: true } },
    { id: "pure", name: "Pure Glyph", blurb: "Big icon, clean white", opts: { bgStyle: "white", tintStrength: 0, ring: false, ringWidth: 0, ringColor: "accent", iconScale: 0.84, showLabel: false } },
  ];

  const DEFAULT_VARIATION = VARIATIONS.find((v) => v.id === "plate") ?? VARIATIONS[0]!;
  let opts = $state<ElementStickerOptions>({ ...DEFAULT_VARIATION.opts });

  function applyVariation(v: (typeof VARIATIONS)[number]) {
    opts = { ...v.opts };
  }

  // Highlight whichever variation the current options match (clears on manual edit).
  function sameOpts(a: ElementStickerOptions, b: ElementStickerOptions): boolean {
    return (
      a.bgStyle === b.bgStyle &&
      a.tintStrength === b.tintStrength &&
      a.ring === b.ring &&
      a.ringWidth === b.ringWidth &&
      a.ringColor === b.ringColor &&
      a.iconScale === b.iconScale &&
      a.showLabel === b.showLabel &&
      !!a.innerHairline === !!b.innerHairline
    );
  }
  const activeVariation = $derived(VARIATIONS.find((v) => sameOpts(v.opts, opts))?.id ?? null);

  // A vivid representative element for the variation thumbnails.
  const REP_ELEMENT = ELEMENTS.find((e) => e.element === "fire") ?? ELEMENTS[0]!;
  let copiesEach = $state(1);
  let showCutLines = $state(true);
  let exporting = $state(false);
  let exportError = $state<string | null>(null);

  // Editable copy of the chosen template + a global printer-drift nudge.
  let tpl = $state<LabelTemplate>({ ...TEMPLATE_C006_STANDARD });
  let nudgeX = $state(0);
  let nudgeY = $state(0);
  let activePreset = $state(TEMPLATE_C006_STANDARD.id);

  function applyPreset(p: LabelTemplate) {
    tpl = { ...p };
    activePreset = p.id;
    nudgeX = 0;
    nudgeY = 0;
  }

  // Base64 data URLs — external hrefs/fonts don't survive SVG rasterization via <img>.
  let iconDataUrls = $state<Record<string, string>>({});
  let fontDataUrl = $state<string>("");
  let loaded = $state(false);

  const GELASIO_700 = "/fonts/gelasio/gelasio-latin-700-normal.woff2";

  onMount(async () => {
    void ensureCardFonts(); // warm document.fonts for the inline-DOM preview
    const [iconEntries] = await Promise.all([
      Promise.all(
        ELEMENTS.map(async (el) => {
          const res = await fetch(el.iconPath);
          return [el.element, await blobToDataUrl(await res.blob())] as const;
        })
      ),
      (async () => {
        try {
          const buf = await (await fetch(GELASIO_700)).arrayBuffer();
          fontDataUrl = `data:font/woff2;base64,${abToBase64(buf)}`;
        } catch {
          // Non-fatal: label falls back to the serif stack.
        }
      })(),
    ]);
    iconDataUrls = Object.fromEntries(iconEntries);
    loaded = true;
  });

  function blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });
  }

  function abToBase64(buf: ArrayBuffer): string {
    const bytes = new Uint8Array(buf);
    let bin = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(bin);
  }

  const svgs = $derived(
    loaded
      ? ELEMENTS.map((el) => renderElementStickerSVG(el, iconDataUrls[el.element] ?? "", opts, fontDataUrl))
      : []
  );

  // One representative-element thumbnail per variation.
  const thumbs = $derived(
    loaded
      ? VARIATIONS.map((v) => ({
          v,
          svg: renderElementStickerSVG(REP_ELEMENT, iconDataUrls[REP_ELEMENT.element] ?? "", v.opts, fontDataUrl),
        }))
      : []
  );

  const centers = $derived(computeLabelCenters(tpl, nudgeX, nudgeY));
  const perPage = $derived(centers.length);

  // Slot SVGs for page 1 of the preview (row-major), expanded by copies.
  const previewSlots = $derived(
    svgs.flatMap((svg) => Array.from({ length: copiesEach }, () => svg)).slice(0, perPage)
  );

  // Cut diameter as a % of the tile box (3" cut inside the 3.2" tile).
  const cutPct = $derived((tpl.diameterIn / TILE_IN) * 100);

  async function downloadPdf() {
    if (!loaded) return;
    exporting = true;
    exportError = null;
    try {
      const jobs: ElementStickerJob[] = ELEMENTS.map((el) => ({
        svg: renderElementStickerSVG(el, iconDataUrls[el.element] ?? "", opts, fontDataUrl),
        copies: copiesEach,
      }));
      const bytes = await exportElementStickerPdf(jobs, {
        template: tpl,
        nudgeXIn: nudgeX,
        nudgeYIn: nudgeY,
        showCutLines,
      });
      const blob = new Blob([bytes as unknown as BlobPart], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `elemental-stickers-${tpl.id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      exportError = e instanceof Error ? e.message : String(e);
    } finally {
      exporting = false;
    }
  }

  const BG_STYLES: { value: StickerBgStyle; label: string }[] = [
    { value: "gradient", label: "Gradient" },
    { value: "tint", label: "Flat tint" },
    { value: "white", label: "White" },
  ];
  const RING_COLORS: { value: StickerRingColor; label: string }[] = [
    { value: "accent", label: "Accent" },
    { value: "dark", label: "Deep" },
  ];
</script>

<div class="page">
  <header class="page-head">
    <h1>Elemental Stickers</h1>
    <p>Six element icons for 3″ round die-cut label paper (Spartan C006). Tune the look + alignment, then export a print-ready PDF. Print at 100% / Actual Size.</p>
  </header>

  <div class="gallery" role="group" aria-label="Sticker style variations">
    {#each thumbs as t (t.v.id)}
      <button class="variation" class:active={activeVariation === t.v.id} onclick={() => applyVariation(t.v)}>
        <span class="thumb">{@html t.svg}</span>
        <span class="vname">{t.v.name}</span>
        <span class="vblurb">{t.v.blurb}</span>
      </button>
    {/each}
  </div>

  <div class="layout">
    <aside class="controls">
      <fieldset>
        <legend>Label paper</legend>
        <div class="seg">
          {#each LABEL_TEMPLATE_PRESETS as p}
            <button class:active={activePreset === p.id} onclick={() => applyPreset(p)}>{p.label}</button>
          {/each}
        </div>
        <div class="grid2">
          <label class="num"><span>Top margin″</span><input type="number" step="0.05" min="0" bind:value={tpl.marginTopIn} /></label>
          <label class="num"><span>Left margin″</span><input type="number" step="0.05" min="0" bind:value={tpl.marginLeftIn} /></label>
          <label class="num"><span>H pitch″</span><input type="number" step="0.05" min="0" bind:value={tpl.pitchXIn} /></label>
          <label class="num"><span>V pitch″</span><input type="number" step="0.05" min="0" bind:value={tpl.pitchYIn} /></label>
        </div>
        <label class="slider"><span>Nudge X <em>{nudgeX.toFixed(2)}″</em></span><input type="range" min="-0.25" max="0.25" step="0.01" bind:value={nudgeX} /></label>
        <label class="slider"><span>Nudge Y <em>{nudgeY.toFixed(2)}″</em></span><input type="range" min="-0.25" max="0.25" step="0.01" bind:value={nudgeY} /></label>
      </fieldset>

      <fieldset>
        <legend>Background</legend>
        <div class="seg">
          {#each BG_STYLES as s}
            <button class:active={opts.bgStyle === s.value} onclick={() => (opts.bgStyle = s.value)}>{s.label}</button>
          {/each}
        </div>
        {#if opts.bgStyle !== "white"}
          <label class="slider"><span>Tint strength <em>{Math.round(opts.tintStrength * 100)}%</em></span><input type="range" min="0.05" max="0.8" step="0.05" bind:value={opts.tintStrength} /></label>
        {/if}
      </fieldset>

      <fieldset>
        <legend>Ring</legend>
        <button class="toggle" aria-pressed={opts.ring} onclick={() => (opts.ring = !opts.ring)}>
          <span class="dot" class:on={opts.ring}></span>{opts.ring ? "Ring on" : "Ring off"}
        </button>
        {#if opts.ring}
          <div class="seg">
            {#each RING_COLORS as c}
              <button class:active={opts.ringColor === c.value} onclick={() => (opts.ringColor = c.value)}>{c.label}</button>
            {/each}
          </div>
          <label class="slider"><span>Ring width <em>{opts.ringWidth}px</em></span><input type="range" min="0" max="60" step="2" bind:value={opts.ringWidth} /></label>
        {/if}
      </fieldset>

      <fieldset>
        <legend>Glyph</legend>
        <label class="slider"><span>Icon size <em>{Math.round(opts.iconScale * 100)}%</em></span><input type="range" min="0.3" max="0.92" step="0.02" bind:value={opts.iconScale} /></label>
        <button class="toggle" aria-pressed={opts.showLabel} onclick={() => (opts.showLabel = !opts.showLabel)}>
          <span class="dot" class:on={opts.showLabel}></span>{opts.showLabel ? "Label on" : "Label off"}
        </button>
      </fieldset>

      <fieldset>
        <legend>Sheet</legend>
        <label class="slider"><span>Copies each <em>{copiesEach}</em></span><input type="range" min="1" max="8" step="1" bind:value={copiesEach} /></label>
        <button class="toggle" aria-pressed={showCutLines} onclick={() => (showCutLines = !showCutLines)}>
          <span class="dot" class:on={showCutLines}></span>Cut guides
        </button>
        <p class="hint">{tpl.cols}×{tpl.rows} = {perPage}/sheet · {ELEMENTS.length * copiesEach} total</p>
      </fieldset>

      <button class="export" onclick={() => window.print()} disabled={!loaded}>
        Print sheet
      </button>
      <button class="export secondary" onclick={downloadPdf} disabled={!loaded || exporting}>
        {exporting ? "Rendering PDF…" : "Export PDF"}
      </button>
      <p class="hint">Print dialog: Paper <strong>Letter</strong>, Scale <strong>100%</strong>, Margins <strong>None</strong>. Load sticker sheet face-up.</p>
      {#if exportError}<p class="error">{exportError}</p>{/if}
    </aside>

    <section class="stage" aria-label="Label sheet preview">
      <div class="sheet" style:aspect-ratio="{tpl.sheetWIn} / {tpl.sheetHIn}">
        {#if loaded}
          {#each previewSlots as svg, i (i)}
            {@const c = centers[i]!}
            <div
              class="slot"
              style:left="{(c.cxIn / tpl.sheetWIn) * 100}%"
              style:top="{(c.cyIn / tpl.sheetHIn) * 100}%"
              style:width="{(TILE_IN / tpl.sheetWIn) * 100}%"
              style:height="{(TILE_IN / tpl.sheetHIn) * 100}%"
            >
              {@html svg}
              {#if showCutLines}
                <span class="cut" style:width="{cutPct}%" style:height="{cutPct}%"></span>
              {/if}
            </div>
          {/each}
        {:else}
          <p class="loading">Loading glyphs…</p>
        {/if}
      </div>
    </section>
  </div>

  <!-- Print-only sheet, laid out at true physical inches so the die-cut aligns. -->
  <div class="print-root" aria-hidden="true">
    <div class="print-sheet" style:width="{tpl.sheetWIn}in" style:height="{tpl.sheetHIn}in">
      {#each previewSlots as svg, i (i)}
        {@const c = centers[i]!}
        <div
          class="print-slot"
          style:left="{(c.cxIn - TILE_IN / 2).toFixed(3)}in"
          style:top="{(c.cyIn - TILE_IN / 2).toFixed(3)}in"
          style:width="{TILE_IN}in"
          style:height="{TILE_IN}in"
        >
          {@html svg}
        </div>
      {/each}
    </div>
  </div>
</div>

<style>
  .page {
    min-height: 100vh;
    background: #14151a;
    color: #e8e8ea;
    padding: 1.5rem;
    box-sizing: border-box;
    font-family: "Inter", system-ui, sans-serif;
  }
  .page-head h1 { margin: 0; font-size: 1.5rem; font-weight: 700; }
  .page-head p { margin: 0.25rem 0 1.25rem; color: rgba(232, 232, 234, 0.6); font-size: 0.9rem; max-width: 60ch; }

  .gallery { display: grid; grid-template-columns: repeat(6, 1fr); gap: 0.75rem; margin-bottom: 1.5rem; }
  @media (max-width: 800px) { .gallery { grid-template-columns: repeat(3, 1fr); } }
  .variation { display: flex; flex-direction: column; align-items: center; gap: 0.3rem; padding: 0.75rem 0.5rem; background: rgba(255, 255, 255, 0.04); border: 2px solid transparent; border-radius: 14px; cursor: pointer; transition: all 0.15s; }
  .variation:hover { background: rgba(255, 255, 255, 0.08); }
  .variation.active { border-color: #a855f6; background: rgba(168, 85, 246, 0.12); }
  .thumb { width: 100%; aspect-ratio: 1; display: block; background: #f9f6ef; border-radius: 50%; overflow: hidden; box-shadow: 0 2px 10px rgba(0, 0, 0, 0.4); }
  .thumb :global(svg) { width: 100%; height: 100%; display: block; }
  .vname { font-size: 0.8rem; font-weight: 600; color: #fff; }
  .vblurb { font-size: 0.68rem; color: rgba(232, 232, 234, 0.5); text-align: center; line-height: 1.2; }

  .layout { display: grid; grid-template-columns: 280px 1fr; gap: 1.5rem; align-items: start; }
  @media (max-width: 800px) { .layout { grid-template-columns: 1fr; } }

  .controls { display: flex; flex-direction: column; gap: 1rem; position: sticky; top: 1rem; }
  fieldset { border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 12px; padding: 0.85rem; margin: 0; display: flex; flex-direction: column; gap: 0.7rem; }
  legend { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.08em; color: rgba(232, 232, 234, 0.55); padding: 0 0.35rem; }

  .seg { display: flex; gap: 2px; background: rgba(255, 255, 255, 0.05); border-radius: 9px; padding: 3px; }
  .seg button { flex: 1; border: none; background: transparent; color: rgba(232, 232, 234, 0.6); padding: 0.45rem 0.5rem; border-radius: 7px; font-size: 0.78rem; cursor: pointer; transition: all 0.15s; }
  .seg button.active { background: rgba(168, 85, 246, 0.25); color: #fff; }

  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; }
  .num { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.72rem; color: rgba(232, 232, 234, 0.7); }
  .num input { background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 7px; color: #fff; padding: 0.4rem 0.5rem; font-size: 0.82rem; font-variant-numeric: tabular-nums; }

  .toggle { display: flex; align-items: center; gap: 0.55rem; min-height: 44px; padding: 0 0.75rem; border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 9px; background: transparent; color: #e8e8ea; font-size: 0.82rem; cursor: pointer; }
  .toggle[aria-pressed="true"] { border-color: rgba(168, 85, 246, 0.5); background: rgba(168, 85, 246, 0.12); }
  .dot { width: 12px; height: 12px; border-radius: 50%; border: 2px solid rgba(255, 255, 255, 0.4); box-sizing: border-box; }
  .dot.on { background: #a855f6; border-color: #a855f6; }

  .slider { display: flex; flex-direction: column; gap: 0.4rem; font-size: 0.78rem; color: rgba(232, 232, 234, 0.75); }
  .slider em { float: right; font-style: normal; color: #fff; font-variant-numeric: tabular-nums; }
  .slider input { width: 100%; accent-color: #a855f6; }

  .hint { margin: 0; font-size: 0.72rem; color: rgba(232, 232, 234, 0.45); font-variant-numeric: tabular-nums; }

  .export { min-height: 48px; border: none; border-radius: 11px; background: linear-gradient(135deg, #a855f6, #7c3aed); color: #fff; font-size: 0.95rem; font-weight: 600; cursor: pointer; transition: filter 0.15s; }
  .export:hover:not(:disabled) { filter: brightness(1.1); }
  .export:disabled { opacity: 0.5; cursor: not-allowed; }
  .export.secondary { background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.15); }

  /* Print-only physical sheet. Hidden on screen; the only thing printed. */
  .print-root { display: none; }
  .print-sheet { position: relative; }
  .print-slot { position: absolute; }
  .print-slot :global(svg) { width: 100%; height: 100%; display: block; }

  @media print {
    :global(html), :global(body) { margin: 0 !important; padding: 0 !important; background: #fff !important; }
    .page > .page-head, .page > .gallery, .page > .layout { display: none !important; }
    .print-root { display: block; }
    .page { padding: 0 !important; background: #fff !important; }
  }
  @page { size: 8.5in 11in; margin: 0; }
  .error { color: #f87171; font-size: 0.78rem; margin: 0; }

  .stage { display: flex; justify-content: center; padding: 1.5rem; background: rgba(0, 0, 0, 0.35); border-radius: 14px; }
  .sheet { position: relative; width: min(100%, 620px); background: #f9f6ef; box-shadow: 0 8px 40px rgba(0, 0, 0, 0.55); border-radius: 4px; }
  .slot { position: absolute; transform: translate(-50%, -50%); display: flex; align-items: center; justify-content: center; }
  .slot :global(svg) { width: 100%; height: 100%; display: block; }
  .cut { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); border-radius: 50%; border: 1px dashed rgba(0, 0, 0, 0.4); pointer-events: none; }
  .loading { position: absolute; inset: 0; display: grid; place-content: center; color: rgba(0, 0, 0, 0.4); }
</style>
