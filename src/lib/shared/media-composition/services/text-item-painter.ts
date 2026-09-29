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

/** The recovered sl5 text selector: ramp-up range, with the native engine's
 * ease controls (0.2, 0) and (0, 1). The animator applies -300 template
 * units of Y and zero opacity at full selection. */
function nativeLetterEase(value: number): number {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  let low = 0;
  let high = 1;
  for (let step = 0; step < 24; step += 1) {
    const t = (low + high) / 2;
    const inverse = 1 - t;
    const x = 0.6 * inverse * inverse * t + t * t * t;
    if (x < value) low = t;
    else high = t;
  }
  const t = (low + high) / 2;
  const inverse = 1 - t;
  return 3 * inverse * t * t + t * t * t;
}

function nativeLetterSelection(
  index: number,
  total: number,
  progress: number,
  direction: "in" | "out"
): number {
  if (total <= 0) return 0;
  const p = Math.max(0, Math.min(1, progress));
  const start = total * (direction === "in" ? -1 + 2 * p : 1 - 2 * p);
  const ramp = Math.max(0, Math.min(1, (index + 0.5 - start) / total));
  return nativeLetterEase(ramp);
}

/** Reference-export calibration for the sl5 entrance. The template's
 * selector and glyph transform are recovered, but InShot's template clock
 * mapping is not; a direct 0..1 mapping leaves the first half invisible.
 * These values align the recovered draft's visible first and last glyphs. */
function nativeEntranceProgress(
  localSeconds: number,
  duration: number
): number {
  if (localSeconds <= 0) return 0;
  const progress = Math.max(0, Math.min(1, localSeconds / duration));
  return 0.25 + 0.75 * (1 - (1 - progress) ** 2.3);
}

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
      const style = this.getText()?.style;
      if (style) {
        const family = style.fontFamily
          .replace(/\.ttf$/i, "")
          .replaceAll('"', "");
        await document.fonts.load(`${FONT_PROBE_PX}px "${family}"`);
      }
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
    frame: PaintFrame
  ): void {
    if (rect.width <= 0 || rect.height <= 0) return;
    const compiled = this.getText();
    if (!compiled) return;
    const text = compiled.style ? compiled.text : compiled.text.trim();
    if (text.length === 0) return;

    const maxWidth =
      rect.width * (compiled.style ? 1 : TEXT_WRAP_WIDTH_FRACTION);
    // Calibrated so the box's own default width (a TEXT_BOX_WIDTH share of
    // the frame) reads at exactly a caption's size; a box resized wider or
    // narrower by Austen scales the text along with it.
    let fontPx = compiled.style
      ? (compiled.style.fontSizeNative *
          (compiled.style.fontScale ?? 1) *
          rect.width) /
        (compiled.box.width * (compiled.style.sourceCanvasWidth ?? 1080))
      : (CAPTION_SIZE_FRACTION[compiled.size] * rect.width) / TEXT_BOX_WIDTH;
    const fontName = compiled.style?.fontFamily.replace(/\.ttf$/i, "");
    const font = (size: number) =>
      fontName
        ? `${size}px "${fontName.replaceAll('"', "")}", cursive`
        : captionFontString(size, this.fontReady);
    const spacing = compiled.style?.letterSpacing ?? 0;
    const measure = (line: string) =>
      context.measureText(line).width + Math.max(0, line.length - 1) * spacing;
    let lines: string[] = [];

    for (;;) {
      context.font = font(fontPx);
      lines = compiled.style
        ? text.replace(/\r\n?/g, "\n").split("\n")
        : wrapCaptionText(text, measure, maxWidth);
      if (compiled.style) break;
      const blockHeight = fontPx * CAPTION_LINE_HEIGHT_FRACTION * lines.length;
      if (blockHeight <= rect.height || fontPx <= MIN_FONT_PX) break;
      fontPx = Math.max(MIN_FONT_PX, fontPx - 1);
    }

    const lineHeight =
      fontPx * (compiled.style?.lineSpacing ?? CAPTION_LINE_HEIGHT_FRACTION);
    const centerX = rect.x + rect.width / 2;
    const textX =
      compiled.style?.alignment === "left"
        ? rect.x + (rect.width - maxWidth) / 2
        : compiled.style?.alignment === "right"
          ? rect.x + (rect.width + maxWidth) / 2
          : centerX;
    const centerY = rect.y + rect.height / 2;
    const lineYs = captionLineYPositions(centerY, lines.length, lineHeight);

    // The layer's fade is already in the context's alpha. Native text style
    // alpha and per-letter visibility multiply it without replacing it.
    context.save();
    context.font = font(fontPx);
    context.textAlign = compiled.style?.alignment ?? "center";
    context.textBaseline = "middle";
    context.lineJoin = "round";
    context.miterLimit = 2;
    context.strokeStyle = STROKE_COLOR;
    context.lineWidth = fontPx * CAPTION_STROKE_WIDTH_FRACTION;
    context.fillStyle = FILL_COLOR;

    if (compiled.style) context.globalAlpha *= compiled.style.alpha;
    const duration = compiled.endSeconds - compiled.startSeconds;
    const localSeconds =
      frame.projectTimeSeconds === undefined
        ? frame.projectProgress * duration
        : frame.projectTimeSeconds - compiled.startSeconds;
    const totalLetters = compiled.animation
      ? lines.reduce(
          (count, line) =>
            count +
            Array.from(line).filter((glyph) => !/\s/u.test(glyph)).length,
          0
        )
      : 0;
    let letterIndex = 0;
    lines.forEach((line, index) => {
      const y = lineYs[index]!;
      if (!compiled.animation && spacing === 0) {
        if (!compiled.style) context.strokeText(line, textX, y);
        context.fillText(line, textX, y);
        return;
      }
      const glyphs = Array.from(line);
      const widths = glyphs.map((glyph) => context.measureText(glyph).width);
      const lineWidth =
        widths.reduce((sum, width) => sum + width, 0) +
        spacing * Math.max(0, glyphs.length - 1);
      let x =
        compiled.style?.alignment === "left"
          ? textX
          : compiled.style?.alignment === "right"
            ? textX - lineWidth
            : textX - lineWidth / 2;
      context.textAlign = "center";
      glyphs.forEach((glyph, glyphIndex) => {
        const slot = letterIndex;
        if (!/\s/u.test(glyph)) letterIndex += 1;
        const inSelection =
          compiled.animation && compiled.animation.inDurationSeconds > 0
            ? nativeLetterSelection(
                slot,
                totalLetters,
                nativeEntranceProgress(
                  localSeconds,
                  compiled.animation.inDurationSeconds
                ),
                "in"
              )
            : 0;
        const outSelection =
          compiled.animation && compiled.animation.outDurationSeconds > 0
            ? nativeLetterSelection(
                slot,
                totalLetters,
                (localSeconds -
                  (duration - compiled.animation.outDurationSeconds)) /
                  compiled.animation.outDurationSeconds,
                "out"
              )
            : 0;
        const selected = Math.max(inSelection, outSelection);
        const visibility = 1 - selected;
        if (visibility > 0) {
          context.save();
          context.globalAlpha *= visibility;
          const templateScale = rect.width / (compiled.box.width * 1080);
          const glyphY = y - 300 * templateScale * selected;
          if (!compiled.style)
            context.strokeText(glyph, x + widths[glyphIndex]! / 2, glyphY);
          context.fillText(glyph, x + widths[glyphIndex]! / 2, glyphY);
          context.restore();
        }
        x += widths[glyphIndex]! + spacing;
      });
    });

    context.restore();
  }
}

export function createTextItemPainter(
  getText: () => CompiledTextItem | null
): PostStudioLayerPainter {
  return new TextItemPainter(getText);
}
