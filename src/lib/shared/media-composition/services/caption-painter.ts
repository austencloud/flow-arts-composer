import type { CompiledCaption } from "$lib/shared/media-composition/domain/post-plan-compiler";
import {
  CAPTION_FADE_SECONDS,
  CAPTION_LINE_HEIGHT_FRACTION,
  CAPTION_MAX_WIDTH_FRACTION,
  CAPTION_STROKE_WIDTH_FRACTION,
  activeCaptionsAtTime,
  captionCenterY,
  captionFontProbe,
  captionFontPx,
  captionFontString,
  captionLineYPositions,
  wrapCaptionText,
} from "$lib/shared/media-composition/domain/caption-layout";
import type {
  PaintFrame,
  PaintRect,
  PostStudioLayerPainter,
} from "$lib/shared/media-composition/services/post-studio-layer-painter";

/** InShot-style caption ink: heavy dark outline under a solid white fill. */
const FILL_COLOR = "#ffffff";
const STROKE_COLOR = "rgba(0, 0, 0, 0.85)";
/** A probe size for `document.fonts.load`; only the family/weight/style
 *  matter for loading, but a realistic size keeps the fetch identical to
 *  what paint() will actually request. */
const FONT_PROBE_PX = 96;

/**
 * Paints the post's captions as one full-frame layer. `getCaptions` reads
 * live so the same painter instance keeps working as the plan is edited -
 * export re-reads it every frame instead of the painter caching a snapshot
 * at construction time.
 */
class CaptionPainter implements PostStudioLayerPainter {
  private fontReady = false;

  constructor(private readonly getCaptions: () => readonly CompiledCaption[]) {}

  async prepare(): Promise<void> {
    if (typeof document === "undefined" || !document.fonts) {
      this.fontReady = false;
      return;
    }
    try {
      await document.fonts.load(captionFontProbe(FONT_PROBE_PX));
      this.fontReady = document.fonts.check(captionFontProbe(FONT_PROBE_PX));
    } catch {
      // A failed fetch (offline, blocked, font missing) falls back to the
      // bold system stack in paint() rather than throwing mid-export.
      this.fontReady = false;
    }
  }

  paint(
    context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    rect: PaintRect,
    frame: PaintFrame
  ): void {
    if (rect.width <= 0 || rect.height <= 0) return;
    const timeSeconds = frame.projectTimeSeconds;
    if (timeSeconds === undefined) return;

    const active = activeCaptionsAtTime(
      this.getCaptions(),
      timeSeconds,
      CAPTION_FADE_SECONDS
    );
    if (active.length === 0) return;

    const maxWidth = rect.width * CAPTION_MAX_WIDTH_FRACTION;
    const centerX = rect.x + rect.width / 2;

    for (const { caption, alpha } of active) {
      if (alpha <= 0) continue;
      const fontPx = captionFontPx(caption.size, rect.width);
      const font = captionFontString(fontPx, this.fontReady);

      context.save();
      context.globalAlpha *= alpha;
      context.font = font;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.lineJoin = "round";
      context.miterLimit = 2;

      const lines = wrapCaptionText(
        caption.text,
        (line) => context.measureText(line).width,
        maxWidth
      );
      const lineHeight = fontPx * CAPTION_LINE_HEIGHT_FRACTION;
      const centerY = captionCenterY(caption.position, rect);
      const lineYs = captionLineYPositions(centerY, lines.length, lineHeight);

      context.strokeStyle = STROKE_COLOR;
      context.lineWidth = fontPx * CAPTION_STROKE_WIDTH_FRACTION;
      context.fillStyle = FILL_COLOR;

      lines.forEach((line, index) => {
        const y = lineYs[index]!;
        // Stroke first so the outline sits behind the fill, not on top of it.
        context.strokeText(line, centerX, y);
        context.fillText(line, centerX, y);
      });

      context.restore();
    }
  }
}

export function createCaptionPainter(
  getCaptions: () => readonly CompiledCaption[]
): PostStudioLayerPainter {
  return new CaptionPainter(getCaptions);
}
