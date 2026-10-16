import { normalizeGooLiquidControls } from "../domain/effects-config";
import type { GooParams } from "../translators/canvas2d-types";
import type { EmitterTip } from "./emitter-tip";
import { emitterId } from "./emitter-tip";
import { resolveGooLook2D, type GooLook2D } from "./goo-look-2d";
import {
  GOO_PIECE_FLOATS,
  GooLiquidGL,
  GooPieces,
  hexToLinear,
  type GooLiquidShade,
} from "./goo-liquid-gl";
import {
  GOO_NODES,
  GooStrandSim,
  nodeRadius,
  segmentRadius,
  sphereRadius,
  type GooDrop,
  type GooMaterial,
  type GooStrand,
  type GooTipInput,
} from "./goo-strand-sim";

/**
 * Goo for the Canvas2D backend: the 3D goo, seen flat.
 *
 * Each tracked tip grows a rope of liquid with the 3D goo's physics (see
 * `GooStrandSim`): it hangs, stretches, swings and curls as the prop moves,
 * beads and necks, and lets go of drops that ring as they fall away.
 *
 * Drawing is the 3D goo's wet material on a WebGL2 canvas (see
 * `GooLiquidGL`): every rope, drop and bead is a lit, rounded body of liquid
 * reflecting the same night studio. Where WebGL2 is missing the same shapes
 * are filled flat.
 */

/** Canvas pixels per meter of liquid at the reference canvas. */
const PX_PER_METER = 145;
/** Size of the liquid at the default base radius, m. */
const BASE_RADIUS = 0.04;
/** Centerline samples per rope segment. */
const SUB = 3;
const RINGS = (GOO_NODES - 1) * SUB + 1;
/** Thinnest a thread is drawn, device px; finer ones would flicker. */
const HAIRLINE = 0.6;
/** Depth every piece is drawn at; the union of pieces sorts within it. */
const DEPTH_AIR = 0.75;

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type Matrix = { a: number; b: number; c: number; d: number; e: number; f: number };

export class Goo2DRenderer {
  readonly sim = new GooStrandSim();
  private painter: GooLiquidGL | null | undefined;
  private air = new GooPieces();
  private tips: GooTipInput[] = [];
  private layers: Array<{ canvas: HTMLCanvasElement | OffscreenCanvas; ctx: Ctx2D }> = [];
  private ringX = new Float32Array(RINGS);
  private ringY = new Float32Array(RINGS);
  private ringR = new Float32Array(RINGS);
  private shadeKey = "";
  private shade: GooLiquidShade | null = null;

  render(
    ctx: CanvasRenderingContext2D,
    params: GooParams,
    emitters: EmitterTip[],
    dt: number,
    scale: number = 1
  ): void {
    const W = ctx.canvas.width;
    const H = ctx.canvas.height;
    const m: Matrix =
      typeof ctx.getTransform === "function"
        ? ctx.getTransform()
        : { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
    const bounds = {
      width: W / (Math.hypot(m.a, m.b) || 1),
      height: H / (Math.hypot(m.c, m.d) || 1),
    };

    this.tips.length = 0;
    for (const e of emitters) {
      if (!isEndEnabled(e.end, params)) continue;
      this.tips.push({ id: emitterId(e.propIndex, e.tipIndex), x: e.x, y: e.y });
    }
    const look = resolveGooLook2D(params.palette);
    const liquid = normalizeGooLiquidControls(params);
    const k = PX_PER_METER * scale;
    const material: GooMaterial = {
      viscosity: liquid.viscosity,
      tension: liquid.surfaceTension,
      intensity: clamp01(params.intensity),
      ambient: clamp01(params.ambientEmission),
      motion: clamp01(params.motionEmission),
      ambientSpawnRate: params.ambientSpawnRate,
      motionSpawnRate: params.motionSpawnRate,
      referenceSpeed: params.motionReferenceSpeed,
      baseRadius: BASE_RADIUS * (params.baseRadius > 0 ? params.baseRadius / 4 : 1),
      gravity: liquid.gravity,
      spew: params.spewStyle ?? "flow",
      pxPerMeter: k,
      look,
    };
    this.sim.step(this.tips, dt, material, bounds);

    const rs = Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) || 1;
    this.buildAir(material, m, k, rs);
    if (!this.air.count) return;

    const shade = this.resolveShade(params, look);
    if (this.painter === undefined || this.painter?.lost) {
      this.painter = GooLiquidGL.create();
    }
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = params.blendMode ?? "source-over";
    ctx.globalAlpha = 1;
    const glow = look.glow > 0 ? this.glowLayers(W, H) : null;
    let image: HTMLCanvasElement | OffscreenCanvas | null = null;
    if (this.painter) {
      this.painter.draw(W, H, this.air, shade);
      image = this.painter.canvas;
    } else {
      image = this.fillFlat(W, H, this.air, params.resolvedPalette.core, shade.alpha);
    }
    if (image) {
      ctx.drawImage(image as CanvasImageSource, 0, 0);
      if (glow) {
        for (const level of glow) {
          level.ctx.drawImage(
            image as CanvasImageSource,
            0,
            0,
            level.canvas.width,
            level.canvas.height
          );
        }
        this.addGlow(ctx, look, W, H, glow);
      }
    }
    ctx.restore();
  }

  /** The ropes and the drops in flight, in device pixels. */
  private buildAir(material: GooMaterial, m: Matrix, k: number, rs: number): void {
    this.air.clear();
    for (const strand of this.sim.strands) this.ropePieces(strand, m, k, rs);
    for (const drop of this.sim.drops) this.dropPiece(drop, material, m, k, rs);
  }

  /**
   * The 3D goo's rope surface: a rounded root, the centerline as a
   * Catmull-Rom curve whose radius follows each segment's volume, and the
   * bulb blended in as a sphere.
   */
  private ropePieces(strand: GooStrand, m: Matrix, k: number, rs: number): void {
    const n = strand.count;
    if (n < 1) return;
    const { ringX: X, ringY: Y, ringR: R } = this;
    const bulb = sphereRadius(strand.bulb);
    const glob = strand.attached ? strand.nozzle * 0.75 : 0;
    const px = strand.x;
    const py = strand.y;
    const point = (p: Float32Array, node: number) => {
      if (node < 0) return 2 * p[0]! - p[1]!;
      if (node >= n) return 2 * p[n - 1]! - p[n - 2]!;
      return p[node]!;
    };
    const blend = (radius: number, x: number, y: number) => {
      const toBulb = Math.hypot(x - px[n - 1]!, y - py[n - 1]!);
      radius = smoothMax(radius, Math.sqrt(Math.max(0, bulb * bulb - toBulb * toBulb)), bulb * 0.35);
      if (glob > 0) {
        const toRoot = Math.hypot(x - px[0]!, y - py[0]!);
        radius = smoothMax(radius, Math.sqrt(Math.max(0, glob * glob - toRoot * toRoot)), glob * 0.35);
      }
      return radius;
    };
    let rings = 0;
    if (n === 1) {
      X[0] = px[0]!;
      Y[0] = py[0]!;
      R[0] = Math.max(bulb, glob);
      rings = 1;
    } else {
      for (let segment = 0; segment < n - 1; segment++) {
        const thread = segmentRadius(strand, segment);
        const start = nodeRadius(strand, segment);
        const end = segment + 1 === n - 1 ? thread : nodeRadius(strand, segment + 1);
        for (let sample = 0; sample < SUB; sample++) {
          const t = sample / SUB;
          const x = catmull(point(px, segment - 1), point(px, segment), point(px, segment + 1), point(px, segment + 2), t);
          const y = catmull(point(py, segment - 1), point(py, segment), point(py, segment + 1), point(py, segment + 2), t);
          const radius = (1 - t) * (1 - t) * start + 2 * t * (1 - t) * thread + t * t * end;
          X[rings] = x;
          Y[rings] = y;
          R[rings] = blend(radius, x, y);
          rings++;
        }
      }
      X[rings] = px[n - 1]!;
      Y[rings] = py[n - 1]!;
      R[rings] = Math.max(bulb, segmentRadius(strand, n - 2));
      rings++;
    }
    const scale = k * rs;
    let ax = m.a * X[0]! * k + m.c * Y[0]! * k + m.e;
    let ay = m.b * X[0]! * k + m.d * Y[0]! * k + m.f;
    let ar = Math.max(HAIRLINE, R[0]! * scale);
    if (rings === 1) {
      this.air.push(ax, ay, ar, ax, ay, ar, 1, 1, DEPTH_AIR, 0);
      return;
    }
    for (let ring = 1; ring < rings; ring++) {
      const bx = m.a * X[ring]! * k + m.c * Y[ring]! * k + m.e;
      const by = m.b * X[ring]! * k + m.d * Y[ring]! * k + m.f;
      const br = Math.max(HAIRLINE, R[ring]! * scale);
      this.air.push(ax, ay, ar, bx, by, br, 1, 1, DEPTH_AIR, 0);
      ax = bx;
      ay = by;
      ar = br;
    }
  }

  /**
   * A falling drop rings between long and flat as surface tension pulls it
   * round, and leans out along its flight.
   */
  private dropPiece(
    drop: GooDrop,
    material: GooMaterial,
    m: Matrix,
    k: number,
    rs: number
  ): void {
    const size = drop.r;
    const tension = clamp01(material.tension);
    const omega =
      2 * Math.PI * (7 + 9 * tension) * Math.sqrt(0.02 / Math.max(drop.r, 0.003));
    const ring =
      drop.wobble *
      Math.exp(-drop.age * (5 + 12 * clamp01(material.viscosity))) *
      Math.cos(drop.age * omega);
    const speed = Math.hypot(drop.vx, drop.vy);
    const stretch = Math.max(0.6, 1 + ring + Math.min(0.22, speed * 0.035));
    let ux = speed > 0.05 ? drop.vx / speed : drop.ax;
    let uy = speed > 0.05 ? drop.vy / speed : drop.ay;
    let radius = size / Math.sqrt(stretch);
    let half = size * stretch - radius;
    if (stretch < 1) {
      // Flattened across its flight instead.
      [ux, uy] = [-uy, ux];
      radius = size * stretch;
      half = size / Math.sqrt(stretch) - radius;
    }
    const x = drop.x * k;
    const y = drop.y * k;
    const hx = ux * half * k;
    const hy = uy * half * k;
    const r = Math.max(HAIRLINE, radius * k * rs);
    this.air.push(
      m.a * (x - hx) + m.c * (y - hy) + m.e,
      m.b * (x - hx) + m.d * (y - hy) + m.f,
      r,
      m.a * (x + hx) + m.c * (y + hy) + m.e,
      m.b * (x + hx) + m.d * (y + hy) + m.f,
      r,
      1,
      1,
      DEPTH_AIR,
      0
    );
  }

  private resolveShade(params: GooParams, look: GooLook2D): GooLiquidShade {
    const palette = params.resolvedPalette;
    const key = `${palette.core}|${palette.puddleTint}|${params.clarity}|${look.metal}|${look.glow}`;
    if (this.shade && key === this.shadeKey) return this.shade;
    const core = hexToLinear(palette.core);
    const tint = hexToLinear(palette.puddleTint, core);
    const metal = look.metal * 0.9;
    this.shadeKey = key;
    this.shade = {
      core,
      // Pooled liquid is the deep tint warmed toward the core, as in 3D.
      puddle: [
        tint[0] + (core[0] - tint[0]) * 0.35,
        tint[1] + (core[1] - tint[1]) * 0.35,
        tint[2] + (core[2] - tint[2]) * 0.35,
      ],
      // Liquid metal is opaque however clear the setting is.
      alpha: Math.max(metal, 0.97 - 0.22 * clamp01(params.clarity)),
      metal,
      glow: look.glow,
    };
    return this.shade;
  }

  /** Without WebGL2: the same shapes, filled in the body color. */
  private fillFlat(
    W: number,
    H: number,
    pieces: GooPieces,
    color: string,
    alpha: number
  ): HTMLCanvasElement | OffscreenCanvas | null {
    const layer = this.layer(0, W, H);
    if (!layer) return null;
    const g = layer.ctx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = "source-over";
    g.globalAlpha = 1;
    g.clearRect(0, 0, W, H);
    g.globalAlpha = alpha;
    g.fillStyle = color;
    g.beginPath();
    const d = pieces.data;
    for (let i = 0; i < pieces.count; i++) {
      const o = i * GOO_PIECE_FLOATS;
      traceRoundCone(g, d[o]!, d[o + 1]!, d[o + 4]!, d[o + 2]!, d[o + 3]!, d[o + 5]!);
    }
    g.fill();
    return layer.canvas;
  }

  private glowLayers(
    W: number,
    H: number
  ): Array<{ canvas: HTMLCanvasElement | OffscreenCanvas; ctx: Ctx2D }> | null {
    const near = this.layer(1, Math.ceil(W / 8), Math.ceil(H / 8));
    const far = this.layer(2, Math.ceil(W / 24), Math.ceil(H / 24));
    if (!near || !far) return null;
    for (const { canvas, ctx } of [near, far]) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      ctx.imageSmoothingEnabled = true;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    return [near, far];
  }

  /** A soft halo: the liquid shrunk, smeared by scaling, and added back. */
  private addGlow(
    ctx: CanvasRenderingContext2D,
    look: GooLook2D,
    W: number,
    H: number,
    levels: Array<{ canvas: HTMLCanvasElement | OffscreenCanvas; ctx: Ctx2D }>
  ): void {
    ctx.imageSmoothingEnabled = true;
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = Math.min(1, 0.45 * look.glow);
    ctx.drawImage(levels[0]!.canvas as CanvasImageSource, 0, 0, W, H);
    ctx.globalAlpha = Math.min(1, 0.35 * look.glow);
    ctx.drawImage(levels[1]!.canvas as CanvasImageSource, 0, 0, W, H);
  }

  private layer(
    slot: number,
    w: number,
    h: number
  ): { canvas: HTMLCanvasElement | OffscreenCanvas; ctx: Ctx2D } | null {
    const held = this.layers[slot];
    if (held && held.canvas.width === w && held.canvas.height === h) return held;
    const canvas = createOffscreen(w, h);
    const ctx = canvas?.getContext("2d") as Ctx2D | null | undefined;
    if (!canvas || !ctx) return null;
    this.layers[slot] = { canvas, ctx };
    return this.layers[slot]!;
  }

  dispose(): void {
    this.sim.clear();
    this.air.clear();
    this.tips = [];
    this.layers = [];
  }
}

/** Two circles joined by their outer tangents. */
function traceRoundCone(
  ctx: Ctx2D,
  ax: number,
  ay: number,
  ar: number,
  bx: number,
  by: number,
  br: number
): void {
  const length = Math.hypot(bx - ax, by - ay);
  if (length <= Math.abs(ar - br)) {
    const [x, y, r] = ar >= br ? [ax, ay, ar] : [bx, by, br];
    ctx.moveTo(x + r, y);
    ctx.arc(x, y, r, 0, Math.PI * 2);
    return;
  }
  const heading = Math.atan2(by - ay, bx - ax);
  const spread = Math.acos((ar - br) / length);
  ctx.moveTo(ax + ar * Math.cos(heading + spread), ay + ar * Math.sin(heading + spread));
  ctx.arc(ax, ay, ar, heading + spread, heading - spread + Math.PI * 2);
  ctx.arc(bx, by, br, heading - spread, heading + spread);
  ctx.closePath();
}

function catmull(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (3 * p1 - p0 - 3 * p2 + p3) * t3)
  );
}

function smoothMax(a: number, b: number, width: number): number {
  if (width <= 0) return Math.max(a, b);
  const overlap = Math.max(0, width - Math.abs(a - b)) / width;
  return Math.max(a, b) + overlap * overlap * width * 0.25;
}

function isEndEnabled(end: "A" | "B", params: GooParams): boolean {
  if (params.trackingMode === "both_ends") return true;
  return params.trackingMode === "left_end" ? end === "A" : end === "B";
}

function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

function createOffscreen(w: number, h: number): HTMLCanvasElement | OffscreenCanvas | null {
  try {
    if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  } catch {
    /* fall through */
  }
  if (typeof document !== "undefined") {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
  }
  return null;
}
