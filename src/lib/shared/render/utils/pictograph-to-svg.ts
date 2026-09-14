import type { FanAppearance } from "$lib/shared/pictograph/prop/domain/fan-appearance";
/**
 * Utility for rendering Pictograph component to SVG string
 *
 * This utility mounts a PictographContainer component to a hidden DOM container,
 * waits for it to render, then extracts the SVG string.
 *
 * ARCHITECTURE NOTES:
 * - Uses Svelte 5's mount() API for programmatic component instantiation
 * - Matches desktop approach of grabbing rendered view (QPainter.drawPixmap)
 * - Browser-only utility (requires DOM)
 */

import type { PictographData } from "../../pictograph/shared/domain/models/pictograph-data";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import type { PropType } from "../../pictograph/prop/domain/enums/prop-type";
import PictographContainer from "../../pictograph/shared/components/PictographContainer.svelte";
import { mount, tick, unmount } from "svelte";

/**
 * Visibility settings for pictograph rendering
 * When provided, these override the global visibility settings
 */
export interface PictographVisibilityOptions {
  fanAppearance?: FanAppearance;
  primaryPropColors?: { left: string; right: string } | null;
  showTKA?: boolean; // TKA Glyph includes turn numbers
  showTnD?: boolean;
  showElemental?: boolean;
  showPositions?: boolean;
  showReversals?: boolean;
  showNonRadialPoints?: boolean;
  /** Dark Mode - dark background, inverted grid, white text/outlines */
  darkMode?: boolean;
  /** Print Mode - pure white background for professional printing (overrides darkMode) */
  printMode?: boolean;
  /**
   * Explicit prop type for the left hand.
   * When provided, passed through to PictographPreparer to ensure consistency
   * during async rendering. Export/thumbnail rendering always provides this.
   */
  leftPropType?: PropType;
  /**
   * Explicit prop type for the right hand.
   * When provided, passed through to PictographPreparer for consistency.
   */
  rightPropType?: PropType;
  /**
   * Buugeng chirality for the left prop. An S-shaped prop is rotation-invariant,
   * so only a mirror changes its handedness — the raster path applies the same
   * scaleX(-1) that PropSvg applies in the live DOM. Ignored for other props.
   */
  leftBuugengFlipped?: boolean;
  /** Buugeng chirality for the right prop. See leftBuugengFlipped. */
  rightBuugengFlipped?: boolean;
  /**
   * Hand point visibility setting for grid rendering.
   * "all" shows all hand positions, "active" shows only active ones, "none" hides all.
   */
  handPointVisibility?: "all" | "active" | "none";
  /**
   * Whether to show the grid background.
   * When false, hides the entire grid (center, hand points, outer corners).
   */
  showGrid?: boolean;
  /**
   * When true, render only the base grid (center + outer corner points).
   * Hand points and layer 2 points are excluded - they're rendered in a separate layer.
   * Used by LayerCompositor for compositional caching.
   */
  baseGridOnly?: boolean;
  /** Render as hand path visualization (HAND props, float arrows, no TKA) */
  handPathMode?: boolean;
  /** Show blue motion (prop + arrow). When false, renderer skips blue entirely. Default: true. */
  showLeftMotion?: boolean;
  /** Show red motion (prop + arrow). When false, renderer skips red entirely. Default: true. */
  showRightMotion?: boolean;
}

/**
 * Render a Pictograph component to SVG string
 *
 * @param pictographData - StepData or PictographData to render
 * @param size - Size of the SVG viewBox (will be size x size)
 * @param stepNumber - Optional beat number to display (for export)
 * @param visibilityOptions - Optional visibility settings to override global defaults
 * @returns Promise<string> - SVG string ready to be converted to canvas
 */
export async function renderPictographToSVG(
  pictographData: StepData | PictographData,
  size: number = 300,
  stepNumber?: number,
  visibilityOptions?: PictographVisibilityOptions
): Promise<string> {
  // Debug: Log visibility options being passed

  // Create hidden container
  const container = document.createElement("div");
  container.style.position = "absolute";
  container.style.left = "-9999px";
  container.style.top = "-9999px";
  container.style.width = `${size}px`;
  container.style.height = `${size}px`;
  container.style.opacity = "0";
  container.style.pointerEvents = "none";

  document.body.appendChild(container);

  try {
    // Prepare pictograph data with beat number if provided
    // IMPORTANT: Explicitly set stepNumber to undefined when not provided,
    // otherwise the original pictographData.stepNumber will be preserved
    const dataWithBeatNumber =
      stepNumber !== undefined
        ? { ...pictographData, stepNumber }
        : { ...pictographData, stepNumber: undefined };

    // Build props object explicitly (not using spread) to ensure visibility settings are passed
    const componentProps: Record<string, unknown> = {
      pictographData: dataWithBeatNumber,
      disableTransitions: true, // Disable container transitions for export
      disableContentTransitions: true, // Disable content transitions for export
    };

    // Add visibility settings explicitly if provided
    if (visibilityOptions) {
      componentProps.showTKA = visibilityOptions.showTKA; // TKA Glyph includes turn numbers
      componentProps.showTnD = visibilityOptions.showTnD;
      componentProps.showElemental = visibilityOptions.showElemental;
      componentProps.showPositions = visibilityOptions.showPositions;
      componentProps.showReversals = visibilityOptions.showReversals;
      componentProps.showNonRadialPoints =
        visibilityOptions.showNonRadialPoints;
      componentProps.darkMode = visibilityOptions.darkMode; // Dark Mode controls background/grid
      componentProps.printMode = visibilityOptions.printMode; // Print Mode: pure white background
      // Pass explicit prop types through to PictographPreparer for consistency during async rendering
      componentProps.fanAppearanceOverride = visibilityOptions.fanAppearance;
      componentProps.leftPropTypeOverride = visibilityOptions.leftPropType;
      componentProps.rightPropTypeOverride = visibilityOptions.rightPropType;
      if (visibilityOptions.showLeftMotion !== undefined) {
        componentProps.showLeftMotion = visibilityOptions.showLeftMotion;
      }
      if (visibilityOptions.showRightMotion !== undefined) {
        componentProps.showRightMotion = visibilityOptions.showRightMotion;
      }
    }

    // Deterministic readiness: PictographContainer fires onReady once its prepared
    // data has been committed to the DOM. Arrows and props are derived synchronously
    // from that prepared data (PictographRenderer does no async work), so when this
    // resolves the SVG content is fully present — no DOM polling, no timed guesses.
    let signalReady!: () => void;
    const ready = new Promise<void>((resolve) => {
      signalReady = resolve;
    });
    componentProps.onReady = signalReady;

    // Mount PictographContainer with explicit visibility settings
    const component = mount(PictographContainer, {
      target: container,
      props: componentProps,
    });

    // Wait until the container reports its first prepared render is in the DOM,
    // with a safety ceiling so a prepare that never settles can't hang this export
    // — and, in batch jobs, the entire run — forever. The normal path resolves via
    // `ready` long before the ceiling; the ceiling only fires in the pathological
    // hang case, where serializing whatever rendered beats blocking indefinitely.
    // This restores the old polling code's "incomplete beats hung" guarantee without
    // reintroducing the polling.
    await Promise.race([ready, readinessCeiling(8000)]);
    await tick();

    // Inline external TKAGlyph images (letter glyphs reference SVGs via <image href>).
    // The glyph cache fetches and inlines them as data URLs so the serialized SVG is
    // self-contained. This awaits the actual fetches — it never sleeps.
    await inlineGlyphImages(container);

    // Find the SVG element in the rendered component
    const svgElement = container.querySelector("svg");

    if (!svgElement) {
      throw new Error("Failed to find SVG element in rendered Pictograph");
    }

    // CRITICAL FIX: Calculate actual bounding box of SVG content
    // The viewBox is "0 0 950 950" but content may extend beyond these bounds
    const bbox = svgElement.getBBox();

    // Use the larger of the viewBox or actual content bounds
    const viewBoxWidth = Math.max(950, Math.ceil(bbox.x + bbox.width));
    const viewBoxHeight = Math.max(950, Math.ceil(bbox.y + bbox.height));

    // Set explicit size and viewBox to accommodate all content
    svgElement.setAttribute("width", size.toString());
    svgElement.setAttribute("height", size.toString());
    svgElement.setAttribute("viewBox", `0 0 ${viewBoxWidth} ${viewBoxHeight}`);

    // Extract SVG string
    const svgString = svgElement.outerHTML;

    // Clean up component
    void unmount(component);

    return svgString;
  } finally {
    // Always clean up container
    document.body.removeChild(container);
  }
}

/**
 * Safety ceiling for the readiness signal. Resolves (never rejects) after `ms` so
 * renderPictographToSVG proceeds with whatever has rendered rather than awaiting a
 * readiness signal that — in a pathological case (a prepare that never settles) —
 * never fires. The deterministic `ready` signal wins this race in every normal
 * case; this only prevents a permanent hang.
 */
function readinessCeiling(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(() => {
      console.warn(
        `renderPictographToSVG: readiness signal did not fire within ${ms}ms; ` +
          `serializing current DOM state (render may be incomplete).`
      );
      resolve();
    }, ms);
  });
}

/**
 * Inline external TKAGlyph images so the serialized SVG is self-contained.
 *
 * TKAGlyph references letter SVGs via <image href="...">. Those hrefs point at
 * external files, which would not survive serialization to an offscreen string.
 * The glyph cache fetches each one and returns a data URL we swap in.
 *
 * Called only after PictographContainer's onReady has fired, so the <image>
 * elements are already in the DOM — there is nothing to poll for. The only wait
 * here is on the actual fetches, via Promise.all.
 */
async function inlineGlyphImages(domContainer: HTMLElement): Promise<void> {
  const images = domContainer.querySelectorAll("image[href]");
  if (images.length === 0) {
    return;
  }

  // Use module singleton getter (only in browser contexts where this function runs)
  const { getGlyphCache } = await import("../get-glyph-cache");
  const glyphCache = getGlyphCache();

  const imagePromises = Array.from(images).map(async (img) => {
    const imageElement = img as SVGImageElement;
    const href = imageElement.getAttribute("href");

    if (!href) {
      return;
    }

    try {
      // Use lazy-loading cache - fetches on-demand and caches automatically
      const dataUrl = await glyphCache.getOrLoadSvg(href);

      if (dataUrl) {
        imageElement.setAttribute("href", dataUrl);
      }
    } catch (error) {
      console.error(`❌ Error processing image:`, href, error);
    }
  });

  await Promise.all(imagePromises);
}
