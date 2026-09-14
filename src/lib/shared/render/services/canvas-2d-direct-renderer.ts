import type {
  IDirectRenderer,
  DirectRenderOptions,
  RenderTiming,
} from "./IDirectRenderer";
import type { PictographData } from "../../pictograph/shared/domain/models/pictograph-data";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import type { PreparedPictographData } from "../../pictograph/shared/domain/models/prepared-pictograph-data";
import { GridMode } from "../../pictograph/grid/domain/enums/grid-enums";
import { getSvgImageCache } from "./svg-image-cache";
import { getSvgAssetLoader } from "./svg-asset-loader";
import { isDashLetter } from "../../pictograph/tka-glyph/utils/letter-image-getter";
import type { Letter } from "../../foundation/domain/models/letter";
import type { PictographPreparer } from "../../pictograph/shared/services/pictograph-preparer";
import { turnsTupleGenerator } from "../../pictograph/arrow/positioning/placement/services/turns-tuple-generator";
import {
  drawTKAGlyph,
  drawTurnsColumn,
  drawDirectionDot,
  drawElementalGlyph,
  drawPositionGlyph,
  drawSoloMotionGlyph,
  drawReversalIndicators,
} from "./canvas-2d-glyph-renderer";
import {
  wrapSvgContent,
  shouldMirrorProp,
  drawElementWithTransform,
  drawDash,
} from "./canvas-2d-transform-helper";
import { createRenderCanvas } from "./create-render-canvas";
import type { RenderCanvas } from "./types";
import { captureException } from "$lib/shared/analytics/services/posthog";
import { HandSide } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";

import { applyColorToSvg, getMotionColor, SELECTIVE_COLOR_PROP_TYPES } from "$lib/shared/utils/svg-color-utils";

const VIEWBOX_SIZE = 950;

const BASE_GRID_POINTS = {
  center: { x: 475, y: 475, r: 12 },
  outer: {
    n: { x: 475, y: 175, r: 25 },
    e: { x: 775, y: 475, r: 25 },
    s: { x: 475, y: 775, r: 25 },
    w: { x: 175, y: 475, r: 25 },
  },
};

const GRID_POINT_COLOR_LIGHT = "#000000";
const GRID_POINT_COLOR_DARK = "#ffffff";
const getTurnsTupleGenerator = () => turnsTupleGenerator;

// One broken asset can be requested by every visible cell. Report each unique
// prop/browser failure once so PostHog gets the cause without a grid-sized
// burst of duplicate exceptions.
const reportedPropDrawFailures = new Set<string>();

export class Canvas2DDirectRenderer implements IDirectRenderer {
  private initialized = false;
  private memoryUsage = 0;
  private preparer?: PictographPreparer;

  // Global preparer function that can be set at app initialization
  private static globalPreparerGetter?: () => PictographPreparer | undefined;

  /**
   * Set a global preparer getter function
   * Called once at app initialization to wire up DI container
   */
  static setGlobalPreparerGetter(getter: () => PictographPreparer | undefined) {
    Canvas2DDirectRenderer.globalPreparerGetter = getter;
  }

  constructor(preparer?: PictographPreparer) {
    this.preparer = preparer;
  }

  getName(): string {
    return "canvas2d";
  }

  isSupported(): boolean {
    // Check for OffscreenCanvas (works in workers)
    if (typeof OffscreenCanvas !== "undefined") {
      const canvas = new OffscreenCanvas(1, 1);
      return !!canvas.getContext("2d");
    }
    // Fallback to HTMLCanvasElement (main thread only)
    if (typeof document !== "undefined") {
      const canvas = document.createElement("canvas");
      return !!canvas.getContext("2d");
    }
    return false;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Initialize the asset loader (pre-loads grids)
    const assetLoader = getSvgAssetLoader();
    await assetLoader.initialize();

    this.initialized = true;
  }

  async renderPictograph(
    pictograph: PictographData | StepData,
    options: DirectRenderOptions
  ): Promise<RenderCanvas> {
    const { canvas } = await this.renderPictographWithTiming(pictograph, options);
    return canvas;
  }

  async renderPictographWithTiming(
    pictograph: PictographData | StepData,
    options: DirectRenderOptions
  ): Promise<{ canvas: RenderCanvas; timing: RenderTiming }> {
    const timing: RenderTiming = {
      totalMs: 0,
      setupMs: 0,
      drawMs: 0,
      finalizeMs: 0,
    };

    const totalStart = performance.now();

    // Setup canvas at requested size
    const setupStart = performance.now();
    const canvas = createRenderCanvas(options.size, options.size);

    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D | null;
    if (!ctx) {
      throw new Error("Failed to get 2D context");
    }
    timing.setupMs = performance.now() - setupStart;

    // Draw all elements
    const drawStart = performance.now();
    await this.drawPictograph(ctx, pictograph as PreparedPictographData, options);
    timing.drawMs = performance.now() - drawStart;

    timing.finalizeMs = 0;
    timing.totalMs = performance.now() - totalStart;

    return { canvas, timing };
  }

  /**
   * Ensure pictograph has prepared data, calling PictographPreparer if needed
   */
  private async ensurePrepared(
    pictograph: PictographData | StepData,
    options: DirectRenderOptions
  ): Promise<PreparedPictographData> {
    const asPrepared = pictograph as PreparedPictographData;

    // If already prepared, return as-is
    if (asPrepared._prepared) {
      return asPrepared;
    }

    // Try injected preparer first, then global getter
    const preparer = this.preparer || Canvas2DDirectRenderer.globalPreparerGetter?.();

    if (preparer) {
      try {
        const prepared = await preparer.prepareSingle(pictograph, {
          fanAppearance: options.visibility.fanAppearance,
          themeMode: options.visibility.darkMode ? "dark" : "light",
          leftPropType: options.visibility.leftPropType,
          rightPropType: options.visibility.rightPropType,
          handPathMode: options.visibility.handPathMode ?? false,
          leftBuugengFlipped: options.visibility.leftBuugengFlipped,
          rightBuugengFlipped: options.visibility.rightBuugengFlipped,
        });
        return prepared;
      } catch (error) {
        console.warn("[Canvas2D] Failed to prepare pictograph:", error);
      }
    }

    // No preparer available - return unprepared (arrows/props won't render)
    return asPrepared;
  }

  /**
   * Main drawing function - renders all pictograph elements in EXACT SVG order
   */
  private async drawPictograph(
    ctx: CanvasRenderingContext2D,
    pictograph: PreparedPictographData,
    options: DirectRenderOptions
  ): Promise<void> {
    const _totalStart = performance.now();
    const { size, visibility } = options;
    const isDarkMode = visibility.darkMode ?? true;
    const scale = size / VIEWBOX_SIZE;

    // Ensure the pictograph has prepared data
    const prepareStart = performance.now();
    const preparedPictograph = await this.ensurePrepared(pictograph, options);
    const prepared = preparedPictograph._prepared;
    const _prepareTime = performance.now() - prepareStart;

    // 1. Draw background
    ctx.fillStyle = isDarkMode ? "#0a0a0f" : "#ffffff";
    ctx.fillRect(0, 0, size, size);

    // 2. Draw grid (skipped entirely when the Grid toggle is off — hides the
    //    base grid, hand points, and non-radial points together)
    const gridStart = performance.now();
    const gridMode = prepared?.gridMode ?? GridMode.DIAMOND;
    if (visibility.showGrid === false) {
      // Grid hidden — draw nothing
    } else if (visibility.baseGridOnly) {
      // Base layer mode: draw only center + outer points (no hand points or layer 2)
      this.drawBaseGridOnly(ctx, size, isDarkMode, gridMode);
    } else {
      // Full mode: draw complete grid with all points
      await this.drawGrid(ctx, size, gridMode, isDarkMode, visibility.showNonRadialPoints ?? false);
    }
    const _gridTime = performance.now() - gridStart;

    // 3. Draw props (if prepared data exists)
    let propsTime = 0;
    if (prepared) {
      const propsStart = performance.now();
      await this.drawProps(ctx, prepared, size, preparedPictograph, options);
      propsTime = performance.now() - propsStart; // eslint-disable-line @typescript-eslint/no-unused-vars
    }

    // 4. Draw arrows (if prepared data exists)
    let arrowsTime = 0;
    if (prepared) {
      const arrowsStart = performance.now();
      await this.drawArrows(ctx, prepared, size, options);
      arrowsTime = performance.now() - arrowsStart; // eslint-disable-line @typescript-eslint/no-unused-vars
    }

    // 5. Draw TKA glyph (letter)
    let letterDimensions = { width: 100, height: 100 };
    let glyphTime = 0;
    if (visibility.showTKA && preparedPictograph.letter) {
      const glyphStart = performance.now();
      letterDimensions = await drawTKAGlyph(
        ctx,
        preparedPictograph.letter as Letter,
        size,
        isDarkMode
      );
      glyphTime = performance.now() - glyphStart; // eslint-disable-line @typescript-eslint/no-unused-vars

      if (isDashLetter(preparedPictograph.letter)) {
        drawDash(ctx, letterDimensions, scale, isDarkMode);
      }
    }

    // 6. Draw turn numbers (TurnsColumn - to the RIGHT of letter)
    if (visibility.showTKA && preparedPictograph.motions) {
      await drawTurnsColumn(ctx, preparedPictograph, letterDimensions, scale, isDarkMode, getTurnsTupleGenerator, visibility);
    }

    // 7. Draw direction dot (same/opp indicator)
    if (visibility.showTKA && preparedPictograph.letter && preparedPictograph.motions) {
      drawDirectionDot(ctx, preparedPictograph, letterDimensions, scale, isDarkMode, getTurnsTupleGenerator);
    }

    // 9. Draw fused Elemental+TnD glyph (bottom-right corner)
    if (visibility.showTnD || visibility.showElemental) {
      await drawElementalGlyph(ctx, preparedPictograph, gridMode, size, isDarkMode);
    }

    // 11. Draw Position glyph or Solo motion glyph (top center)
    // When showTKA is false (e.g. ChoreoCard solo mode), skip the baked-in solo
    // glyph — CellRenderer provides its own HTML overlay for locations/turns.
    const singleColor =
      visibility.showLeftMotion === false || visibility.showRightMotion === false;
    if (singleColor && visibility.showTKA) {
      drawSoloMotionGlyph(
        ctx, preparedPictograph, size, isDarkMode,
        visibility.showLeftMotion ?? true,
        visibility.showRightMotion ?? true,
        visibility.handPathMode ?? false
      );
    } else if (visibility.showPositions) {
      await drawPositionGlyph(ctx, preparedPictograph, size, isDarkMode);
    }

    // 12. Draw reversal indicators
    if (visibility.showReversals) {
      drawReversalIndicators(ctx, preparedPictograph, size, isDarkMode, visibility);
    }


  }

  /**
   * Draw the grid using actual SVG images
   */
  private async drawGrid(
    ctx: CanvasRenderingContext2D,
    size: number,
    gridMode: GridMode,
    isDarkMode: boolean,
    showNonRadial: boolean
  ): Promise<void> {
    const assetLoader = getSvgAssetLoader();
    const gridType = gridMode === GridMode.BOX ? "box" : "diamond";
    const _scale = size / VIEWBOX_SIZE;

    // For box mode, we need to rotate the diamond grid 45 degrees
    const needsRotation = gridMode === GridMode.BOX;

    // Draw main grid
    const gridImg = assetLoader.getGridImage(gridType === "box" ? "diamond" : gridType);
    if (gridImg) {
      ctx.save();

      // Apply dark mode filter to match GridSvg.svelte's #d0d0d0 color
      // The grid SVG is black on transparent - invert to white for dark mode
      if (isDarkMode) {
        ctx.filter = "invert(1) opacity(0.85)";
      }
      // Light mode: no filter - render grid as pure black

      if (needsRotation) {
        // Rotate 45 degrees around center for box mode
        const center = size / 2;
        ctx.translate(center, center);
        ctx.rotate(45 * Math.PI / 180);
        ctx.translate(-center, -center);
      }

      ctx.drawImage(gridImg, 0, 0, size, size);
      ctx.restore();
    }

    // Draw non-radial points overlay if enabled
    if (showNonRadial) {
      const nonRadialImg = assetLoader.getNonRadialPointsImage(gridType === "box" ? "diamond" : gridType);
      if (nonRadialImg) {
        ctx.save();
        if (isDarkMode) {
          ctx.filter = "invert(1) opacity(0.85)";
        }
        // Light mode: no filter - render as pure black

        if (needsRotation) {
          const center = size / 2;
          ctx.translate(center, center);
          ctx.rotate(45 * Math.PI / 180);
          ctx.translate(-center, -center);
        }

        ctx.drawImage(nonRadialImg, 0, 0, size, size);
        ctx.restore();
      }
    }
  }

  /**
   * Draw only the base grid points (center + outer corners)
   *
   * This is used by the LayerCompositor for the base layer, which excludes
   * toggleable grid points (hand points and layer 2 points).
   * Those are rendered separately in the gridPoints layer.
   */
  drawBaseGridOnly(
    ctx: CanvasRenderingContext2D,
    size: number,
    isDarkMode: boolean,
    gridMode: GridMode = GridMode.DIAMOND
  ): void {
    const scale = size / VIEWBOX_SIZE;
    const pointColor = isDarkMode ? GRID_POINT_COLOR_DARK : GRID_POINT_COLOR_LIGHT;
    const isBoxMode = gridMode === GridMode.BOX;

    // Set opacity for grid points
    // Dark mode: slightly transparent white (avoids harsh pure white)
    // Light mode: solid black for maximum clarity
    ctx.save();
    ctx.globalAlpha = isDarkMode ? 0.85 : 1.0;

    // For box mode, rotate the entire coordinate system 45° around center
    // This matches GridSvg.svelte which rotates diamond_grid.svg for box mode
    if (isBoxMode) {
      const center = size / 2;
      ctx.translate(center, center);
      ctx.rotate(45 * Math.PI / 180);
      ctx.translate(-center, -center);
    }

    // Draw center point (unaffected by rotation since it's at center)
    ctx.fillStyle = pointColor;
    const center = BASE_GRID_POINTS.center;
    ctx.beginPath();
    ctx.arc(center.x * scale, center.y * scale, center.r * scale, 0, Math.PI * 2);
    ctx.fill();

    // Draw outer points
    // Diamond mode: filled circles. Box mode: outlined (stroked) circles.
    // This matches GridSvg.svelte's fill-opacity/stroke-opacity toggling.
    for (const point of Object.values(BASE_GRID_POINTS.outer)) {
      ctx.beginPath();
      ctx.arc(point.x * scale, point.y * scale, point.r * scale, 0, Math.PI * 2);
      if (isBoxMode) {
        // Box mode: outlined circles (stroke only, no fill)
        ctx.strokeStyle = pointColor;
        ctx.lineWidth = 13 * scale;
        ctx.stroke();
      } else {
        // Diamond mode: filled circles
        ctx.fill();
      }
    }

    ctx.restore();
  }

  private async drawProps(
    ctx: CanvasRenderingContext2D,
    prepared: NonNullable<PreparedPictographData["_prepared"]>,
    canvasSize: number,
    pictograph: PreparedPictographData,
    options: DirectRenderOptions
  ): Promise<void> {
    const { propPositions, propAssets } = prepared;
    const svgCache = getSvgImageCache();
    const scale = canvasSize / VIEWBOX_SIZE;

    const showLeft = options.visibility.showLeftMotion ?? true;
    const showRight = options.visibility.showRightMotion ?? true;

    for (const color of [HandSide.LEFT, HandSide.RIGHT]) {
      if (color === HandSide.LEFT && !showLeft) continue;
      if (color === HandSide.RIGHT && !showRight) continue;

      const position = propPositions[color];
      const assets = propAssets[color];

      if (!position || !assets?.imageSrc) continue;

      try {
        const viewBoxParts = assets.viewBox.split(" ").map(Number);
        const viewBoxWidth = viewBoxParts[0] || 100;
        const viewBoxHeight = viewBoxParts[1] || 100;

        const displayColor = options.visibility.primaryPropColors?.[color];
        const artwork = displayColor ? applyColorToSvg(assets.imageSrc, displayColor, {
          sourceColors: [getMotionColor(color, "dark"), getMotionColor(color, "light")],
          selectiveColorMode: (SELECTIVE_COLOR_PROP_TYPES as readonly string[]).includes(String(assets.propType ?? pictograph.motions?.[color]?.propType).toLowerCase()),
        }) : assets.imageSrc;
        const wrapped = wrapSvgContent(artwork, viewBoxWidth, viewBoxHeight, false);

        const cacheKey = `prop_${color}_${this.hashString(wrapped.svg)}`;
        const img = await svgCache.getImage(wrapped.svg, cacheKey);

        const mirror = shouldMirrorProp(color, pictograph, options);

        drawElementWithTransform(ctx, img, {
          x: position.x * scale,
          y: position.y * scale,
          rotation: position.rotation,
          centerX: assets.center.x,
          centerY: assets.center.y,
          viewBoxWidth,
          viewBoxHeight,
          scale,
          shouldMirror: mirror,
        });
      } catch (error) {
        const normalizedError =
          error instanceof Error ? error : new Error(String(error));
        const propType = assets.propType ?? "unknown";
        const failureKey = [
          color,
          propType,
          normalizedError.name,
          normalizedError.message,
        ].join(":");

        if (!reportedPropDrawFailures.has(failureKey)) {
          reportedPropDrawFailures.add(failureKey);
          const details = {
            renderer: "canvas2d",
            render_surface: "pictograph",
            prop_color: color,
            prop_type: propType,
            prop_view_box: assets.viewBox,
            error_name: normalizedError.name,
            error_message: normalizedError.message,
          };
          console.warn(
            "[Canvas2D] Failed to draw prop",
            details,
            normalizedError
          );
          captureException(normalizedError, details);
        }
      }
    }
  }

  private async drawArrows(
    ctx: CanvasRenderingContext2D,
    prepared: NonNullable<PreparedPictographData["_prepared"]>,
    canvasSize: number,
    options: DirectRenderOptions
  ): Promise<void> {
    const { arrowPositions, arrowAssets, arrowMirroring } = prepared;
    const svgCache = getSvgImageCache();
    const scale = canvasSize / VIEWBOX_SIZE;

    const showLeft = options.visibility.showLeftMotion ?? true;
    const showRight = options.visibility.showRightMotion ?? true;
    // Halo color matches the composed background (same isDarkMode the renderer
    // uses for the bg fill), so it is invisible against the background and only
    // shows where the arrow overlaps a same-colored prop. Shared definition.
    const isDarkMode = options.visibility.darkMode ?? true;

    for (const hand of [HandSide.LEFT, HandSide.RIGHT]) {
      if (hand === HandSide.LEFT && !showLeft) continue;
      if (hand === HandSide.RIGHT && !showRight) continue;

      const position = arrowPositions[hand];
      const assets = arrowAssets[hand];
      const mirror = arrowMirroring[hand] ?? false;

      if (!position || !assets?.imageSrc) continue;

      try {
        const viewBoxWidth = assets.viewBox.width || 100;
        const viewBoxHeight = assets.viewBox.height || 100;
        const fullViewBox = assets.viewBox.fullViewBox;

        const displayColor = options.visibility.primaryPropColors?.[hand];
        const artwork = displayColor ? applyColorToSvg(assets.imageSrc, displayColor) : assets.imageSrc;
        const wrapped = wrapSvgContent(artwork, viewBoxWidth, viewBoxHeight, true, fullViewBox, {
          id: `arrow-halo-${hand}`,
          isDarkMode,
        });

        const cacheKey = `arrow_${hand}_exp_${this.hashString(wrapped.svg)}`;
        const img = await svgCache.getImage(wrapped.svg, cacheKey);

        let viewBoxMinX = 0, viewBoxMinY = 0;
        if (fullViewBox) {
          const parts = fullViewBox.split(/\s+/);
          viewBoxMinX = parseFloat(parts[0] || "0") || 0;
          viewBoxMinY = parseFloat(parts[1] || "0") || 0;
        }

        const adjustedCenterX = (assets.center?.x ?? viewBoxWidth / 2) - viewBoxMinX + wrapped.offsetX;
        const adjustedCenterY = (assets.center?.y ?? viewBoxHeight / 2) - viewBoxMinY + wrapped.offsetY;

        drawElementWithTransform(ctx, img, {
          x: position.x * scale,
          y: position.y * scale,
          rotation: position.rotation,
          centerX: adjustedCenterX,
          centerY: adjustedCenterY,
          viewBoxWidth: wrapped.newWidth,
          viewBoxHeight: wrapped.newHeight,
          scale,
          shouldMirror: mirror,
        });
      } catch (error) {
        console.warn(`[Canvas2D] Failed to draw ${hand} arrow:`, error);
      }
    }
  }

  /**
   * Simple string hash for cache keys
   */
  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return String(hash);
  }

  getMemoryUsage(): number {
    return this.memoryUsage;
  }

  dispose(): void {
    this.memoryUsage = 0;
    this.initialized = false;
  }
}

// DIRECT EXPORT - Use this instead of getCanvas2DRenderer()
// This avoids DI container rebuilds when this file changes
export const canvas2DDirectRenderer = new Canvas2DDirectRenderer();
