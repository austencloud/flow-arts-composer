import type { Silk2DParams } from "../translators/canvas2d-types";
import type { EmitterTip } from "./emitter-tip";
import { emitterId } from "./emitter-tip";
import { SILK_GL_VERTEX_FLOATS, SilkClothGL } from "./silk-cloth-gl";
import {
  SILK_CLOTH_COLUMNS,
  SILK_CLOTH_ROWS,
  SilkCloth3D,
  resolveSilkClothSettings,
  resolveSilkFabricProfile3D,
  type SilkFabricProfile3D,
} from "#lib/shared/3d/effects/silk/silk-cloth-3d.js";

/**
 * 2D Silk: the same cloth streamer the 3D view simulates, seen from the
 * front. Screen x and y are the cloth's x and y (y flipped, so gravity pulls
 * down the screen); the cloth still moves in depth, so it twists, turns its
 * back to the viewer and folds over itself. Each patch of fabric is shaded
 * from the way it faces: a lit face, a darker turned-away face, sheen where
 * it turns edge-on, a satin highlight, and light glowing through from
 * behind. Patches are drawn far to near, on the GPU (silk-cloth-gl) where
 * WebGL2 is available, else flat-filled on a Canvas2D layer.
 */

/** Screen pixels per metre of cloth at the reference canvas size. */
const PIXELS_PER_METRE = 140;
/** A tip that jumps further than this in one frame starts a fresh streamer. */
const TELEPORT_METRES = 0.5;
/** Seconds a let-go streamer takes to fall and fade out. */
const RELEASE_SECONDS = 1.2;
const QUADS = (SILK_CLOTH_ROWS - 1) * (SILK_CLOTH_COLUMNS - 1);
const VERTICES = SILK_CLOTH_ROWS * SILK_CLOTH_COLUMNS;
/** Drawn rows per simulated row: the strip is smoothed between them. */
const SMOOTHING = 3;
const FINE_ROWS = (SILK_CLOTH_ROWS - 1) * SMOOTHING + 1;
const FINE_VERTICES = FINE_ROWS * SILK_CLOTH_COLUMNS;
const FINE_QUADS = (FINE_ROWS - 1) * (SILK_CLOTH_COLUMNS - 1);
/** Key light from the upper left, a little in front of the stage. */
const LIGHT = normalize3(-0.45, 0.65, 0.62);
/** Halfway between the light and the viewer, for the satin highlight. */
const HALF = normalize3(LIGHT[0], LIGHT[1], LIGHT[2] + 1);

interface Streamer {
  cloth: SilkCloth3D;
  color: string;
  lastX: number;
  lastY: number;
  seenAt: number;
  /** 0 while held, rising to 1 as a let-go streamer fades. */
  released: number;
  /** 0 to 1 as a new streamer fades in. */
  grown: number;
}

type Rgb = [number, number, number];

/**
 * Keeps the normal two-prop, two-end view vivid while preventing tunnel layers
 * from stacking into a white disc. The floor preserves material identity at
 * high source counts without allowing total opacity to grow linearly.
 */
export function resolveSilk2DEnergyScale(sourceCount: number): number {
  if (sourceCount <= 4) return 1;
  return Math.max(0.32, Math.sqrt(4 / sourceCount));
}

/** Opacity of the fabric for an intensity, before fades. */
export function resolveSilk2DOpacity(intensity: number, sourceCount: number): number {
  const energy = resolveSilk2DEnergyScale(sourceCount);
  return Math.min(0.97, 0.25 + 1.1 * clamp01(intensity)) * (0.85 + 0.15 * energy);
}

export class Silk2DRenderer {
  private time = 0;
  private readonly streamers = new Map<string, Streamer>();
  private nextSeed = 1;
  private layer: HTMLCanvasElement | OffscreenCanvas | null = null;
  private layerContext: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;
  // Reused per-frame buffers: quad depth, owner and corner indices.
  private depth = new Float32Array(0);
  private order = new Uint32Array(0);
  // Lit color (0-255) and alpha (0-1) of every vertex, for the flat fallback.
  private shades = new Float32Array(0);
  // The smoothed strip handed to the GPU.
  private painter: SilkClothGL | null | undefined;
  private fineVertices = new Float32Array(0);
  private fineDepth = new Float32Array(0);
  private fineIndices = new Uint32Array(0);

  render(
    ctx: CanvasRenderingContext2D,
    params: Silk2DParams,
    emitters: EmitterTip[],
    dt: number,
    scale: number = 1,
    loopDetected: boolean = false
  ): void {
    const step = Math.min(Math.max(dt, 0), 1 / 15);
    this.time += step;
    const settings = resolveSilkClothSettings(params);
    const pixels = PIXELS_PER_METRE * Math.max(0.25, scale);

    for (const tip of emitters) {
      if (!this.isEndEnabled(tip.end, params)) continue;
      const id = emitterId(tip.propIndex, tip.tipIndex);
      const pin = { x: tip.x / pixels, y: -tip.y / pixels, z: 0 };
      let streamer = this.streamers.get(id);
      if (!streamer) {
        streamer = {
          cloth: new SilkCloth3D(this.nextSeed++),
          color: tip.color,
          lastX: pin.x,
          lastY: pin.y,
          seenAt: this.time,
          released: 0,
          grown: 0,
        };
        this.streamers.set(id, streamer);
      }
      const dx = pin.x - streamer.lastX;
      const dy = pin.y - streamer.lastY;
      streamer.color = tip.color;
      streamer.seenAt = this.time;
      streamer.released = 0;
      if (!streamer.cloth.isStarted || (!loopDetected && Math.hypot(dx, dy) > TELEPORT_METRES)) {
        const vx = step > 0 ? dx / step : 0;
        const vy = step > 0 ? dy / step : 0;
        streamer.cloth.reset(pin, { x: -vx, y: -vy, z: 0 }, settings);
        streamer.grown = 0;
      } else if (loopDetected) {
        // A sequence seam teleports the prop; carry the cloth with it rather
        // than dragging it across the stage.
        streamer.cloth.translate(dx, dy, 0);
      } else if (step > 0) {
        streamer.cloth.step(pin, step, settings, -1e6);
      }
      streamer.grown = Math.min(1, streamer.grown + step / 0.25);
      streamer.lastX = pin.x;
      streamer.lastY = pin.y;
    }

    for (const [id, streamer] of this.streamers) {
      if (streamer.seenAt === this.time) continue;
      streamer.released += step / RELEASE_SECONDS;
      if (streamer.released >= 1) {
        this.streamers.delete(id);
        continue;
      }
      if (step > 0) streamer.cloth.step(null, step, settings, -1e6);
    }
    if (this.streamers.size === 0) return;

    this.draw(ctx, params, pixels);
  }

  private draw(ctx: CanvasRenderingContext2D, params: Silk2DParams, pixels: number): void {
    const list = [...this.streamers.values()];
    const opacity = resolveSilk2DOpacity(params.intensity, list.length);
    const profile = resolveSilkFabricProfile3D(params.resolvedPalette.id);
    const glow = params.resolvedPalette.emissive ? 0.2 + 0.35 * clamp01(params.intensity) : 0;
    if (this.painter === undefined || this.painter?.lost) this.painter = SilkClothGL.create();
    if (this.painter && this.drawSmooth(ctx, this.painter, list, params, pixels, opacity, profile, glow)) {
      return;
    }
    this.drawFlat(ctx, list, params, pixels, opacity, profile, glow);
  }

  /**
   * The cloth on the GPU: rows smoothed into a finer strip, lit per pixel and
   * multisampled, then laid on the stage.
   */
  private drawSmooth(
    ctx: CanvasRenderingContext2D,
    painter: SilkClothGL,
    list: readonly Streamer[],
    params: Silk2DParams,
    pixels: number,
    opacity: number,
    profile: SilkFabricProfile3D,
    glow: number
  ): boolean {
    const width = ctx.canvas?.width ?? 0;
    const height = ctx.canvas?.height ?? 0;
    if (width <= 0 || height <= 0 || typeof ctx.drawImage !== "function") return false;
    const m =
      typeof ctx.getTransform === "function"
        ? ctx.getTransform()
        : { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

    const vertexCount = list.length * FINE_VERTICES;
    const quadCount = list.length * FINE_QUADS;
    if (this.fineVertices.length < vertexCount * SILK_GL_VERTEX_FLOATS) {
      this.fineVertices = new Float32Array(vertexCount * SILK_GL_VERTEX_FLOATS);
      this.fineDepth = new Float32Array(vertexCount);
    }
    if (this.depth.length < quadCount) {
      this.depth = new Float32Array(quadCount);
      this.order = new Uint32Array(quadCount);
    }
    if (this.fineIndices.length < quadCount * 6) this.fineIndices = new Uint32Array(quadCount * 6);
    const out = this.fineVertices;
    const z = this.fineDepth;

    for (let s = 0; s < list.length; s++) {
      const streamer = list[s]!;
      const p = streamer.cloth.positions;
      const n = streamer.cloth.normals;
      const colors = streamerColors(params, streamer.color, profile);
      const fade = smooth(streamer.grown) * (1 - smooth(streamer.released));
      for (let row = 0; row < FINE_ROWS; row++) {
        const segment = Math.min(SILK_CLOTH_ROWS - 2, Math.floor(row / SMOOTHING));
        const t = row / SMOOTHING - segment;
        const along = row / (FINE_ROWS - 1);
        // The tail thins and dissolves; the head stays solid where it is tied.
        const alpha = opacity * fade * (1 - 0.9 * smooth((along - 0.7) / 0.3));
        const body = colors.emissive
          ? mixRgb(colors.sheen, colors.body, Math.sqrt(along))
          : mixRgb(colors.body, colors.bodyAlt, along);
        const sheen = mixRgb(colors.sheen, colors.sheenAlt, along);
        const r0 = Math.max(0, segment - 1);
        const r1 = segment;
        const r2 = segment + 1;
        const r3 = Math.min(SILK_CLOTH_ROWS - 1, segment + 2);
        for (let column = 0; column < SILK_CLOTH_COLUMNS; column++) {
          const v0 = (r0 * SILK_CLOTH_COLUMNS + column) * 3;
          const v1 = (r1 * SILK_CLOTH_COLUMNS + column) * 3;
          const v2 = (r2 * SILK_CLOTH_COLUMNS + column) * 3;
          const v3 = (r3 * SILK_CLOTH_COLUMNS + column) * 3;
          const x = catmullRom(p[v0]!, p[v1]!, p[v2]!, p[v3]!, t) * pixels;
          const y = -catmullRom(p[v0 + 1]!, p[v1 + 1]!, p[v2 + 1]!, p[v3 + 1]!, t) * pixels;
          const vertex = s * FINE_VERTICES + row * SILK_CLOTH_COLUMNS + column;
          const o = vertex * SILK_GL_VERTEX_FLOATS;
          z[vertex] = catmullRom(p[v0 + 2]!, p[v1 + 2]!, p[v2 + 2]!, p[v3 + 2]!, t);
          out[o] = m.a * x + m.c * y + m.e;
          out[o + 1] = m.b * x + m.d * y + m.f;
          out[o + 2] = n[v1]! + (n[v2]! - n[v1]!) * t;
          out[o + 3] = n[v1 + 1]! + (n[v2 + 1]! - n[v1 + 1]!) * t;
          out[o + 4] = n[v1 + 2]! + (n[v2 + 2]! - n[v1 + 2]!) * t;
          out[o + 5] = body[0];
          out[o + 6] = body[1];
          out[o + 7] = body[2];
          out[o + 8] = sheen[0];
          out[o + 9] = sheen[1];
          out[o + 10] = sheen[2];
          out[o + 11] = alpha;
        }
      }
    }

    // Patches of every streamer, far to near, so folds layer correctly.
    const depth = this.depth;
    const order = this.order.subarray(0, quadCount);
    for (let i = 0; i < quadCount; i++) {
      const a = fineCorner(i);
      depth[i] = z[a]! + z[a + 1]! + z[a + SILK_CLOTH_COLUMNS]! + z[a + SILK_CLOTH_COLUMNS + 1]!;
      order[i] = i;
    }
    order.sort((left, right) => depth[left]! - depth[right]!);
    const indices = this.fineIndices;
    let cursor = 0;
    for (const i of order) {
      const a = fineCorner(i);
      const b = a + 1;
      const c = a + SILK_CLOTH_COLUMNS;
      const d = c + 1;
      indices[cursor++] = a;
      indices[cursor++] = c;
      indices[cursor++] = b;
      indices[cursor++] = b;
      indices[cursor++] = c;
      indices[cursor++] = d;
    }

    try {
      painter.draw(
        width,
        height,
        out.subarray(0, vertexCount * SILK_GL_VERTEX_FLOATS),
        indices.subarray(0, cursor),
        {
          roughness: profile.roughness,
          sheen: profile.sheen,
          translucency: profile.translucency,
          metalness: profile.metalness,
          glow,
          light: LIGHT,
          half: HALF,
        }
      );
    } catch {
      this.painter = null;
      return false;
    }
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = params.blendMode ?? "source-over";
    ctx.drawImage(painter.canvas as CanvasImageSource, 0, 0);
    ctx.restore();
    return true;
  }

  /**
   * Without WebGL2: each patch filled flat with its corners' average light,
   * on an opaque layer laid on the stage at the fabric's opacity.
   */
  private drawFlat(
    ctx: CanvasRenderingContext2D,
    list: readonly Streamer[],
    params: Silk2DParams,
    pixels: number,
    opacity: number,
    profile: SilkFabricProfile3D,
    glow: number
  ): void {
    const total = list.length * QUADS;
    if (this.depth.length < total) {
      this.depth = new Float32Array(total);
      this.order = new Uint32Array(total);
    }
    for (let s = 0; s < list.length; s++) {
      const p = list[s]!.cloth.positions;
      for (let q = 0; q < QUADS; q++) {
        const [a, b, c, d] = corners(q);
        const i = s * QUADS + q;
        this.depth[i] = p[a * 3 + 2]! + p[b * 3 + 2]! + p[c * 3 + 2]! + p[d * 3 + 2]!;
        this.order[i] = i;
      }
    }
    const order = this.order.subarray(0, total);
    const depth = this.depth;
    order.sort((left, right) => depth[left]! - depth[right]!);

    if (this.shades.length < list.length * VERTICES * 4) {
      this.shades = new Float32Array(list.length * VERTICES * 4);
    }
    const shades = this.shades;
    for (let s = 0; s < list.length; s++) {
      const streamer = list[s]!;
      const colors = streamerColors(params, streamer.color, profile);
      const fade = smooth(streamer.grown) * (1 - smooth(streamer.released));
      for (let row = 0; row < SILK_CLOTH_ROWS; row++) {
        const along = row / (SILK_CLOTH_ROWS - 1);
        const tail = 1 - 0.9 * smooth((along - 0.7) / 0.3);
        for (let column = 0; column < SILK_CLOTH_COLUMNS; column++) {
          const v = row * SILK_CLOTH_COLUMNS + column;
          const at = (s * VERTICES + v) * 4;
          shadeVertex(streamer.cloth, v, along, colors, profile, glow, shades, at);
          shades[at + 3] = tail * fade;
        }
      }
    }

    const target = this.layerFor(ctx);
    const paint = target ?? ctx;
    if (target) {
      const transform = ctx.getTransform?.();
      target.setTransform(1, 0, 0, 1, 0, 0);
      target.clearRect(0, 0, target.canvas.width, target.canvas.height);
      if (transform) target.setTransform(transform);
    }
    paint.save();
    if (!target) paint.globalCompositeOperation = params.blendMode ?? "source-over";
    paint.lineJoin = "round";
    paint.lineWidth = 0.9;
    for (const i of order) {
      const s = Math.floor(i / QUADS);
      const q = i - s * QUADS;
      const p = list[s]!.cloth.positions;
      const quad = corners(q);
      const color = [0, 0, 0, 0];
      for (const v of quad) {
        const at = (s * VERTICES + v) * 4;
        for (let channel = 0; channel < 4; channel++) color[channel]! += shades[at + channel]! / 4;
      }
      const alpha = color[3]! * (target ? 1 : opacity);
      if (alpha <= 0.004) continue;
      const style = `rgb(${byte(color[0]!)},${byte(color[1]!)},${byte(color[2]!)})`;
      paint.globalAlpha = alpha;
      paint.fillStyle = style;
      paint.strokeStyle = style;
      paint.beginPath();
      paint.moveTo(p[quad[0] * 3]! * pixels, -p[quad[0] * 3 + 1]! * pixels);
      paint.lineTo(p[quad[1] * 3]! * pixels, -p[quad[1] * 3 + 1]! * pixels);
      paint.lineTo(p[quad[3] * 3]! * pixels, -p[quad[3] * 3 + 1]! * pixels);
      paint.lineTo(p[quad[2] * 3]! * pixels, -p[quad[2] * 3 + 1]! * pixels);
      paint.closePath();
      paint.fill();
      // Hairline seams between neighboring patches would show the grid.
      if (target) paint.stroke();
    }
    paint.restore();

    if (target) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = opacity;
      ctx.globalCompositeOperation = params.blendMode ?? "source-over";
      ctx.drawImage(target.canvas as CanvasImageSource, 0, 0);
      ctx.restore();
    }
  }

  /**
   * Fabric is drawn opaque on its own layer, then laid on the stage at the
   * fabric's opacity, so patches meet without see-through seams.
   */
  private layerFor(
    ctx: CanvasRenderingContext2D
  ): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null {
    const width = ctx.canvas?.width ?? 0;
    const height = ctx.canvas?.height ?? 0;
    if (width <= 0 || height <= 0 || typeof ctx.drawImage !== "function") return null;
    if (!this.layer) {
      try {
        if (typeof OffscreenCanvas !== "undefined") this.layer = new OffscreenCanvas(width, height);
        else if (typeof document !== "undefined") this.layer = document.createElement("canvas");
      } catch {
        this.layer = null;
      }
      this.layerContext = (this.layer?.getContext("2d") ?? null) as
        | CanvasRenderingContext2D
        | OffscreenCanvasRenderingContext2D
        | null;
    }
    // Test doubles and headless stubs can hand back a partial context.
    if (!this.layer || typeof this.layerContext?.setTransform !== "function") return null;
    if (this.layer.width !== width) this.layer.width = width;
    if (this.layer.height !== height) this.layer.height = height;
    return this.layerContext;
  }

  private isEndEnabled(end: "A" | "B", params: Silk2DParams): boolean {
    if (params.trackingMode === "both_ends") return true;
    return params.trackingMode === "left_end" ? end === "A" : end === "B";
  }

  /** Number of streamers alive, held or falling. */
  get streamerCount(): number {
    return this.streamers.size;
  }

  dispose(): void {
    this.streamers.clear();
    this.time = 0;
  }
}

interface StreamerColors {
  body: Rgb;
  bodyAlt: Rgb;
  sheen: Rgb;
  sheenAlt: Rgb;
  emissive: boolean;
}

function streamerColors(
  params: Silk2DParams,
  propColor: string,
  profile: SilkFabricProfile3D
): StreamerColors {
  const palette = params.resolvedPalette;
  const prop = hexToRgb(propColor) ?? hexToRgb(palette.body)!;
  const body = mixRgb(hexToRgb(palette.body)!, prop, profile.identityMix);
  const bodyAlt = palette.hueShift
    ? mixRgb(hexToRgb(palette.bodyAlt ?? palette.body)!, prop, profile.identityMix)
    : body;
  const edgeMix = Math.min(0.42, profile.identityMix + 0.08);
  const sheen = mixRgb(hexToRgb(palette.edge)!, prop, edgeMix);
  const sheenAlt = palette.hueShift
    ? mixRgb(hexToRgb(palette.edgeAlt ?? palette.edge)!, prop, edgeMix)
    : sheen;
  return { body, bodyAlt, sheen, sheenAlt, emissive: !!palette.emissive };
}

/** Lights vertex `v` and writes its color, as 0-255 channels, at `out`. */
function shadeVertex(
  cloth: SilkCloth3D,
  v: number,
  along: number,
  colors: StreamerColors,
  profile: SilkFabricProfile3D,
  glow: number,
  target: Float32Array,
  out: number
): void {
  const n = cloth.normals;
  let nx = n[v * 3]!;
  let ny = n[v * 3 + 1]!;
  let nz = n[v * 3 + 2]!;
  // Whichever side faces the viewer is the side we light.
  if (nz < 0) {
    nx = -nx;
    ny = -ny;
    nz = -nz;
  }
  const body: Rgb = colors.emissive
    ? mixRgb(colors.sheen, colors.body, Math.sqrt(along))
    : mixRgb(colors.body, colors.bodyAlt, along);
  const sheen = mixRgb(colors.sheen, colors.sheenAlt, along);
  const facing = nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2];
  const diffuse = 0.3 + 0.7 * Math.max(0, facing);
  // Light on the far side of thin silk glows through it.
  const through = Math.max(0, -facing) * profile.translucency * 0.9;
  const grazing = 1 - nz;
  const sheenAmount = profile.sheen * 0.55 * grazing * grazing;
  const shininess = 6 + 90 * (1 - profile.roughness) ** 2;
  const highlight =
    Math.max(0, nx * HALF[0] + ny * HALF[1] + nz * HALF[2]) ** shininess *
    (0.15 + 0.7 * (1 - profile.roughness) + 0.4 * profile.metalness);
  // The room reflected in the weave, as silk-cloth-gl does.
  const fresnel = 0.04 + 0.96 * (1 - nz) ** 5;
  const soft = Math.max(0, nx * HALF[0] + ny * HALF[1] + nz * HALF[2]) ** 3;
  const dark = Math.min(1, Math.max(0.25, 1.15 - (0.3 * body[0] + 0.59 * body[1] + 0.11 * body[2])));
  const room = (0.12 + 0.5 * fresnel + 0.3 * soft) * (1 - 0.6 * profile.roughness) * dark;
  for (let k = 0; k < 3; k++) {
    const specular = 1 + (body[k]! - 1) * profile.metalness;
    target[out + k] = toByte(
      body[k]! * (diffuse * (1 - 0.5 * profile.metalness) + through + glow) +
        sheen[k]! * sheenAmount +
        specular * (highlight + room)
    );
  }
}

function byte(value: number): number {
  return Math.round(Math.max(0, Math.min(255, value)));
}

/** Smooth curve through b and c, with a and d as the neighbors beyond. */
function catmullRom(a: number, b: number, c: number, d: number, t: number): number {
  const t2 = t * t;
  return (
    0.5 *
    (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (3 * b - a - 3 * c + d) * t2 * t)
  );
}

/** First vertex of smoothed patch `i`, counting across all streamers. */
function fineCorner(i: number): number {
  const streamer = Math.floor(i / FINE_QUADS);
  const q = i - streamer * FINE_QUADS;
  const row = Math.floor(q / (SILK_CLOTH_COLUMNS - 1));
  const column = q - row * (SILK_CLOTH_COLUMNS - 1);
  return streamer * FINE_VERTICES + row * SILK_CLOTH_COLUMNS + column;
}

/** Corner vertices of quad `q`: a, b along the head side, c, d toward the tail. */
function corners(q: number): [number, number, number, number] {
  const row = Math.floor(q / (SILK_CLOTH_COLUMNS - 1));
  const column = q - row * (SILK_CLOTH_COLUMNS - 1);
  const a = row * SILK_CLOTH_COLUMNS + column;
  return [a, a + 1, a + SILK_CLOTH_COLUMNS, a + SILK_CLOTH_COLUMNS + 1];
}

function hexToRgb(color: string): Rgb | null {
  const source = color.replace(/^#/, "");
  const full =
    source.length === 3
      ? source
          .split("")
          .map((channel) => channel + channel)
          .join("")
      : source.slice(0, 6);
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  return [
    parseInt(full.slice(0, 2), 16) / 255,
    parseInt(full.slice(2, 4), 16) / 255,
    parseInt(full.slice(4, 6), 16) / 255,
  ];
}

function mixRgb(a: Rgb, b: Rgb, amount: number): Rgb {
  const t = clamp01(amount);
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function toByte(value: number): number {
  // Soft roll-off so highlights saturate instead of clipping flat.
  const v = value / (1 + Math.max(0, value - 0.8) * 0.8);
  return clamp01(v) * 255;
}

function normalize3(x: number, y: number, z: number): [number, number, number] {
  const length = Math.hypot(x, y, z) || 1;
  return [x / length, y / length, z / length];
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function smooth(value: number): number {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}
