<!--
  PictographHistoryLab.svelte - Synchronized pictograph gallery across 10 eras.

  Loads every Diamond + Box pictograph variation from the CSV dataframes and
  lets the user step through them. On each navigation, the current pictograph
  is posted to all 10 era iframes so they re-render in sync - the same
  pictograph shown in 10 visual traditions simultaneously.

  Each era card has a feedback textarea (localStorage-persisted per
  pictograph + era) so the user can sweep through and triage what's broken
  in each era renderer.

  Domain: Retro Labs
-->
<script lang="ts">
  import { onMount } from "svelte";
  import { motionQueryHandler } from "$lib/shared/pictograph/shared/services/motion-query-handler";
  import { GridMode, GridLocation } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import {
    HandSide,
    MotionType,
    Orientation,
    RotationDirection,
  } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
  import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
  import { pictographPreparer } from "$lib/shared/pictograph/shared/services/pictograph-preparer";
  import { getCanvas2DRenderer } from "$lib/shared/render/get-canvas-2d-renderer";

  // Pixel size of the canonical render - each era scales it to fit its
  // own grid diameter when compositing.
  const CANONICAL_SIZE = 500;
  const canvas2DRenderer = getCanvas2DRenderer();

  type EraId = "cave" | "egypt" | "mosaic" | "medieval" | "renaissance" | "woodblock" | "blueprint" | "deco" | "bauhaus" | "punch";

  interface Era {
    id: EraId;
    file: string;
    year: string;
    title: string;
    color: string;
  }

  const ERAS: readonly Era[] = [
    { id: "cave",        file: "cave-painting.html",   year: "~40,000 BC", title: "Cave Painting",        color: "#C17F3A" },
    { id: "egypt",       file: "egyptian.html",        year: "~3000 BC",   title: "Egyptian Hieroglyph",  color: "#C5A54E" },
    { id: "mosaic",      file: "greek-mosaic.html",    year: "~500 BC",    title: "Greek Mosaic",         color: "#7BA089" },
    { id: "medieval",    file: "medieval.html",        year: "~1200 AD",   title: "Illuminated Manuscript", color: "#D4AF37" },
    { id: "renaissance", file: "renaissance.html",     year: "~1500 AD",   title: "Renaissance Diagram",  color: "#8B7355" },
    { id: "woodblock",   file: "woodblock.html",       year: "~1800 AD",   title: "Japanese Woodblock",   color: "#D14836" },
    { id: "blueprint",   file: "blueprint.html",       year: "~1850 AD",   title: "Technical Blueprint",  color: "#4A90D9" },
    { id: "deco",        file: "art-deco.html",        year: "~1925 AD",   title: "Art Deco",             color: "#D4AF37" },
    { id: "bauhaus",     file: "bauhaus.html",         year: "~1930 AD",   title: "Bauhaus",              color: "#E63B2E" },
    { id: "punch",       file: "punch-card.html",      year: "~1976 AD",   title: "Line Printer",         color: "#33AA55" },
  ];

  //
  // Each iframe sends {type:"ready"} on load. We respond by posting
  // {type:"pictograph", data: RetroPictographData}. The bridge script in
  // static/retro-eras/_shared/pictograph-bridge.js handles this wire format.

  interface RetroHandPayload {
    color: "blue" | "red";
    location: string;
    endLocation: string;
    motionType: string;
    rotationDirection: string;
    orientation: string;
    turns: number;
  }

  interface RetroPayload {
    letter: string;
    gridMode: string;
    leftHand: RetroHandPayload;
    rightHand: RetroHandPayload;
  }


  let allPictographs = $state<PictographData[]>([]);
  let currentIndex = $state(0);
  let gridMode = $state<GridMode>(GridMode.DIAMOND);
  let dataLoading = $state(true);
  let error = $state<string | null>(null);
  let focusedEra = $state<EraId>("cave");

  // ── Render mode: Smart | Canonical | Data ──
  //
  //   "smart"     - each era gets its preferred path. Hand-drawn eras (cave,
  //                 egypt, mosaic, medieval, renaissance, woodblock) fall back
  //                 to their native data-driven primitives; technical/geometric
  //                 eras (blueprint, art-deco, bauhaus, punch-card) use canonical.
  //   "canonical" - every era uses the canonical-compose path (clean SVG
  //                 filtered through per-era palette + edge treatment).
  //   "data"      - every era uses its native data-driven primitives. For
  //                 technical eras this may look weaker, but lets you see each
  //                 era's hand-built vocabulary in isolation.
  type RenderMode = "smart" | "canonical" | "data";
  let renderMode = $state<RenderMode>("smart");

  // Per-era preference for "smart" mode. Hand-drawn eras keep their charm by
  // defaulting to data-driven; technical eras shine with canonical.
  const ERA_PREFERS_CANONICAL: Record<EraId, boolean> = {
    cave:        false,  // pigmentStroke / pigmentArc flow is the era's voice
    egypt:       false,  // flat tomb-painting staves + bold hieroglyphic arrows
    mosaic:      false,  // tesserae tiles + Greek-key meander
    medieval:    false,  // illuminated quill + gold leaf
    renaissance: false,  // jittered construction-line sketch
    woodblock:   false,  // brush taper + bokashi wash
    blueprint:   true,   // technical linework matches canonical
    deco:        true,   // faceted geometric arcs match canonical
    bauhaus:     true,   // primary-color blocks match canonical
    punch:       true,   // ASCII sampling of canonical is authentic
  };

  function shouldUseCanonical(eraId: EraId): boolean {
    if (renderMode === "canonical") return true;
    if (renderMode === "data")      return false;
    return ERA_PREFERS_CANONICAL[eraId];
  }

  const pictograph = $derived<PictographData | null>(allPictographs[currentIndex] ?? null);

  // iframe element refs and which ones have posted "ready"
  const iframeRefs: Record<EraId, HTMLIFrameElement | null> = {
    cave: null, egypt: null, mosaic: null, medieval: null, renaissance: null,
    woodblock: null, blueprint: null, deco: null, bauhaus: null, punch: null,
  };
  const readyEras = new Set<EraId>();

  // Per-pictograph-per-era feedback notes (persisted to localStorage)
  let feedbackDraft = $state<Record<EraId, string>>({
    cave: "", egypt: "", mosaic: "", medieval: "", renaissance: "",
    woodblock: "", blueprint: "", deco: "", bauhaus: "", punch: "",
  });


  function pictographId(p: PictographData): string {
    const b = p.motions?.[HandSide.LEFT];
    const r = p.motions?.[HandSide.RIGHT];
    return `${p.gridMode ?? "diamond"}:${p.letter ?? "?"}:${b?.startLocation ?? "?"}>${b?.endLocation ?? "?"}:${r?.startLocation ?? "?"}>${r?.endLocation ?? "?"}`;
  }

  function feedbackKey(pictoId: string, eraId: EraId): string {
    return `tka.retro.historyLab.feedback.${pictoId}.${eraId}`;
  }

  function loadFeedback(pictoId: string) {
    if (typeof localStorage === "undefined") return;
    for (const era of ERAS) {
      const raw = localStorage.getItem(feedbackKey(pictoId, era.id));
      feedbackDraft[era.id] = raw ?? "";
    }
  }

  function saveFeedback(pictoId: string, eraId: EraId, value: string) {
    if (typeof localStorage === "undefined") return;
    const key = feedbackKey(pictoId, eraId);
    if (value.trim() === "") localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  }

  function toPayload(p: PictographData): RetroPayload {
    const left = p.motions?.[HandSide.LEFT];
    const right = p.motions?.[HandSide.RIGHT];
    return {
      letter: String(p.letter ?? ""),
      gridMode: String(p.gridMode ?? "diamond"),
      leftHand: {
        color: "blue",
        location: String(left?.startLocation ?? GridLocation.NORTH),
        endLocation: String(left?.endLocation ?? GridLocation.NORTH),
        motionType: String(left?.motionType ?? MotionType.STATIC),
        rotationDirection: String(left?.rotationDirection ?? RotationDirection.NO_ROTATION),
        orientation: String(left?.endOrientation ?? Orientation.IN),
        turns: typeof left?.turns === "number" ? left.turns : 0,
      },
      rightHand: {
        color: "red",
        location: String(right?.startLocation ?? GridLocation.SOUTH),
        endLocation: String(right?.endLocation ?? GridLocation.SOUTH),
        motionType: String(right?.motionType ?? MotionType.STATIC),
        rotationDirection: String(right?.rotationDirection ?? RotationDirection.NO_ROTATION),
        orientation: String(right?.endOrientation ?? Orientation.IN),
        turns: typeof right?.turns === "number" ? right.turns : 0,
      },
    };
  }

  // ── Canonical render ──
  //
  // For each pictograph we render ONE high-res authoritative canvas using the
  // real Canvas2DDirectRenderer (same pipeline the app uses everywhere). That
  // canvas contains all the correct arrows, staves, turns indicators, and
  // motion-type visuals (pro/anti/dash/float). Each era receives a fresh
  // ImageBitmap clone to recolor and stylize - it never reinvents motion
  // geometry.

  let canonicalSource = $state<HTMLCanvasElement | OffscreenCanvas | null>(null);

  async function buildCanonical(p: PictographData): Promise<HTMLCanvasElement | OffscreenCanvas | null> {
    try {
      await canvas2DRenderer.initialize();
      const prepared = await pictographPreparer.prepareSingle(p, { themeMode: "dark" });
      const cvs = await canvas2DRenderer.renderPictograph(prepared, {
        size: CANONICAL_SIZE,
        visibility: {
          showTKA: false,
          showTnD: false,
          showElemental: false,
          showPlacements: false,
          showReversals: false,
          showNonRadialPoints: true,
          darkMode: true,
        },
      });
      return cvs;
    } catch (e) {
      console.warn("Canonical render failed:", e);
      return null;
    }
  }

  async function bitmapFor(cvs: HTMLCanvasElement | OffscreenCanvas | null): Promise<ImageBitmap | null> {
    if (!cvs) return null;
    try {
      return await createImageBitmap(cvs);
    } catch {
      return null;
    }
  }

  function broadcast(p: PictographData | null) {
    if (!p) return;
    const payload = toPayload(p);
    ERAS.forEach(async (era) => {
      const iframe = iframeRefs[era.id];
      if (!iframe?.contentWindow || !readyEras.has(era.id)) return;
      const wantsCanonical = shouldUseCanonical(era.id);
      const canonical = wantsCanonical ? await bitmapFor(canonicalSource) : null;
      const msg: { type: string; data: RetroPayload; canonical?: ImageBitmap; canonicalSize?: number } = {
        type: "pictograph",
        data: payload,
      };
      if (canonical) {
        msg.canonical = canonical;
        msg.canonicalSize = CANONICAL_SIZE;
        iframe.contentWindow.postMessage(msg, "*", [canonical]);
      } else {
        iframe.contentWindow.postMessage(msg, "*");
      }
    });
  }

  async function postTo(eraId: EraId, p: PictographData | null) {
    if (!p) return;
    const iframe = iframeRefs[eraId];
    if (!iframe?.contentWindow) return;
    const wantsCanonical = shouldUseCanonical(eraId);
    const canonical = wantsCanonical ? await bitmapFor(canonicalSource) : null;
    const msg: { type: string; data: RetroPayload; canonical?: ImageBitmap; canonicalSize?: number } = {
      type: "pictograph",
      data: toPayload(p),
    };
    if (canonical) {
      msg.canonical = canonical;
      msg.canonicalSize = CANONICAL_SIZE;
      iframe.contentWindow.postMessage(msg, "*", [canonical]);
    } else {
      iframe.contentWindow.postMessage(msg, "*");
    }
  }

  // ── Data load - switches when gridMode toggles ──

  async function loadPictographs(mode: GridMode) {
    dataLoading = true;
    error = null;
    try {
      const pictographs = await motionQueryHandler.queryMotions({ gridMode: mode });
      allPictographs = pictographs;
      currentIndex = 0;
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load pictographs";
      allPictographs = [];
    } finally {
      dataLoading = false;
    }
  }

  // ── Navigation ──

  function prev() {
    if (allPictographs.length === 0) return;
    currentIndex = (currentIndex - 1 + allPictographs.length) % allPictographs.length;
  }
  function next() {
    if (allPictographs.length === 0) return;
    currentIndex = (currentIndex + 1) % allPictographs.length;
  }
  function randomize() {
    if (allPictographs.length === 0) return;
    currentIndex = Math.floor(Math.random() * allPictographs.length);
  }
  function jumpToLetter(letter: string) {
    const idx = allPictographs.findIndex((p) => String(p.letter) === letter);
    if (idx >= 0) currentIndex = idx;
  }

  function cycleRenderMode() {
    renderMode =
      renderMode === "smart"     ? "canonical" :
      renderMode === "canonical" ? "data"      :
                                   "smart";
  }

  function handleKeydown(e: KeyboardEvent) {
    const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
    if (tag === "textarea" || tag === "input") return;
    if (e.key === "ArrowLeft")  { prev();  e.preventDefault(); }
    if (e.key === "ArrowRight") { next();  e.preventDefault(); }
    if (e.key === "r" || e.key === "R") { randomize(); e.preventDefault(); }
    if (e.key === "m" || e.key === "M") { cycleRenderMode(); e.preventDefault(); }
  }

  // Listen for "ready" messages from era iframes
  function handleMessage(event: MessageEvent) {
    const msg = event.data;
    if (!msg || typeof msg !== "object" || msg.type !== "ready") return;
    // Find which iframe this came from
    for (const era of ERAS) {
      const iframe = iframeRefs[era.id];
      if (iframe && iframe.contentWindow === event.source) {
        readyEras.add(era.id);
        postTo(era.id, pictograph);
        return;
      }
    }
  }

  // ── Derived data ──

  const letters = $derived(
    Array.from(new Set(allPictographs.map((p) => String(p.letter ?? ""))))
      .filter((s) => s !== "")
      .sort()
  );

  const label = $derived(
    dataLoading
      ? "Loading…"
      : allPictographs.length === 0
        ? "No pictographs"
        : `${pictograph?.letter ?? "?"}  ·  ${currentIndex + 1} / ${allPictographs.length}`
  );

  const currentPictoId = $derived(pictograph ? pictographId(pictograph) : "");

  // ── Effects ──

  onMount(() => {
    loadPictographs(gridMode);
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  });

  // Reload data when grid mode toggles
  $effect(() => {
    const mode = gridMode;
    loadPictographs(mode);
  });

  // Rebuild the canonical source whenever the pictograph OR render mode
  // changes, THEN broadcast. Any time the mode flips we want all iframes to
  // receive fresh messages with the appropriate canonical (or no canonical)
  // so they re-render in the newly-selected style.
  $effect(() => {
    const p = pictograph;
    // Access renderMode reactively so this effect re-runs on mode changes
    // (even when the rebuilt canonical is otherwise identical).
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _mode = renderMode;
    if (!p) {
      canonicalSource = null;
      return;
    }
    let cancelled = false;
    (async () => {
      const cvs = await buildCanonical(p);
      if (cancelled) return;
      canonicalSource = cvs;
      broadcast(p);
    })();
    return () => { cancelled = true; };
  });

  // Load feedback draft when pictograph changes
  $effect(() => {
    const id = currentPictoId;
    if (id) loadFeedback(id);
  });

  function onFeedbackInput(eraId: EraId, value: string) {
    feedbackDraft[eraId] = value;
    if (currentPictoId) saveFeedback(currentPictoId, eraId, value);
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="history-lab">
  <!-- Toolbar -->
  <div class="toolbar">
    <div class="toolbar-row">
      <button class="nav-btn" onclick={prev} disabled={dataLoading} aria-label="Previous">
        <i class="fas fa-chevron-left" aria-hidden="true"></i>
      </button>

      <span class="label">{label}</span>

      <button class="nav-btn" onclick={next} disabled={dataLoading} aria-label="Next">
        <i class="fas fa-chevron-right" aria-hidden="true"></i>
      </button>

      <button class="randomize-btn" onclick={randomize} disabled={dataLoading} aria-label="Randomize">
        <i class="fas fa-dice" aria-hidden="true"></i>
      </button>

      <div class="spacer"></div>

      <div class="mode-toggle" role="group" aria-label="Render mode" title="Render mode - press M to cycle">
        <button
          class="mode-btn"
          class:active={renderMode === "smart"}
          onclick={() => (renderMode = "smart")}
          title="Per-era best: hand-drawn eras use native primitives, technical eras use canonical"
        >Smart</button>
        <button
          class="mode-btn"
          class:active={renderMode === "canonical"}
          onclick={() => (renderMode = "canonical")}
          title="All eras use canonical-composed rendering (SVG filtered through palette)"
        >Canonical</button>
        <button
          class="mode-btn"
          class:active={renderMode === "data"}
          onclick={() => (renderMode = "data")}
          title="All eras use native data-driven primitives (era's own hand-built vocabulary)"
        >Data</button>
      </div>

      <div class="mode-toggle" role="group" aria-label="Grid mode">
        <button
          class="mode-btn"
          class:active={gridMode === GridMode.DIAMOND}
          onclick={() => (gridMode = GridMode.DIAMOND)}
          disabled={dataLoading}
        >Diamond</button>
        <button
          class="mode-btn"
          class:active={gridMode === GridMode.BOX}
          onclick={() => (gridMode = GridMode.BOX)}
          disabled={dataLoading}
        >Box</button>
      </div>

      {#if letters.length > 0}
        <select
          class="letter-jump"
          value={String(pictograph?.letter ?? "")}
          onchange={(e) => jumpToLetter((e.currentTarget as HTMLSelectElement).value)}
          disabled={dataLoading}
          aria-label="Jump to letter"
        >
          {#each letters as l}
            <option value={l}>{l}</option>
          {/each}
        </select>
      {/if}

      <span class="hint">
        <kbd>&larr;</kbd><kbd>&rarr;</kbd> step · <kbd>R</kbd> random · <kbd>M</kbd> mode
      </span>
    </div>
  </div>

  {#if error}
    <div class="status error">{error}</div>
  {/if}

  <!-- Focus gallery: one era large, the other nine as clickable thumbnails -->
  <div class="gallery" class:has-focus={focusedEra !== null}>
    {#each ERAS as era (era.id)}
      {@const isFocused = era.id === focusedEra}
      <div
        class="era-card"
        class:focused={isFocused}
        class:thumb={!isFocused}
      >
        {#if !isFocused}
          <button
            class="thumb-clicktarget"
            onclick={() => (focusedEra = era.id)}
            aria-label="Focus on {era.title}"
          ></button>
        {/if}
        <div class="era-frame">
          <iframe
            bind:this={iframeRefs[era.id]}
            src={`/retro-eras/${era.file}${era.file.includes('?') ? '&' : '?'}embed=1`}
            title={era.title}
            loading="lazy"
          ></iframe>
        </div>
        <div class="era-label" style="color: {era.color}">
          <span class="era-year">{era.year}</span>
          <span class="era-title">{era.title}</span>
        </div>
        {#if isFocused}
          <textarea
            class="feedback"
            placeholder="Notes for this pictograph…"
            value={feedbackDraft[era.id]}
            oninput={(e) => onFeedbackInput(era.id, (e.currentTarget as HTMLTextAreaElement).value)}
            aria-label="Feedback for {era.title}"
          ></textarea>
        {/if}
      </div>
    {/each}
  </div>
</div>

<style>
  .history-lab {
    display: flex;
    flex-direction: column;
    height: 100%;
    color: var(--theme-text, #fff);
    min-height: 0;
  }


  .toolbar {
    padding: 8px 12px;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.06));
    flex-shrink: 0;
  }
  .toolbar-row {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .label {
    font-size: var(--font-size-min, 14px);
    font-weight: 500;
    color: var(--theme-text, #fff);
    font-family: "SF Mono", "Fira Code", "Courier New", monospace;
    min-width: 160px;
    text-align: center;
    letter-spacing: 0.5px;
  }

  .nav-btn,
  .randomize-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 50%;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    font-size: 12px;
    cursor: pointer;
    transition: border-color 150ms ease, color 150ms ease;
  }
  @media (hover: hover) {
    .nav-btn:not(:disabled):hover,
    .randomize-btn:not(:disabled):hover {
      border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
      color: var(--theme-text, #fff);
    }
  }
  .nav-btn:disabled,
  .randomize-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .spacer { flex: 1; }

  .mode-toggle {
    display: inline-flex;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 6px;
    overflow: hidden;
  }
  .mode-btn {
    background: transparent;
    border: none;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    padding: 6px 12px;
    font-size: var(--font-size-compact, 12px);
    cursor: pointer;
    transition: background 150ms ease, color 150ms ease;
  }
  .mode-btn.active {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.08));
    color: var(--theme-text, #fff);
  }
  .mode-btn:disabled { opacity: 0.3; cursor: not-allowed; }

  .letter-jump {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    color: var(--theme-text, #fff);
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 6px;
    padding: 4px 8px;
    font-size: var(--font-size-compact, 12px);
    font-family: "SF Mono", "Fira Code", "Courier New", monospace;
    cursor: pointer;
  }

  .hint {
    font-size: 10px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.3));
  }
  .hint kbd {
    display: inline-block;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 3px;
    padding: 0 4px;
    font-size: 10px;
    font-family: "SF Mono", "Fira Code", monospace;
    margin: 0 1px;
  }

  .status {
    padding: 16px;
    text-align: center;
    font-size: var(--font-size-min, 14px);
  }
  .status.error {
    color: var(--semantic-error, #ef4444);
  }

  /* ── Gallery: focus mode ── */
  /*
    6×3 grid. Focused era occupies cols 1-3, rows 1-3 (9 cells).
    The remaining 9 cells auto-flow with the other 9 era thumbnails.
  */

  .gallery {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    grid-template-rows: repeat(3, 1fr);
    gap: 6px;
    padding: 8px 12px;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  .era-card {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.03));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.06));
    border-radius: 8px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    min-height: 0;
    position: relative;
  }

  .era-card.focused {
    grid-column: 1 / span 3;
    grid-row: 1 / span 3;
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.18));
    background: color-mix(in srgb, var(--theme-card-bg, rgba(255, 255, 255, 0.05)) 100%, #fff 2%);
  }

  /* Clickable overlay on thumbnails (iframe has pointer-events:none so it doesn't steal clicks) */
  .thumb-clicktarget {
    position: absolute;
    inset: 0;
    z-index: 2;
    background: transparent;
    border: none;
    padding: 0;
    margin: 0;
    cursor: pointer;
    transition: background 150ms ease;
  }
  @media (hover: hover) {
    .era-card.thumb:hover .thumb-clicktarget {
      background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    }
    .era-card.thumb:hover {
      border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.25));
    }
  }

  .era-frame {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    position: relative;
  }
  .era-frame iframe {
    width: 100%;
    height: 100%;
    border: none;
    display: block;
  }
  /* Thumbnails shouldn't intercept pointer events - the overlay button does */
  .era-card.thumb .era-frame iframe {
    pointer-events: none;
  }

  .era-label {
    padding: 4px 8px;
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.06));
    display: flex;
    flex-direction: column;
    gap: 1px;
    flex-shrink: 0;
  }
  .era-year {
    /* Functional metadata label (the era's year), not bitmap font art -
       keep it at the readable compact minimum, not sub-readable pixel sizes. */
    font-size: var(--font-size-compact, 12px);
    font-weight: 700;
    letter-spacing: 2px;
    text-transform: uppercase;
  }
  .era-title {
    font-size: 11px;
    font-weight: 500;
    color: var(--theme-text, #fff);
  }

  /* Focused-card label gets more room */
  .era-card.focused .era-label {
    padding: 8px 12px;
    flex-direction: row;
    align-items: baseline;
    gap: 10px;
  }
  .era-card.focused .era-year {
    font-size: var(--font-size-min, 14px);
  }
  .era-card.focused .era-title {
    font-size: 14px;
  }

  /* Thumbnail label is compact */
  .era-card.thumb .era-label {
    padding: 3px 6px;
  }
  .era-card.thumb .era-year {
    /* Was 7px (invisible for low-vision). Keep thumbnails dense but hold the
       year label at the readable compact floor. */
    font-size: var(--font-size-compact, 12px);
    letter-spacing: 1px;
  }
  .era-card.thumb .era-title {
    font-size: 10px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .feedback {
    border: none;
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.06));
    background: var(--theme-overlay, rgba(0, 0, 0, 0.25));
    color: var(--theme-text, #fff);
    font-family: "SF Mono", "Fira Code", "Courier New", monospace;
    font-size: 12px;
    padding: 6px 10px;
    resize: none;
    height: 60px;
    flex-shrink: 0;
    outline: none;
  }
  .feedback::placeholder {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.25));
    font-style: italic;
  }
  .feedback:focus {
    background: color-mix(in srgb, var(--theme-overlay, rgba(0, 0, 0, 0.4)) 100%, #000 15%);
    box-shadow: inset 0 0 0 1px var(--theme-stroke-strong, rgba(255, 255, 255, 0.15));
  }
</style>
