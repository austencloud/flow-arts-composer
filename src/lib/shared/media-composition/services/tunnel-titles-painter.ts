import {
  calculateHeaderWordSideInset,
  renderHeader,
  type GlyphImageData,
} from "@tka/render-composition";
import {
  CAPTION_STROKE_WIDTH_FRACTION,
  sampleEasing,
} from "@austencloud/video-editor/core";
import {
  titlesLayout,
  titlesSpokenShown,
  titlesSpokenSizeAt,
  tunnelTitlesLook,
  type TunnelTitlesPlan,
} from "#lib/shared/media-composition/domain/tunnel-titles.js";
import {
  TITLE_LIT_DIM,
  createTitleLitFollower,
  drawnLetterForMove,
  drawnTitleLetters,
  titleLetterStrengths,
} from "#lib/shared/media-composition/domain/title-lit-letter.js";
import type {
  PaintFrame,
  PaintRect,
  PostStudioLayerPainter,
} from "@austencloud/video-editor/render";
import { textRenderer } from "#lib/shared/render/services/text-renderer.js";

/** Same ink as a caption, so the opening reads as one family with the post's words. */
const FILL_COLOR = "#ffffff";
const STROKE_COLOR = "rgba(0, 0, 0, 0.85)";
const SHADOW_COLOR = "rgba(0, 0, 0, 0.7)";
const LABEL_FONT_STACK =
  'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/** `renderHeader` draws its letters at this share of its band. */
const HEADER_GLYPH_SHARE = 0.65;
/** How strong the spoken line's words draw while another letter is lit. */
const SPOKEN_DIM = 0.35;
/**
 * The header's own spacing, which it does not export: the gap between
 * letters and a dash letter's bar, both against the band's height and the
 * glyph's scale. Only used to find where one letter ends and the next
 * begins, so a letter can draw at its own strength.
 */
const HEADER_LETTER_GAP = 0.04;
const HEADER_DASH_GAP = 10;
const HEADER_DASH_WIDTH = 70;

type Context = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** What the painter needs from the sequence. */
export interface TunnelTitlesSource {
  /** The name as drawn, shortened when it repeats. */
  word(): string;
  /** Each move's letter, in order, for the lit letter. */
  beatLetters(): readonly (string | null | undefined)[];
}

/**
 * Left and right edges of each drawn letter in a band of `canvasWidth` by
 * `band`, laid out as `renderHeader` lays them out. Null when a letter has no
 * glyph, since the header then draws without it.
 */
function letterEdges(
  letters: readonly string[],
  glyphs: Map<string, GlyphImageData>,
  canvasWidth: number,
  band: number
): [number, number][] | null {
  const glyphHeight = band * HEADER_GLYPH_SHARE;
  const gap = band * HEADER_LETTER_GAP;
  const widths: number[] = [];
  for (const letter of letters) {
    const data = glyphs.get(letter);
    if (!data) return null;
    const scale = glyphHeight / data.naturalHeight;
    widths.push(
      data.naturalWidth * scale +
        (data.isDash ? (HEADER_DASH_GAP + HEADER_DASH_WIDTH) * scale : 0)
    );
  }
  const total =
    widths.reduce((sum, width) => sum + width, 0) +
    gap * Math.max(0, widths.length - 1);
  const inset = calculateHeaderWordSideInset({
    headerHeight: band,
    showDifficultyBadge: false,
  });
  const available = Math.max(0, canvasWidth - 2 * inset);
  const fit = total > available && total > 0 ? available / total : 1;
  let cursor = canvasWidth / 2 - (total * fit) / 2;
  return widths.map((width) => {
    const edges: [number, number] = [cursor, cursor + width * fit];
    cursor += (width + gap) * fit;
    return edges;
  });
}

/** The spoken line's words, one per drawn letter when the counts match. */
function spokenParts(
  spoken: string,
  letterCount: number
): { text: string; letter: number | null }[] {
  const words = spoken.split(",").map((part) => part.trim());
  if (words.length !== letterCount || words.some((part) => !part))
    return [{ text: `“${spoken}”`, letter: null }];
  const parts: { text: string; letter: number | null }[] = [
    { text: "“", letter: null },
  ];
  words.forEach((part, index) => {
    parts.push({ text: part, letter: index });
    if (index < words.length - 1) parts.push({ text: ", ", letter: null });
  });
  parts.push({ text: "”", letter: null });
  return parts;
}

class TunnelTitlesPainter implements PostStudioLayerPainter {
  private readonly follow = createTitleLitFollower();

  constructor(
    private readonly getPlan: () => TunnelTitlesPlan | null,
    private readonly source: TunnelTitlesSource
  ) {}

  async prepare(): Promise<void> {
    const word = this.source.word();
    try {
      if (word) await textRenderer.preloadGlyphImagesForWord(word);
    } catch {
      // Without its glyphs the name paints in the header's own text face.
    }
  }

  /** Each drawn letter's strength now; all full when nothing is lit. */
  private strengths(
    plan: TunnelTitlesPlan,
    seconds: number,
    frame: PaintFrame,
    letters: readonly string[]
  ): number[] {
    const sequenceFrame = frame.sequenceFrame;
    const letter =
      sequenceFrame && sequenceFrame.phase !== "opening"
        ? drawnLetterForMove(
            sequenceFrame.move,
            this.source.beatLetters(),
            letters
          )
        : null;
    const moment = this.follow(seconds, letter);
    return titleLetterStrengths(letters.length, seconds, plan.lit, moment);
  }

  paint(context: Context, rect: PaintRect, frame: PaintFrame): void {
    const plan = this.getPlan();
    if (!plan || rect.width <= 0 || rect.height <= 0) return;
    const seconds =
      frame.projectTimeSeconds ??
      plan.start + frame.projectProgress * (plan.end - plan.start);
    const look = tunnelTitlesLook(plan, seconds, sampleEasing);
    const { x, width } = rect;
    const layout = titlesLayout(
      plan.layout,
      rect,
      titlesSpokenSizeAt(plan, seconds)
    );
    const { glyphHeight, spokenPx } = layout;
    const word = this.source.word();
    const letters = drawnTitleLetters(word);
    const strengths = this.strengths(plan, seconds, frame, letters);
    const lighting = strengths.some((strength) => strength < 1);

    context.save();
    context.lineJoin = "round";

    if (look.name.opacity > 0 && word && glyphHeight > 0) {
      const band = glyphHeight / HEADER_GLYPH_SHARE;
      const glyphs = textRenderer.buildGlyphMap(word);
      const top =
        layout.nameCenterY - band / 2 - look.name.rise * layout.risePx;
      const edges =
        lighting && glyphs.size > 0
          ? letterEdges(letters, glyphs, width, band)
          : null;
      const drawName = () =>
        renderHeader(context as CanvasRenderingContext2D, {
          canvasWidth: width,
          headerHeight: band,
          word,
          showDifficultyBadge: false,
          darkMode: true,
          backgroundColor: "transparent",
          borderColor: "transparent",
          ...(glyphs.size > 0 ? { glyphImages: glyphs } : {}),
        });
      context.save();
      context.globalAlpha *= look.name.opacity;
      context.translate(x, top);
      context.shadowColor = SHADOW_COLOR;
      context.shadowBlur = glyphHeight * 0.18;
      context.shadowOffsetY = glyphHeight * 0.03;
      if (edges) {
        // Each letter draws the whole name through a slit around itself, at
        // its own strength; the slits meet halfway across each gap.
        const alpha = context.globalAlpha;
        edges.forEach(([left, right], index) => {
          const from = index === 0 ? 0 : (edges[index - 1]![1] + left) / 2;
          const to =
            index === edges.length - 1
              ? width
              : (right + edges[index + 1]![0]) / 2;
          context.save();
          context.beginPath();
          context.rect(from, -band, to - from, band * 3);
          context.clip();
          context.globalAlpha = alpha * strengths[index]!;
          drawName();
          context.restore();
        });
      } else {
        drawName();
      }
      context.restore();
    }
    // A quiet span hides the line, say while the name sits on a card's header.
    const spokenOpacity =
      look.spoken.opacity * titlesSpokenShown(plan, seconds);
    if (spokenOpacity > 0 && plan.spoken) {
      context.save();
      context.globalAlpha *= spokenOpacity;
      // Read as a pronunciation, not a second title: quoted, in italics.
      context.font = `italic 500 ${spokenPx}px ${LABEL_FONT_STACK}`;
      context.textBaseline = "middle";
      context.strokeStyle = STROKE_COLOR;
      context.lineWidth = spokenPx * CAPTION_STROKE_WIDTH_FRACTION;
      context.fillStyle = FILL_COLOR;
      const spokenY = layout.spokenCenterY - look.spoken.rise * layout.risePx;
      const parts = lighting
        ? spokenParts(plan.spoken, letters.length)
        : [{ text: `“${plan.spoken}”`, letter: null }];
      if (parts.length === 1) {
        context.textAlign = "center";
        const line = parts[0]!.text;
        context.strokeText(line, x + width / 2, spokenY, layout.spokenMaxWidth);
        context.fillText(line, x + width / 2, spokenY, layout.spokenMaxWidth);
      } else {
        // The word said for the lit letter is lit with it.
        context.textAlign = "left";
        const widths = parts.map(
          (part) => context.measureText(part.text).width
        );
        const total = widths.reduce((sum, w) => sum + w, 0);
        const squeeze =
          total > layout.spokenMaxWidth ? layout.spokenMaxWidth / total : 1;
        let cursor = x + width / 2 - (total * squeeze) / 2;
        const alpha = context.globalAlpha;
        // The quotes and commas dim as far as the dimmest letter, so the
        // line comes back whole as the name does.
        const spokenStrength = (letterStrength: number) =>
          SPOKEN_DIM +
          ((1 - SPOKEN_DIM) * (letterStrength - TITLE_LIT_DIM)) /
            (1 - TITLE_LIT_DIM);
        const dimmest = Math.min(...strengths);
        parts.forEach((part, index) => {
          const strength = spokenStrength(
            part.letter === null ? dimmest : strengths[part.letter]!
          );
          context.globalAlpha = alpha * strength;
          const w = widths[index]! * squeeze;
          context.strokeText(part.text, cursor, spokenY, w);
          context.fillText(part.text, cursor, spokenY, w);
          cursor += w;
        });
      }
      context.restore();
    }

    context.restore();
  }
}

export function createTunnelTitlesPainter(
  getPlan: () => TunnelTitlesPlan | null,
  source: TunnelTitlesSource
): PostStudioLayerPainter {
  return new TunnelTitlesPainter(getPlan, source);
}
