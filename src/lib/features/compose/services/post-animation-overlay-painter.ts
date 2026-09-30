/** Paint the beat number and notation glyphs omitted by canvas capture.
 * Progress belongs to the shared animation layer and frame compositor. */
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
import { renderStepNumberToCanvas } from "./canvas-renderer";
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
  private prerenderer: ExportGlyphPrerenderer | null = null;
  private preparing: Promise<void> | null = null;
  private ready = false;

  constructor(sequence: SequenceData) {
    this.steps = sequence.steps ?? [];
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
    // The render fades a layer in through the context's alpha, and these
    // helpers set their opacity outright; the preview's alpha is 1.
    const alpha = ctx.globalAlpha;

    const { stepIndex, beatNumber } = resolveOverlayStep(sequenceFrame);
    renderStepNumberToCanvas(ctx, canvasSize, beatNumber, alpha, IS_DARK_MODE);

    if (stepIndex !== null && this.ready && this.prerenderer) {
      const cacheKey = this.prerenderer.getCacheKeyForStep(stepIndex);
      const glyph = cacheKey ? this.prerenderer.getGlyph(cacheKey) : null;
      if (glyph) {
        drawPrerenderedGlyphToCanvas(ctx, canvasSize, glyph, alpha);
      }

      const elemental = this.prerenderer.getElementalGlyphForStep(stepIndex);
      if (elemental) {
        drawElementalGlyphToCanvas(ctx, canvasSize, elemental, alpha);
      }
    }

    ctx.restore();
  }
}
