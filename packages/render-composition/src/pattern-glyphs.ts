/** Canvas geometry shared by card-back bitmaps and exported video headers. */
export interface TurnGlyphEntry {
  readonly left: number;
  readonly right: number;
  readonly leftFloat?: boolean;
  readonly rightFloat?: boolean;
}

export interface ReversalGlyphData {
  readonly sequence: string;
  readonly period: number;
}

export const TURN_GLYPH_BOX_W_CQI = 10;
export const TURN_GLYPH_BOX_H_CQI = 6;

const BAR_W_CQI = 1.1;
const INTRA_GAP_CQI = 0.25;
const GROUP_GAP_CQI = 0.6;
const RADIUS_CQI = 0.2;

export interface TurnGlyphLayout {
  barW: number;
  intraGap: number;
  groupGap: number;
  radius: number;
  clusterW: number;
  scale: number;
}

export function layoutTurnGlyph(
  count: number,
  boxW: number = TURN_GLYPH_BOX_W_CQI
): TurnGlyphLayout {
  const groupW = BAR_W_CQI * 2 + INTRA_GAP_CQI;
  const natural = count > 0 ? count * groupW + (count - 1) * GROUP_GAP_CQI : 0;
  const scale = natural > boxW ? boxW / natural : 1;
  return {
    barW: BAR_W_CQI * scale,
    intraGap: INTRA_GAP_CQI * scale,
    groupGap: GROUP_GAP_CQI * scale,
    radius: RADIUS_CQI * scale,
    clusterW: natural * scale,
    scale,
  };
}

type GlyphContext =
  | CanvasRenderingContext2D
  | OffscreenCanvasRenderingContext2D;
export interface GlyphBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}
export interface GlyphColors {
  readonly blue?: string;
  readonly red?: string;
  readonly muted?: string;
}
const BLUE_HAND = "#3498db";
const RED_HAND = "#e74c3c";

export function turnBarHeightCqi(value: number, isFloat: boolean): number {
  if (isFloat) return 1.2;
  return value === 0 ? 0.5 : value * 1.8;
}

/** Paint the original card-back bars, including its diagonal hatch approximation. */
export function paintTurnGlyph(
  ctx: GlyphContext,
  entries: readonly TurnGlyphEntry[],
  box: GlyphBox,
  colors: GlyphColors = {},
  unit = box.width / TURN_GLYPH_BOX_W_CQI
): void {
  const cqi = unit;
  const layout = layoutTurnGlyph(entries.length);
  const barW = layout.barW * cqi;
  const intraGap = layout.intraGap * cqi;
  const groupGap = layout.groupGap * cqi;
  const radius = layout.radius * cqi;
  let x = box.x + (box.width - layout.clusterW * cqi) / 2;
  const bottom = box.y + box.height;
  for (const entry of entries) {
    drawTurnBar(
      ctx,
      x,
      bottom,
      barW,
      turnBarHeightCqi(entry.left, !!entry.leftFloat) * cqi,
      radius,
      colors.blue ?? BLUE_HAND,
      !!entry.leftFloat
    );
    x += barW + intraGap;
    drawTurnBar(
      ctx,
      x,
      bottom,
      barW,
      turnBarHeightCqi(entry.right, !!entry.rightFloat) * cqi,
      radius,
      colors.red ?? RED_HAND,
      !!entry.rightFloat
    );
    x += barW + groupGap;
  }
}

function drawTurnBar(
  ctx: GlyphContext,
  x: number,
  bottom: number,
  w: number,
  h: number,
  radius: number,
  color: string,
  isFloat: boolean
): void {
  const y = bottom - h;
  const rr = Math.min(radius, w / 2, h);
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.lineTo(x, y + rr);
  ctx.arcTo(x, y, x + rr, y, rr);
  ctx.lineTo(x + w - rr, y);
  ctx.arcTo(x + w, y, x + w, y + rr, rr);
  ctx.lineTo(x + w, y + h);
  ctx.closePath();
  if (isFloat) {
    ctx.save();
    ctx.clip();
    ctx.globalAlpha = 0.7;
    ctx.strokeStyle = color;
    ctx.lineWidth = 0.4 * (w / 1.1);
    const step = 0.8 * (w / 1.1);
    for (let d = -h; d < w + h; d += step) {
      ctx.beginPath();
      ctx.moveTo(x + d, y + h);
      ctx.lineTo(x + d + h, y);
      ctx.stroke();
    }
    ctx.restore();
  } else {
    ctx.fillStyle = color;
    ctx.fill();
  }
}

export function paintReversalGlyph(
  ctx: GlyphContext,
  data: ReversalGlyphData,
  box: GlyphBox,
  colors: GlyphColors = {},
  fit = false,
  unit = box.height / TURN_GLYPH_BOX_H_CQI
): void {
  const symbols = data.sequence.slice(0, Math.min(8, data.period)).split("");
  const cqi = unit;
  const naturalRowW = symbols.length
    ? (symbols.length * 1.8 + (symbols.length - 1) * 0.6) * cqi
    : 0;
  const scale = fit && naturalRowW > box.width ? box.width / naturalRowW : 1;
  const r = 0.9 * cqi * scale;
  const colGap = 0.6 * cqi * scale;
  const dotGap = 0.3 * cqi * scale;
  const colW = r * 2;
  const colH = r * 4 + dotGap;
  const rowW = symbols.length
    ? symbols.length * colW + (symbols.length - 1) * colGap
    : 0;
  let cx = box.x + (box.width - rowW) / 2 + r;
  const topCy = box.y + (box.height - colH) / 2 + r;
  const botCy = topCy + r * 2 + dotGap;
  for (const symbol of symbols) {
    const right = symbol === "P" || symbol === "R";
    const left = symbol === "P" || symbol === "B";
    drawReversalDot(
      ctx,
      cx,
      topCy,
      r,
      right ? (colors.red ?? RED_HAND) : null,
      colors.muted ?? "rgba(0, 0, 0, 0.55)"
    );
    drawReversalDot(
      ctx,
      cx,
      botCy,
      r,
      left ? (colors.blue ?? BLUE_HAND) : null,
      colors.muted ?? "rgba(0, 0, 0, 0.55)"
    );
    cx += colW + colGap;
  }
}

function drawReversalDot(
  ctx: GlyphContext,
  cx: number,
  cy: number,
  r: number,
  color: string | null,
  muted: string
): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  if (color === null) {
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = muted;
  } else {
    ctx.fillStyle = color;
  }
  ctx.fill();
  ctx.restore();
}
