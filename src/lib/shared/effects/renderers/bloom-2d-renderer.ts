import type { Bloom2DParams } from "../translators/canvas2d-types";
import {
  resolveBloomExposure,
  resolveBloomHistoryLifetime,
  resolveBloomRainbowHue,
  resolveBloomSourceNormalization,
} from "../domain/bloom-optics";
import {
  hslToRgb,
  mixRgb,
  parseCssRgb,
  rgba,
  WHITE,
  type Rgb,
} from "./css-rgb";

/**
 * Per-tip input for the bloom overlay. Each tip is an independent light
 * source so palette/color-mode indexing reads naturally off `tipIndex`.
 *
 * `propIndex`: base blue=0, red=1; tunnel layer li blue=2+2*li, red=3+2*li.
 * `tipIndex`: global tip index - used for palette and rainbow offsets AND as
 * the key for the tip's light path and motion.
 * `color`: the tip's resolved prop color (base trail color or tunnel spectrum),
 * consumed when `params.colorMode === "prop-matched"`. Resolved upstream so a
 * tunnel copy blooms in the same hue it renders as, not a hardcoded red.
 */
export interface BloomTipInput {
  x: number;
  y: number;
  propIndex: number;
  tipIndex: number;
  color: string;
}

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type Stops = ReadonlyArray<readonly [offset: number, level: number]>;

/**
 * Reference-size px per second treated as a full swing. 3D uses 3 m/s on a
 * 0.86 m staff, about 3.5 staff lengths a second; a 2D staff is ~165 px.
 */
const REF_SPEED = 600;
/** Seconds for the motion reading to follow a change in speed. */
const MOTION_LAG = 0.06;
const MAX_MOTION = 1.5;
const PATH_CAPACITY = 160;
/** Trail segments drawn per frame across all tips; tunnels thin their paths. */
const SEGMENT_BUDGET = 360;
/** Path light is a dose of the source, the way overlapping 3D halos add up. */
const TRAIL_GAIN = 3;
const TAU = Math.PI * 2;
const GOLDEN_ANGLE = 2.399963229728653;

// Gaussian falloffs sampled from the 3D shader (sharpness 2.8, 8.5 and 58).
const SMOOTH_HALO: Stops = [
  [0, 1],
  [0.25, 0.84],
  [0.5, 0.5],
  [0.75, 0.21],
  [1, 0],
];
const SHARP_HALO: Stops = [
  [0, 1],
  [0.15, 0.83],
  [0.3, 0.47],
  [0.5, 0.12],
  [1, 0],
];
const CORE: Stops = [
  [0, 1],
  [0.25, 0.56],
  [0.5, 0.1],
  [1, 0],
];
/** Lens ray and motion blade: bright at the source, gone by the tip. */
const RAY: Stops = [
  [0, 1],
  [0.12, 0.6],
  [0.3, 0.26],
  [0.55, 0.06],
  [1, 0],
];
/** Trail cross-section from the edge (0) to the center line (0.5). */
const TRAIL_EDGE: Stops = [
  [0, 0],
  [0.125, 0.15],
  [0.25, 0.43],
  [0.375, 0.81],
];
/** Half-width of the hot line along the trail, as a share of the width. */
const TRAIL_BLADE = 0.035;

/** One tip's light path: newest sample first, trimmed by age. */
class TipPath {
  readonly xs = new Float32Array(PATH_CAPACITY);
  readonly ys = new Float32Array(PATH_CAPACITY);
  readonly born = new Float64Array(PATH_CAPACITY);
  readonly level = new Float32Array(PATH_CAPACITY);
  readonly motion = new Float32Array(PATH_CAPACITY);
  readonly colors: Rgb[] = new Array<Rgb>(PATH_CAPACITY);
  private head = PATH_CAPACITY - 1;
  count = 0;

  // Live state, updated every frame the tip is present.
  x: number;
  y: number;
  liveMotion = 0;
  liveLevel = 0;
  liveColor: Rgb = WHITE;
  axis: number;
  seen = true;

  constructor(x: number, y: number, axis: number) {
    this.x = x;
    this.y = y;
    this.axis = axis;
  }

  /** Index of the n-th newest sample (0 = newest). */
  at(n: number): number {
    return (this.head - n + PATH_CAPACITY) % PATH_CAPACITY;
  }

  push(
    x: number,
    y: number,
    born: number,
    level: number,
    motion: number,
    color: Rgb
  ): void {
    this.head = (this.head + 1) % PATH_CAPACITY;
    this.xs[this.head] = x;
    this.ys[this.head] = y;
    this.born[this.head] = born;
    this.level[this.head] = level;
    this.motion[this.head] = motion;
    this.colors[this.head] = color;
    if (this.count < PATH_CAPACITY) this.count++;
  }

  trimBefore(time: number): void {
    while (this.count > 0 && this.born[this.at(this.count - 1)]! < time) {
      this.count--;
    }
  }

  clear(): void {
    this.count = 0;
  }
}

interface LiveTip {
  x: number;
  y: number;
  color: Rgb;
  motion: number;
  axis: number;
  seed: number;
}

/**
 * Lens bloom for the Canvas2D backend, built on the same light model as the
 * 3D Bloom so the two read as one effect.
 *
 * Each tip is an over-bright source: a colored halo, a white-hot core, four
 * tinted lens rays that turn with the motion, and an anamorphic blade along
 * the direction of travel whose length follows real speed (px per second, so
 * frame rate does not change it). Behind the source, a timed light path traces
 * where the tip has been: a soft band with a hot center line that narrows and
 * fades with age, then expires after the afterglow lifetime.
 *
 * The path stores only where the tip moved. A tip that holds still leaves no
 * history, and the white core never enters it, so slow turns and crossings
 * cannot stack into a flash. Time comes from `dt`, never the wall clock, so a
 * QR export renders the same frames every time.
 */
export class Bloom2DRenderer {
  private paths = new Map<number, TipPath>();
  private clock = 0;
  private rgbCache = new Map<string, Rgb>();

  // Scratch vertex arrays for path drawing; vertex 0 is the live tip.
  private vx = new Float32Array(PATH_CAPACITY + 1);
  private vy = new Float32Array(PATH_CAPACITY + 1);
  private vp = new Float32Array(PATH_CAPACITY + 1);
  private vl = new Float32Array(PATH_CAPACITY + 1);
  private vm = new Float32Array(PATH_CAPACITY + 1);
  private vc: Rgb[] = new Array<Rgb>(PATH_CAPACITY + 1);
  private vt = new Float32Array(PATH_CAPACITY + 1);
  private nx = new Float32Array(PATH_CAPACITY + 1);
  private ny = new Float32Array(PATH_CAPACITY + 1);

  render(
    ctx: CanvasRenderingContext2D,
    params: Bloom2DParams,
    tips: BloomTipInput[],
    dt = 1 / 60,
    scale = 1
  ): void {
    const step = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.1) : 0;
    this.clock += step;
    if (tips.length === 0 && this.paths.size === 0) return;

    const coreR = Math.max(1, params.radius * scale);
    const lifetime = resolveBloomHistoryLifetime(params.afterglow);
    const exposure = resolveBloomExposure(
      params.intensity,
      params.pulse,
      params.pulseRate,
      this.clock
    );
    // The 3D shader lights by the square root of the source energy; matching
    // it keeps the slider's low end visible and its top end blown out.
    const level = Math.sqrt(
      exposure * resolveBloomSourceNormalization(countProps(tips))
    );

    const canvas = ctx.canvas as
      | { width?: number; height?: number }
      | undefined;
    const minDim = Math.min(canvas?.width ?? 0, canvas?.height ?? 0);
    const jumpLimit = Math.max(
      coreR * 6,
      minDim > 0 ? minDim * 0.25 : 125 * scale
    );

    for (const path of this.paths.values()) path.seen = false;
    const live: LiveTip[] = [];
    for (const tip of tips) {
      const color = this.tipColor(params, tip);
      const path = this.track(
        tip,
        step,
        scale,
        coreR,
        lifetime,
        level,
        color,
        jumpLimit
      );
      live.push({
        x: tip.x,
        y: tip.y,
        color,
        motion: path.liveMotion,
        axis: path.axis,
        seed: ((tip.tipIndex + 1) % 17) / 17,
      });
    }
    for (const [key, path] of this.paths) {
      if (path.seen) continue;
      // A lifted tip's path keeps fading out instead of vanishing mid-trail.
      path.trimBefore(this.clock - lifetime);
      if (lifetime <= 0 || path.count < 2) this.paths.delete(key);
    }

    ctx.save();
    ctx.globalCompositeOperation = params.blendMode ?? "lighter";
    ctx.globalAlpha = 1;

    if (lifetime > 0) {
      let samples = 0;
      for (const path of this.paths.values()) samples += path.count;
      const stride = Math.max(1, Math.ceil(samples / SEGMENT_BUDGET));
      for (const path of this.paths.values()) {
        this.drawPath(ctx, path, params, coreR, lifetime, stride);
      }
    }

    for (const tip of live) this.drawSource(ctx, tip, params, coreR, level);

    ctx.restore();
  }

  dispose(): void {
    this.paths.clear();
    this.rgbCache.clear();
    this.clock = 0;
  }

  // ── Motion and history ─────────────────────────────────────────────

  private track(
    tip: BloomTipInput,
    step: number,
    scale: number,
    coreR: number,
    lifetime: number,
    level: number,
    color: Rgb,
    jumpLimit: number
  ): TipPath {
    let path = this.paths.get(tip.tipIndex);
    if (!path) {
      path = new TipPath(tip.x, tip.y, (tip.tipIndex * GOLDEN_ANGLE) % TAU);
      this.paths.set(tip.tipIndex, path);
    }

    const dx = tip.x - path.x;
    const dy = tip.y - path.y;
    const dist = Math.hypot(dx, dy);
    if (dist > jumpLimit) {
      // A seek or loop seam teleported the tip; never draw light across it.
      path.clear();
      path.liveMotion = 0;
    } else {
      if (step > 0) {
        const target = Math.min(MAX_MOTION, dist / step / scale / REF_SPEED);
        path.liveMotion +=
          (target - path.liveMotion) * (1 - Math.exp(-step / MOTION_LAG));
      }
      if (dist > 0.5 * scale) path.axis = Math.atan2(dy, dx);
    }
    path.x = tip.x;
    path.y = tip.y;
    path.liveLevel = level;
    path.liveColor = color;
    path.seen = true;

    if (lifetime <= 0) {
      path.clear();
      return path;
    }
    path.trimBefore(this.clock - lifetime);
    const spacing = Math.max(2 * scale, coreR * 0.12);
    const newest = path.at(0);
    if (
      path.count === 0 ||
      Math.hypot(tip.x - path.xs[newest]!, tip.y - path.ys[newest]!) >= spacing
    ) {
      path.push(tip.x, tip.y, this.clock, level, path.liveMotion, color);
    }
    return path;
  }

  /**
   * Draw the path as one ribbon: each segment is a quad between per-vertex
   * normals (so neighbors share edges with no gaps or double-lit seams), lit
   * by a gradient across it. Width and light fall with age as in 3D.
   */
  private drawPath(
    ctx: Ctx2D,
    path: TipPath,
    params: Bloom2DParams,
    coreR: number,
    lifetime: number,
    stride: number
  ): void {
    const { vx, vy, vp, vl, vm, vc, vt, nx, ny } = this;
    let n = 0;
    if (path.seen) {
      vx[0] = path.x;
      vy[0] = path.y;
      vp[0] = 0;
      vl[0] = path.liveLevel;
      vm[0] = path.liveMotion;
      vc[0] = path.liveColor;
      n = 1;
    }
    for (
      let i = 0;
      i < path.count;
      i += i + stride < path.count ? stride : Math.max(1, path.count - 1 - i)
    ) {
      const k = path.at(i);
      const x = path.xs[k]!;
      const y = path.ys[k]!;
      if (n > 0 && Math.abs(x - vx[n - 1]!) + Math.abs(y - vy[n - 1]!) < 0.5)
        continue;
      vx[n] = x;
      vy[n] = y;
      vp[n] = Math.min(1, Math.max(0, (this.clock - path.born[k]!) / lifetime));
      vl[n] = path.level[k]!;
      vm[n] = path.motion[k]!;
      vc[n] = path.colors[k]!;
      n++;
    }
    if (n < 2) return;

    // The live end fades in out of the halo instead of starting as a flat cut.
    const taper = coreR * 0.8;
    let along = 0;
    for (let i = 0; i < n; i++) {
      if (i > 0) along += Math.hypot(vx[i]! - vx[i - 1]!, vy[i]! - vy[i - 1]!);
      vt[i] =
        !path.seen || along >= taper
          ? 1
          : Math.sin((along / taper) * (Math.PI / 2));
    }

    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 1);
      const b = Math.min(n - 1, i + 1);
      const tx = vx[b]! - vx[a]!;
      const ty = vy[b]! - vy[a]!;
      const len = Math.hypot(tx, ty) || 1;
      nx[i] = -ty / len;
      ny[i] = tx / len;
    }

    const afterglow = params.afterglow;
    for (let i = 0; i < n - 1; i++) {
      const j = i + 1;
      const progress = (vp[i]! + vp[j]!) / 2;
      const fade = (1 - progress) * (1 - progress) * afterglow * 0.72;
      const body = Math.min(1, ((vl[i]! + vl[j]!) / 2) * fade * TRAIL_GAIN);
      if (body * Math.max(vt[i]!, vt[j]!) < 0.004) continue;
      const motion = Math.min(1, (vm[i]! + vm[j]!) / 2);
      const blade = body * params.streak * motion * (1 - progress * 0.35) * 1.6;

      const wi = coreR * (0.58 - vp[i]! * 0.3) * 1.1;
      const wj = coreR * (0.58 - vp[j]! * 0.3) * 1.1;
      const sx = vx[j]! - vx[i]!;
      const sy = vy[j]! - vy[i]!;
      const sl = Math.hypot(sx, sy) || 1;
      const px = -sy / sl;
      const py = sx / sl;
      const mx = (vx[i]! + vx[j]!) / 2;
      const my = (vy[i]! + vy[j]!) / 2;
      const w = (wi + wj) / 2;
      // Where the path doubles back, a shared vertex normal would twist the
      // quad into a bow tie, so that end keeps the segment's own square edge.
      const squareI = nx[i]! * px + ny[i]! * py < 0.5;
      const squareJ = nx[j]! * px + ny[j]! * py < 0.5;
      const nix = squareI ? px : nx[i]!;
      const niy = squareI ? py : ny[i]!;
      const njx = squareJ ? px : nx[j]!;
      const njy = squareJ ? py : ny[j]!;

      const color = vc[i]!;
      const g = ctx.createLinearGradient(
        mx + px * w,
        my + py * w,
        mx - px * w,
        my - py * w
      );
      for (const [offset, share] of TRAIL_EDGE)
        g.addColorStop(offset, rgba(color, body * share));
      g.addColorStop(0.5 - TRAIL_BLADE, rgba(color, body * 0.99));
      const hot =
        blade > 0
          ? mixRgb(color, WHITE, (0.55 * blade) / (body + blade))
          : color;
      g.addColorStop(0.5, rgba(hot, body + blade));
      g.addColorStop(0.5 + TRAIL_BLADE, rgba(color, body * 0.99));
      for (let s = TRAIL_EDGE.length - 1; s >= 0; s--) {
        const [offset, share] = TRAIL_EDGE[s]!;
        g.addColorStop(1 - offset, rgba(color, body * share));
      }

      ctx.fillStyle = g;
      const ax = vx[i]! + nix * wi;
      const ay = vy[i]! + niy * wi;
      const bx = vx[i]! - nix * wi;
      const by = vy[i]! - niy * wi;
      const cx = vx[j]! + njx * wj;
      const cy = vy[j]! + njy * wj;
      const dx = vx[j]! - njx * wj;
      const dy = vy[j]! - njy * wj;
      // The fading head is cut into thin slices so its brightness ramps
      // instead of stepping once per sample. Every slice shares the gradient,
      // which runs across the segment and so reads the same along it.
      const ramp = vt[i]! < 1 || vt[j]! < 1;
      const slices = ramp
        ? Math.min(16, Math.max(1, Math.ceil(sl / (coreR * 0.05))))
        : 1;
      for (let q = 0; q < slices; q++) {
        const t0 = q / slices;
        const t1 = (q + 1) / slices;
        if (ramp) {
          const t = (t0 + t1) / 2;
          ctx.globalAlpha = vt[i]! + (vt[j]! - vt[i]!) * t;
        }
        ctx.beginPath();
        ctx.moveTo(ax + (cx - ax) * t0, ay + (cy - ay) * t0);
        ctx.lineTo(ax + (cx - ax) * t1, ay + (cy - ay) * t1);
        ctx.lineTo(bx + (dx - bx) * t1, by + (dy - by) * t1);
        ctx.lineTo(bx + (dx - bx) * t0, by + (dy - by) * t0);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  // ── The live source ────────────────────────────────────────────────

  private drawSource(
    ctx: Ctx2D,
    tip: LiveTip,
    params: Bloom2DParams,
    coreR: number,
    level: number
  ): void {
    const halo = params.falloff === "sharp" ? SHARP_HALO : SMOOTH_HALO;
    fillDisc(ctx, tip.x, tip.y, coreR, halo, tip.color, level * 1.1);

    const motion = Math.min(1, tip.motion);
    if (params.streak > 0 && tip.motion > 0.01) {
      const stretch = 1 + params.streak * tip.motion * 2.2;
      fillEllipse(
        ctx,
        tip.x,
        tip.y,
        tip.axis,
        coreR * stretch,
        coreR * 0.1,
        mixRgb(tip.color, WHITE, 0.3),
        level * params.streak * motion * 1.6
      );
    }

    if (params.spikes > 0) {
      const amount = level * params.spikes * (0.55 + motion * 0.45) * 2.2;
      const ray = coreR * (0.9 + params.spikes * 1.6);
      const tint = mixRgb(tip.color, WHITE, 0.45);
      const diagonal = tip.axis + Math.PI / 4 + tip.seed * 0.12;
      fillEllipse(
        ctx,
        tip.x,
        tip.y,
        tip.axis,
        ray,
        Math.max(0.6, coreR * 0.035),
        tint,
        amount
      );
      fillEllipse(
        ctx,
        tip.x,
        tip.y,
        tip.axis + Math.PI / 2,
        ray * 0.9,
        Math.max(0.6, coreR * 0.028),
        tint,
        amount
      );
      fillEllipse(
        ctx,
        tip.x,
        tip.y,
        diagonal,
        ray * 0.7,
        Math.max(0.6, coreR * 0.024),
        tint,
        amount * 0.8
      );
      fillEllipse(
        ctx,
        tip.x,
        tip.y,
        diagonal + Math.PI / 2,
        ray * 0.7,
        Math.max(0.6, coreR * 0.024),
        tint,
        amount * 0.8
      );
    }

    if (params.coreStrength > 0) {
      fillDisc(
        ctx,
        tip.x,
        tip.y,
        coreR * (0.3 + params.coreStrength * 0.25),
        CORE,
        mixRgb(tip.color, WHITE, 0.88),
        params.coreStrength * (0.6 + level * 1.4)
      );
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────

  private tipColor(params: Bloom2DParams, tip: BloomTipInput): Rgb {
    switch (params.colorMode) {
      case "prop-matched":
        return this.rgb(tip.color);
      case "rainbow":
        return hslToRgb(
          resolveBloomRainbowHue(this.clock, tip.tipIndex),
          0.9,
          0.62
        );
      case "palette":
        if (params.palette.length === 0) return this.rgb(params.color);
        return this.rgb(params.palette[tip.tipIndex % params.palette.length]!);
      case "solid":
      default:
        return this.rgb(params.color);
    }
  }

  private rgb(color: string): Rgb {
    let value = this.rgbCache.get(color);
    if (!value) {
      value = parseCssRgb(color);
      if (this.rgbCache.size > 256) this.rgbCache.clear();
      this.rgbCache.set(color, value);
    }
    return value;
  }
}

function countProps(tips: BloomTipInput[]): number {
  const props = new Set<number>();
  for (const tip of tips) props.add(tip.propIndex);
  return props.size;
}

function fillDisc(
  ctx: Ctx2D,
  x: number,
  y: number,
  r: number,
  stops: Stops,
  color: Rgb,
  alpha: number
): void {
  if (alpha <= 0.002) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  for (const [offset, share] of stops)
    g.addColorStop(offset, rgba(color, alpha * share));
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

/** A radial falloff squeezed into a thin ellipse: lens rays and the motion blade. */
function fillEllipse(
  ctx: Ctx2D,
  x: number,
  y: number,
  angle: number,
  length: number,
  width: number,
  color: Rgb,
  alpha: number
): void {
  if (alpha <= 0.002 || length <= 0 || width <= 0) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(length, width);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  for (const [offset, share] of RAY)
    g.addColorStop(offset, rgba(color, alpha * share));
  ctx.fillStyle = g;
  ctx.fillRect(-1, -1, 2, 2);
  ctx.restore();
}
