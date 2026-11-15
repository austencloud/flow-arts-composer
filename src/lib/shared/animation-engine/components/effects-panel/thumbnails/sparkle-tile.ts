/**
 * Sparkle portrait. A prop tip has just swept an arc left-to-right; the glints
 * are what it left behind. Rate sets how many, size sets the arm length,
 * gravity pulls the older ones down, lifetime stretches the tail, spread
 * scatters them, mode decides whether they stream out, cling to the path, or
 * pop in clumps. Color follows the preset: solid, a palette, or the rainbow.
 * Ported from the approved reference page (spec reference/sparkle.html).
 */
import type { EffectConfigMap } from "#lib/shared/effects/state/effects-config-state.svelte.js";
import {
  type Point,
  type Rgb,
  blob,
  css,
  cssToRgb,
  ground,
  lcg,
  terminal,
} from "./tile-paint";
import { type Box, type TileFormat, frame, isSmall } from "./tile-format";

export type SparkleIntent = EffectConfigMap["sparkles"];
export const SPARKLE_TILE_SEED = 0x5a3c;

type Rand = () => number;

/** The swept arc: tail at lower-left, head (the tip now) at upper-right. */
const ARC = { x0: 90, y0: 205, cx: 330, cy: 0, x1: 610, y1: 105 };

function arcAt(t: number): Point {
  const u = 1 - t;
  return {
    x: u * u * ARC.x0 + 2 * u * t * ARC.cx + t * t * ARC.x1,
    y: u * u * ARC.y0 + 2 * u * t * ARC.cy + t * t * ARC.y1,
  };
}

function paletteColor(p: SparkleIntent, i: number): string {
  const palette = p.palette.length > 0 ? p.palette : [p.color];
  return palette[i % palette.length] ?? p.color;
}

function colorFor(p: SparkleIntent, i: number): string {
  if (p.colorMode === "rainbow")
    return `hsl(${Math.round((i * 47) % 360)}, 85%, 65%)`;
  if (p.colorMode === "palette") return paletteColor(p, i);
  return p.color;
}

/** The renderer's glint: glow bed, four long arms, four short diagonals, white heart. */
function glint(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  arm: number,
  rot: number,
  color: string,
  alpha: number,
  bed = 1,
  bold = false
): void {
  const rgb: Rgb = cssToRgb(color);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.globalCompositeOperation = "lighter";
  const d = arm * 2.8;
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, d);
  g.addColorStop(0, css(rgb, alpha * 0.8 * bed));
  g.addColorStop(0.35, css(rgb, alpha * 0.3 * bed));
  g.addColorStop(1, css(rgb, 0));
  ctx.fillStyle = g;
  ctx.fillRect(-d, -d, d * 2, d * 2);
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  ctx.globalAlpha = alpha;
  ctx.lineWidth = Math.max(1, arm * (bold ? 0.24 : 0.22));
  ctx.beginPath();
  ctx.moveTo(-arm, 0);
  ctx.lineTo(arm, 0);
  ctx.moveTo(0, -arm);
  ctx.lineTo(0, arm);
  ctx.stroke();
  // Small formats draw the plain four-point star: diagonals are mush there.
  const dg = bold ? 0 : arm * 0.55;
  ctx.globalAlpha = alpha * 0.7;
  ctx.lineWidth = Math.max(0.6, arm * (bold ? 0.17 : 0.12));
  ctx.beginPath();
  if (dg > 0) {
    ctx.moveTo(-dg, -dg);
    ctx.lineTo(dg, dg);
    ctx.moveTo(-dg, dg);
    ctx.lineTo(dg, -dg);
  }
  ctx.stroke();
  ctx.fillStyle = "#fff";
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.arc(0, 0, Math.max(0.8, arm * (bold ? 0.24 : 0.18)), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawGlints(
  ctx: CanvasRenderingContext2D,
  p: SparkleIntent,
  rand: Rand
): void {
  // Dial -> arm length: the dial maps onto a 0.25-0.65 base scale and the
  // renderer draws a star ~5x that in reference px; at tile scale that is
  // roughly 7px at size 0.07 and 30px at size 0.42.
  const arm = (0.25 + p.size * 0.95) * 5 * 2.4 * 1.9;
  const count = Math.round(18 + p.rate * 70);
  // How far back along the arc glints survive.
  const tail = 0.35 + Math.min(1, p.lifetime / 2.6) * 0.65;
  const scatter = (6 + p.spread * 9) * 2.4 * 0.5;
  const drop = p.gravity * 150;
  const burst = p.mode === "burst";
  const trail = p.mode === "trail";
  const cling = trail ? 0.35 : 1;

  for (let i = 0; i < count; i += 1) {
    // Age 0 = just spawned at the head; 1 = oldest surviving glint.
    const age = burst ? rand() : Math.pow(rand(), 1.5);
    const t = 1 - age * tail;
    const base = arcAt(Math.max(0, t));
    const spreadNow = scatter * cling * (0.3 + age);
    const x = base.x + (rand() - 0.5) * 2 * spreadNow;
    // Stream glints drift outward and sag with gravity as they age; trail
    // glints hug the path and then fall straight.
    const y =
      base.y + (rand() - 0.5) * 2 * spreadNow * 0.8 + drop * age * (0.4 + age);
    const r = arm * (0.7 + rand() * 0.6);
    const alpha = (0.45 + (1 - age) * 0.55) * (0.7 + rand() * 0.3);
    glint(
      ctx,
      x,
      y,
      r,
      rand() * Math.PI,
      colorFor(p, i),
      alpha,
      Math.min(1, 38 / count)
    );
  }
  // The tip itself: a small hot point at the head of the sweep.
  const head = arcAt(1);
  const headColor =
    p.colorMode === "rainbow"
      ? "#fff"
      : p.colorMode === "palette"
        ? paletteColor(p, 0)
        : p.color;
  terminal(ctx, head.x, head.y, 36, headColor, 0.9);
}

/**
 * Small formats: five to seven large stars on a rising sweep, one brightest.
 * Positions are fractions of the framed view (u, v), arm a fraction of its
 * height; the look's size dial scales the arms a little, rate picks how many
 * of the seven show, spread jitters the positions.
 */
const SMALL_VIEW: Record<"tile" | "chip", Box> = {
  tile: { x: 90, y: 30, w: 540, h: 202.5 },
  chip: { x: 210, y: 30, w: 300, h: 200 },
};
const SMALL_STARS: Record<
  "tile" | "chip",
  readonly (readonly [number, number, number])[]
> = {
  tile: [
    [0.14, 0.72, 0.17],
    [0.27, 0.46, 0.22],
    [0.4, 0.74, 0.15],
    [0.52, 0.38, 0.34],
    [0.65, 0.68, 0.17],
    [0.77, 0.3, 0.23],
    [0.87, 0.6, 0.16],
  ],
  chip: [
    [0.2, 0.7, 0.12],
    [0.37, 0.36, 0.19],
    [0.54, 0.74, 0.12],
    [0.66, 0.34, 0.27],
    [0.84, 0.68, 0.13],
  ],
};
/** Index of the brightest star in each layout. */
const SMALL_LEAD: Record<"tile" | "chip", number> = { tile: 3, chip: 3 };

function drawSmallStars(
  ctx: CanvasRenderingContext2D,
  p: SparkleIntent,
  rand: Rand,
  format: "tile" | "chip",
  view: Box
): void {
  const layout = SMALL_STARS[format];
  const shown = Math.min(
    layout.length,
    Math.max(format === "chip" ? 4 : 5, Math.round(4 + p.rate * 4))
  );
  const sizeK = 0.85 + Math.min(0.3, p.size * 0.6);
  const order = layout.map((_, i) => i);
  // Drop the faintest first when the rate is low; the lead always stays.
  const keep = new Set(order.slice(0, shown).concat(SMALL_LEAD[format]));
  layout.forEach(([u, v, a], i) => {
    if (!keep.has(i)) return;
    const jx = (rand() - 0.5) * p.spread * 0.04;
    const jy = (rand() - 0.5) * p.spread * 0.06;
    const lead = i === SMALL_LEAD[format];
    glint(
      ctx,
      view.x + (u + jx) * view.w,
      view.y + (v + jy) * view.h,
      a * view.h * sizeK,
      i * 0.22,
      colorFor(p, i),
      lead ? 1 : 0.82,
      lead ? 0.55 : 0.3,
      true
    );
  });
}

export function paintSparkleTile(
  ctx: CanvasRenderingContext2D,
  intent: SparkleIntent,
  format: TileFormat = "card"
): void {
  const small = isSmall(format);
  const view = small
    ? frame(ctx, format, SMALL_VIEW[format as "tile" | "chip"], 0)
    : null;
  ground(ctx, [0.03, 0.03, 0.06]);
  const wash: Rgb =
    intent.colorMode === "rainbow"
      ? [0.6, 0.5, 0.8]
      : cssToRgb(
          intent.colorMode === "palette"
            ? paletteColor(intent, 0)
            : intent.color
        );
  if (view) {
    blob(ctx, view.x + view.w / 2, view.y + view.h / 2, view.w * 0.5, view.h * 0.6, wash, 0.09);
    drawSmallStars(ctx, intent, lcg(SPARKLE_TILE_SEED), format as "tile" | "chip", view);
    return;
  }
  blob(ctx, 400, 120, 260, 150, wash, 0.08);
  drawGlints(ctx, intent, lcg(SPARKLE_TILE_SEED));
}
