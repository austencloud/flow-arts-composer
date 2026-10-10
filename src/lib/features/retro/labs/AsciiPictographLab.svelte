<!--
  AsciiPictographLab.svelte - SVG vs Braille comparison lab.

  Side-by-side: real SVG pictograph on the left, braille-downsampled
  version on the right. Loads real pictographs from the CSV dataframe
  via motionQueryHandler, with a randomize button to cycle through them.

  Domain: Retro DOS Terminal
-->
<script lang="ts">
  import { onMount } from "svelte";
  import { SvgToBrailleConverter } from "#lib/features/retro/dos/services/svg-to-braille-converter.js";
  import AsciiRawPreview from "./AsciiRawPreview.svelte";
  import PictographContainer from "#lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import { motionQueryHandler } from "#lib/shared/pictograph/shared/services/motion-query-handler.js";
  import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
  import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
  import { getCanvas2DRenderer } from "#lib/shared/render/get-canvas-2d-renderer.js";
  import { pictographPreparer } from "#lib/shared/pictograph/shared/services/pictograph-preparer.js";
  import "#lib/features/retro/dos/styles/dos-terminal.css";

  const svgToBraille = new SvgToBrailleConverter(
    getCanvas2DRenderer(),
    pictographPreparer,
  );


  let allPictographs = $state<PictographData[]>([]);
  let currentIndex = $state(0);
  let pictograph = $derived<PictographData | null>(allPictographs[currentIndex] ?? null);
  let brailleLines = $state<string[]>([]);
  let brailleLoading = $state(false);
  let renderTimeMs = $state(0);
  let dataLoading = $state(true);
  let error = $state<string | null>(null);

  const label = $derived(
    allPictographs.length > 0
      ? `${pictograph?.letter ?? "?"} - ${currentIndex + 1} / ${allPictographs.length}`
      : "Loading pictographs...",
  );

  // Load real pictographs from CSV dataframe
  onMount(async () => {
    try {
      const pictographs = await motionQueryHandler.queryMotions({ gridMode: GridMode.DIAMOND });
      allPictographs = pictographs;
      currentIndex = 0;
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load pictographs";
    } finally {
      dataLoading = false;
    }
  });

  // Convert to braille when pictograph changes
  $effect(() => {
    const data = pictograph;
    if (!data) {
      brailleLines = [];
      return;
    }
    brailleLoading = true;
    svgToBraille.convert(data).then((result) => {
      brailleLines = result.lines;
      renderTimeMs = result.renderTimeMs;
      brailleLoading = false;
    }).catch((e) => {
      console.error("Braille conversion failed:", e);
      brailleLines = [];
      brailleLoading = false;
    });
  });

  function randomize() {
    if (allPictographs.length === 0) return;
    currentIndex = Math.floor(Math.random() * allPictographs.length);
  }

  function prev() {
    if (allPictographs.length === 0) return;
    currentIndex = (currentIndex - 1 + allPictographs.length) % allPictographs.length;
  }

  function next() {
    if (allPictographs.length === 0) return;
    currentIndex = (currentIndex + 1) % allPictographs.length;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "ArrowLeft") { prev(); e.preventDefault(); }
    if (e.key === "ArrowRight") { next(); e.preventDefault(); }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="lab">
  <div class="lab-toolbar">
    <button class="nav-btn" onclick={prev} disabled={dataLoading} aria-label="Previous">
      <i class="fas fa-chevron-left" aria-hidden="true"></i>
    </button>

    <button class="randomize-btn" onclick={randomize} disabled={dataLoading}>
      <i class="fas fa-dice" aria-hidden="true"></i>
      Randomize
    </button>

    <button class="nav-btn" onclick={next} disabled={dataLoading} aria-label="Next">
      <i class="fas fa-chevron-right" aria-hidden="true"></i>
    </button>
  </div>

  <div class="lab-info">
    <span class="nav-label">{label}</span>
    {#if renderTimeMs > 0}
      <span class="render-time">{Math.round(renderTimeMs)}ms</span>
    {/if}
  </div>

  {#if dataLoading}
    <div class="lab-status">Loading pictographs from dataframe...</div>
  {:else if error}
    <div class="lab-status lab-error">{error}</div>
  {:else}
    <div class="compare-split">
      <!-- Left: real SVG pictograph -->
      <div class="compare-pane">
        <div class="compare-label">SVG (real)</div>
        <div class="svg-wrap">
          {#if pictograph}
            <div class="svg-pictograph">
              <PictographContainer
                pictographData={pictograph}
                showTKA={true}
                darkMode={true}
              />
            </div>
          {/if}
        </div>
      </div>

      <div class="compare-divider"></div>

      <!-- Right: braille downsampled -->
      <div class="compare-pane">
        <div class="compare-label braille-label">Braille (downsampled)</div>
        <div class="braille-wrap">
          {#if brailleLoading}
            <div class="lab-status">Rendering...</div>
          {:else}
            <AsciiRawPreview htmlLines={brailleLines} compact="" />
          {/if}
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .lab {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: 1rem;
    gap: 0.75rem;
    color: var(--theme-text, #fff);
  }


  .lab-toolbar {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
  }

  .lab-info {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 1rem;
  }

  .nav-label {
    font-size: var(--font-size-min, 14px);
    font-weight: 500;
    color: var(--theme-text, #fff);
    font-family: "SF Mono", "Fira Code", "Courier New", monospace;
    letter-spacing: 0.5px;
  }

  .render-time {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.4));
    font-family: "SF Mono", "Fira Code", "Courier New", monospace;
  }

  .nav-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 50%;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    font-size: var(--font-size-min, 14px);
    cursor: pointer;
    transition:
      border-color var(--duration-fast, 150ms) ease,
      color var(--duration-fast, 150ms) ease;
  }

  @media (hover: hover) {
    .nav-btn:not(:disabled):hover {
      border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
      color: var(--theme-text, #fff);
    }
  }

  .nav-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .nav-btn:focus-visible {
    outline: 2px solid var(--theme-accent, #33ff33);
    outline-offset: 2px;
  }

  .randomize-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 20px;
    min-height: 40px;
    border: 1px solid color-mix(in srgb, #33ff33 40%, transparent);
    border-radius: 100px;
    background: color-mix(in srgb, #33ff33 12%, transparent);
    color: #33ff33;
    font-size: var(--font-size-min, 14px);
    font-weight: 500;
    cursor: pointer;
    transition:
      background var(--duration-fast, 150ms) ease,
      border-color var(--duration-fast, 150ms) ease;
  }

  @media (hover: hover) {
    .randomize-btn:not(:disabled):hover {
      background: color-mix(in srgb, #33ff33 20%, transparent);
      border-color: color-mix(in srgb, #33ff33 60%, transparent);
    }
  }

  .randomize-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .randomize-btn:focus-visible {
    outline: 2px solid #33ff33;
    outline-offset: 2px;
  }


  .compare-split {
    display: flex;
    flex: 1;
    min-height: 0;
  }

  .compare-pane {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
  }

  .compare-label {
    text-align: center;
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    padding: 4px 0;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    font-family: "SF Mono", "Fira Code", "Courier New", monospace;
  }

  .braille-label {
    color: #ff6b6b;
  }

  .compare-divider {
    width: 1px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.1));
    margin: 0 4px;
  }

  /* Left pane: SVG pictograph */

  .svg-wrap {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 0;
    padding: 8px;
  }

  .svg-pictograph {
    width: min(100%, 400px);
    aspect-ratio: 1;
  }

  /* Right pane: braille output */

  .braille-wrap {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 0;
    overflow: auto;
  }


  .lab-status {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
    font-size: var(--font-size-min, 14px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
  }

  .lab-error {
    color: var(--semantic-error, #ef4444);
  }

  @media (prefers-reduced-motion: reduce) {
    .nav-btn,
    .randomize-btn {
      transition: none;
    }
  }
</style>
