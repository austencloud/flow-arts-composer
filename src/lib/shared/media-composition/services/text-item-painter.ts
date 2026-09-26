import type { CompiledTextItem } from "$lib/shared/media-composition/domain/post-project-compiler";
import { TEXT_BOX_WIDTH } from "$lib/shared/media-composition/domain/post-project";
import {
  CAPTION_LINE_HEIGHT_FRACTION,
  CAPTION_SIZE_FRACTION,
  CAPTION_STROKE_WIDTH_FRACTION,
  captionFontProbe,
  captionFontString,
  captionLineYPositions,
  wrapCaptionText,
} from "$lib/shared/media-composition/domain/caption-layout";
import type {
  PaintFrame,
  PaintRect,
  PostStudioLayerPainter,
} from "$lib/shared/media-composition/services/post-studio-layer-painter";

/** Same ink as a caption, so a text item and a caption read as one family. */
const FILL_COLOR = "#ffffff";
const STROKE_COLOR = "rgba(0, 0, 0, 0.85)";
const FONT_PROBE_PX = 96;
/** A small margin inside the text item's own box, distinct from the caption
 *  layer's margin (that one is a fraction of the whole frame). */
const TEXT_WRAP_WIDTH_FRACTION = 0.96;
const MIN_FONT_PX = 8;

/**
 * Paints one text item into its own region, live off `getText` so the same
 * instance keeps working as the project is edited. Every text item gets its
 * own clip and its own painter instance (see `textRole` in
 * `post-project-compiler.ts`), unlike the single full-frame caption layer, so
 * there is no "which ones are active right now" filtering to do here - the
 * frame evaluator already only calls paint() while this item's own clip
 * covers the current time.
 */
class TextItemPainter implements PostStudioLayerPainter {
  private fontReady = false;

  constructor(private readonly getText: () => CompiledTextItem | null) {}

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
      // bold system stack below rather than throwing mid-export.
      this.fontReady = false;
    }
  }

  paint(
    context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    rect: PaintRect,
    _frame: PaintFrame
  ): void {
    if (rect.width <= 0 || rect.height <= 0) return;
    const compiled = this.getText();
    if (!compiled) return;
    const text = compiled.text.trim();
    if (text.length === 0) return;

    const maxWidth = rect.width * TEXT_WRAP_WIDTH_FRACTION;
    // Calibrated so the box's own default width (a TEXT_BOX_WIDTH share of
    // the frame) reads at exactly a caption's size; a box resized wider or
    // narrower by Austen scales the text along with it.
    let fontPx =
      (CAPTION_SIZE_FRACTION[compiled.size] * rect.width) / TEXT_BOX_WIDTH;
    let lines: string[] = [];

    for (;;) {
      context.font = captionFontString(fontPx, this.fontReady);
      lines = wrapCaptionText(
        text,
        (line) => context.measureText(line).width,
        maxWidth
      );
      const blockHeight = fontPx * CAPTION_LINE_HEIGHT_FRACTION * lines.length;
      if (blockHeight <= rect.height || fontPx <= MIN_FONT_PX) break;
      fontPx = Math.max(MIN_FONT_PX, fontPx - 1);
    }

    const lineHeight = fontPx * CAPTION_LINE_HEIGHT_FRACTION;
    const centerX = rect.x + rect.width / 2;
    const centerY = rect.y + rect.height / 2;
    const lineYs = captionLineYPositions(centerY, lines.length, lineHeight);

    // The layer's opacity and any fade are already in the context's alpha by
    // the time this runs; painting at full strength keeps that the only
    // place a fade happens, so it never compounds with one of ours.
    context.save();
    context.font = captionFontString(fontPx, this.fontReady);
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.lineJoin = "round";
    context.miterLimit = 2;
    context.strokeStyle = STROKE_COLOR;
    context.lineWidth = fontPx * CAPTION_STROKE_WIDTH_FRACTION;
    context.fillStyle = FILL_COLOR;

    lines.forEach((line, index) => {
      const y = lineYs[index]!;
      context.strokeText(line, centerX, y);
      context.fillText(line, centerX, y);
    });

    context.restore();
  }
}

export function createTextItemPainter(
  getText: () => CompiledTextItem | null
): PostStudioLayerPainter {
  return new TextItemPainter(getText);
}
