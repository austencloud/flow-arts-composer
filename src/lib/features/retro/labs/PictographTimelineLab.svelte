<!--
  PictographTimelineLab.svelte - Unified pictograph comparison across eras.

  Shows the same pictograph rendered three ways side by side:
  - 2026: Modern SVG (the real PictographContainer)
  - 1995: 128×128 pixel canvas with Bayer dithering
  - 1989: Braille/ASCII terminal rendering

  Prev/next navigation cycles through real pictograph data from the CSV dataframe.

  Domain: Retro Labs
-->
<script lang="ts">
  import { onMount } from "svelte";
  import PictographContainer from "#lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import { PixelRenderer } from "#lib/features/retro/win95/services/pixel-renderer.js";
  import { XPRenderer } from "#lib/features/retro/winxp/services/xp-renderer.js";
  import { SvgToBrailleConverter } from "#lib/features/retro/dos/services/svg-to-braille-converter.js";
  import AsciiRawPreview from "./AsciiRawPreview.svelte";
  import { motionQueryHandler } from "#lib/shared/pictograph/shared/services/motion-query-handler.js";
  import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
  import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
  import type { RetroPictographData, RetroHandData } from "#lib/features/retro/shared/domain/pictograph-types.js";
  import { HandSide, MotionType, Orientation, RotationDirection, GridLocation } from "#lib/features/retro/shared/domain/pictograph-types.js";
  import { getCanvas2DRenderer } from "#lib/shared/render/get-canvas-2d-renderer.js";
  import { pictographPreparer } from "#lib/shared/pictograph/shared/services/pictograph-preparer.js";
  import "#lib/features/retro/dos/styles/dos-terminal.css";

  const pixelRenderer = new PixelRenderer(pictographPreparer);
  const xpRenderer = new XPRenderer(pictographPreparer);
  const svgToBraille = new SvgToBrailleConverter(
    getCanvas2DRenderer(),
    pictographPreparer,
  );

  const PIXEL_INTERNAL_SIZE = 128;
  const XP_INTERNAL_SIZE = 256;


  let allPictographs = $state<PictographData[]>([]);
  let currentIndex = $state(0);
  let pictograph = $derived<PictographData | null>(allPictographs[currentIndex] ?? null);
  let dataLoading = $state(true);
  let error = $state<string | null>(null);

  // 1995 pixel canvas
  let pixelCanvas = $state<HTMLCanvasElement | undefined>();

  // 2003 XP canvas
  let xpCanvas = $state<HTMLCanvasElement | undefined>();

  // 1989 braille
  let brailleLines = $state<string[]>([]);
  let brailleLoading = $state(false);

  const label = $derived(
    allPictographs.length > 0
      ? `${pictograph?.letter ?? "?"} - ${currentIndex + 1} / ${allPictographs.length}`
      : "Loading pictographs...",
  );

  // ── Load real pictographs ──

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

  // ── Convert PictographData → RetroPictographData for the pixel renderer ──

  function toRetro(data: PictographData): RetroPictographData {
    const left = data.motions?.[HandSide.LEFT];
    const right = data.motions?.[HandSide.RIGHT];

    const leftHand = {
      color: HandSide.LEFT,
      location: left?.startLocation ?? GridLocation.NORTH,
      endLocation: left?.endLocation ?? GridLocation.NORTH,
      motionType: left?.motionType ?? MotionType.STATIC,
      orientation: left?.endOrientation ?? Orientation.IN,
      turns: typeof left?.turns === "number" ? left.turns : 0,
      rotationDirection: left?.rotationDirection ?? RotationDirection.NO_ROTATION,
    };
    const rightHand = {
      color: HandSide.RIGHT,
      location: right?.startLocation ?? GridLocation.SOUTH,
      endLocation: right?.endLocation ?? GridLocation.SOUTH,
      motionType: right?.motionType ?? MotionType.STATIC,
      orientation: right?.endOrientation ?? Orientation.IN,
      turns: typeof right?.turns === "number" ? right.turns : 0,
      rotationDirection: right?.rotationDirection ?? RotationDirection.NO_ROTATION,
    };

    return {
      letter: data.letter ?? "",
      leftHand,
      rightHand,
      gridMode: data.gridMode ?? GridMode.DIAMOND,
    };
  }

  // ── Render 1995 pixel when pictograph changes ──

  $effect(() => {
    const data = pictograph;
    const canvas = pixelCanvas;
    if (!canvas || !data) return;

    const retroData = toRetro(data);
    pixelRenderer.render(canvas, retroData, PIXEL_INTERNAL_SIZE);
  });

  // ── Render 2003 XP when pictograph changes ──

  $effect(() => {
    const data = pictograph;
    const canvas = xpCanvas;
    if (!canvas || !data) return;
    const retroData = toRetro(data);
    xpRenderer.render(canvas, retroData, XP_INTERNAL_SIZE);
  });

  // ── Render 1989 braille when pictograph changes ──

  $effect(() => {
    const data = pictograph;
    if (!data) {
      brailleLines = [];
      return;
    }
    brailleLoading = true;
    svgToBraille.convert(data).then((result) => {
      brailleLines = result.lines;
      brailleLoading = false;
    }).catch(() => {
      brailleLines = [];
      brailleLoading = false;
    });
  });

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

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "ArrowLeft") { prev(); e.preventDefault(); }
    if (e.key === "ArrowRight") { next(); e.preventDefault(); }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="timeline-lab">
  <!-- Toolbar -->
  <div class="lab-toolbar">
    <button class="nav-btn" onclick={prev} disabled={dataLoading} aria-label="Previous">
      <i class="fas fa-chevron-left" aria-hidden="true"></i>
    </button>

    <span class="nav-label">{label}</span>

    <button class="nav-btn" onclick={next} disabled={dataLoading} aria-label="Next">
      <i class="fas fa-chevron-right" aria-hidden="true"></i>
    </button>

    <button class="randomize-btn" onclick={randomize} disabled={dataLoading} aria-label="Randomize">
      <i class="fas fa-dice" aria-hidden="true"></i>
    </button>
  </div>

  {#if dataLoading}
    <div class="lab-status">Loading pictographs...</div>
  {:else if error}
    <div class="lab-status lab-error">{error}</div>
  {:else}
    <!-- 2×2 era comparison grid -->
    <div class="compare-row">
      <!-- 1989: ASCII/Braille (top-left) -->
      <div class="era-column">
        <div class="era-label era-1989">1989</div>
        <div class="era-content">
          {#if brailleLoading}
            <div class="era-loading">Rendering...</div>
          {:else if brailleLines.length > 0 && brailleLines.some(l => l.replace(/&nbsp;/g, '').replace(/<[^>]*>/g, '').trim().length > 0)}
            <div class="braille-frame">
              <AsciiRawPreview htmlLines={brailleLines} compact="" />
            </div>
          {:else}
            <div class="era-placeholder">
              <span class="placeholder-icon">&#9617;</span>
              <span class="placeholder-text">Braille render empty</span>
            </div>
          {/if}
        </div>
      </div>

      <!-- 1995: Pixel (top-right) -->
      <div class="era-column">
        <div class="era-label era-1995">1995</div>
        <div class="era-content">
          <div class="pixel-frame">
            <canvas
              bind:this={pixelCanvas}
              width={PIXEL_INTERNAL_SIZE}
              height={PIXEL_INTERNAL_SIZE}
              class="pixel-canvas"
              aria-label="1995 pixel pictograph"
            ></canvas>
          </div>
        </div>
      </div>

      <!-- 2003: XP (bottom-left) -->
      <div class="era-column">
        <div class="era-label era-2003">2003</div>
        <div class="era-content">
          <div class="xp-frame">
            <canvas
              bind:this={xpCanvas}
              width={XP_INTERNAL_SIZE}
              height={XP_INTERNAL_SIZE}
              class="xp-canvas"
              aria-label="2003 XP pictograph"
            ></canvas>
          </div>
        </div>
      </div>

      <!-- 2026: Modern SVG (bottom-right) -->
      <div class="era-column">
        <div class="era-label era-2026">2026</div>
        <div class="era-content">
          {#if pictograph}
            <div class="svg-frame">
              <PictographContainer
                pictographData={pictograph}
                showTKA={true}
                darkMode={true}
              />
            </div>
          {/if}
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .timeline-lab {
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
    flex-shrink: 0;
  }

  .nav-label {
    font-size: var(--font-size-min, 14px);
    font-weight: 500;
    color: var(--theme-text, #fff);
    font-family: "SF Mono", "Fira Code", "Courier New", monospace;
    min-width: 180px;
    text-align: center;
    letter-spacing: 0.5px;
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

  .randomize-btn {
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
    .randomize-btn:not(:disabled):hover {
      border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
      color: var(--theme-text, #fff);
    }
  }

  .randomize-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  /* ── 2×2 era comparison grid ── */

  .compare-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-template-rows: 1fr 1fr;
    flex: 1;
    min-height: 0;
    gap: 1px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.08));
  }

  .era-column {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
  }

  .era-label {
    text-align: center;
    font-size: var(--font-size-compact, 12px);
    font-weight: 700;
    padding: 6px 0;
    text-transform: uppercase;
    letter-spacing: 2px;
    font-family: "SF Mono", "Fira Code", "Courier New", monospace;
  }

  .era-1989 { color: #33ff33; }
  .era-1995 { color: #6666ff; }
  .era-2003 { color: #FF9933; }
  .era-2026 { color: var(--theme-text-dim, rgba(255, 255, 255, 0.6)); }

  .era-content {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 0;
    min-width: 0;
    padding: 8px;
    container-type: size;
    overflow: hidden;
  }

  .era-loading {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.4));
    font-size: var(--font-size-min, 14px);
  }

  /* ── Braille frame (1989) ── */

  .braille-frame {
    width: min(100cqw, 100cqh);
    height: min(100cqw, 100cqh);
    aspect-ratio: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    background: #0a0a0f;
    border-radius: 4px;
    container-type: inline-size;
  }

  /*
    Override the child component's scoped styles. We use !important because
    Svelte scoped selectors in AsciiRawPreview have equal or higher specificity
    than our :global() selectors here, and we need the timeline layout to win.
  */
  .braille-frame :global(.raw-wrap) {
    width: 100% !important;
    height: 100% !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    gap: 0 !important;
  }

  .braille-frame :global(.raw-canvas) {
    /*
      The braille grid is 50 chars wide × ~25 lines tall.
      Each monospace character cell is ~0.6em wide, so 50 chars = 30em.
      To fill the container: font-size = containerWidth / 30.
      100cqw / 30 = 3.33cqw. We use 3.2cqw with a slight margin for padding.
      The 2026 SVG and 1995 pixel art fill their frames fully, so we want
      the braille text block to visually fill the same area.
    */
    width: 100% !important;
    height: 100% !important;
    max-width: none !important;
    display: flex !important;
    flex-direction: column !important;
    align-items: center !important;
    justify-content: center !important;
    font-size: clamp(4px, 3.2cqw, 16px) !important;
    line-height: 1.15 !important;
    padding: 3% !important;
    overflow: hidden !important;
    border: none !important;
    border-radius: 0 !important;
    background: transparent !important;
    box-sizing: border-box !important;
    flex: unset !important;
  }

  /* Center each braille line within the canvas */
  .braille-frame :global(.raw-line) {
    text-align: center !important;
    width: 100% !important;
  }

  /* Hide copy button in timeline view */
  .braille-frame :global(.copy-btn) {
    display: none !important;
  }

  /* ── Pixel frame (1995) ── */

  .pixel-frame {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
  }

  .pixel-canvas {
    image-rendering: pixelated;
    image-rendering: crisp-edges;
    display: block;
    width: min(100cqw, 100cqh);
    height: min(100cqw, 100cqh);
    aspect-ratio: 1;
    background: #c0c0c0;
    border: 2px inset #c0c0c0;
    box-sizing: border-box;
  }

  /* ── XP frame (2003) ── */

  .xp-frame {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
  }

  .xp-canvas {
    display: block;
    width: min(100cqw, 100cqh);
    height: min(100cqw, 100cqh);
    aspect-ratio: 1;
    background: #ffffff;
  }

  /* ── SVG frame (2026) ── */

  .svg-frame {
    width: min(100cqw, 100cqh);
    height: min(100cqw, 100cqh);
    aspect-ratio: 1;
  }

  /* ── Placeholder (empty render) ── */

  .era-placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.3));
  }

  .placeholder-icon {
    font-size: 48px;
    opacity: 0.3;
  }

  .placeholder-text {
    font-size: var(--font-size-compact, 12px);
    font-family: "SF Mono", "Fira Code", "Courier New", monospace;
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
