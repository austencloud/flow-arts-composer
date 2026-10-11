import type { GooParams } from "../translators/canvas2d-types";
import type { EmitterTip } from "./emitter-tip";
import { emitterId } from "./emitter-tip";
import {
  GooStrandSim,
  gooBulbRadius,
  resolveGooShape,
  type GooDrop,
  type GooMaterial,
  type GooShape,
  type GooStrand,
  type GooTipInput,
} from "./goo-strand-sim";

/**
 * Goo for the Canvas2D backend: the 2D telling of the 3D goo.
 *
 * Each tracked tip carries a strand of thick liquid (see `GooStrandSim`): it
 * coats the tip, hangs from it under gravity, swings and stretches as the prop
 * moves, necks thin, and pinches off into falling drops. Viscosity decides how
 * long it clings before it lets go.
 *
 * Drawing is plain vector work, no filters. Every shape is first filled in the
 * palette's deep tint, then the same shapes are redrawn smaller and nudged
 * toward one light up and to the left, clipped to the body: core color, a
 * brighter sheen, a backlit glow on the far side, and a sharp specular streak.
 * Because every highlight agrees on where the light is, the blobs read as one
 * wet surface. The shading happens on a transparent layer, so nothing outside
 * the goo is ever painted.
 */

const PX_PER_WORLD = 60;
const LIGHT_LEN = Math.hypot(0.55, 0.83);
/** Unit vector toward the key light, up and to the left (canvas y is down). */
const LIGHT_X = -0.55 / LIGHT_LEN;
const LIGHT_Y = -0.83 / LIGHT_LEN;
const STRAND_SAMPLES = 18;
/** Seconds a fresh drop keeps the torn neck as a tail behind it. */
const SNAP_TIME = 0.18;

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

interface Tube {
  kind: "tube";
  x: Float32Array;
  y: Float32Array;
  r: Float32Array;
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

type Piece = Tube | Ball | Tear;

interface ShadePass {
  op: GlobalCompositeOperation;
  color: (p: GooParams["resolvedPalette"]) => string;
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
const SHADE_PASSES: readonly ShadePass[] = [
  {
    op: "source-over",
    color: (p) => p.puddleTint,
    alpha: 1,
    shift: 0,
    size: 1,
  },
  { op: "source-atop", color: (p) => p.core, alpha: 1, shift: 0.22, size: 0.9 },
  {
    op: "source-atop",
    color: (p) => p.edge,
    alpha: 0.55,
    shift: 0.4,
    size: 0.55,
  },
  // Light that went through the liquid and came out the shadow side.
  {
    op: "source-atop",
    color: (p) => p.edge,
    alpha: 0.32,
    shift: -0.52,
    size: 0.38,
  },
  {
    op: "source-atop",
    color: (p) => p.highlight,
    alpha: 0.9,
    shift: 0.48,
    size: 0.2,
  },
];

export class Goo2DRenderer {
  private sim = new GooStrandSim();
  private pieces: Piece[] = [];
  private tubes: Tube[] = [];
  private tips: GooTipInput[] = [];
  private layer: HTMLCanvasElement | OffscreenCanvas | null = null;
  private layerCtx: Ctx2D | null = null;

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
    const material: GooMaterial = {
      viscosity: params.surfaceTension,
      amount: params.motionEmission,
      ambient: params.ambientEmission,
      intensity: params.intensity,
      gravity: Number.isFinite(params.gravity)
        ? Math.max(0, Math.min(2, params.gravity))
        : 1,
      scale,
      referenceSpeed: params.motionReferenceSpeed * PX_PER_WORLD * scale,
    };
    this.sim.step(this.tips, dt, material, bounds);

    this.buildPieces(resolveGooShape(material), scale, bounds);
    if (!this.pieces.length) return;

    const layer = this.ensureLayer(W, H);
    if (!layer || !this.layer) return;
    layer.setTransform(1, 0, 0, 1, 0, 0);
    layer.globalCompositeOperation = "source-over";
    layer.globalAlpha = 1;
    layer.clearRect(0, 0, W, H);
    layer.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);

    const palette = params.resolvedPalette;
    for (const pass of SHADE_PASSES) {
      layer.globalCompositeOperation = pass.op;
      layer.globalAlpha = pass.alpha;
      layer.fillStyle = pass.color(palette);
      for (const piece of this.pieces) {
        layer.beginPath();
        tracePiece(layer, piece, pass.shift, pass.size);
        layer.fill();
      }
    }

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = params.blendMode ?? "source-over";
    ctx.globalAlpha = 0.72 + 0.28 * clamp01(params.intensity);
    ctx.drawImage(this.layer as CanvasImageSource, 0, 0);
    ctx.restore();
  }

  /** Turn the sim's strands and drops into this frame's drawable shapes. */
  private buildPieces(
    shape: GooShape,
    scale: number,
    bounds: { width: number; height: number }
  ): void {
    this.pieces.length = 0;
    let tubeIndex = 0;
    const root = shape.bulbMaxRadius * 0.3;
    for (const strand of this.sim.strands.values()) {
      const rb = gooBulbRadius(shape, strand.fill);
      const { tail, head } = strand;
      const len = Math.hypot(head.x - tail.x, head.y - tail.y);
      if (len > 0.5 * scale) {
        const tube = (this.tubes[tubeIndex++] ??= {
          kind: "tube",
          x: new Float32Array(STRAND_SAMPLES + 1),
          y: new Float32Array(STRAND_SAMPLES + 1),
          r: new Float32Array(STRAND_SAMPLES + 1),
        });
        sampleStrand(tube, strand, root, rb, len, shape.pinchLength, scale);
        this.pieces.push(tube);
      }
      this.pieces.push({ kind: "ball", x: tail.x, y: tail.y, r: root });
      this.pieces.push({ kind: "ball", x: head.x, y: head.y, r: rb });
    }
    for (const drop of this.sim.drops) {
      const piece = dropPiece(drop, bounds);
      if (piece) this.pieces.push(piece);
    }
  }

  private ensureLayer(w: number, h: number): Ctx2D | null {
    if (
      this.layer &&
      this.layerCtx &&
      this.layer.width === w &&
      this.layer.height === h
    ) {
      return this.layerCtx;
    }
    const canvas = createOffscreen(w, h);
    const ctx = canvas?.getContext("2d") as Ctx2D | null | undefined;
    if (!canvas || !ctx) return null;
    this.layer = canvas;
    this.layerCtx = ctx;
    return ctx;
  }

  dispose(): void {
    this.sim.clear();
    this.pieces = [];
    this.tubes = [];
    this.tips = [];
    this.layer = null;
    this.layerCtx = null;
  }
}

/**
 * Lay the strand along a quadratic through tail, middle node and bulb. Like
 * the 3D goo it holds onto the tip by a slim root, runs as a thin thread, and
 * widens into a teardrop bulb; the thread thins further as the strand is
 * pulled toward its pinch length, which tells the eye it is about to let go.
 */
function sampleStrand(
  tube: Tube,
  strand: GooStrand,
  root: number,
  bulb: number,
  len: number,
  pinchLength: number,
  scale: number
): void {
  const { tail, mid, head } = strand;
  const cx = 2 * mid.x - (tail.x + head.x) / 2;
  const cy = 2 * mid.y - (tail.y + head.y) / 2;
  const pull = Math.min(1, Math.max(0, len / pinchLength));
  const thread = Math.max(0.9 * scale, bulb * (0.32 - 0.16 * pull));
  const swell = 0.92 * bulb;
  for (let i = 0; i <= STRAND_SAMPLES; i++) {
    const t = i / STRAND_SAMPLES;
    const s = 1 - t;
    tube.x[i] = s * s * tail.x + 2 * s * t * cx + t * t * head.x;
    tube.y[i] = s * s * tail.y + 2 * s * t * cy + t * t * head.y;
    const upper = root + (thread - root) * smoothstep(0, 0.45, t);
    const drop = Math.pow(smoothstep(0.35, 1, t), 2);
    tube.r[i] = upper + (swell - upper) * drop;
  }
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function dropPiece(
  drop: GooDrop,
  bounds: { width: number; height: number }
): Ball | Tear | null {
  const left = 1 - drop.age / drop.life;
  const r = drop.r * Math.min(1, left / 0.25);
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
  const tail = drop.age < SNAP_TIME ? (1 - drop.age / SNAP_TIME) * 2 * r : 0;
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
function tracePiece(
  ctx: Ctx2D,
  piece: Piece,
  shift: number,
  size: number
): void {
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
  traceTube(ctx, piece, shift, size);
}

/** Outline a variable-width tube: down one side, back up the other. */
function traceTube(ctx: Ctx2D, tube: Tube, shift: number, size: number): void {
  const n = tube.x.length;
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
    if (typeof OffscreenCanvas !== "undefined")
      return new OffscreenCanvas(w, h);
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
