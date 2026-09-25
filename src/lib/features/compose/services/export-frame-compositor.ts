import {
  getHeaderHeight,
  getProgressBarHeight,
  renderStepNumberToCanvas,
  renderWordHeaderToCanvas,
  renderProgressBarToCanvas,
} from "./canvas-renderer";
import type {
  ElementalGlyphAsset,
  GlyphAsset,
} from "$lib/shared/animation-engine/services/export-glyph-prerenderer";
import type { ExportGlyphPrerenderer } from "$lib/shared/animation-engine/services/export-glyph-prerenderer";
import type { CompositeVideoRenderer } from "$lib/shared/animation-engine/services/composite-video-renderer";
import type { Period } from "$lib/shared/foundation/domain/models/generation/circular-models";
import type { LoopReflectionAxis } from "@tka/render-composition";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import {
  MotionType,
  HandSide,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { getPathPoints } from "$lib/features/hand-paths/hand-path-builder/services/hand-path-animator";
import { getAnimationVisibilityManager } from "$lib/shared/animation-engine/state/animation-visibility-state.svelte";
import { getMotionColor } from "$lib/shared/utils/svg-color-utils";
import type { MotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import {
  containElementalGlyph,
  getElementalGlyphBox,
} from "$lib/shared/pictograph/shared/domain/constants/elemental-glyph-layout";

export interface FrameCompositorConfig {
  outputWidth: number;
  outputHeight: number;
  sourceWidth: number;
  headerHeight: number;
  progressBarHeight: number;
  outputCanvasSize: number;
  scaleFactor: number;
  fps: number;
  showTkaGlyph: boolean;
  showElementalGlyph: boolean;
  showStepNumbers: boolean;
  showWordHeader: boolean;
  showProgressBar: boolean;
  isDarkMode: boolean;
  isCompositeMode: boolean;
  sequenceWord: string;
  difficultyLevel: number | null;
  loopComponents: Set<string> | null;
  rotationPeriod: Period | undefined;
  inversionPeriod: Period | undefined;
  reflectionAxis?: LoopReflectionAxis;
  overlayComponents: Set<string> | null;
  showLeftPathLines: boolean;
  showRightPathLines: boolean;
  sequenceSteps: readonly StepData[];
  /** Optional static overlay baked on top of each frame (e.g. the mandala). */
  frameOverlayDraw?: (ctx: CanvasRenderingContext2D, sizePx: number) => void;
}

interface CrossfadeState {
  currentCacheKey: string;
  currentGlyph: GlyphAsset | null;
  currentElementalGlyph: ElementalGlyphAsset | null;
  currentStepNumber: number | null;
  previousGlyph: GlyphAsset | null;
  previousElementalGlyph: ElementalGlyphAsset | null;
  previousStepNumber: number | null;
  framesSinceTransition: number;
}

const CROSSFADE_DURATION_MS = 200;

export class ExportFrameCompositor {
  private crossfade: CrossfadeState = {
    currentCacheKey: "",
    currentGlyph: null,
    currentElementalGlyph: null,
    currentStepNumber: null,
    previousGlyph: null,
    previousElementalGlyph: null,
    previousStepNumber: null,
    framesSinceTransition: 0,
  };
  private crossfadeDurationFrames: number;
  private tempOverlayCanvas: HTMLCanvasElement | null = null;

  constructor(
    private readonly config: FrameCompositorConfig,
    private readonly glyphPrerenderer: ExportGlyphPrerenderer,
    private readonly compositeRenderer: CompositeVideoRenderer
  ) {
    this.crossfadeDurationFrames = Math.ceil(
      (CROSSFADE_DURATION_MS / 1000) * config.fps
    );
  }

  static computeLayoutFromCanvas(
    canvas: HTMLCanvasElement,
    showWordHeader: boolean,
    showProgressBar: boolean,
    resolution: number | undefined,
    isCompositeMode: boolean,
    getExportDimensions: (
      res: number,
      ar: number
    ) => { width: number; height: number }
  ): {
    sourceWidth: number;
    sourceHeight: number;
    outputWidth: number;
    outputHeight: number;
    srcHeaderHeight: number;
    srcProgressBarHeight: number;
  } {
    const srcHeaderHeight = showWordHeader ? getHeaderHeight(canvas.width) : 0;
    const srcProgressBarHeight = showProgressBar
      ? getProgressBarHeight(canvas.width)
      : 0;
    const sourceWidth = Math.round(canvas.width);
    const sourceHeight = Math.round(
      canvas.width + srcHeaderHeight + srcProgressBarHeight
    );

    let outputWidth: number;
    let outputHeight: number;

    if (resolution) {
      const aspectRatio = sourceWidth / sourceHeight;
      const dims = getExportDimensions(resolution, aspectRatio);
      outputWidth = dims.width;
      outputHeight = dims.height;
    } else {
      outputWidth = sourceWidth;
      outputHeight = sourceHeight;
    }

    return {
      sourceWidth,
      sourceHeight,
      outputWidth,
      outputHeight,
      srcHeaderHeight,
      srcProgressBarHeight,
    };
  }

  renderOverlays(
    offscreenCtx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    stepIndex: number,
    isInStartPlacement: boolean,
    isInEndHold: boolean,
    playbackPosition: number,
    steps: readonly { duration?: number }[],
    stepDurations: number[],
    _frameIndex: number
  ): void {
    const {
      headerHeight,
      outputCanvasSize,
      isCompositeMode,
      showTkaGlyph,
      showElementalGlyph,
      showStepNumbers,
      showWordHeader,
      showProgressBar,
      isDarkMode,
      sequenceWord,
      difficultyLevel,
      loopComponents,
      rotationPeriod,
      inversionPeriod,
      reflectionAxis,
      overlayComponents,
    } = this.config;

    const actualCanvasSize = outputCanvasSize;
    const clampedStepIndex = Math.max(0, Math.min(stepIndex, steps.length - 1));
    const stepNumber = isInStartPlacement ? null : clampedStepIndex + 1;
    const cacheKey = isInStartPlacement
      ? ""
      : this.glyphPrerenderer.getCacheKeyForStep(clampedStepIndex);

    // Detect transitions
    const glyphChanged = cacheKey !== this.crossfade.currentCacheKey;
    const stepNumberChanged = stepNumber !== this.crossfade.currentStepNumber;
    const transitionDetected = glyphChanged || stepNumberChanged;

    if (transitionDetected) {
      this.crossfade.previousGlyph = this.crossfade.currentGlyph;
      this.crossfade.previousElementalGlyph =
        this.crossfade.currentElementalGlyph;
      this.crossfade.previousStepNumber = this.crossfade.currentStepNumber;
      this.crossfade.currentCacheKey = cacheKey;
      this.crossfade.currentStepNumber = stepNumber;

      if (glyphChanged) {
        this.crossfade.currentGlyph = cacheKey
          ? this.glyphPrerenderer.getGlyph(cacheKey)
          : null;
      }

      if (showElementalGlyph) {
        this.crossfade.currentElementalGlyph = isInStartPlacement
          ? null
          : this.glyphPrerenderer.getElementalGlyphForStep(clampedStepIndex);
      }

      this.crossfade.framesSinceTransition = 0;
    }

    // Calculate crossfade opacities
    const inCrossfade =
      this.crossfade.framesSinceTransition < this.crossfadeDurationFrames;
    const fadeProgress = inCrossfade
      ? this.crossfade.framesSinceTransition / this.crossfadeDurationFrames
      : 1;
    const fadeOutOpacity = Math.max(0, 1 - fadeProgress);
    const fadeInOpacity = Math.min(1, fadeProgress);

    // Apply translation offset for header
    if (headerHeight > 0 && !isCompositeMode) {
      offscreenCtx.save();
      offscreenCtx.translate(0, headerHeight);
    }

    // Render TKA glyph
    if (showTkaGlyph) {
      if (
        inCrossfade &&
        this.crossfade.previousGlyph?.image &&
        fadeOutOpacity > 0
      ) {
        drawPrerenderedGlyphToCanvas(
          offscreenCtx,
          actualCanvasSize,
          this.crossfade.previousGlyph,
          fadeOutOpacity
        );
      }
      if (this.crossfade.currentGlyph?.image) {
        const opacity = inCrossfade ? fadeInOpacity : 1;
        drawPrerenderedGlyphToCanvas(
          offscreenCtx,
          actualCanvasSize,
          this.crossfade.currentGlyph,
          opacity
        );
      }
    }

    // Render beat numbers
    if (showStepNumbers) {
      if (
        inCrossfade &&
        this.crossfade.previousStepNumber !== null &&
        fadeOutOpacity > 0
      ) {
        renderStepNumberToCanvas(
          offscreenCtx,
          actualCanvasSize,
          this.crossfade.previousStepNumber,
          fadeOutOpacity,
          isDarkMode
        );
      }
      if (this.crossfade.currentStepNumber !== null) {
        const opacity = inCrossfade ? fadeInOpacity : 1;
        renderStepNumberToCanvas(
          offscreenCtx,
          actualCanvasSize,
          this.crossfade.currentStepNumber,
          opacity,
          isDarkMode
        );
      }
    }

    // Render path lines (per-hand)
    if (this.config.showLeftPathLines || this.config.showRightPathLines) {
      this.renderPathLines(offscreenCtx, actualCanvasSize, clampedStepIndex);
    }

    // Bake an optional static overlay (mandala) into the square animation area,
    // on top of grid+prop+trail+path. Drawn in the same translated space as the
    // path lines so it shares the canvas-square origin.
    if (this.config.frameOverlayDraw) {
      this.config.frameOverlayDraw(offscreenCtx, actualCanvasSize);
    }

    if (showElementalGlyph) {
      if (
        inCrossfade &&
        this.crossfade.previousElementalGlyph &&
        fadeOutOpacity > 0
      ) {
        drawElementalGlyphToCanvas(
          offscreenCtx,
          actualCanvasSize,
          this.crossfade.previousElementalGlyph,
          fadeOutOpacity
        );
      }
      if (this.crossfade.currentElementalGlyph) {
        drawElementalGlyphToCanvas(
          offscreenCtx,
          actualCanvasSize,
          this.crossfade.currentElementalGlyph,
          inCrossfade ? fadeInOpacity : 1
        );
      }
    }

    // Restore context
    if (headerHeight > 0 && !isCompositeMode) {
      offscreenCtx.restore();
    }

    if (showWordHeader) {
      renderWordHeaderToCanvas(
        offscreenCtx,
        actualCanvasSize,
        sequenceWord,
        isDarkMode,
        stepNumber,
        difficultyLevel,
        loopComponents,
        rotationPeriod,
        inversionPeriod,
        overlayComponents,
        reflectionAxis
      );
    }

    if (showProgressBar && !isCompositeMode) {
      const progressBarY = headerHeight + outputCanvasSize;
      const progressBeat = isInStartPlacement
        ? 0
        : isInEndHold
          ? steps.length
          : playbackPosition - 1;
      renderProgressBarToCanvas(
        offscreenCtx,
        actualCanvasSize,
        progressBarY,
        steps.length,
        progressBeat,
        stepDurations,
        isDarkMode
      );
    }

    this.crossfade.framesSinceTransition++;
  }

  renderCanvasLayers(
    offscreenCtx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    isCompositeMode: boolean,
    compositeStepIndex: number,
    offscreenCanvas: HTMLCanvasElement,
    _frameIndex: number
  ): void {
    const { headerHeight, outputCanvasSize } = this.config;

    if (isCompositeMode) {
      this.compositeRenderer.renderCompositeFrame(
        canvas,
        compositeStepIndex,
        offscreenCanvas
      );
    } else {
      // Fill OPAQUE BLACK, not transparent. The encoder builds a VideoFrame as
      // RGBA and H.264/AV1 drop the alpha channel — so any semi-transparent
      // trail/glow pixel composited on a transparent base would encode at full
      // straight-alpha intensity (bright/harsh) instead of the dim alpha-blended
      // value shown on the live canvas. Pre-flattening over black makes the
      // captured pixels opaque and correctly blended, matching the preview.
      offscreenCtx.fillStyle = "#000";
      offscreenCtx.fillRect(
        0,
        0,
        offscreenCanvas.width,
        offscreenCanvas.height
      );
      const canvasY = headerHeight > 0 ? headerHeight : 0;

      const container = canvas.parentElement;
      const overlayCanvases = container
        ? Array.from(container.querySelectorAll("canvas")).filter(
            (overlay) =>
              overlay !== canvas && overlay.width > 0 && overlay.height > 0
          )
        : [];
      const mandalaUnderlays = overlayCanvases.filter(
        (overlay) => overlay.getAttribute("data-animation-layer") === "mandala"
      );
      const foregroundOverlays = overlayCanvases.filter(
        (overlay) => overlay.getAttribute("data-animation-layer") !== "mandala"
      );
      const drawLayer = (layer: HTMLCanvasElement) => {
        offscreenCtx.drawImage(
          layer,
          0,
          0,
          layer.width,
          layer.height,
          0,
          canvasY,
          outputCanvasSize,
          outputCanvasSize
        );
      };

      // The browser places the mandala at z=0, beneath the transparent scene
      // canvas. DOM-query composition does not honor z-index, so preserve that
      // order explicitly before drawing props/grid and the foreground effects.
      for (const underlay of mandalaUnderlays) drawLayer(underlay);
      drawLayer(canvas);

      if (container) {
        for (const overlay of foregroundOverlays) drawLayer(overlay);
      }
    }
  }

  private resolvePathType(motion: MotionData): "arc" | "linear" | "concave" {
    if (motion.pathShape) return motion.pathShape;
    if (motion.motionType === MotionType.DASH) return "linear";
    if (motion.motionType === MotionType.STATIC) return "arc";

    const vm = getAnimationVisibilityManager();
    if (vm.getMotionAwarePaths()) {
      if (motion.motionType === MotionType.PRO) return "arc";
      if (motion.motionType === MotionType.ANTI) return "concave";
    }
    return vm.getPathShape();
  }

  private renderPathLines(
    ctx: CanvasRenderingContext2D,
    canvasSize: number,
    stepIndex: number
  ): void {
    const { sequenceSteps } = this.config;
    if (stepIndex < 0 || stepIndex >= sequenceSteps.length) return;

    const step = sequenceSteps[stepIndex];
    if (!step) return;

    const scale = canvasSize / 950;

    const drawMotionPath = (motion: MotionData | undefined, color: string) => {
      if (!motion) return;
      if (motion.startLocation === motion.endLocation) return;
      if (motion.motionType === MotionType.STATIC) return;

      const pathType = this.resolvePathType(motion);
      const points = getPathPoints(
        motion.startLocation,
        motion.endLocation,
        20,
        pathType
      );
      if (points.length < 2) return;

      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 3 * scale;
      ctx.lineCap = "round";
      ctx.setLineDash([8 * scale, 6 * scale]);
      ctx.globalAlpha = 0.5;

      ctx.beginPath();
      ctx.moveTo(points[0]!.x * scale, points[0]!.y * scale);
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i]!.x * scale, points[i]!.y * scale);
      }
      ctx.stroke();
      ctx.restore();
    };

    const leftColor = getMotionColor(HandSide.LEFT, "dark");
    const rightColor = getMotionColor(HandSide.RIGHT, "dark");

    if (this.config.showLeftPathLines)
      drawMotionPath(step.motions?.left, leftColor);
    if (this.config.showRightPathLines)
      drawMotionPath(step.motions?.right, rightColor);
  }
}

/**
 * Places the prerendered TKA glyph composite (letter + dash + skew braces +
 * turns column) at the glyph's standard canvas position. Pulled out of
 * ExportFrameCompositor so the Post Studio overlay painter can draw the exact
 * same glyph the Animate export bakes into its MP4, instead of duplicating
 * this placement math.
 */
export function drawPrerenderedGlyphToCanvas(
  ctx: CanvasRenderingContext2D,
  canvasSize: number,
  glyph: GlyphAsset,
  opacity: number
): void {
  const gridScaleFactor = canvasSize / 950;
  const x = (50 - glyph.xOffset) * gridScaleFactor;
  const y = (800 - glyph.yOffset) * gridScaleFactor;
  const scaledWidth = glyph.dimensions.width * gridScaleFactor;
  const scaledHeight = glyph.dimensions.height * gridScaleFactor;

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.drawImage(glyph.image, x, y, scaledWidth, scaledHeight);
  ctx.restore();
}

/**
 * Places the elemental (timing/direction) glyph in its canonical corner slot,
 * containing it without stretching. Pulled out alongside
 * drawPrerenderedGlyphToCanvas for the same reuse reason.
 */
export function drawElementalGlyphToCanvas(
  ctx: CanvasRenderingContext2D,
  canvasSize: number,
  glyph: ElementalGlyphAsset,
  opacity: number
): void {
  const box = containElementalGlyph(
    getElementalGlyphBox(canvasSize),
    glyph.sourceWidth,
    glyph.sourceHeight
  );
  if (!box) return;

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.drawImage(glyph.image, box.x, box.y, box.width, box.height);
  ctx.restore();
}
