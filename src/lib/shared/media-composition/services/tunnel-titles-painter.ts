import { renderHeader } from "@tka/render-composition";
import { CAPTION_STROKE_WIDTH_FRACTION } from "$lib/shared/media-composition/domain/caption-layout";
import { sampleEasing } from "$lib/shared/media-composition/domain/post-project-keyframes";
import {
  tunnelTitlesLook,
  type TunnelTitlesPlan,
} from "$lib/shared/media-composition/domain/tunnel-titles";
import type {
  PaintFrame,
  PaintRect,
  PostStudioLayerPainter,
} from "$lib/shared/media-composition/services/post-studio-layer-painter";
import { textRenderer } from "$lib/shared/render/services/text-renderer";

/** Same ink as a caption, so the opening reads as one family with the post's words. */
const FILL_COLOR = "#ffffff";
const STROKE_COLOR = "rgba(0, 0, 0, 0.85)";
const SHADOW_COLOR = "rgba(0, 0, 0, 0.7)";
const LABEL_FONT_STACK = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/** Share of the frame's short side the tunnel's ring covers while it holds the frame. */
const TUNNEL_EXTENT = 0.62;
/** The name's letters, as a share of the frame's height, at most. */
const NAME_HEIGHT = 0.055;
/** The share of the band above the tunnel the name may take. */
const NAME_BAND_SHARE = 0.3;
/** `renderHeader` draws its letters at this share of its band. */
const HEADER_GLYPH_SHARE = 0.65;
/** "How to say it", relative to the name's letters. */
const SPOKEN_SIZE = 0.42;
const SPOKEN_GAP = 0.45;
type Context = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

class TunnelTitlesPainter implements PostStudioLayerPainter {
  constructor(
    private readonly getPlan: () => TunnelTitlesPlan | null,
    private readonly getWord: () => string
  ) {}

  async prepare(): Promise<void> {
    const word = this.getWord();
    try {
      if (word) await textRenderer.preloadGlyphImagesForWord(word);
    } catch {
      // Without its glyphs the name paints in the header's own text face.
    }
  }

  paint(context: Context, rect: PaintRect, frame: PaintFrame): void {
    const plan = this.getPlan();
    if (!plan || rect.width <= 0 || rect.height <= 0) return;
    const seconds =
      frame.projectTimeSeconds ??
      plan.start + frame.projectProgress * (plan.end - plan.start);
    const look = tunnelTitlesLook(plan, seconds, sampleEasing);
    const { x, y, width, height } = rect;
    const ring = (Math.min(width, height) * TUNNEL_EXTENT) / 2;
    const above = Math.max(0, height / 2 - ring);

    context.save();
    context.lineJoin = "round";

    // The name and how to say it, centred in the band above the tunnel.
    const glyphHeight = Math.min(height * NAME_HEIGHT, above * NAME_BAND_SHARE);
    const spokenPx = glyphHeight * SPOKEN_SIZE;
    const blockHeight =
      glyphHeight + (plan.spoken ? glyphHeight * SPOKEN_GAP + spokenPx : 0);
    const blockTop = y + (above - blockHeight) / 2;
    const word = this.getWord();
    if (look.name.opacity > 0 && word && glyphHeight > 0) {
      const band = glyphHeight / HEADER_GLYPH_SHARE;
      const glyphs = textRenderer.buildGlyphMap(word);
      context.save();
      context.globalAlpha *= look.name.opacity;
      context.translate(
        x,
        blockTop + glyphHeight / 2 - band / 2 - look.name.rise * height
      );
      context.shadowColor = SHADOW_COLOR;
      context.shadowBlur = glyphHeight * 0.18;
      context.shadowOffsetY = glyphHeight * 0.03;
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
      context.restore();
    }
    if (look.spoken.opacity > 0 && plan.spoken) {
      context.save();
      context.globalAlpha *= look.spoken.opacity;
      // Read as a pronunciation, not a second title: quoted, in italics.
      context.font = `italic 500 ${spokenPx}px ${LABEL_FONT_STACK}`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.strokeStyle = STROKE_COLOR;
      context.lineWidth = spokenPx * CAPTION_STROKE_WIDTH_FRACTION;
      context.fillStyle = FILL_COLOR;
      const spokenY =
        blockTop +
        glyphHeight * (1 + SPOKEN_GAP) +
        spokenPx / 2 -
        look.spoken.rise * height;
      const line = `“${plan.spoken}”`;
      context.strokeText(line, x + width / 2, spokenY, width * 0.9);
      context.fillText(line, x + width / 2, spokenY, width * 0.9);
      context.restore();
    }

    context.restore();
  }
}

export function createTunnelTitlesPainter(
  getPlan: () => TunnelTitlesPlan | null,
  getWord: () => string
): PostStudioLayerPainter {
  return new TunnelTitlesPainter(getPlan, getWord);
}
