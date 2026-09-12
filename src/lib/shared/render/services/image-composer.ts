import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import type { StartPositionData } from "$lib/shared/foundation/domain/models/start-position-data";
import type { PictographData } from "../../pictograph/shared/domain/models/pictograph-data";
import type { SequenceData } from "../../foundation/domain/models/sequence-data";
import { PropType } from "../../pictograph/prop/domain/enums/prop-type";
import type { PictographVisibilityOptions } from "../utils/pictograph-to-svg";
import { createStartPositionFromBeatStart } from "$lib/shared/create/services/sequence-transforms";
// These 5 imports are loaded dynamically at usage sites to avoid pulling
// Svelte stores and $app/environment into the composition worker bundle.
// See: getVisibilitySettings(), renderPictographDirect(), storePictographBlob()
import type { PreviewCellRenderOptions } from "../../sequence-viewer/services/preview-cell-renderer";
import type { SequenceExportOptions } from "../domain/models/sequence-export-options";
import type { CompositionProgressCallback } from "./types";
import type { TextRenderer } from "./text-renderer";
import type { PictographBlobCache } from "./pictograph-blob-cache";
import type { PictographKeyHasher } from "$lib/shared/render/services/pictograph-key-hasher";
import type { PictographMemoryCache } from "./pictograph-memory-cache";
import type { Canvas2DDirectRenderer } from "./canvas-2d-direct-renderer";
import type { LayerCompositor } from "./layer-compositor";
import { drawStepNumber } from "./step-number-renderer";
import type { QRCodeGenerator } from "../../qr/services/qr-code-generator";
import { blobToImage, canvasToImage, imageToBlob } from "./image-format-converter";
import { createRenderCanvas } from "./create-render-canvas";
import type { RenderCanvas } from "./types";
import { findEmptyCellForQR } from "./cell-border-renderer";
import {
  computeCardFrontLayout,
  paintCardFrontBackground,
  paintCardFrontChrome,
  buildCellLayerOptions,
} from "./card-front-assembler";
import type { CardFrontLayout, CardFrontChromeDeps } from "./card-front-assembler";
import type { LayerRenderOptions, LayerVisibility } from "./types";
import { composeCardImage as composeCardImageFn } from "./card-composer";
import { ensureCardFonts } from "./gelasio-fonts";
// mandala geometry calculate() loaded dynamically to keep its dependency graph out of the worker bundle until needed
import { renderMandalaToCanvas } from "../../mandala/services/mandala-renderer";
import { applyMandalaHandColors } from "../../mandala/domain/mandala-palette";
import { pairTipEnds } from "../../pictograph/prop/domain/prop-tip-ends";
import { getMandalaPlacements } from "../../sequence-viewer/services/get-mandala-placements";
import {
  LIGHT_MOTION_BLUE_STROKE,
  LIGHT_MOTION_RED_STROKE,
  LIGHT_MOTION_BLUE_FILL,
  LIGHT_MOTION_RED_FILL,
  LIGHT_MOTION_PURPLE_STROKE,
  LIGHT_MOTION_PURPLE_FILL,
  DARK_MOTION_BLUE_STROKE,
  DARK_MOTION_RED_STROKE,
  DARK_MOTION_BLUE_FILL,
  DARK_MOTION_RED_FILL,
  DARK_MOTION_PURPLE_STROKE,
  DARK_MOTION_PURPLE_FILL,
} from "../../mandala/domain/mandala-constants";
import type { PreparedPictographData } from '../../pictograph/shared/domain/models/prepared-pictograph-data';

const yieldToEventLoop: () => Promise<void> =
  (globalThis as unknown as Record<string, Record<string, () => Promise<void>>>).scheduler?.yield?.bind((globalThis as unknown as Record<string, unknown>).scheduler) ??
  (() => new Promise<void>((r) => setTimeout(r, 0)));

export class ImageComposer {
  private layer1Hits = 0;
  private layer1Misses = 0;
  private layer2Hits = 0;
  private layer2Misses = 0;

  private compositionL2Hits = 0;
  private compositionL1Hits = 0;
  private compositionFreshRenders = 0;

  private canvas2DInitialized = false;

  private useCompositionalCaching = true;

  constructor(
    private readonly TextRenderer: TextRenderer,
    private readonly blobCache: PictographBlobCache,
    private readonly keyHasher: PictographKeyHasher,
    private readonly memoryCache: PictographMemoryCache,
    private readonly canvas2DRenderer: Canvas2DDirectRenderer,
    private readonly layerCompositor?: LayerCompositor,
    private qrCodeGenerator?: QRCodeGenerator
  ) {}

  setQRCodeGenerator(generator: QRCodeGenerator): void {
    this.qrCodeGenerator = generator;
  }

  // composeCardFrontParallel runs cell rasterization on a worker pool but reuses
  // this composer for glyph preload, visibility resolution, chrome deps, the
  // duration badge, and the per-cell main-thread fallback. These thin accessors
  // expose exactly what that path needs without duplicating composer state.

  async preloadHeaderGlyphs(): Promise<void> {
    await this.TextRenderer.preloadGlyphImages();
  }

  async resolveVisibilitySettings(
    options: Partial<SequenceExportOptions>
  ): Promise<PictographVisibilityOptions> {
    const v = await this.getVisibilitySettings(options.visibilityOverrides);
    if (options.leftVisible === false) v.showLeftMotion = false;
    if (options.rightVisible === false) v.showRightMotion = false;
    if (v.showLeftMotion === false || v.showRightMotion === false) v.showTKA = false;
    return v;
  }

  get textRenderer() {
    return this.TextRenderer;
  }

  get qrGenerator() {
    return this.qrCodeGenerator;
  }

  drawDurationBadgePublic(
    ctx: CanvasRenderingContext2D,
    duration: number,
    x: number,
    y: number,
    size: number,
    dark: boolean
  ): void {
    this.drawDurationBadge(ctx, duration, x, y, size, dark);
  }

  async composeCellMainThread(
    prepared: PreparedPictographData,
    options: LayerRenderOptions,
    visibility: LayerVisibility,
    stepNumber: number | undefined
  ): Promise<ImageBitmap> {
    await this.ensureCanvas2DInitialized();
    if (!this.layerCompositor) throw new Error("layerCompositor unavailable");
    const result = await this.layerCompositor.compose(prepared, options, visibility, stepNumber);
    const c = result.canvas;
    return c instanceof OffscreenCanvas ? c.transferToImageBitmap() : createImageBitmap(c);
  }

  setCompositionalCaching(enabled: boolean): void {
    this.useCompositionalCaching = enabled && !!this.layerCompositor;
  }

  getLayerCacheStats() {
    return this.layerCompositor?.getCacheStats() ?? null;
  }

  private async ensureCanvas2DInitialized(): Promise<void> {
    if (!this.canvas2DInitialized) {
      await this.canvas2DRenderer.initialize();
      this.canvas2DInitialized = true;
    }
  }

  private async getVisibilitySettings(
    overrides?: SequenceExportOptions["visibilityOverrides"]
  ): Promise<PictographVisibilityOptions> {
    // Tripwire: the LOCKED card path (deckCard / printMode) must pass a full,
    // explicit visibility set so it never inherits the global vm. If a deckCard
    // render arrives with partial overrides it would silently leak app-wide
    // toggles onto printed cards — warn loudly in dev.
    if (
      (import.meta as any).env?.DEV &&
      overrides?.printMode === true &&
      overrides.showNonRadialPoints === undefined
    ) {
      console.warn(
        "[ImageComposer] Locked card render passed partial visibilityOverrides " +
          "(showNonRadialPoints undefined) — it will inherit the global vm. " +
          "Use buildCanonicalCardVisibility() for deck/print renders.",
      );
    }
    if (
      overrides?.showTKA !== undefined &&
      overrides.showTnD !== undefined &&
      overrides.showElemental !== undefined &&
      overrides.showPositions !== undefined &&
      overrides.showReversals !== undefined &&
      overrides.showNonRadialPoints !== undefined
    ) {
      // Resolve prop types: prefer overrides, fall back to app settings, then default to STAFF
      let leftPropType = overrides.leftPropType;
      let rightPropType = overrides.rightPropType;
      if (!leftPropType || !rightPropType) {
        try {
          const { getSettings } = await import("$lib/shared/application/state/app-state.svelte");
          const appSettings = getSettings();
          leftPropType ??= appSettings.leftPropType;
          rightPropType ??= appSettings.rightPropType;
        } catch {
          // Worker context — no app state available, use default prop type
          leftPropType ??= PropType.STAFF;
          rightPropType ??= PropType.STAFF;
        }
      }
      return {
        fanAppearance: overrides.fanAppearance,
        primaryPropColors: overrides.primaryPropColors,
        showTKA: overrides.showTKA,
        showTnD: overrides.showTnD,
        showElemental: overrides.showElemental,
        showPositions: overrides.showPositions,
        showReversals: overrides.showReversals,
        showNonRadialPoints: overrides.showNonRadialPoints,
        darkMode: overrides.darkMode,
        showGrid: overrides.showGrid,
        handPointVisibility: overrides.handPointVisibility,
        leftPropType,
        rightPropType,
        // Locked card path: chirality comes ONLY from explicit overrides so a
        // printed card never inherits the operator's personal handedness.
        leftBuugengFlipped: overrides.leftBuugengFlipped,
        rightBuugengFlipped: overrides.rightBuugengFlipped,
        handPathMode: overrides.handPathMode,
      };
    }

    // Fallback path: read from Svelte stores (not available in worker context)
    const { getVisibilityStateManager } = await import(
      "../../pictograph/shared/state/visibility-state.svelte"
    );
    const visibilityManager = getVisibilityStateManager();
    await visibilityManager.ensureSettingsLoaded();

    const { getAnimationVisibilityManager } = await import(
      "../../animation-engine/state/animation-visibility-state.svelte"
    );
    const animVisibilityManager = getAnimationVisibilityManager();

    const { getSettings } = await import("$lib/shared/application/state/app-state.svelte");
    const appSettings = getSettings();

    const globalSettings: PictographVisibilityOptions = {
      fanAppearance: appSettings.fanAppearance,
      primaryPropColors: appSettings.primaryPropColors,
      showTKA: visibilityManager.getGlyphVisibility("tkaGlyph"),
      showTnD: visibilityManager.getGlyphVisibility("tndGlyph"),
      showElemental: visibilityManager.getGlyphVisibility("elementalGlyph"),
      showPositions: visibilityManager.getGlyphVisibility("positionsGlyph"),
      showReversals: visibilityManager.getGlyphVisibility("reversalIndicators"),
      showNonRadialPoints: visibilityManager.getNonRadialVisibility(),
      darkMode: animVisibilityManager.isDarkMode(),
      handPointVisibility: visibilityManager.getHandPointVisibility(),
      leftPropType: appSettings.leftPropType,
      rightPropType: appSettings.rightPropType,
      leftBuugengFlipped: appSettings.leftBuugengFlipped ?? false,
      rightBuugengFlipped: appSettings.rightBuugengFlipped ?? false,
    };

    if (overrides) {
      return {
        fanAppearance: overrides.fanAppearance ?? globalSettings.fanAppearance,
        primaryPropColors: overrides.primaryPropColors !== undefined ? overrides.primaryPropColors : globalSettings.primaryPropColors,
        showTKA: overrides.showTKA ?? globalSettings.showTKA,
        showTnD: overrides.showTnD ?? globalSettings.showTnD,
        showElemental: overrides.showElemental ?? globalSettings.showElemental,
        showPositions: overrides.showPositions ?? globalSettings.showPositions,
        showReversals: overrides.showReversals ?? globalSettings.showReversals,
        showNonRadialPoints:
          overrides.showNonRadialPoints ?? globalSettings.showNonRadialPoints,
        darkMode: overrides.darkMode ?? globalSettings.darkMode,
        showGrid: overrides.showGrid ?? true,
        handPointVisibility: overrides.handPointVisibility ?? globalSettings.handPointVisibility,
        leftPropType: overrides.leftPropType ?? globalSettings.leftPropType,
        rightPropType: overrides.rightPropType ?? globalSettings.rightPropType,
        leftBuugengFlipped:
          overrides.leftBuugengFlipped ?? globalSettings.leftBuugengFlipped,
        rightBuugengFlipped:
          overrides.rightBuugengFlipped ?? globalSettings.rightBuugengFlipped,
        handPathMode: overrides.handPathMode,
      };
    }

    return globalSettings;
  }

  async composeSequenceImage(
    sequence: SequenceData,
    options: Partial<SequenceExportOptions>,
    onProgress?: CompositionProgressCallback,
    signal?: AbortSignal
  ): Promise<RenderCanvas> {
    if (!sequence.steps || sequence.steps.length === 0) {
      throw new Error("Sequence must have at least one beat");
    }

    await (this.TextRenderer as TextRenderer).preloadGlyphImages();
    // Ensure Gelasio is loaded into document.fonts before any canvas text draw
    // (no-op in the worker, which seeds self.fonts at init). Cached after first.
    await ensureCardFonts();

    this.compositionL2Hits = 0;
    this.compositionL1Hits = 0;
    this.compositionFreshRenders = 0;

    const visibilitySettings = await this.getVisibilitySettings(
      options.visibilityOverrides
    );

    if (options.leftVisible === false) visibilitySettings.showLeftMotion = false;
    if (options.rightVisible === false) visibilitySettings.showRightMotion = false;

    if (visibilitySettings.showLeftMotion === false || visibilitySettings.showRightMotion === false) {
      visibilitySettings.showTKA = false;
    }

    const layout = computeCardFrontLayout(sequence, options, visibilitySettings);
    const {
      columns,
      rows,
      stepSize,
      canvasWidth,
      canvasHeight,
      gridOffsetX,
      gridOffsetY,
      isDarkMode,
    } = layout;

    const canvas = createRenderCanvas(canvasWidth, canvasHeight);

    // Both HTMLCanvasElement and OffscreenCanvas provide compatible 2D contexts.
    // Cast to CanvasRenderingContext2D to satisfy downstream method signatures.
    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D | null;
    if (!ctx) {
      throw new Error("Failed to get 2D context");
    }

    paintCardFrontBackground(ctx, layout, options);

    let derivedStartPosition: StartPositionData | null = null;
    const firstStep = sequence.steps[0];
    if (options.includeStartPosition && !sequence.startPosition && firstStep) {
      derivedStartPosition = createStartPositionFromBeatStart(firstStep);
    }
    const effectiveStartPosition = sequence.startPosition ?? derivedStartPosition;
    const hasStartPosition = options.includeStartPosition && effectiveStartPosition;
    const totalItems = sequence.steps.length + (hasStartPosition ? 1 : 0);
    let renderedCount = 0;

    onProgress?.({ current: 0, total: totalItems, stage: "rendering" });

    const hasPropOverride =
      options.propTypeOverride ||
      options.leftPropTypeOverride ||
      options.rightPropTypeOverride;

    const effectiveLeftPropType = options.leftPropTypeOverride ?? options.propTypeOverride;
    const effectiveRightPropType = options.rightPropTypeOverride ?? options.propTypeOverride;

    if (hasStartPosition && effectiveStartPosition) {
      const startStepNumber = options.addStepNumbers ? 0 : undefined;
      const startPositionData = hasPropOverride
        ? this.applyPropTypeOverride(
            effectiveStartPosition,
            options.propTypeOverride,
            options.leftPropTypeOverride,
            options.rightPropTypeOverride
          )
        : effectiveStartPosition;
      await this.renderPictographAt(
        ctx,
        startPositionData,
        0,
        0,
        stepSize,
        startStepNumber,
        gridOffsetY,
        visibilitySettings,
        effectiveLeftPropType,
        effectiveRightPropType,
        gridOffsetX
      );
      renderedCount++;
      onProgress?.({
        current: renderedCount,
        total: totalItems,
        stage: "rendering",
      });
    }

    const { startRow, startColumn, stepsPerRow } = layout;

    for (let i = 0; i < sequence.steps.length; i++) {
      if (signal?.aborted) throw new DOMException("Render aborted", "AbortError");
      if (i > 0) await yieldToEventLoop();
      const beat = sequence.steps[i];
      if (!beat) continue;
      const col = startColumn + (i % stepsPerRow);
      const row = startRow + Math.floor(i / stepsPerRow);
      const stepNumber = options.addStepNumbers ? i + 1 : undefined;
      const stepData = hasPropOverride
        ? this.applyPropTypeOverride(
            beat,
            options.propTypeOverride,
            options.leftPropTypeOverride,
            options.rightPropTypeOverride
          )
        : beat;
      await this.renderPictographAt(
        ctx,
        stepData,
        col,
        row,
        stepSize,
        stepNumber,
        gridOffsetY,
        visibilitySettings,
        effectiveLeftPropType,
        effectiveRightPropType,
        gridOffsetX
      );

      const beatDuration = beat.duration ?? 1;
      if (Math.abs(beatDuration - 1.0) > 0.001) {
        const x = col * stepSize + gridOffsetX;
        const y = row * stepSize + gridOffsetY;
        this.drawDurationBadge(ctx, beatDuration, x, y, stepSize, isDarkMode);
      }

      renderedCount++;
      onProgress?.({
        current: renderedCount,
        total: totalItems,
        stage: "rendering",
      });
    }

    await paintCardFrontChrome(
      canvas,
      ctx,
      layout,
      sequence,
      options,
      visibilitySettings,
      this.buildChromeDeps(sequence, layout, options)
    );

    return canvas;
  }

  /**
   * Single source of truth for the chrome (mandala/QR/header/footer) dependencies
   * passed to paintCardFrontChrome. Used by both composeSequenceImage (main-thread
   * serial path) and composeCardFrontParallel (worker-pool path) so the chrome
   * renders byte-identically regardless of how the cells were rasterized.
   */
  buildChromeDeps(
    sequence: SequenceData,
    layout: CardFrontLayout,
    options: Partial<SequenceExportOptions>
  ): CardFrontChromeDeps {
    const { columns, rows, stepSize, gridOffsetY, gridOffsetX, isDarkMode } = layout;
    const effectiveLeftPropType = options.leftPropTypeOverride ?? options.propTypeOverride;
    const effectiveRightPropType = options.rightPropTypeOverride ?? options.propTypeOverride;
    return {
      textRenderer: this.TextRenderer,
      qrCodeGenerator: this.qrCodeGenerator,
      renderMandalas: async (c) => {
        await this.renderMandalas(
          c,
          sequence,
          columns,
          rows,
          stepSize,
          gridOffsetY,
          gridOffsetX,
          isDarkMode,
          options,
          effectiveLeftPropType,
          effectiveRightPropType
        );
      },
      renderQRCode: async (c) => {
        const emptyCell = findEmptyCellForQR(columns, rows, sequence, options);
        if (emptyCell) {
          await this.renderQRCode(
            c,
            sequence,
            emptyCell,
            stepSize,
            gridOffsetY,
            isDarkMode,
            effectiveLeftPropType,
            effectiveRightPropType,
            gridOffsetX,
            options.deckId,
            options.deckName,
            options.qrImageBitmap,
          );
        }
      },
    };
  }

  private writeThroughToPreviewCache(
    pictographData: StepData | PictographData,
    stepNumber: number | undefined,
    stepSize: number,
    visibilitySettings: PictographVisibilityOptions,
    blob: Blob
  ): void {
    // Custom palettes must not seed default preview cells.
    if (visibilitySettings.primaryPropColors) return;
    const isDark = visibilitySettings.darkMode ?? false;
    const leftProp = visibilitySettings.leftPropType;
    const rightProp = visibilitySettings.rightPropType;
    const catDogModeEnabled = !!(leftProp && rightProp && leftProp !== rightProp);

    const previewOptions: PreviewCellRenderOptions = {
      fanAppearance: visibilitySettings.fanAppearance,
      size: stepSize,
      leftPropType: leftProp,
      rightPropType: rightProp,
      catDogModeEnabled,
      // Write-through into the preview-cell cache: the key MUST carry the same
      // chirality this blob was rendered with, or an unflipped export would be
      // served to a flipped card cell.
      leftBuugengFlipped: visibilitySettings.leftBuugengFlipped ?? false,
      rightBuugengFlipped: visibilitySettings.rightBuugengFlipped ?? false,
      showStepNumbers: false,
      showNonRadialPoints: visibilitySettings.showNonRadialPoints ?? true,
      showGrid: visibilitySettings.showGrid ?? true,
      handPointVisibility: (visibilitySettings.handPointVisibility === "none"
        ? "active"
        : visibilitySettings.handPointVisibility ?? "all") as "all" | "active",
      showTKA: visibilitySettings.showTKA ?? true,
      showReversals: visibilitySettings.showReversals ?? true,
      handPathMode: visibilitySettings.handPathMode ?? false,
    };

    import("../../sequence-viewer/services/cell-cache-key-deriver")
      .then(({ deriveCacheKey }) => {
        const previewKey = deriveCacheKey(
          pictographData as PictographData,
          stepNumber,
          isDark,
          previewOptions
        );
        this.blobCache.set(previewKey, blob).catch(() => {});
      })
      .catch(() => {
        // Worker context — preview cache write-through unavailable
      });
  }

  private async renderPictographAt(
    ctx: CanvasRenderingContext2D,
    pictographData: StepData | PictographData,
    column: number,
    row: number,
    stepSize: number,
    stepNumber?: number,
    titleOffset: number = 0,
    visibilitySettings?: PictographVisibilityOptions,
    leftPropType?: PropType,
    rightPropType?: PropType,
    horizontalOffset: number = 0
  ): Promise<void> {
    try {
      const finalVisibilitySettings: PictographVisibilityOptions = {
        ...visibilitySettings,
        leftPropType: leftPropType ?? visibilitySettings?.leftPropType,
        rightPropType: rightPropType ?? visibilitySettings?.rightPropType,
      };

      if (this.useCompositionalCaching && this.layerCompositor && !finalVisibilitySettings.primaryPropColors) {
        await this.renderPictographWithLayerCompositor(
          ctx,
          pictographData,
          column,
          row,
          stepSize,
          stepNumber,
          titleOffset,
          finalVisibilitySettings,
          horizontalOffset
        );
        return;
      }

      const baseKey = this.keyHasher.deriveKey(pictographData, finalVisibilitySettings);

      const blobKey = `${baseKey}:${stepSize}`;

      let img = this.memoryCache.get(blobKey);

      if (img) {
        this.layer2Hits++;
        this.compositionL2Hits++;
      } else {
        this.layer2Misses++;

        const cachedBlob = await this.blobCache.get(blobKey);

        if (cachedBlob) {
          this.layer1Hits++;
          this.compositionL1Hits++;
          img = await blobToImage(cachedBlob);
        } else {
          this.layer1Misses++;
          this.compositionFreshRenders++;

          await this.ensureCanvas2DInitialized();

          // The direct renderer has no preparer of its own: handed a raw step it
          // still paints the grid, letter, and turn numbers but silently skips
          // every prop and arrow. Custom palettes land here (the compositor's
          // blue/red layer caches must not leak into them), so prepare first,
          // the same way the compositor branch does.
          const preparedPictograph = await this.prepareForRaster(
            pictographData,
            finalVisibilitySettings
          );

          const pictographCanvas = await this.canvas2DRenderer.renderPictograph(
            preparedPictograph,
            {
              size: stepSize,
              visibility: finalVisibilitySettings,
              leftPropType: leftPropType,
              rightPropType: rightPropType,
            }
          );
          img = await canvasToImage(pictographCanvas);

          imageToBlob(img).then((blob) => {
            this.blobCache.set(blobKey, blob).catch((err) => {
              console.warn("[ImageComposer] Failed to cache blob:", err);
            });
            this.writeThroughToPreviewCache(
              pictographData, stepNumber, stepSize, finalVisibilitySettings, blob
            );
          });
        }

        this.memoryCache.set(blobKey, img);
      }

      const x = column * stepSize + horizontalOffset;
      const y = row * stepSize + titleOffset;
      ctx.drawImage(img, x, y, stepSize, stepSize);

      if (stepNumber !== undefined) {
        const isDarkMode = finalVisibilitySettings.darkMode ?? false;
        drawStepNumber(ctx, stepNumber, x, y, stepSize, isDarkMode);
      }
    } catch (error) {
      console.error(`❌ Failed to render beat at (${column}, ${row}):`, error);
      const x = column * stepSize + horizontalOffset;
      const y = row * stepSize + titleOffset;
      ctx.fillStyle = "#ffeeee";
      ctx.fillRect(x + 5, y + 5, stepSize - 10, stepSize - 10);
      ctx.fillStyle = "#cc0000";
      ctx.font = "14px Arial";
      ctx.textAlign = "center";
      ctx.fillText("Error", x + stepSize / 2, y + stepSize / 2);
    }
  }

  private drawDurationBadge(
    ctx: CanvasRenderingContext2D,
    duration: number,
    x: number,
    y: number,
    cellSize: number,
    isDarkMode: boolean
  ): void {
    const VIEW_BOX_SIZE = 950;
    const scale = cellSize / VIEW_BOX_SIZE;

    const formatted = Number.isInteger(duration)
      ? duration.toString()
      : duration.toFixed(2).replace(/\.?0+$/, "");
    const text = `${formatted}×`;

    const fontSize = 52 * scale;
    const textX = x + 475 * scale;
    const textY = y + 890 * scale;

    ctx.save();
    ctx.font = `600 ${fontSize}px Inter, "SF Pro Display", -apple-system, BlinkMacSystemFont, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = isDarkMode ? "#ffffff" : "#231f20";
    ctx.fillText(text, textX, textY);
    ctx.restore();
  }

  getCacheStats() {
    const memoryStats = this.memoryCache.getStats();
    const totalHits = this.layer1Hits + this.layer2Hits;
    const totalMisses = this.layer1Misses + this.layer2Misses;

    return {
      memoryCacheSize: memoryStats.size,
      memoryCacheMaxEntries: memoryStats.maxEntries,
      layer2Hits: this.layer2Hits,
      layer2Misses: this.layer2Misses,
      layer2HitRate:
        this.layer2Hits + this.layer2Misses > 0
          ? ((this.layer2Hits / (this.layer2Hits + this.layer2Misses)) * 100).toFixed(2) + "%"
          : "0%",

      layer1Hits: this.layer1Hits,
      layer1Misses: this.layer1Misses,
      layer1HitRate:
        this.layer1Hits + this.layer1Misses > 0
          ? ((this.layer1Hits / (this.layer1Hits + this.layer1Misses)) * 100).toFixed(2) + "%"
          : "0%",

      totalHits,
      totalMisses,
      overallHitRate:
        totalHits + totalMisses > 0
          ? ((totalHits / (totalHits + totalMisses)) * 100).toFixed(2) + "%"
          : "0%",
    };
  }

  async getLayer1Stats() {
    return this.blobCache.getStats();
  }

  async clearCache(includeIndexedDB: boolean = false): Promise<void> {
    this.memoryCache.clear();

    if (includeIndexedDB) {
      await this.blobCache.clear();
    }

    this.layer1Hits = 0;
    this.layer1Misses = 0;
    this.layer2Hits = 0;
    this.layer2Misses = 0;
  }


  private async renderQRCode(
    ctx: CanvasRenderingContext2D,
    sequence: SequenceData,
    cell: { col: number; row: number },
    stepSize: number,
    headerHeight: number,
    isDarkMode: boolean,
    leftPropType?: PropType,
    rightPropType?: PropType,
    horizontalOffset: number = 0,
    deckId?: string,
    deckName?: string,
    preRenderedQR?: CanvasImageSource,
  ): Promise<void> {
    // Proceed if we have either a generator OR a pre-rendered image (the worker
    // path supplies a main-rendered bitmap because it has no QR generator).
    if (!this.qrCodeGenerator && !preRenderedQR) {
      return;
    }

    try {
      // A large QR centered in the cell — mirrors the centered Start pictograph
      // in the neighbouring cell so the grid reads evenly (no top-hugging). The
      // green center play button + the QR shape are self-evident ("scan to
      // play"), so no caption. Largest square after a small side margin.
      const sideMargin = Math.round(stepSize * 0.055);
      const qrSize = Math.floor(stepSize - 2 * sideMargin);

      // Pre-rendered QR is authored at a fixed resolution; drawImage scales it
      // to the cell below. Generated QR is produced at qrSize directly.
      const qrImage: CanvasImageSource = preRenderedQR
        ? preRenderedQR
        : await this.qrCodeGenerator!.generateAsImage(
            sequence,
            qrSize,
            {
              style: "modern",
              margin: 1,
              darkMode: isDarkMode,
              leftPropType: leftPropType,
              rightPropType: rightPropType,
              deckId,
              deckName,
            }
          );

      const cellLeft = cell.col * stepSize + horizontalOffset;
      const cellTop = cell.row * stepSize + headerHeight;
      const x = cellLeft + Math.floor((stepSize - qrSize) / 2);
      const y = cellTop + Math.floor((stepSize - qrSize) / 2);

      ctx.fillStyle = isDarkMode ? "#000000" : "#ffffff";
      ctx.fillRect(cellLeft, cellTop, stepSize, stepSize);

      ctx.drawImage(qrImage, x, y, qrSize, qrSize);
    } catch (error) {
      console.error("[ImageComposer] Failed to render QR code:", error);
    }
  }


  private async renderMandalas(
    ctx: CanvasRenderingContext2D,
    sequence: SequenceData,
    columns: number,
    rows: number,
    stepSize: number,
    gridOffsetY: number,
    gridOffsetX: number,
    isDarkMode: boolean,
    options: Partial<SequenceExportOptions>,
    leftPropType?: PropType,
    rightPropType?: PropType,
  ): Promise<void> {
    try {
      const { calculate: calculateMandalaGeometry } = await import(
        "../../mandala/services/mandala-geometry-calculator"
      );
      const { getMandalaPathOptions } = await import(
        "../../mandala/services/mandala-path-options"
      );
      const tipEnds = pairTipEnds(leftPropType, rightPropType);
      // The card traces the same hand paths the animation draws, so it uses the
      // shape the caller was showing. Unset means the arc default.
      const paths = calculateMandalaGeometry(
        sequence.steps ?? [],
        leftPropType,
        rightPropType,
        getMandalaPathOptions(
          options.mandalaPathShape ?? "arc",
          tipEnds === 1 ? 1 : 2,
        ),
      );
      if (paths.left.length === 0 && paths.right.length === 0) return;

      const layoutMode = options.startPositionLayout ?? "row";
      const { placements } = getMandalaPlacements({
        stepCount: sequence.steps?.length ?? 0,
        cols: columns,
        rows,
        includeStartPosition: options.includeStartPosition ?? false,
        showQRCode: options.visibilityOverrides?.showQRCode ?? false,
        leftVisible: options.leftVisible ?? true,
        rightVisible: options.rightVisible ?? true,
        mandalaEnabled: true,
        startPositionLayout: layoutMode,
      });

      if (placements.length === 0) return;

      const defaultPalette = isDarkMode
        ? {
            leftStroke: DARK_MOTION_BLUE_STROKE,
            leftFill: DARK_MOTION_BLUE_FILL,
            rightStroke: DARK_MOTION_RED_STROKE,
            rightFill: DARK_MOTION_RED_FILL,
            purpleStroke: DARK_MOTION_PURPLE_STROKE,
            purpleFill: DARK_MOTION_PURPLE_FILL,
          }
        : {
            leftStroke: LIGHT_MOTION_BLUE_STROKE,
            leftFill: LIGHT_MOTION_BLUE_FILL,
            rightStroke: LIGHT_MOTION_RED_STROKE,
            rightFill: LIGHT_MOTION_RED_FILL,
            purpleStroke: LIGHT_MOTION_PURPLE_STROKE,
            purpleFill: LIGHT_MOTION_PURPLE_FILL,
          };

      const visibility = await this.getVisibilitySettings(options.visibilityOverrides);
      const palette = applyMandalaHandColors(defaultPalette, visibility.primaryPropColors);
      const mandalaScale = 0.85;
      const mandalaSize = Math.floor(stepSize * mandalaScale);
      const padding = (stepSize - mandalaSize) / 2;

      for (const p of placements) {
        const show = p.variant === "full" ? "both" as const : p.variant;
        const x = (p.col - 1) * stepSize + gridOffsetX + padding;
        const y = (p.row - 1) * stepSize + gridOffsetY + padding;

        renderMandalaToCanvas(ctx, paths, {
          size: mandalaSize,
          style: "stroke",
          show,
          strokeWidth: 3,
          palette,
          offsetX: x,
          offsetY: y,
        });
      }
    } catch (error) {
      console.error("[ImageComposer] Failed to render mandalas:", error);
    }
  }

  private applyPropTypeOverride<
    T extends StepData | PictographData | StartPositionData,
  >(
    data: T,
    propType?: PropType,
    leftPropType?: PropType,
    rightPropType?: PropType
  ): T {
    const finalLeftProp = leftPropType ?? propType;
    const finalRightProp = rightPropType ?? propType;

    const result = {
      ...data,
      motions: {
        left:
          data.motions.left && finalLeftProp
            ? { ...data.motions.left, propType: finalLeftProp }
            : data.motions.left,
        right:
          data.motions.right && finalRightProp
            ? { ...data.motions.right, propType: finalRightProp }
            : data.motions.right,
      },
    };

    return result;
  }

  // Every rasterizer below (the layer compositor and the direct renderer) draws
  // props and arrows only from `_prepared`; neither prepares on its own. The
  // preparer is imported lazily because its dependency chain is heavy and
  // unavailable to unit tests, which inject a fake.
  private async prepareForRaster(
    pictographData: StepData | PictographData,
    visibilitySettings: PictographVisibilityOptions
  ): Promise<PreparedPictographData> {
    const themeMode = visibilitySettings.darkMode ? "dark" : "light";
    const { pictographPreparer: preparer } = await import(
      "../../pictograph/shared/services/pictograph-preparer"
    );
    const prepared = await preparer.prepareSingle(pictographData, {
      themeMode,
      fanAppearance: visibilitySettings.fanAppearance,
      leftPropType: visibilitySettings.leftPropType,
      rightPropType: visibilitySettings.rightPropType,
      handPathMode: visibilitySettings.handPathMode ?? false,
      showLeftMotion: visibilitySettings.showLeftMotion,
      showRightMotion: visibilitySettings.showRightMotion,
      leftBuugengFlipped: visibilitySettings.leftBuugengFlipped,
      rightBuugengFlipped: visibilitySettings.rightBuugengFlipped,
    });
    return prepared as unknown as PreparedPictographData;
  }

  private async renderPictographWithLayerCompositor(
    ctx: CanvasRenderingContext2D,
    pictographData: StepData | PictographData,
    column: number,
    row: number,
    stepSize: number,
    stepNumber: number | undefined,
    titleOffset: number,
    visibilitySettings: PictographVisibilityOptions,
    horizontalOffset: number = 0
  ): Promise<void> {
    if (!this.layerCompositor) {
      throw new Error("LayerCompositor not available");
    }

    await this.ensureCanvas2DInitialized();

    const preparedPictograph = await this.prepareForRaster(
      pictographData,
      visibilitySettings
    );

    const { options: layerOptions, visibility: layerVisibility } = buildCellLayerOptions(
      stepSize,
      visibilitySettings
    );

    const result = await this.layerCompositor.compose(
      preparedPictograph,
      layerOptions,
      layerVisibility,
      stepNumber
    );

    if (result.cacheStats.baseFromCache) {
      this.compositionL2Hits++;
      this.layer2Hits++;
    } else {
      this.compositionFreshRenders++;
      this.layer1Misses++;
    }

    const x = column * stepSize + horizontalOffset;
    const y = row * stepSize + titleOffset;
    ctx.drawImage(result.canvas, x, y, stepSize, stepSize);
  }

  async composeCardImage(
    sequence: SequenceData,
    options: Partial<SequenceExportOptions>,
    onProgress?: CompositionProgressCallback,
    signal?: AbortSignal
  ): Promise<RenderCanvas> {
    return composeCardImageFn(
      sequence,
      options,
      (seq, opts, prog, sig) => this.composeSequenceImage(seq, opts, prog, sig),
      onProgress,
      signal
    );
  }
}

// Default singleton removed — it pulled PictographBlobCache ($app/environment) into
// the worker bundle. Use getImageComposer() from $lib/shared/render/getImageComposer
// for main-thread usage. The worker creates its own instances via composition.worker.ts.
