import type { Ink2DParams } from "../translators/canvas2d-types";
import type { EmitterTip } from "./emitter-tip";
import { emitterId } from "./emitter-tip";
import {
  InkLiquidSim,
  inkDropShape,
  resolveInkLiquidSettings,
  sphereRadius,
  type InkLiquidTip,
} from "#lib/shared/3d/effects/ink/ink-liquid-sim.js";

/**
 * 2D Ink: the same liquid the 3D view throws (ink-liquid-sim), seen from the
 * front. Screen x and y are the liquid's x and y, flipped so gravity pulls
 * down the screen. Strands are filled outlines as wide as the ink in them,
 * with a wet highlight along the lit side and a thin rim; loose drops are
 * beads stretched along their flight with their own glint. There is no stage
 * floor in this view, so drops fall out of the frame.
 */

export interface InkFrameBoundary {
  loopDetected: boolean;
  isSeamlesslyLoopable: boolean;
}

export interface Ink2DDiagnostics {
  parcels: number;
  strands: number;
  /** Strands still tied to a tip. */
  tied: number;
  drops: number;
}

/** Screen pixels per metre of liquid at the reference canvas size. */
const PIXELS_PER_METRE = 140;
/** Strands read thicker face-on than they do among the 3D stage's depth cues. */
const THICKNESS = 1.45;
/** Smoothed points per simulated segment. */
const SUB = 2;
/** Light from the upper left of the screen. */
const LIGHT_X = -0.56;
const LIGHT_Y = -0.83;

type Rgb = [number, number, number];

export class Ink2DRenderer {
  private readonly sim = new InkLiquidSim(3200, 1, 0x2d1f7);
  private readonly tips: InkLiquidTip[] = [];
  // One strand's smoothed outline, reused.
  private px = new Float32Array(512);
  private py = new Float32Array(512);
  private pr = new Float32Array(512);
  private strands = 0;
  private drops = 0;

  render(
    ctx: CanvasRenderingContext2D,
    params: Ink2DParams,
    emitters: EmitterTip[],
    dt: number,
    scale: number = 1,
    boundary?: InkFrameBoundary
  ): void {
    const pixels = PIXELS_PER_METRE * Math.max(0.25, scale);
    // A freeform wrap teleports the props back to the start pose; cut the
    // strands there rather than drawing ink across the stage.
    const jumped = !!boundary?.loopDetected && !boundary.isSeamlesslyLoopable;
    this.tips.length = 0;
    for (const tip of emitters) {
      if (!isEndEnabled(tip.end, params)) continue;
      this.tips.push({
        key: emitterId(tip.propIndex, tip.tipIndex),
        x: tip.x / pixels,
        y: -tip.y / pixels,
        z: 0,
        jumped,
      });
    }
    const palette = params.resolvedPalette;
    const settings = resolveInkLiquidSettings(params, {
      ambient: params.effectiveAmbient,
      thickness: palette.watercolor ? 1.15 : palette.id === "sumi" ? 1.3 : 1,
    });
    this.sim.update(dt, this.tips, settings, -Infinity, this.cullY(ctx, pixels));
    this.draw(ctx, params, pixels, settings.flowRadius);
  }

  getDiagnostics(): Ink2DDiagnostics {
    let tied = 0;
    for (const source of this.sim.sources) if (source.head >= 0) tied++;
    return { parcels: this.sim.liveCount, strands: this.strands, tied, drops: this.drops };
  }

  dispose(): void {
    this.sim.clear();
    this.strands = 0;
    this.drops = 0;
  }

  /** Liquid below the canvas's bottom edge (plus a margin) has left the view. */
  private cullY(ctx: CanvasRenderingContext2D, pixels: number): number {
    const height = ctx.canvas?.height ?? 0;
    if (!(height > 0) || typeof ctx.getTransform !== "function") return -50;
    const m = ctx.getTransform();
    if (Math.abs(m.d) < 1e-6) return -50;
    const bottom = (height - m.f) / m.d;
    return -(bottom / pixels) - 0.3;
  }

  private draw(
    ctx: CanvasRenderingContext2D,
    params: Ink2DParams,
    pixels: number,
    flowRadius: number
  ): void {
    const sim = this.sim;
    const palette = params.resolvedPalette;
    const pigment = hexToRgb(palette.pigment);
    const edge = hexToRgb(palette.edge);
    const spray = hexToRgb(palette.splatterTint);
    const glow = palette.emissive === true;
    const opacity = params.opacityMax;
    const shine = mixRgb(edge, [255, 255, 255], glow ? 0.75 : 0.55);
    const rim = mixRgb(edge, [255, 255, 255], 0.22);

    ctx.save();
    ctx.globalCompositeOperation = glow ? "lighter" : "source-over";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    this.strands = 0;
    for (let i = 0; i < sim.capacity; i++) {
      if (!sim.alive[i] || sim.newer[i]! >= 0) continue;
      const head = sim.isHead(i);
      if (!head && sim.older[i]! < 0) continue;
      const count = this.outline(i, head, pixels);
      if (count < 2) continue;
      this.strands++;
      if (glow) {
        // Light bleeds around a glowing strand before its core.
        this.fillStrand(ctx, count, 2.6, rgba(pigment, 0.13 * opacity));
        this.fillStrand(ctx, count, 1.6, rgba(pigment, 0.22 * opacity));
        this.fillStrand(ctx, count, 1, rgba(pigment, 0.85 * opacity));
        this.strokeSpine(ctx, count, 0, 0.42, rgba(shine, 0.75 * opacity));
        continue;
      }
      if (palette.watercolor) this.fillStrand(ctx, count, 1.7, rgba(pigment, 0.14 * opacity));
      this.fillStrand(ctx, count, 1, rgba(pigment, opacity));
      this.strokeOutline(ctx, count, rgba(rim, 0.3 * opacity), Math.max(0.6, pixels / 140));
      // The wet glint runs along the side facing the light.
      this.strokeSpine(ctx, count, 0.42, 0.3, rgba(shine, 0.55 * opacity));
    }

    this.drops = 0;
    for (let i = 0; i < sim.capacity; i++) {
      if (!sim.alive[i] || sim.newer[i]! >= 0 || sim.older[i]! >= 0 || sim.isHead(i)) continue;
      const radius = sphereRadius(sim.volume[i]!);
      const vx = sim.vx[i]!;
      const vy = sim.vy[i]!;
      const speed = Math.hypot(vx, vy);
      const shape = inkDropShape(radius, speed, sim.shapeAge[i]!);
      const angle = speed > 1e-4 ? Math.atan2(-vy, vx) : Math.PI / 2;
      const fine = 1 - smooth(0.35, 0.8, radius / Math.max(1e-4, flowRadius));
      this.drawDrop(
        ctx,
        sim.x[i]! * pixels,
        -sim.y[i]! * pixels,
        shape.along * pixels * THICKNESS,
        shape.across * pixels * THICKNESS,
        angle,
        mixRgb(pigment, spray, fine),
        shine,
        rim,
        opacity,
        glow
      );
      this.drops++;
    }
    // Drops hanging from a resting tip, drawn long by their weight.
    for (const source of sim.sources) {
      const radius = sphereRadius(source.drip);
      if (radius < 0.0015) continue;
      const sag = 1 + 0.35 * smooth(0.002, 0.0105, radius);
      this.drawDrop(
        ctx,
        source.x * pixels,
        -(source.y - radius * sag * 0.85) * pixels,
        radius * sag * pixels * THICKNESS,
        (radius / Math.sqrt(sag)) * pixels * THICKNESS,
        Math.PI / 2,
        pigment,
        shine,
        rim,
        opacity,
        glow
      );
    }
    ctx.restore();
  }

  /** Smoothed centerline of one strand in screen pixels, with radii. */
  private outline(newest: number, head: boolean, pixels: number): number {
    const sim = this.sim;
    let nodes = 0;
    const raw: number[] = [];
    if (head) {
      const source = sim.sources[sim.owner[newest]!]!;
      raw.push(source.x, source.y, sim.nodeRadius(newest) * 0.7);
      nodes++;
    }
    for (let p = newest; p >= 0; p = sim.older[p]!) {
      raw.push(sim.x[p]!, sim.y[p]!, sim.nodeRadius(p));
      nodes++;
    }
    const needed = (nodes - 1) * SUB + 1;
    if (this.px.length < needed) {
      const size = Math.max(needed, this.px.length * 2);
      this.px = new Float32Array(size);
      this.py = new Float32Array(size);
      this.pr = new Float32Array(size);
    }
    let count = 0;
    const at = (n: number, k: number) => raw[n * 3 + k]!;
    for (let s = 0; s < nodes - 1; s++) {
      const a = Math.max(0, s - 1);
      const d = Math.min(nodes - 1, s + 2);
      for (let k = 0; k < SUB; k++) {
        const t = k / SUB;
        this.px[count] = catmullRom(at(a, 0), at(s, 0), at(s + 1, 0), at(d, 0), t) * pixels;
        this.py[count] = -catmullRom(at(a, 1), at(s, 1), at(s + 1, 1), at(d, 1), t) * pixels;
        this.pr[count] = (at(s, 2) + (at(s + 1, 2) - at(s, 2)) * t) * pixels * THICKNESS;
        count++;
      }
    }
    if (nodes > 0) {
      this.px[count] = at(nodes - 1, 0) * pixels;
      this.py[count] = -at(nodes - 1, 1) * pixels;
      this.pr[count] = at(nodes - 1, 2) * pixels * THICKNESS;
      count++;
    }
    return count;
  }

  /** Fill the strand's body as one shape, with round ends. */
  private fillStrand(
    ctx: CanvasRenderingContext2D,
    count: number,
    widen: number,
    color: string
  ): void {
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let k = 0; k < count; k++) {
      const [nx, ny] = this.normalAt(k, count);
      const r = Math.max(0.35, this.pr[k]! * widen);
      if (k === 0) ctx.moveTo(this.px[k]! + nx * r, this.py[k]! + ny * r);
      else ctx.lineTo(this.px[k]! + nx * r, this.py[k]! + ny * r);
    }
    for (let k = count - 1; k >= 0; k--) {
      const [nx, ny] = this.normalAt(k, count);
      const r = Math.max(0.35, this.pr[k]! * widen);
      ctx.lineTo(this.px[k]! - nx * r, this.py[k]! - ny * r);
    }
    ctx.closePath();
    for (const k of [0, count - 1]) {
      const r = Math.max(0.35, this.pr[k]! * widen);
      ctx.moveTo(this.px[k]! + r, this.py[k]!);
      ctx.arc(this.px[k]!, this.py[k]!, r, 0, Math.PI * 2);
    }
    ctx.fill("nonzero");
  }

  private strokeOutline(
    ctx: CanvasRenderingContext2D,
    count: number,
    color: string,
    width: number
  ): void {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    for (const sign of [1, -1]) {
      ctx.beginPath();
      for (let k = 0; k < count; k++) {
        const [nx, ny] = this.normalAt(k, count);
        const r = this.pr[k]! * sign;
        if (k === 0) ctx.moveTo(this.px[k]! + nx * r, this.py[k]! + ny * r);
        else ctx.lineTo(this.px[k]! + nx * r, this.py[k]! + ny * r);
      }
      ctx.stroke();
    }
  }

  /**
   * A line along the strand, shifted toward the light by `offset` of its
   * radius and `width` of its diameter wide, as a highlight on a round body.
   */
  private strokeSpine(
    ctx: CanvasRenderingContext2D,
    count: number,
    offset: number,
    width: number,
    color: string
  ): void {
    ctx.strokeStyle = color;
    for (let k = 0; k < count - 1; k++) {
      const [nx, ny] = this.normalAt(k, count);
      const toward = nx * LIGHT_X + ny * LIGHT_Y >= 0 ? 1 : -1;
      const r = this.pr[k]!;
      const r2 = this.pr[k + 1]!;
      ctx.lineWidth = Math.max(0.4, (r + r2) * width);
      ctx.beginPath();
      ctx.moveTo(this.px[k]! + nx * r * offset * toward, this.py[k]! + ny * r * offset * toward);
      ctx.lineTo(
        this.px[k + 1]! + nx * r2 * offset * toward,
        this.py[k + 1]! + ny * r2 * offset * toward
      );
      ctx.stroke();
    }
  }

  private normalAt(k: number, count: number): [number, number] {
    const a = Math.max(0, k - 1);
    const b = Math.min(count - 1, k + 1);
    const tx = this.px[b]! - this.px[a]!;
    const ty = this.py[b]! - this.py[a]!;
    const length = Math.hypot(tx, ty);
    if (length < 1e-6) return [0, 1];
    return [-ty / length, tx / length];
  }

  private drawDrop(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    along: number,
    across: number,
    angle: number,
    body: Rgb,
    shine: Rgb,
    rim: Rgb,
    opacity: number,
    glow: boolean
  ): void {
    const a = Math.max(0.5, along);
    const c = Math.max(0.5, across);
    if (glow) {
      ctx.fillStyle = rgba(body, 0.16 * opacity);
      ctx.beginPath();
      ctx.ellipse(x, y, a * 2.4, c * 2.4, angle, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = rgba(body, (glow ? 0.85 : 1) * opacity);
    ctx.beginPath();
    ctx.ellipse(x, y, a, c, angle, 0, Math.PI * 2);
    ctx.fill();
    if (!glow && c > 1.2) {
      ctx.strokeStyle = rgba(rim, 0.28 * opacity);
      ctx.lineWidth = 0.75;
      ctx.stroke();
    }
    if (c > 1) {
      const glint = Math.min(a, c) * 0.42;
      ctx.fillStyle = rgba(shine, (glow ? 0.8 : 0.6) * opacity);
      ctx.beginPath();
      ctx.ellipse(x + LIGHT_X * c * 0.38, y + LIGHT_Y * c * 0.38, glint, glint * 0.7, angle, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function isEndEnabled(end: "A" | "B", params: Ink2DParams): boolean {
  if (params.trackingMode === "both_ends") return true;
  return params.trackingMode === "left_end" ? end === "A" : end === "B";
}

function smooth(edge0: number, edge1: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
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

function hexToRgb(hex: string): Rgb {
  const raw = hex.trim().replace(/^#/, "");
  const full =
    raw.length === 3
      ? raw
          .split("")
          .map((c) => c + c)
          .join("")
      : raw.slice(0, 6).padEnd(6, "0");
  const value = parseInt(full, 16);
  if (!Number.isFinite(value)) return [10, 10, 10];
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function rgba(color: Rgb, alpha: number): string {
  return `rgba(${Math.round(color[0])},${Math.round(color[1])},${Math.round(color[2])},${Math.min(1, Math.max(0, alpha)).toFixed(3)})`;
}
