/**
 * Shared tile paint kit. Every effect portrait is a 720x270 canvas, shown at
 * about 304x114 in the picker: dark ground, additive light, every mark derived
 * from the preset's own parameters, seeded random only. Fire, Coal and Bloom
 * carried private copies of these helpers; the ported tiles share this one.
 */
export const TILE_W = 720;
export const TILE_H = 270;

export type Rgb = [number, number, number];
export const WHITE: Rgb = [1, 1, 1];

/** Stable per-tile variation: a seeded LCG, never Math.random. */
export function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** The Coal tile's generator, kept so its picture does not change. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function toRgb(c: readonly number[]): Rgb {
  return [c[0] ?? 0, c[1] ?? 0, c[2] ?? 0];
}

export function hexToRgb(hex: string): Rgb {
  let h = hex.replace("#", "");
  if (h.length === 3)
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  const n = parseInt(h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function css(c: Rgb, alpha = 1): string {
  const [r, g, b] = c;
  return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${alpha})`;
}

export function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

/** Alpha on a CSS color string (hex or hsl), the Bloom tile's helper. */
export function withAlpha(color: string, alpha: number): string {
  const a = Math.min(1, Math.max(0, alpha));
  if (color.startsWith("#")) {
    let h = color.slice(1);
    if (h.length === 3)
      h = h
        .split("")
        .map((c) => c + c)
        .join("");
    const n = parseInt(h, 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
  }
  if (color.startsWith("hsl(")) return `hsla${color.slice(3, -1)}, ${a})`;
  return color;
}

/** `hsl(h, s%, l%)` or hex to an Rgb triple. */
export function cssToRgb(color: string): Rgb {
  if (color.startsWith("#")) return hexToRgb(color);
  const m =
    /hsl\((\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?)%,\s*(\d+(?:\.\d+)?)%\)/.exec(
      color
    );
  if (!m) return WHITE;
  const h = Number(m[1]) / 360;
  const s = Number(m[2]) / 100;
  const l = Number(m[3]) / 100;
  const f = (n: number): number => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0), f(8), f(4)];
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function smoothstep(e0: number, e1: number, v: number): number {
  const t = clamp01((v - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

export function easeOutCubic(p: number): number {
  const q = 1 - p;
  return 1 - q * q * q;
}

/**
 * Vertical dark gradient: tint x1.6 at the top, x0.5 at the bottom. A light
 * tint makes the lit ground dark materials sit on.
 */
export function ground(
  ctx: CanvasRenderingContext2D,
  tint: Rgb = [0.04, 0.03, 0.05]
): void {
  const g = ctx.createLinearGradient(0, 0, 0, TILE_H);
  g.addColorStop(0, css(toRgb(tint.map((v) => v * 1.6))));
  g.addColorStop(1, css(toRgb(tint.map((v) => v * 0.5))));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, TILE_W, TILE_H);
}

/** One soft light blob. Everything in a tile is made of these. */
export function blob(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  color: Rgb,
  alpha: number
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, ry / rx);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, css(color, alpha));
  g.addColorStop(0.45, css(color, alpha * 0.42));
  g.addColorStop(1, css(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(-rx, -rx, rx * 2, rx * 2);
  ctx.restore();
}

export interface Point {
  x: number;
  y: number;
}

/** Glow stroke: wide colored halo under a hot core (the Zap bolt contract). */
export function glowStroke(
  ctx: CanvasRenderingContext2D,
  pts: readonly Point[],
  width: number,
  color: string,
  glow: number,
  alpha: number,
  coreColor = "#fff",
  strokeStyle: string | CanvasGradient = color
): void {
  if (pts.length < 2) return;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  const trace = (): void => {
    ctx.beginPath();
    ctx.moveTo(pts[0]!.x, pts[0]!.y);
    for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i]!.x, pts[i]!.y);
  };
  ctx.shadowBlur = glow;
  ctx.shadowColor = color;
  ctx.strokeStyle = strokeStyle;
  ctx.globalAlpha = alpha * 0.6;
  ctx.lineWidth = width * 2;
  trace();
  ctx.stroke();
  ctx.shadowBlur = glow * 0.4;
  ctx.strokeStyle = coreColor;
  ctx.globalAlpha = alpha;
  ctx.lineWidth = width;
  trace();
  ctx.stroke();
  ctx.restore();
}

/** Radiant terminal at a prop tip: white heart, colored skirt. */
export function terminal(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
  alpha = 1
): void {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = alpha;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, "rgba(255,255,255,0.95)");
  g.addColorStop(0.3, color);
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.restore();
}
