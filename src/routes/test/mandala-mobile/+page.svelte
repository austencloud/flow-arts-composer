<script lang="ts">
  import { onMount } from "svelte";
  import { fade } from "svelte/transition";
  import SequenceMandala from "#lib/shared/mandala/components/SequenceMandala.svelte";
  import ViewerModeBottomBar from "#lib/shared/sequence-viewer/components/ViewerModeBottomBar.svelte";
  import MandalaControlDock from "#lib/shared/sequence-viewer/components/MandalaControlDock.svelte";
  import MandalaExportTakeover from "#lib/shared/sequence-viewer/components/MandalaExportTakeover.svelte";
  import type { ContentType, ViewerMode } from "#lib/shared/sequence-viewer/state/viewer-state.svelte.js";
  import { MandalaViewerController } from "#lib/shared/sequence-viewer/state/mandala-viewer-controller.svelte.js";
  import { loadCatalogs, loadCatalogSequences } from "#lib/features/choreo-card/services/catalog-loader.js";
  import { mandalaCollectionState } from "#lib/features/mandala/tabs/collection/state/mandala-collection-state.svelte.js";
  import type { Catalog } from "#lib/features/choreo-card/domain/models/Catalog.js";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import { forceFreshReload } from "#lib/shared/foundation/services/force-fresh.js";
  import { getAnimationVisibilityManager } from "#lib/shared/animation-engine/state/animation-visibility-state.svelte.js";

  // ── Sequence sourcing (same approach as /test/mandala-paths) ──────
  let catalogs: Catalog[] = $state([]);
  let selectedCatalogId = $state("");
  let catalogSequences: any[] = $state([]);
  let loading = $state(false);
  let error = $state("");
  let currentIndex = $state(0);

  type DataSource = "collection" | "catalogs";
  let dataSource = $state<DataSource>("collection");

  const collectionSequences = $derived(
    mandalaCollectionState.collection.map((m) => ({
      id: m.id, word: m.name, steps: m.steps,
      leftPropType: m.leftPropType, rightPropType: m.rightPropType,
    })),
  );

  const sequences = $derived(dataSource === "collection" ? collectionSequences : catalogSequences);
  const currentSeq = $derived(sequences[currentIndex] ?? null);
  const leftProp = $derived(currentSeq?.leftPropType ?? "staff");
  const rightProp = $derived(currentSeq?.rightPropType ?? "staff");

  // ── Shared controller (same logic the real MandalaPane uses) ──────
  const ctrl = new MandalaViewerController({
    getSequence: () => currentSeq as SequenceData,
    getLeftPropType: () => leftProp,
    getRightPropType: () => rightProp,
    pathPolicy: getAnimationVisibilityManager(),
  });

  let viewerMode = $state<ViewerMode>("mandala");

  // Honor prefers-reduced-motion for the harness's own JS transitions.
  let reduceMotion = $state(false);
  $effect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    reduceMotion = mq.matches;
    const onChange = () => (reduceMotion = mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  });
  const dur = (ms: number) => (reduceMotion ? 0 : ms);

  // Device presets — iPhone SE is the tight-screen stress test (default);
  // Desktop verifies the floating-dock layout in the same sandbox.
  type Device = { id: string; label: string; w: number; h: number };
  const DEVICES: Device[] = [
    { id: "se", label: "iPhone SE", w: 375, h: 667 },
    { id: "i15", label: "iPhone 15", w: 393, h: 852 },
    { id: "pixel", label: "Pixel 7", w: 412, h: 915 },
    { id: "desktop", label: "Desktop", w: 1100, h: 720 },
  ];
  let deviceId = $state("se");
  const device = $derived(DEVICES.find((d) => d.id === deviceId) ?? DEVICES[0]!);

  // Dock reports its height so the stage reserves room above it.
  let dockHeight = $state(76);

  const takeoverSize = $derived(Math.max(160, Math.min(device.w, device.h) - 48));

  // Tap the mandala to play/pause. Flash the action icon briefly for feedback.
  let playFlash = $state(false);
  let playFlashTimer: ReturnType<typeof setTimeout> | undefined;
  function togglePlay() {
    ctrl.paused = !ctrl.paused;
    playFlash = true;
    clearTimeout(playFlashTimer);
    playFlashTimer = setTimeout(() => (playFlash = false), 520);
  }

  let stageEl: HTMLButtonElement | undefined = $state();
  let stageSize = $state(320);
  $effect(() => {
    if (!stageEl) return;
    const ro = new ResizeObserver((entries) => {
      const e = entries[0];
      if (!e) return;
      const { width, height } = e.contentRect;
      stageSize = Math.floor(Math.min(width, height));
    });
    ro.observe(stageEl);
    return () => ro.disconnect();
  });

  onMount(async () => {
    try {
      catalogs = await loadCatalogs();
      const first = catalogs[0];
      if (first) selectedCatalogId = first.id;
      if (mandalaCollectionState.count === 0) dataSource = "catalogs";
    } catch (e: any) {
      error = e.message ?? "Failed to load catalogs";
    }
  });

  $effect(() => {
    if (dataSource !== "catalogs" || !selectedCatalogId) return;
    loading = true;
    error = "";
    currentIndex = 0;
    loadCatalogSequences(selectedCatalogId)
      .then((seqs) => { catalogSequences = seqs; })
      .catch((e: any) => { error = e.message ?? "Failed to load sequences"; })
      .finally(() => { loading = false; });
  });

  function prev() {
    if (sequences.length) currentIndex = (currentIndex - 1 + sequences.length) % sequences.length;
  }
  function next() {
    if (sequences.length) currentIndex = (currentIndex + 1) % sequences.length;
  }
</script>

<div class="page">
  <!-- Out-of-frame harness: pick a real sequence to preview -->
  <header class="harness">
    <div class="seg">
      <button class:active={dataSource === "collection"} onclick={() => { dataSource = "collection"; currentIndex = 0; }}>
        Collection{#if mandalaCollectionState.count > 0}<span class="badge">{mandalaCollectionState.count}</span>{/if}
      </button>
      <button class:active={dataSource === "catalogs"} onclick={() => { dataSource = "catalogs"; currentIndex = 0; }}>Catalogs</button>
    </div>
    {#if dataSource === "catalogs"}
      <select bind:value={selectedCatalogId} class="deck-select" transition:fade={{ duration: dur(180) }}>
        {#each catalogs as catalog}<option value={catalog.id}>{catalog.name} ({catalog.totalSequences})</option>{/each}
      </select>
    {/if}
    <div class="picker">
      <button onclick={prev} aria-label="Previous"><i class="fas fa-chevron-left" aria-hidden="true"></i></button>
      {#key currentSeq?.word ?? "—"}
        <span class="picker-word" in:fade={{ duration: dur(160) }}>{currentSeq?.word ?? "—"}</span>
      {/key}
      <button onclick={next} aria-label="Next"><i class="fas fa-chevron-right" aria-hidden="true"></i></button>
    </div>
    {#if sequences.length}<span class="count" transition:fade={{ duration: dur(180) }}>{currentIndex + 1}/{sequences.length}</span>{/if}
    <div class="seg device-seg">
      {#each DEVICES as d}
        <button class:active={deviceId === d.id} onclick={() => (deviceId = d.id)}>{d.label}</button>
      {/each}
    </div>
    <!-- Bust a stale service-worker-cached worker bundle (tunnel host SW serves
         old export code). Keeps auth + collection; only clears SW + Cache Storage. -->
    <button class="fresh-btn" onclick={() => forceFreshReload()} title="Unregister service workers, clear caches, hard reload">
      <i class="fas fa-rotate" aria-hidden="true"></i> Force fresh
    </button>
  </header>

  <!-- Phone/desktop frame: preview at the selected device size -->
  <div
    class="phone"
    style:width="{device.w + 24}px"
    style:height="min({device.h + 24}px, calc(100vh - 6rem))"
  >
    <div class="screen" style:background={ctrl.bgColor}>
      <!-- Real viewer header chrome (mirrors SequenceViewerDrawerHost .drawer-header) -->
      <header class="vp-header">
        <div class="vp-header-actions left">
          <button class="vp-hbtn" aria-label="More options"><i class="fas fa-ellipsis-vertical" aria-hidden="true"></i></button>
        </div>
        <div class="vp-header-title">Sequence Viewer</div>
        <div class="vp-header-actions right">
          <button class="vp-hbtn close" aria-label="Close viewer"><i class="fas fa-times" aria-hidden="true"></i></button>
        </div>
      </header>

      <div class="viewer">
      {#if loading}
        <div class="state"><i class="fas fa-spinner fa-spin" aria-hidden="true"></i></div>
      {:else if error}
        <div class="state error"><i class="fas fa-triangle-exclamation" aria-hidden="true"></i><p>{error}</p></div>
      {:else if !currentSeq}
        <div class="state"><i class="fas fa-atom" aria-hidden="true"></i><p>No sequences</p></div>
      {:else}
        <button
          type="button"
          class="stage"
          bind:this={stageEl}
          style:padding-bottom="{dockHeight + 14}px"
          onclick={togglePlay}
          aria-label={ctrl.paused ? "Play animation" : "Pause animation"}
        >
          <div class="stage-inner">
            <SequenceMandala
              sequence={currentSeq}
              animate={!ctrl.paused}
              animateMin={0}
              animateMax={ctrl.rangeMax}
              animatePeriod={ctrl.period}
              animateEasing="breathe"
              animateRotation={ctrl.rotation}
              pathShape={ctrl.pathShape}
              size={stageSize}
              leftPropType={leftProp}
              rightPropType={rightProp}
              mode="card-back"
              style="stroke"
              show="both"
              palette={ctrl.palette}
              strokeWidth={ctrl.lineWeight}
              gradient={ctrl.gradientColors}
            />
            <span class="play-flash" class:show={playFlash} aria-hidden="true">
              <i class="fas {ctrl.paused ? 'fa-pause' : 'fa-play'}"></i>
            </span>
          </div>
        </button>

        <MandalaControlDock {ctrl} onHeightChange={(px) => (dockHeight = px)} />
      {/if}
      </div>

      <ViewerModeBottomBar
        activeMode={viewerMode}
        onSelectMode={(m: ContentType) => { viewerMode = m; }}
        onSelectSplit={() => { viewerMode = "split"; }}
      />

      <MandalaExportTakeover {ctrl} sequence={currentSeq} leftPropType={leftProp} rightPropType={rightProp} size={takeoverSize} />
    </div>
  </div>
</div>

<style>
  .page {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    padding: 1rem;
    background: #07070f;
    color: #e2e8f0;
  }

  .harness {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    font-size: 0.8rem;
  }
  .seg {
    display: flex;
    gap: 1px;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 8px;
    padding: 3px;
  }
  .seg button {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 0.35rem 0.7rem;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: inherit;
    cursor: pointer;
    opacity: 0.55;
    font-size: 0.75rem;
  }
  .seg button.active {
    background: rgba(167, 139, 250, 0.2);
    opacity: 1;
  }
  .badge {
    font-size: 0.6rem;
    padding: 0 5px;
    border-radius: 8px;
    background: rgba(167, 139, 250, 0.3);
    color: #c4b5fd;
  }
  .deck-select {
    padding: 0.4rem 0.6rem;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(0, 0, 0, 0.3);
    color: inherit;
    font-size: 0.75rem;
    max-width: 220px;
  }
  .picker {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }
  .picker button {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.04);
    color: inherit;
    cursor: pointer;
  }
  .picker-word {
    min-width: 90px;
    text-align: center;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    font-size: 0.85rem;
  }
  .count {
    opacity: 0.4;
    font-variant-numeric: tabular-nums;
    font-size: 0.72rem;
  }
  .device-seg button { font-size: 0.7rem; }
  .fresh-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0.4rem 0.8rem;
    border-radius: 8px;
    border: 1px solid rgba(251, 191, 36, 0.4);
    background: rgba(251, 191, 36, 0.12);
    color: #fbbf24;
    font-size: 0.72rem;
    font-weight: 600;
    cursor: pointer;
  }
  .fresh-btn:active { transform: scale(0.96); }

  .phone {
    max-width: 100%;
    border-radius: 44px;
    padding: 12px;
    background: #15151f;
    box-shadow:
      0 0 0 2px rgba(255, 255, 255, 0.06),
      0 30px 80px rgba(0, 0, 0, 0.6);
    transition: width 320ms cubic-bezier(0.2, 0.8, 0.2, 1), height 320ms cubic-bezier(0.2, 0.8, 0.2, 1);
  }
  .screen {
    position: relative;
    width: 100%;
    height: 100%;
    border-radius: 32px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  /* ── Viewer header chrome (mirrors .drawer-header) ──────────────── */
  .vp-header {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 2px 8px;
    min-height: 44px;
    flex-shrink: 0;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    z-index: 6;
  }
  .vp-header-actions { display: flex; align-items: center; gap: 4px; }
  .vp-header-title {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    font-size: 14px;
    font-weight: 600;
    color: var(--theme-text, #fff);
    white-space: nowrap;
    pointer-events: none;
  }
  .vp-hbtn {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 40px;
    min-height: 40px;
    background: none;
    border: none;
    border-radius: 9px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    cursor: pointer;
    font-size: 16px;
    transition: background 150ms ease, color 150ms ease, transform 120ms ease;
  }
  .vp-hbtn:hover { background: var(--theme-card-bg, rgba(255, 255, 255, 0.06)); color: #fff; }
  .vp-hbtn:active { transform: scale(0.9); }

  .viewer {
    position: relative;
    flex: 1;
    min-height: 0;
    overflow: hidden;
    display: flex;
  }

  /* ── Mandala stage (tap to play/pause) ──────────────────────────── */
  .stage {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 12px;
    transition: padding-bottom 300ms cubic-bezier(0.2, 0.8, 0.2, 1);
    appearance: none;
    border: none;
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }
  .stage-inner {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .stage :global(svg) { width: 100%; height: 100%; }

  .play-flash {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
    opacity: 0;
  }
  .play-flash i {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 64px;
    height: 64px;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.45);
    backdrop-filter: blur(6px);
    color: #fff;
    font-size: 24px;
    box-shadow: 0 4px 18px rgba(0, 0, 0, 0.5);
  }
  .play-flash.show { animation: flashPop 520ms cubic-bezier(0.2, 0.8, 0.2, 1); }
  @keyframes flashPop {
    0% { opacity: 0; transform: scale(0.7); }
    25% { opacity: 1; transform: scale(1); }
    100% { opacity: 0; transform: scale(1.25); }
  }

  .state {
    margin: auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    opacity: 0.5;
  }
  .state i { font-size: 1.8rem; }
  .state.error { color: #f87171; opacity: 1; }

  @media (prefers-reduced-motion: reduce) {
    .stage, .phone { transition: none !important; }
    .play-flash.show { animation: none !important; }
    .vp-hbtn:active { transform: none; }
  }
</style>
