// MPC poker card defaults (822x1122 at 300 DPI with 36px bleed).
const MPC_WIDTH = 822;
const MPC_HEIGHT = 1122;
const MPC_BLEED = 36;

// Colored frame thickness as a multiple of the print bleed. >1 pushes the
// stripe border PAST the trim line into the safe area, so an imprecise cut
// still lands on colored border instead of white content (cutting tolerance).
// Content (cells + header + footer) shrinks to fit the smaller inner area.
const BORDER_SCALE = 2.0;

const OUTER_RADIUS = 0;
const INNER_RADIUS = 0;

export function getCardFrameContentInset(bleedPx: number): number {
  return Math.round(bleedPx * BORDER_SCALE);
}

/** Draw a rounded rectangle path (does not fill or stroke) */
function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.closePath();
}

/** Fill the canvas with diagonal pinstripes */
function drawStripes(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  accent: string,
  dark: string,
  stripeWidth: number = 6,
  palette?: readonly string[]
): void {
  if (palette && palette.length > 0) {
    const diagonal = Math.sqrt(w * w + h * h);
    const bandWidth = stripeWidth * 2;
    const count = Math.ceil(diagonal / bandWidth) + palette.length;

    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(-Math.PI / 4);
    for (let index = -count; index <= count; index += 1) {
      const paletteIndex =
        ((index % palette.length) + palette.length) % palette.length;
      ctx.fillStyle = palette[paletteIndex]!;
      ctx.fillRect(index * bandWidth, -diagonal / 2, bandWidth + 1, diagonal);
    }
    ctx.restore();
    return;
  }

  // Fill base with dark color
  ctx.fillStyle = dark;
  ctx.fillRect(0, 0, w, h);

  // Draw diagonal accent stripes
  ctx.fillStyle = accent;
  const half = stripeWidth / 2;
  const diagonal = Math.sqrt(w * w + h * h);
  const count = Math.ceil(diagonal / stripeWidth) + 1;

  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate(-Math.PI / 4); // 45 degrees

  for (let i = -count; i <= count; i++) {
    const x = i * stripeWidth;
    ctx.fillRect(x, -diagonal / 2, half, diagonal);
  }
  ctx.restore();
}

/** Draw the edge glow overlay */
function drawEdgeGlow(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number
): void {
  const glowHeight = h * 0.2;

  // Top glow
  const topGrad = ctx.createLinearGradient(0, 0, 0, glowHeight);
  topGrad.addColorStop(0, "rgba(255, 255, 255, 0.2)");
  topGrad.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = topGrad;
  ctx.fillRect(0, 0, w, glowHeight);

  // Bottom glow
  const botGrad = ctx.createLinearGradient(0, h - glowHeight, 0, h);
  botGrad.addColorStop(0, "rgba(255, 255, 255, 0)");
  botGrad.addColorStop(1, "rgba(255, 255, 255, 0.2)");
  ctx.fillStyle = botGrad;
  ctx.fillRect(0, h - glowHeight, w, glowHeight);
}

export interface CardFrameOptions {
  canvasWidth?: number; // default 822
  canvasHeight?: number; // default 1122
  bleedPx?: number; // default 36 (print trim margin)
  accent: string; // tndElement.accentColor (fallback handled by caller)
  dark: string; // tndElement.darkComplement
  /** Ordered semantic stripe colors. Omit to preserve the classic two-color frame. */
  palette?: readonly string[];
}

/**
 * Wrap a rendered content canvas in the MPC card frame: full-canvas stripe
 * border + edge glow, then the content drawn into the white inner area inset by
 * the colored border (border = round(bleed * BORDER_SCALE), thicker than bleed
 * for cut tolerance). Paints into the caller's browser or Node canvas.
 */
export function paintCardFrame(
  ctx: CanvasRenderingContext2D,
  content: CanvasImageSource,
  opts: CardFrameOptions
): void {
  const canvasW = opts.canvasWidth ?? MPC_WIDTH;
  const canvasH = opts.canvasHeight ?? MPC_HEIGHT;
  const bleed = opts.bleedPx ?? MPC_BLEED;
  // Border (colored frame) is thicker than the bleed so it stays visible after
  // an imprecise cut. Content insets by `border`, not `bleed`.
  const border = getCardFrameContentInset(bleed);
  const contentW = canvasW - border * 2;
  const contentH = canvasH - border * 2;

  const outerRadius = OUTER_RADIUS;
  const innerRadius = INNER_RADIUS;

  // 1. Clip to rounded outer card shape
  ctx.save();
  roundRectPath(ctx, 0, 0, canvasW, canvasH, outerRadius);
  ctx.clip();

  // 2. Draw stripe pattern across entire canvas
  drawStripes(ctx, canvasW, canvasH, opts.accent, opts.dark, 6, opts.palette);

  // 3. Draw edge glow overlay
  drawEdgeGlow(ctx, canvasW, canvasH);

  // 4. Clip inner content area (rounded rect inset by the colored border)
  ctx.save();
  roundRectPath(ctx, border, border, contentW, contentH, innerRadius);
  ctx.clip();

  // 5. Fill inner area with white
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(border, border, contentW, contentH);

  // 6. Draw sequence image - deckCard mode produces exact content dimensions, draw 1:1
  ctx.drawImage(content, border, border, contentW, contentH);

  ctx.restore(); // inner clip
  ctx.restore(); // outer clip
}
