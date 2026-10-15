import type { GooParams } from "../translators/canvas2d-types";
import type { EmitterTip } from "./emitter-tip";
import { emitterId } from "./emitter-tip";
import { resolveGooLook2D, type GooLook2D } from "./goo-look-2d";
import {
  GooGlassSim,
  splatRadius,
  streakWidth,
  type GooGlassParams,
  type GooSplat,
  type GooStreak,
} from "./goo-glass-sim";
import {
  GOO_NODES,
  GooStrandSim,
  approach,
  resolveGooShape,
  segmentRadius,
  sphereRadius,
  type GooDrop,
  type GooMaterial,
  type GooShape,
  type GooStrand,
  type GooTipInput,
} from "./goo-strand-sim";

/**
 * Goo for the Canvas2D backend: the 2D telling of the 3D goo.
 *
 * Each tracked tip carries a rope of thick liquid (see `GooStrandSim`): it
 * coats the tip, hangs and stretches under its own weight, swings as the prop
 * moves, necks thin and pinches off into drops. Drops thrown at the viewer
 * splat on the glass in front of the scene and run down it (see
 * `GooGlassSim`).
 *
 * Drawing is plain vector work, no filters. Every shape is first filled in the
 * palette's deep tint, then the same shapes are redrawn smaller and nudged
 * toward one light up and to the left, clipped to the body: core color, a
 * brighter sheen, light that came through the liquid, and a sharp specular.
 * Because every highlight agrees on where the light is, the blobs read as one
 * wet surface. Liquid on the glass is lit like a lens instead, with the light
 * it focuses landing on the side away from the light. Mercury is shaded as
 * chrome; Acid and Spirit add a soft glow around themselves.
 */

const PX_PER_WORLD = 60;
const LIGHT_LEN = Math.hypot(0.55, 0.83);
/** Unit vector toward the key light, up and to the left (canvas y is down). */
const LIGHT_X = -0.55 / LIGHT_LEN;
const LIGHT_Y = -0.83 / LIGHT_LEN;
/** Samples per rope segment along the smoothed curve. */
const ROPE_SAMPLES = 3;
const ROPE_POINTS = (GOO_NODES - 1) * ROPE_SAMPLES + 1;
/** Seconds a fresh drop keeps the torn neck as a tail behind it. */
const SNAP_TIME = 0.18;

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type Palette = GooParams["resolvedPalette"];

interface Tube {
  kind: "tube";
  x: Float32Array;
  y: Float32Array;
  r: Float32Array;
  n: number;
}

interface Ball {
  kind: "ball";
  x: number;
  y: number;
  r: number;
}

interface Tear {
  kind: "tear";
  x: number;
  y: number;
  r: number;
  /** Unit direction of travel; the tail trails the other way. */
  ux: number;
  uy: number;
  tail: number;
}

/** A splat still ragged from landing. */
interface Blob {
  kind: "blob";
  x: number;
  y: number;
  r: number;
  splash: number;
  seed: number;
  heading: number;
}

type Piece = Tube | Ball | Tear | Blob;

interface ShadePass {
  op: GlobalCompositeOperation;
  color: (p: Palette) => string;
  alpha: number;
  /** Center offset toward the light, in local radii. */
  shift: number;
  /** Radius multiplier. */
  size: number;
}

/**
 * Body, then light. Every pass after the first is clipped to the body
 * (`source-atop`), so the offsets can never paint outside the liquid.
 */
const LIQUID: readonly ShadePass[] = [
  { op: "source-over", color: (p) => p.puddleTint, alpha: 1, shift: 0, size: 1 },
  { op: "source-atop", color: (p) => p.core, alpha: 1, shift: 0.22, size: 0.9 },
  { op: "source-atop", color: (p) => p.edge, alpha: 0.55, shift: 0.4, size: 0.55 },
  // Light that went through the liquid and came out the shadow side.
  { op: "source-atop", color: (p) => p.edge, alpha: 0.32, shift: -0.52, size: 0.38 },
  { op: "source-atop", color: (p) => p.highlight, alpha: 0.9, shift: 0.48, size: 0.2 },
];

/** A bead on glass is a lens: it focuses the light onto its far side. */
const LENS: readonly ShadePass[] = [
  { op: "source-over", color: (p) => p.puddleTint, alpha: 1, shift: 0, size: 1 },
  { op: "source-atop", color: (p) => p.core, alpha: 1, shift: 0.1, size: 0.84 },
  // The focused light pools on the far side as a soft glow, not a spot.
  { op: "source-atop", color: (p) => p.edge, alpha: 0.45, shift: -0.38, size: 0.62 },
  { op: "source-atop", color: (p) => p.edge, alpha: 0.5, shift: -0.6, size: 0.34 },
  { op: "source-atop", color: (p) => p.highlight, alpha: 0.95, shift: 0.5, size: 0.17 },
];

/** A wet streak is a thin film: color, a faint sheen, no sparkle. */
const FILM: readonly ShadePass[] = [
  { op: "source-over", color: (p) => p.puddleTint, alpha: 0.75, shift: 0, size: 1 },
  { op: "source-atop", color: (p) => p.core, alpha: 0.8, shift: 0.15, size: 0.6 },
  { op: "source-atop", color: (p) => p.edge, alpha: 0.35, shift: 0.45, size: 0.25 },
];

/** Chrome: a dark body, a sky reflection on top, the floor's glow below. */
const METAL: readonly ShadePass[] = [
  { op: "source-over", color: () => "#1e2127", alpha: 1, shift: 0, size: 1 },
  { op: "source-atop", color: (p) => p.core, alpha: 1, shift: 0.32, size: 0.8 },
  { op: "source-atop", color: () => "#2a2e35", alpha: 0.9, shift: -0.12, size: 0.48 },
  { op: "source-atop", color: (p) => p.edge, alpha: 0.85, shift: -0.64, size: 0.3 },
  { op: "source-atop", color: (p) => p.highlight, alpha: 1, shift: 0.44, size: 0.3 },
  { op: "source-atop", color: () => "#ffffff", alpha: 1, shift: 0.52, size: 0.12 },
];

export class Goo2DRenderer {
  readonly sim = new GooStrandSim();
  readonly glass = new GooGlassSim();
  private air: Piece[] = [];
  private streakPieces: Piece[] = [];
  private onGlass: Piece[] = [];
  private tubes: Tube[] = [];
  private tubeIndex = 0;
  private tips: GooTipInput[] = [];
  private layers: Array<{ canvas: HTMLCanvasElement | OffscreenCanvas; ctx: Ctx2D }> =
    [];

  render(
    ctx: CanvasRenderingContext2D,
    params: GooParams,
    emitters: EmitterTip[],
    dt: number,
    scale: number = 1
  ): void {
    const W = ctx.canvas.width;
    const H = ctx.canvas.height;
    const m =
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
      this.tips.push({
        id: emitterId(e.propIndex, e.tipIndex),
        x: e.x,
        y: e.y,
      });
    }
    const look = resolveGooLook2D(params.palette);
    const gravity = Number.isFinite(params.gravity)
      ? Math.max(0, Math.min(2, params.gravity))
      : 1;
    const material: GooMaterial = {
      viscosity: params.surfaceTension,
      amount: params.motionEmission,
      ambient: params.ambientEmission,
      intensity: params.intensity,
      gravity,
      scale,
      referenceSpeed: params.motionReferenceSpeed * PX_PER_WORLD * scale,
      look,
    };
    const glassParams: GooGlassParams = {
      scale,
      gravity,
      viscosity: params.surfaceTension,
      look,
    };
    this.sim.step(this.tips, dt, material, bounds);
    this.glass.land(this.sim.impacts, glassParams);
    this.glass.step(Math.min(Math.max(dt, 0), 1 / 15), glassParams, bounds);

    this.tubeIndex = 0;
    this.buildAir(resolveGooShape(material), scale, bounds);
    this.buildGlass(scale, look.metal);
    if (!this.air.length && !this.onGlass.length && !this.streakPieces.length) {
      return;
    }

    const palette = params.resolvedPalette;
    const metal = look.metal > 0.5;
    const air = this.paint(0, W, H, m, [[this.air, metal ? METAL : LIQUID]], palette);
    const glass = this.paint(
      1,
      W,
      H,
      m,
      [
        [this.streakPieces, FILM],
        [this.onGlass, metal ? METAL : LENS],
      ],
      palette
    );
    if (!air || !glass) return;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = params.blendMode ?? "source-over";
    ctx.globalAlpha = look.opacity * (0.8 + 0.2 * clamp01(params.intensity));
    ctx.drawImage(air as CanvasImageSource, 0, 0);
    ctx.drawImage(glass as CanvasImageSource, 0, 0);
    if (look.glow > 0) this.glow(ctx, look, W, H, air, glass);
    ctx.restore();
  }

  /** Draw groups of pieces, each with its own shading, onto layer `slot`. */
  private paint(
    slot: number,
    W: number,
    H: number,
    m: { a: number; b: number; c: number; d: number; e: number; f: number },
    groups: ReadonlyArray<readonly [readonly Piece[], readonly ShadePass[]]>,
    palette: Palette
  ): HTMLCanvasElement | OffscreenCanvas | null {
    const layer = this.layer(slot, W, H);
    if (!layer) return null;
    const g = layer.ctx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = "source-over";
    g.globalAlpha = 1;
    g.clearRect(0, 0, W, H);
    g.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);
    const filled = groups.filter(([pieces]) => pieces.length > 0);
    for (const [pieces, passes] of filled) {
      // Each group shades only itself: its highlights are clipped to a
      // scratch layer holding its own body, then laid over what came before.
      const scratch = filled.length > 1 ? this.layer(4 + slot, W, H) : null;
      const target = scratch ? scratch.ctx : g;
      if (scratch) {
        target.setTransform(1, 0, 0, 1, 0, 0);
        target.globalCompositeOperation = "source-over";
        target.globalAlpha = 1;
        target.clearRect(0, 0, W, H);
        target.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);
      }
      for (const pass of passes) {
        target.globalCompositeOperation = pass.op;
        target.globalAlpha = pass.alpha;
        target.fillStyle = pass.color(palette);
        for (const piece of pieces) {
          target.beginPath();
          tracePiece(target, piece, pass.shift, pass.size);
          target.fill();
        }
      }
      if (scratch) {
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.globalCompositeOperation = "source-over";
        g.globalAlpha = 1;
        g.drawImage(scratch.canvas as CanvasImageSource, 0, 0);
        g.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);
      }
    }
    return layer.canvas;
  }

  /** A soft halo: the liquid shrunk, smeared by scaling, and added back. */
  private glow(
    ctx: CanvasRenderingContext2D,
    look: GooLook2D,
    W: number,
    H: number,
    air: HTMLCanvasElement | OffscreenCanvas,
    glass: HTMLCanvasElement | OffscreenCanvas
  ): void {
    const near = this.layer(2, Math.ceil(W / 8), Math.ceil(H / 8));
    const far = this.layer(3, Math.ceil(W / 24), Math.ceil(H / 24));
    if (!near || !far) return;
    for (const level of [near, far]) {
      const { canvas, ctx: g } = level;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalCompositeOperation = "source-over";
      g.globalAlpha = 1;
      g.clearRect(0, 0, canvas.width, canvas.height);
      g.imageSmoothingEnabled = true;
      g.drawImage(air as CanvasImageSource, 0, 0, canvas.width, canvas.height);
      g.drawImage(glass as CanvasImageSource, 0, 0, canvas.width, canvas.height);
    }
    ctx.imageSmoothingEnabled = true;
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = Math.min(1, 0.45 * look.glow);
    ctx.drawImage(near.canvas as CanvasImageSource, 0, 0, W, H);
    ctx.globalAlpha = Math.min(1, 0.35 * look.glow);
    ctx.drawImage(far.canvas as CanvasImageSource, 0, 0, W, H);
  }

  /** The ropes and the drops in flight. */
  private buildAir(
    shape: GooShape,
    scale: number,
    bounds: { width: number; height: number }
  ): void {
    this.air.length = 0;
    for (const strand of this.sim.strands.values()) {
      const root = Math.max(shape.thread * 1.25, segmentRadius(strand, 0));
      this.air.push({ kind: "ball", x: strand.x[0]!, y: strand.y[0]!, r: root });
      const tube = this.nextTube(ROPE_POINTS);
      const bulb = sampleRope(tube, strand, shape, root, scale);
      if (tube.n > 1) this.air.push(tube);
      const end = GOO_NODES - 1;
      this.air.push({ kind: "ball", x: strand.x[end]!, y: strand.y[end]!, r: bulb });
    }
    for (const drop of this.sim.drops) {
      const piece = dropPiece(drop, bounds);
      if (piece) this.air.push(piece);
    }
  }

  /** Streaks under the splats, then the splats. */
  private buildGlass(scale: number, metal: number): void {
    this.onGlass.length = 0;
    this.streakPieces.length = 0;
    const now = this.glass.now;
    for (const streak of this.glass.streaks) {
      const tube = this.nextTube(streak.x.length);
      if (sampleStreak(tube, streak, now, scale)) this.streakPieces.push(tube);
    }
    for (const splat of this.glass.splats) {
      this.onGlass.push(splatPiece(splat, scale, metal));
    }
  }

  private nextTube(points: number): Tube {
    let tube = this.tubes[this.tubeIndex];
    if (!tube || tube.x.length < points) {
      tube = {
        kind: "tube",
        x: new Float32Array(points),
        y: new Float32Array(points),
        r: new Float32Array(points),
        n: 0,
      };
      this.tubes[this.tubeIndex] = tube;
    }
    this.tubeIndex++;
    tube.n = 0;
    return tube;
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
    this.glass.clear();
    this.air = [];
    this.streakPieces = [];
    this.onGlass = [];
    this.tubes = [];
    this.tips = [];
    this.layers = [];
  }
}

/**
 * Lay a smooth curve through the rope's nodes, each as thick as the liquid
 * around it, swelling into the bulb at the end. Nodes bunched on one spot
 * after a pinch are skipped so the curve has no kinks. Returns the bulb's
 * radius.
 */
function sampleRope(
  tube: Tube,
  strand: GooStrand,
  shape: GooShape,
  root: number,
  scale: number
): number {
  const keep: number[] = [0];
  const radius: number[] = [root];
  const end = GOO_NODES - 1;
  const minimum = 0.6 * scale;
  for (let i = 1; i <= end; i++) {
    const last = keep[keep.length - 1]!;
    const gap = Math.hypot(
      strand.x[i]! - strand.x[last]!,
      strand.y[i]! - strand.y[last]!
    );
    const before = segmentRadius(strand, i - 1);
    const after = i < end ? segmentRadius(strand, i) : before;
    const r = Math.max(minimum, Math.min(before, after));
    if (gap < 0.3 * scale && i < end) continue;
    if (gap < 0.3 * scale) {
      radius[radius.length - 1] = Math.max(radius[radius.length - 1]!, r);
      continue;
    }
    keep.push(i);
    radius.push(r);
  }
  const bulb = Math.max(
    sphereRadius(strand.bulb),
    radius[radius.length - 1]!,
    shape.thread
  );
  if (keep.length < 2) return Math.max(bulb, root);
  radius[radius.length - 1] = bulb * 0.92;

  let n = 0;
  for (let k = 0; k < keep.length - 1; k++) {
    const p0 = keep[Math.max(0, k - 1)]!;
    const p1 = keep[k]!;
    const p2 = keep[k + 1]!;
    const p3 = keep[Math.min(keep.length - 1, k + 2)]!;
    for (let s = 0; s < ROPE_SAMPLES; s++) {
      const t = s / ROPE_SAMPLES;
      tube.x[n] = catmull(strand.x[p0]!, strand.x[p1]!, strand.x[p2]!, strand.x[p3]!, t);
      tube.y[n] = catmull(strand.y[p0]!, strand.y[p1]!, strand.y[p2]!, strand.y[p3]!, t);
      // Thin runs ease into the bulb so the end reads as a teardrop.
      const ease = t * t * (3 - 2 * t);
      tube.r[n] = radius[k]! + (radius[k + 1]! - radius[k]!) * ease;
      n++;
    }
  }
  tube.x[n] = strand.x[end]!;
  tube.y[n] = strand.y[end]!;
  tube.r[n] = radius[radius.length - 1]!;
  tube.n = n + 1;
  return bulb;
}

function catmull(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  );
}

/** A streak drying from its oldest end; false once nothing is left. */
function sampleStreak(
  tube: Tube,
  streak: GooStreak,
  now: number,
  scale: number
): boolean {
  let n = 0;
  for (let i = 0; i < streak.n; i++) {
    const w = streakWidth(streak, i, now);
    if (w < 0.35 * scale) {
      // A dried gap ends the visible run; start again after it.
      if (n > 1) break;
      n = 0;
      continue;
    }
    tube.x[n] = streak.x[i]!;
    tube.y[n] = streak.y[i]!;
    tube.r[n] = w;
    n++;
  }
  tube.n = n;
  return n > 1;
}

/**
 * A running splat trails a tail; a metal bead rolls instead, so it stays
 * nearly round.
 */
function splatPiece(splat: GooSplat, scale: number, metal: number): Ball | Tear | Blob {
  const r = splatRadius(splat);
  if (splat.vy > 2 * scale) {
    const speed = Math.hypot(splat.vx, splat.vy);
    return {
      kind: "tear",
      x: splat.x,
      y: splat.y,
      r,
      ux: splat.vx / speed,
      uy: splat.vy / speed,
      tail: r * Math.min(1.3, splat.vy / (70 * scale)) * (1 - 0.85 * metal),
    };
  }
  if (splat.splash > 0.02) {
    return {
      kind: "blob",
      x: splat.x,
      y: splat.y,
      r,
      splash: splat.splash,
      seed: splat.seed,
      heading: splat.heading,
    };
  }
  return { kind: "ball", x: splat.x, y: splat.y, r };
}

function dropPiece(
  drop: GooDrop,
  bounds: { width: number; height: number }
): Ball | Tear | null {
  const left = drop.life - drop.age;
  const r = drop.r * approach(drop) * Math.min(1, left / 0.25);
  if (r < 0.4) return null;
  const pad = r * 6;
  if (
    drop.x < -pad ||
    drop.y < -pad ||
    drop.x > bounds.width + pad ||
    drop.y > bounds.height + pad
  ) {
    return null;
  }
  // A falling glob is round. Only a fresh one still trails the neck it tore
  // from; a speed tail on every drop made them read as water.
  const speed = Math.hypot(drop.vx, drop.vy);
  const tail =
    drop.age < SNAP_TIME ? (1 - drop.age / SNAP_TIME) * Math.max(drop.tail, r) : 0;
  if (speed < 1e-3 || tail < 0.05 * r) {
    return { kind: "ball", x: drop.x, y: drop.y, r };
  }
  return {
    kind: "tear",
    x: drop.x,
    y: drop.y,
    r,
    ux: drop.vx / speed,
    uy: drop.vy / speed,
    tail,
  };
}

/**
 * Add one piece to the current path, shrunk by `size` and shifted toward the
 * light by `shift` of its local radius.
 */
function tracePiece(ctx: Ctx2D, piece: Piece, shift: number, size: number): void {
  if (piece.kind === "ball") {
    const ox = LIGHT_X * shift * piece.r;
    const oy = LIGHT_Y * shift * piece.r;
    ctx.moveTo(piece.x + ox + piece.r * size, piece.y + oy);
    ctx.arc(piece.x + ox, piece.y + oy, piece.r * size, 0, Math.PI * 2);
    return;
  }
  if (piece.kind === "tear") {
    const r = piece.r * size;
    const cx = piece.x + LIGHT_X * shift * piece.r;
    const cy = piece.y + LIGHT_Y * shift * piece.r;
    const d = r + piece.tail * size;
    const px = cx - piece.ux * d;
    const py = cy - piece.uy * d;
    const back = Math.atan2(-piece.uy, -piece.ux);
    const spread = Math.acos(Math.min(1, r / d));
    ctx.moveTo(px, py);
    ctx.arc(cx, cy, r, back + spread, back - spread + Math.PI * 2);
    ctx.closePath();
    return;
  }
  if (piece.kind === "blob") {
    traceBlob(ctx, piece, shift, size);
    return;
  }
  traceTube(ctx, piece, shift, size);
}

/** A splat's outline: round, plus lobes that fade as it pulls together. */
function traceBlob(ctx: Ctx2D, blob: Blob, shift: number, size: number): void {
  const cx = blob.x + LIGHT_X * shift * blob.r;
  const cy = blob.y + LIGHT_Y * shift * blob.r;
  const steps = 28;
  const s = blob.seed;
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const lobe =
      0.5 * Math.sin(3 * a + s) +
      0.32 * Math.sin(5 * a + 2.1 * s) +
      0.22 * Math.sin(8 * a + 3.7 * s);
    // Smeared along the way it was flying, ragged all round.
    const smear = 1 + 0.45 * blob.splash * Math.cos(2 * (a - blob.heading));
    const r = blob.r * size * smear * (1 + 0.38 * blob.splash * lobe);
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

/** Outline a variable-width tube: down one side, back up the other. */
function traceTube(ctx: Ctx2D, tube: Tube, shift: number, size: number): void {
  const n = tube.n;
  let nx = 0;
  let ny = 0;
  for (let pass = 0; pass < 2; pass++) {
    const side = pass === 0 ? 1 : -1;
    for (let k = 0; k < n; k++) {
      const i = pass === 0 ? k : n - 1 - k;
      const a = Math.max(0, i - 1);
      const b = Math.min(n - 1, i + 1);
      const tx = tube.x[b]! - tube.x[a]!;
      const ty = tube.y[b]! - tube.y[a]!;
      const tl = Math.hypot(tx, ty);
      if (tl > 1e-6) {
        nx = -ty / tl;
        ny = tx / tl;
      } else if (nx === 0 && ny === 0) {
        nx = 1;
      }
      const r = tube.r[i]!;
      const x = tube.x[i]! + LIGHT_X * shift * r + nx * r * size * side;
      const y = tube.y[i]! + LIGHT_Y * shift * r + ny * r * size * side;
      if (k === 0 && pass === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
  }
  ctx.closePath();
  // Round both ends so a streak or thread never ends square. The outline is
  // filled first: under the nonzero rule a cap wound the other way would cut
  // a hole where it overlaps.
  ctx.fill();
  ctx.beginPath();
  for (const i of [0, n - 1]) {
    const r = tube.r[i]! * size;
    const x = tube.x[i]! + LIGHT_X * shift * tube.r[i]!;
    const y = tube.y[i]! + LIGHT_Y * shift * tube.r[i]!;
    ctx.moveTo(x + r, y);
    ctx.arc(x, y, r, 0, Math.PI * 2);
  }
}

function isEndEnabled(end: "A" | "B", params: GooParams): boolean {
  if (params.trackingMode === "both_ends") return true;
  return params.trackingMode === "left_end" ? end === "A" : end === "B";
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function createOffscreen(
  w: number,
  h: number
): HTMLCanvasElement | OffscreenCanvas | null {
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
