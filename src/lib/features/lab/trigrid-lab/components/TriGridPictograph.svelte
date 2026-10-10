<!--
  TriGridPictograph.svelte - Pictograph-style renderer for the 3-point trigrid.

  Matches the existing pictograph aesthetic:
  - Static SVG grid loaded via SvgPreloader, stripped and injected
  - Props loaded from static/images/props/pictograph/triad.svg
  - Transform chain: translate(x,y) rotate(angle) translate(-cx,-cy)
  - Dark background, currentColor grid elements
  - 950x950 viewBox, center at (475, 475)
-->
<script lang="ts">
  import type { GridLocation } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
  import type { TriGridMode } from "../domain/trigrid-types";
  import { Orientation } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
  import { svgPreloader } from "#lib/shared/pictograph/shared/services/svg-preloader.js";
  import { getTriGridCalculator } from "../get-tri-grid-calculator";
  import { TRIGRID_SVG_SIZE } from "../domain/trigrid-constants";
  import { applyColorToSvg } from "#lib/shared/utils/svg-color-utils.js";
  import { BLUE_PROP_COLOR, RED_PROP_COLOR } from "../domain/trigrid-colors";
  import { toast } from "#lib/shared/toast/state/toast-state.svelte.js";

  interface Props {
    mode: TriGridMode;
    leftLocation: GridLocation;
    rightLocation: GridLocation;
    leftOrientation: Orientation;
    rightOrientation: Orientation;
    showGrid: boolean;
  }

  const {
    mode,
    leftLocation,
    rightLocation,
    leftOrientation,
    rightOrientation,
    showGrid,
  }: Props = $props();

  const calculator = getTriGridCalculator();

  // Triad SVG center point (from viewBox 0 0 248.76 219.09)
  const TRIAD_CENTER_X = 124.38;
  const TRIAD_CENTER_Y = 109.545;

  // Prop colors matching existing pictograph convention (shared module)
  const BLUE_COLOR = BLUE_PROP_COLOR;
  const RED_COLOR = RED_PROP_COLOR;

  // SVG content loaded from static files
  let gridSvgContent = $state("");
  let triadSvgContent = $state("");

  // Async load lifecycle so the canvas can show loading / error states
  let loadStatus = $state<"loading" | "ready" | "error">("loading");

  // Load grid and prop SVGs via SvgPreloader (same pattern as GridSvg.svelte)
  $effect(() => {
    loadAssets();
  });

  async function loadAssets(): Promise<void> {
    loadStatus = "loading";
    try {
      const [gridSvg, propSvg] = await Promise.all([
        svgPreloader.getSvgContent("grid", "trigrid_grid"),
        svgPreloader.getSvgContent("prop", "triad"),
      ]);
      gridSvgContent = stripSvgWrapper(gridSvg);
      triadSvgContent = stripSvgWrapper(propSvg);
      loadStatus = "ready";
    } catch (err) {
      console.error("Failed to load trigrid assets:", err);
      loadStatus = "error";
      toast.error("Failed to load trigrid assets. Check that grid and triad SVGs are available.");
    }
  }

  /** Strip outer <svg> wrapper so content respects parent coordinate system */
  function stripSvgWrapper(svgContent: string): string {
    let content = svgContent.replace(/<svg[^>]*>/i, "");
    content = content.replace(/<\/svg>/i, "");
    return content.trim();
  }

  /**
   * Apply color to triad SVG content using the shared svg-color-utils.
   * Same approach as PropSvgLoader: replaces all non-preserved fill colors.
   */
  function colorizedTriad(color: string): string {
    if (!triadSvgContent) return "";
    return applyColorToSvg(triadSvgContent, color);
  }

  // Grid rotation: rotate the base grid SVG to match the triangle orientation.
  // The grid SVG is drawn in upright position (apex north).
  const gridRotation = $derived(
    mode === "upright" ? 0 :
    mode === "right" ? 90 :
    mode === "inverted" ? 180 :
    270 // left
  );

  // Hand points for prop positioning
  const handPoints = $derived(calculator.getHandPoints(mode));

  // Beta detection: both props at the same vertex
  const isBeta = $derived(leftLocation === rightLocation);

  // Prop transform chains (matching PropSvg.svelte pattern)
  const leftTransform = $derived.by(() => {
    let pt = handPoints.get(leftLocation);
    if (!pt) return "";
    if (isBeta) {
      const offset = calculator.computeBetaOffset(leftLocation, "left", mode);
      pt = { x: pt.x + offset.x, y: pt.y + offset.y };
    }
    const angle = calculator.computePropRotation(leftLocation, leftOrientation, mode);
    return `translate(${pt.x}, ${pt.y}) rotate(${angle}) translate(${-TRIAD_CENTER_X}, ${-TRIAD_CENTER_Y})`;
  });

  const rightTransform = $derived.by(() => {
    let pt = handPoints.get(rightLocation);
    if (!pt) return "";
    if (isBeta) {
      const offset = calculator.computeBetaOffset(rightLocation, "right", mode);
      pt = { x: pt.x + offset.x, y: pt.y + offset.y };
    }
    const angle = calculator.computePropRotation(rightLocation, rightOrientation, mode);
    // Red prop is mirrored (scaleX(-1)) like in the existing pipeline.
    // SVG transforms apply right-to-left: center → mirror → rotate → position.
    // The mirror flips the prop from pointing-right to pointing-left (adds 180°).
    // To compensate, subtract 180° from the rotation so the visual direction is correct.
    const mirrorCompensatedAngle = angle - 180;
    return `translate(${pt.x}, ${pt.y}) rotate(${mirrorCompensatedAngle}) scale(-1, 1) translate(${-TRIAD_CENTER_X}, ${-TRIAD_CENTER_Y})`;
  });

</script>

<div class="trigrid-stage">
  <svg
  viewBox="0 0 {TRIGRID_SVG_SIZE} {TRIGRID_SVG_SIZE}"
  class="trigrid-pictograph"
  role="img"
  aria-label="Trigrid pictograph with {mode} triangle"
>
  <!-- Dark background -->
  <rect width={TRIGRID_SVG_SIZE} height={TRIGRID_SVG_SIZE} class="pictograph-bg" />

  <!-- Grid layer: loaded via SvgPreloader, rotated for inverted mode -->
  {#if showGrid && gridSvgContent}
    <g class="grid-container" class:inverted-mode={mode === "inverted"} transform="rotate({gridRotation}, 475, 475)">
      <g class="grid-layer">
        {@html gridSvgContent}
      </g>
    </g>
  {/if}

  <!-- Blue prop -->
  {#if triadSvgContent && handPoints.get(leftLocation)}
    <g class="prop-svg blue-prop" transform={leftTransform}>
      {@html colorizedTriad(BLUE_COLOR)}
    </g>
  {/if}

  <!-- Red prop -->
  {#if triadSvgContent && handPoints.get(rightLocation)}
    <g class="prop-svg red-prop" transform={rightTransform}>
      {@html colorizedTriad(RED_COLOR)}
    </g>
  {/if}
  </svg>

  {#if loadStatus === "loading"}
    <div class="stage-status" role="status" aria-live="polite">
      <i class="fas fa-circle-notch fa-spin" aria-hidden="true"></i>
      <span>Loading assets…</span>
    </div>
  {:else if loadStatus === "error"}
    <div class="stage-status error" role="alert">
      <i class="fas fa-triangle-exclamation" aria-hidden="true"></i>
      <span>Couldn't load trigrid assets.</span>
      <button type="button" class="retry-btn" onclick={() => loadAssets()}>Retry</button>
    </div>
  {/if}
</div>

<style>
  .trigrid-stage {
    position: relative;
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .trigrid-pictograph {
    width: 100%;
    height: 100%;
    max-width: 100%;
    max-height: 100%;
  }

  .pictograph-bg {
    fill: var(--pictograph-bg, #000000);
  }

  /* Grid styling matching existing pictograph conventions */
  .grid-container {
    color: var(--pictograph-grid-color, #d0d0d0);
  }

  :global(:root.dark) .grid-container {
    color: var(--pictograph-grid-color-dark, #d0d0d0);
  }

  :global(:root:not(.dark)) .grid-container {
    color: var(--pictograph-grid-color-light, #333333);
  }

  .stage-status {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    text-align: center;
    padding: 16px;
    font-size: var(--font-size-min, 14px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    background: rgba(0, 0, 0, 0.4);
    pointer-events: none;
  }

  .stage-status i {
    font-size: 24px;
  }

  .stage-status.error {
    color: var(--theme-text, #ffffff);
    pointer-events: auto;
  }

  .stage-status.error i {
    color: var(--theme-danger, #f87171);
  }

  .retry-btn {
    min-height: var(--min-touch-target);
    padding: 0 16px;
    background: transparent;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.2));
    border-radius: 8px;
    color: var(--theme-text, #ffffff);
    font-size: var(--font-size-compact, 12px);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .retry-btn:hover {
    border-color: var(--theme-accent, #10b981);
    color: var(--theme-accent, #10b981);
  }

  /* Prop opacity */
  .prop-svg {
    opacity: 0.85;
  }
</style>
