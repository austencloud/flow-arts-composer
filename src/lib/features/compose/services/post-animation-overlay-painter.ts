/**
 * Post Studio Animation Overlay Painter
 *
 * Draws the overlays the AnimatorCanvas canvas itself does NOT paint when
 * mounted with hideHeader+hideProgressBar (as PostStudioSequenceAnimationLayer
 * does): the beat number, the letter (TKA) glyph, the element icon, and a
 * progress bar. Those four live in AnimatorCanvas's DOM siblings today -
 * WordHeader's step number and GlyphOverlay's TKA/elemental glyphs sit beside
 * the <canvas> in CanvasSurface.svelte, and the transport/progress bar is a
 * DOM slot in AnimatorCanvas.svelte's progress-slot - so post-studio-frame-
 * compositor's canvas-only capture (renderMode "sequence-animation" only
 * copies <canvas> elements) silently drops all four from the exported MP4.
 * Trails, props and the grid ARE drawn on AnimatorCanvas's own canvas, so
 * this painter does not touch them.
 *
 * Reuses the Animate/compose export's own drawing helpers so the baked-in
 * look matches exactly: ExportGlyphPrerenderer builds the same composite TKA
 * glyph (letter + dash + skew braces + turns) and elemental-icon image the
 * real video export bakes in, and canvas-renderer.ts's step-number/progress-
 * bar drawing is reused unchanged.
 */
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import type { SequenceFrame } from "$lib/shared/media-composition/domain/sequence-frame";
import type {
  PaintFrame,
  PaintRect,
  PostStudioLayerPainter,
} from "$lib/shared/media-composition/services/post-studio-layer-painter";
import { ExportGlyphPrerenderer } from "$lib/shared/animation-engine/services/export-glyph-prerenderer";
import { getSvgImageConverter } from "$lib/shared/foundation/get-svg-image-converter";
import {
  getProgressBarHeight,
  renderProgressBarToCanvas,
  renderStepNumberToCanvas,
} from "./canvas-renderer";
import {
  drawElementalGlyphToCanvas,
  drawPrerenderedGlyphToCanvas,
} from "./export-frame-compositor";

// PostStudioSequenceAnimationLayer always mounts AnimatorCanvas with
// `previewDarkMode` set (the shorthand for `previewDarkMode={true}`) - Post
// Studio's animation panel is never in light mode, so this painter matches
// that fixed choice rather than threading a darkMode prop through prepare().
const IS_DARK_MODE = true;

/** Which sequence step (if any) the overlay shows for one sequence frame. */
export interface OverlayStepSelection {
  /** 0-based index into `sequence.steps`, or null during the opening pose. */
  stepIndex: number | null;
  /** 1-based number as drawn on the canvas; null when nothing is drawn. */
  beatNumber: number | null;
}

/**
 * The Animate export shows no beat number and no glyph during the opening
 * (start-placement) phase - video-export-orchestrator.ts sets stepIndex=-1
 * for that phase and comments "no glyph (once, at the beginning)", and
 * ExportFrameCompositor.renderOverlays only draws a glyph/number when its
 * cacheKey/stepNumber is non-null, which isInStartPlacement forces to null/""
 * (export-frame-compositor.ts renderOverlays). This mirrors that: the
 * opening phase (move 0) draws nothing, every other phase shows `move`.
 */
export function resolveOverlayStep(
  sequenceFrame: SequenceFrame
): OverlayStepSelection {
  if (sequenceFrame.phase === "opening") {
    return { stepIndex: null, beatNumber: null };
  }
  return { stepIndex: sequenceFrame.move - 1, beatNumber: sequenceFrame.move };
}

export class PostAnimationOverlayPainter implements PostStudioLayerPainter {
  private readonly steps: readonly StepData[];
  private readonly stepDurations: number[];
  private prerenderer: ExportGlyphPrerenderer | null = null;
  private preparing: Promise<void> | null = null;
  private ready = false;

  constructor(sequence: SequenceData) {
    this.steps = sequence.steps ?? [];
    this.stepDurations = this.steps.map((step) => step.duration ?? 1);
  }

  /**
   * Prerenders every glyph the sequence can show, once, regardless of the
   * requested pixel size - the glyph composites are vector SVG rasterized to
   * an intrinsic size and then scaled at paint time (see
   * drawPrerenderedGlyphToCanvas's gridScaleFactor), so one prepare pass
   * serves preview and export alike. Concurrent callers (preview firing
   * every frame, export calling once up front) share the same in-flight
   * promise instead of re-triggering the fetch/rasterize work.
   */
  async prepare(_target: { width: number; height: number }): Promise<void> {
    if (this.ready) return;
    if (!this.preparing) {
      this.preparing = (async () => {
        const prerenderer = new ExportGlyphPrerenderer(getSvgImageConverter());
        await Promise.all([
          prerenderer.prerenderGlyphs(this.steps, IS_DARK_MODE),
          prerenderer.prerenderElementalGlyphs(this.steps),
        ]);
        this.prerenderer = prerenderer;
        this.ready = true;
      })();
    }
    await this.preparing;
  }

  paint(
    context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    rect: PaintRect,
    frame: PaintFrame
  ): void {
    const sequenceFrame = frame.sequenceFrame;
    if (!sequenceFrame) return;

    // The animation is a square fitted inside its region and centred, as
    // AnimatorCanvas centres its canvas-wrapper and the compositor draws the
    // canvas "contain". The split's region is wider than tall, so the labels
    // sit on that square, not the region's corner.
    const canvasSize = Math.min(rect.width, rect.height);
    if (canvasSize <= 0) return;
    const squareX = rect.x + (rect.width - canvasSize) / 2;
    const squareY = rect.y + (rect.height - canvasSize) / 2;

    // Cast is safe: every draw call below uses only the 2D context methods
    // both CanvasRenderingContext2D and OffscreenCanvasRenderingContext2D
    // implement, which is exactly what canvas-renderer.ts's helpers expect.
    const ctx = context as CanvasRenderingContext2D;
    ctx.save();
    ctx.translate(squareX, squareY);

    const { stepIndex, beatNumber } = resolveOverlayStep(sequenceFrame);
    renderStepNumberToCanvas(ctx, canvasSize, beatNumber, 1, IS_DARK_MODE);

    if (stepIndex !== null && this.ready && this.prerenderer) {
      const cacheKey = this.prerenderer.getCacheKeyForStep(stepIndex);
      const glyph = cacheKey ? this.prerenderer.getGlyph(cacheKey) : null;
      if (glyph) {
        drawPrerenderedGlyphToCanvas(ctx, canvasSize, glyph, 1);
      }

      const elemental = this.prerenderer.getElementalGlyphForStep(stepIndex);
      if (elemental) {
        drawElementalGlyphToCanvas(ctx, canvasSize, elemental, 1);
      }
    }

    if (this.steps.length > 0) {
      // sequenceFrame.passArrival (0-based step position within the pass) is
      // exactly the `currentStep` renderProgressBarToCanvas expects, and it
      // weights progress by the same per-step stepDurations this painter
      // already carries - so this reproduces sequenceFrame.passBeatProgress
      // (the field the painter conceptually reads) without duplicating that
      // duration-weighted math here.
      const barHeight = getProgressBarHeight(canvasSize);
      renderProgressBarToCanvas(
        ctx,
        canvasSize,
        canvasSize - barHeight,
        this.steps.length,
        sequenceFrame.passArrival,
        this.stepDurations,
        IS_DARK_MODE
      );
    }

    ctx.restore();
  }
}
