/**
 * Ink portrait. One loaded-brush swash recorded the way the renderer records
 * a tip: Catmull-Rom through a loop, sampled at 60 points/s with the speed
 * falling in the turn, so the stroke swells where the brush was pressed and
 * thins where it lifted. Every mark comes from the translator's resolved
 * material (stroke widths, lifetime, opacity) and the renderer's own pressure,
 * turn-load and broad-nib math; the fiber stamp is the renderer's
 * `BrushStampCache`. Splatter bursts fire at the sharpest turns, the oldest
 * ink shatters into drops when viscosity allows (never for blood), and neon
 * adds its own glow pass. Dark pigments sit on a lit ground. Ported from the
 * approved reference page (spec reference/ink.html).
 */
import type { EffectConfigMap } from "#lib/shared/effects/state/effects-config-state.svelte.js";
import type { Ink2DParams } from "#lib/shared/effects/translators/canvas2d-types.js";
import { resolveInk2D } from "#lib/shared/effects/translators/canvas2d-translator.js";
import {
  BrushStampCache,
  resolveInkNibWidth,
  resolveInkStrokeWidth,
  resolveInkTurnLoad,
} from "#lib/shared/effects/renderers/ink-2d-renderer.js";
import {
  TILE_H,
  TILE_W,
  WHITE,
  blob,
  css,
  ground,
  hexToRgb,
  lcg,
  mix,
  smoothstep,
} from "./tile-paint";

export type InkIntent = EffectConfigMap["ink"];
export const INK_TILE_SEED = 0x1a4b;

type Rand = () => number;
interface Pt {
  x: number;
  y: number;
}

const TAU = Math.PI * 2;
const SCALE = 2.6;
const CENTER: Pt = { x: TILE_W / 2, y: TILE_H / 2 };
/** Renderer constants the tile keeps its own copies of. */
const FADE_FRACTION = 0.6;
const INK_WET_LENGTH_PX = 110;
const DROPLET_DRIFT_PX = 30;
const GRAVITY = 180;
const STAMP_HALF = 32;
const STAMP_R = 64 * 0.42;

const STAMPS = new BrushStampCache();

interface Params {
  readonly p: Ink2DParams;
  readonly emissive: boolean;
  readonly blood: boolean;
  readonly lifetime: number;
  readonly peakAlpha: number;
}

interface StrokePoint {
  x: number;
  y: number;
  spawnSpeedPx: number;
  tangentAngle: number;
  sequence: number;
  jitterSeed: number;
  materialSeed: number;
  age: number;
}

interface RibbonPoint {
  x: number;
  y: number;
  nx: number;
  ny: number;
  width: number;
  fade: number;
  wet: number;
  sequence: number;
  materialSeed: number;
  seed: number;
}

interface Droplet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  maxAge: number;
  radius: number;
  seed: number;
  kind: "splatter" | "breakup";
}

function jitterHash(seed: number, channel: number): number {
  let h = ((seed * 1000000) | 0) + channel * 374761393;
  h = ((h ^ (h >> 13)) * 1103515245) | 0;
  return (h & 0x7fffffff) / 0x7fffffff;
}

function pointFade(age: number, life: number): number {
  const t = age / life;
  return t > FADE_FRACTION ? Math.max(0, (1 - t) / (1 - FADE_FRACTION)) : 1;
}

function mixWithWhite(hex: string, k: number): string {
  return css(mix(hexToRgb(hex), WHITE, k), 1);
}

function isDark(hex: string): boolean {
  const [r, g, b] = hexToRgb(hex);
  return r * 0.2126 + g * 0.7152 + b * 0.0722 < 0.22;
}

function strokeWidth(P: Params, speedPx: number): number {
  return resolveInkStrokeWidth(P.p, speedPx, SCALE);
}

// --- The swash: Catmull-Rom through a loop, sampled at the renderer's 60 points/s ---

const KNOTS: ReadonlyArray<readonly [number, number]> = [
  [60, 215],
  [150, 175],
  [250, 85],
  [360, 110],
  [370, 205],
  [290, 225],
  [265, 150],
  [330, 75],
  [470, 60],
  [600, 95],
  [680, 150],
];

function catmull(i: number, t: number): Pt {
  const p0 = KNOTS[Math.max(0, i - 1)]!;
  const p1 = KNOTS[i]!;
  const p2 = KNOTS[Math.min(KNOTS.length - 1, i + 1)]!;
  const p3 = KNOTS[Math.min(KNOTS.length - 1, i + 2)]!;
  const t2 = t * t;
  const t3 = t2 * t;
  const f = (a: number, b: number, c: number, d: number) =>
    0.5 *
    (2 * b +
      (-a + c) * t +
      (2 * a - 5 * b + 4 * c - d) * t2 +
      (-a + 3 * b - 3 * c + d) * t3);
  return { x: f(p0[0], p1[0], p2[0], p3[0]), y: f(p0[1], p1[1], p2[1], p3[1]) };
}

function densePath(): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < KNOTS.length - 1; i++) {
    for (let k = 0; k < 40; k++) out.push(catmull(i, k / 40));
  }
  out.push(catmull(KNOTS.length - 2, 1));
  return out;
}

/** Sample the swash as the tip would have been recorded: spacing follows speed, slow in the loop. */
function recordStroke(P: Params, rand: Rand): StrokePoint[] {
  const fine = densePath();
  const curv = fine.map((_, i) =>
    resolveInkTurnLoad(
      fine[Math.max(0, i - 6)]!,
      fine[i]!,
      fine[Math.min(fine.length - 1, i + 6)]!
    )
  );
  const pts: StrokePoint[] = [];
  let acc = 0;
  let seq = 0;
  const baseSpeed = 150 * SCALE;
  for (let i = 1; i < fine.length; i++) {
    const cur = fine[i]!;
    const prev = fine[i - 1]!;
    acc += Math.hypot(cur.x - prev.x, cur.y - prev.y);
    const speed =
      baseSpeed * (1 - curv[i]! * 0.62) * (0.9 + 0.2 * Math.sin(i * 0.11));
    const spacing = speed / 60;
    if (acc >= spacing || pts.length === 0) {
      acc = 0;
      const a = fine[Math.max(0, i - 3)]!;
      const c = fine[Math.min(fine.length - 1, i + 3)]!;
      pts.push({
        x: cur.x,
        y: cur.y,
        spawnSpeedPx: speed,
        tangentAngle: Math.atan2(c.y - a.y, c.x - a.x),
        sequence: seq++,
        jitterSeed: rand(),
        materialSeed: rand(),
        age: 0,
      });
    }
  }
  // Newest at the head (end of the path). Age runs back along the stroke.
  const n = pts.length;
  pts.forEach((p, i) => {
    p.age = (1 - i / (n - 1)) * P.lifetime * 0.78;
  });
  return pts;
}

function buildRibbon(
  points: StrokePoint[],
  P: Params,
  nibOn: boolean
): RibbonPoint[] {
  const cum: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    const a = points[i]!;
    const b = points[i - 1]!;
    cum[i] = cum[i - 1]! + Math.hypot(a.x - b.x, a.y - b.y);
  }
  const total = cum[cum.length - 1]!;
  const tailFade = Math.min(72 * SCALE, total * 0.24);
  const ribbon: RibbonPoint[] = points.map((pt, i) => {
    const prev = points[Math.max(0, i - 1)]!;
    const next = points[Math.min(points.length - 1, i + 1)]!;
    const tp = points[Math.max(0, i - 4)]!;
    const tn = points[Math.min(points.length - 1, i + 4)]!;
    let dx = next.x - prev.x;
    let dy = next.y - prev.y;
    const l = Math.hypot(dx, dy);
    if (l < 0.001) {
      dx = Math.cos(pt.tangentAngle);
      dy = Math.sin(pt.tangentAngle);
    } else {
      dx /= l;
      dy /= l;
    }
    const widthNoise = 0.84 + jitterHash(pt.jitterSeed, 4) * 0.3;
    const load = resolveInkTurnLoad(tp, pt, tn);
    const fade =
      pointFade(pt.age, P.lifetime) * smoothstep(0, tailFade, cum[i]!);
    const nib = nibOn
      ? resolveInkNibWidth(pt, tn.x - tp.x, tn.y - tp.y, CENTER, SCALE)
      : 1;
    const wet =
      (1 - smoothstep(0, INK_WET_LENGTH_PX * SCALE, total - cum[i]!)) *
      (1 - smoothstep(0.35, 1.1, pt.age));
    return {
      x: pt.x,
      y: pt.y,
      nx: -dy,
      ny: dx,
      width:
        Math.max(0.75 * SCALE, strokeWidth(P, pt.spawnSpeedPx)) *
        widthNoise *
        nib *
        (1 + load * 0.42),
      fade,
      wet,
      sequence: pt.sequence,
      materialSeed: pt.materialSeed,
      seed: pt.jitterSeed,
    };
  });
  for (let i = 1; i < ribbon.length; i++) {
    const pw = ribbon[i - 1]!.width;
    ribbon[i]!.width = Math.max(
      pw / 1.42,
      Math.min(pw * 1.42, ribbon[i]!.width)
    );
  }
  for (const r of ribbon) r.width *= Math.sqrt(Math.max(0, r.fade));
  return ribbon;
}

function segmentedPass(
  ctx: CanvasRenderingContext2D,
  ribbon: RibbonPoint[],
  color: string,
  wf: number,
  alpha: number,
  composite: GlobalCompositeOperation,
  channel: number
): void {
  ctx.save();
  ctx.globalCompositeOperation = composite;
  ctx.fillStyle = color;
  for (let i = 0; i < ribbon.length - 1; i++) {
    const s = ribbon[i]!;
    const e = ribbon[i + 1]!;
    const sh = s.width * wf * 0.5;
    const eh = e.width * wf * 0.5;
    const on = 0.66 + jitterHash((s.seed + e.seed) * 0.5, channel) * 0.42;
    ctx.globalAlpha = alpha * (s.fade + e.fade) * 0.5 * on;
    if (ctx.globalAlpha <= 0.003) continue;
    ctx.beginPath();
    ctx.moveTo(s.x + s.nx * sh, s.y + s.ny * sh);
    ctx.lineTo(e.x + e.nx * eh, e.y + e.ny * eh);
    ctx.lineTo(e.x - e.nx * eh, e.y - e.ny * eh);
    ctx.lineTo(s.x - s.nx * sh, s.y - s.ny * sh);
    ctx.closePath();
    ctx.fill();
  }
  const nw = ribbon[ribbon.length - 1]!;
  ctx.globalAlpha = alpha * nw.fade * 0.82;
  ctx.beginPath();
  ctx.arc(nw.x, nw.y, nw.width * wf * 0.5, 0, TAU);
  ctx.fill();
  ctx.restore();
}

interface RibbonPassOptions {
  offsetFactor?: number;
  noiseChannel?: number;
  breakThreshold?: number;
  chunkSize?: number;
  wetOnly?: boolean;
}

function ribbonPass(
  ctx: CanvasRenderingContext2D,
  ribbon: RibbonPoint[],
  color: string,
  wf: number,
  alpha: number,
  composite: GlobalCompositeOperation,
  o: RibbonPassOptions = {}
): void {
  const offsetFactor = o.offsetFactor ?? 0;
  const channel = o.noiseChannel ?? 5;
  const breakThreshold = o.breakThreshold ?? 0;
  const chunkSize = Math.max(2, o.chunkSize ?? 8);
  const wetOnly = o.wetOnly ?? false;
  ctx.save();
  ctx.globalCompositeOperation = composite;
  ctx.fillStyle = color;
  const last = ribbon.length - 1;
  const off = (r: RibbonPoint, sign: number) =>
    r.width * offsetFactor + sign * r.width * wf * 0.5;
  for (let si = 0; si < last; ) {
    const chunkId = Math.floor(ribbon[si]!.sequence / chunkSize);
    let ei = si + 1;
    while (ei < last && Math.floor(ribbon[ei]!.sequence / chunkSize) === chunkId) {
      ei++;
    }
    const s = ribbon[si]!;
    const e = ribbon[ei]!;
    const grain = jitterHash(chunkId + s.materialSeed * 4096, channel);
    if (grain >= breakThreshold) {
      let lf = 0;
      for (let i = si; i <= ei; i++) {
        const r = ribbon[i]!;
        lf += r.fade * (wetOnly ? r.wet : 1);
      }
      lf /= ei - si + 1;
      ctx.globalAlpha = alpha * lf * (0.82 + grain * 0.18);
      if (ctx.globalAlpha > 0.003) {
        ctx.beginPath();
        ctx.moveTo(s.x + s.nx * off(s, 1), s.y + s.ny * off(s, 1));
        for (let i = si + 1; i < ei; i++) {
          const p = ribbon[i]!;
          const n = ribbon[i + 1]!;
          const px = p.x + p.nx * off(p, 1);
          const py = p.y + p.ny * off(p, 1);
          const nx = n.x + n.nx * off(n, 1);
          const ny = n.y + n.ny * off(n, 1);
          ctx.quadraticCurveTo(px, py, (px + nx) * 0.5, (py + ny) * 0.5);
        }
        ctx.lineTo(e.x + e.nx * off(e, 1), e.y + e.ny * off(e, 1));
        ctx.lineTo(e.x + e.nx * off(e, -1), e.y + e.ny * off(e, -1));
        for (let i = ei - 1; i > si; i--) {
          const p = ribbon[i]!;
          const n = ribbon[i - 1]!;
          const px = p.x + p.nx * off(p, -1);
          const py = p.y + p.ny * off(p, -1);
          const nx = n.x + n.nx * off(n, -1);
          const ny = n.y + n.ny * off(n, -1);
          ctx.quadraticCurveTo(px, py, (px + nx) * 0.5, (py + ny) * 0.5);
        }
        ctx.lineTo(s.x + s.nx * off(s, -1), s.y + s.ny * off(s, -1));
        ctx.closePath();
        ctx.fill();
      }
    }
    si = ei;
  }
  ctx.restore();
}

/** Fiber grain clipped to the ink, from the renderer's own brush stamp. */
function drawGranulation(
  ctx: CanvasRenderingContext2D,
  P: Params,
  points: StrokePoint[],
  stamp: CanvasImageSource
): void {
  ctx.save();
  ctx.globalCompositeOperation = "source-atop";
  for (let i = 0; i < points.length; i += 2) {
    const pt = points[i]!;
    const fade = pointFade(pt.age, P.lifetime);
    if (fade <= 0.01) continue;
    const w = strokeWidth(P, pt.spawnSpeedPx);
    const ss =
      Math.max(0.08, (w / (STAMP_R * 2)) * 1.1) *
      (1 + (jitterHash(pt.jitterSeed, 6) - 0.5) * 0.2);
    ctx.globalAlpha = fade * 0.12;
    ctx.save();
    ctx.translate(pt.x, pt.y);
    ctx.rotate(pt.tangentAngle + (jitterHash(pt.jitterSeed, 7) - 0.5) * 0.12);
    ctx.scale(ss * 1.7, ss);
    ctx.drawImage(stamp, -STAMP_HALF, -STAMP_HALF);
    ctx.restore();
  }
  ctx.restore();
}

function drawBristles(
  ctx: CanvasRenderingContext2D,
  P: Params,
  points: StrokePoint[]
): void {
  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  ctx.strokeStyle = "#000";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(0.45, 0.8 * SCALE);
  ctx.globalAlpha = 0.11;
  for (let strand = -1; strand <= 1; strand++) {
    ctx.beginPath();
    points.forEach((pt, i) => {
      const w = strokeWidth(P, pt.spawnSpeedPx);
      const off =
        strand * w * 0.16 +
        (jitterHash(pt.jitterSeed, 12 + strand) - 0.5) * w * 0.12;
      const na = pt.tangentAngle + Math.PI / 2;
      const x = pt.x + Math.cos(na) * off;
      const y = pt.y + Math.sin(na) * off;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }
  ctx.restore();
}

function bloodChip(
  ctx: CanvasRenderingContext2D,
  radius: number,
  stretch: number,
  seed: number
): void {
  const tip = (jitterHash(seed, 21) - 0.5) * radius * 0.46;
  const left = radius * (0.58 + jitterHash(seed, 22) * 0.28);
  const right = radius * (0.54 + jitterHash(seed, 23) * 0.32);
  const front = radius * stretch * (1.05 + jitterHash(seed, 24) * 0.24);
  const tail = radius * stretch * (0.72 + jitterHash(seed, 25) * 0.2);
  ctx.beginPath();
  ctx.moveTo(tip, -front);
  ctx.bezierCurveTo(
    right * 0.72,
    -radius * 0.62,
    right,
    radius * 0.08,
    right * 0.52,
    tail * 0.58
  );
  ctx.quadraticCurveTo(0, tail, -left * 0.62, tail * 0.5);
  ctx.bezierCurveTo(
    -left,
    radius * 0.04,
    -left * 0.68,
    -radius * 0.58,
    tip,
    -front
  );
  ctx.closePath();
  ctx.fill();
}

function drawDroplets(
  ctx: CanvasRenderingContext2D,
  P: Params,
  drops: Droplet[]
): void {
  const pal = P.p.resolvedPalette;
  ctx.save();
  ctx.globalCompositeOperation = P.emissive ? "lighter" : "source-over";
  for (const d of drops) {
    const fade = pointFade(d.age, d.maxAge);
    const speed = Math.hypot(d.vx, d.vy);
    const stretch = 1 + Math.min(1.7, speed / 190);
    const rot = Math.atan2(d.vy, d.vx) - Math.PI / 2;
    ctx.save();
    ctx.translate(d.x, d.y);
    ctx.rotate(rot);
    ctx.globalAlpha = P.peakAlpha * fade * 0.2;
    ctx.fillStyle = pal.edge;
    if (P.blood) bloodChip(ctx, d.radius * 1.14, stretch * 1.08, d.seed);
    else {
      ctx.save();
      ctx.scale(1.45, stretch * 1.25);
      ctx.beginPath();
      ctx.arc(0, 0, d.radius, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = P.peakAlpha * fade * (d.kind === "splatter" ? 0.9 : 0.78);
    ctx.fillStyle = d.kind === "splatter" ? pal.splatterTint : pal.pigment;
    if (P.blood) bloodChip(ctx, d.radius, stretch, d.seed);
    else {
      ctx.scale(0.72, stretch);
      ctx.beginPath();
      ctx.arc(0, 0, d.radius, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }
  ctx.restore();
}

/** Splatter bursts at the sharpest turns: the renderer fires on acceleration spikes. */
function droplets(P: Params, points: StrokePoint[], rand: Rand): Droplet[] {
  const out: Droplet[] = [];
  const loads = points.map((_, i) =>
    resolveInkTurnLoad(
      points[Math.max(0, i - 4)]!,
      points[i]!,
      points[Math.min(points.length - 1, i + 4)]!
    )
  );
  const picks: number[] = [];
  for (let i = 4; i < points.length - 4; i++) {
    if (
      loads[i]! > 0.5 &&
      loads[i]! >= loads[i - 1]! &&
      loads[i]! >= loads[i + 1]! &&
      picks.every((k) => Math.abs(k - i) > 14)
    ) {
      picks.push(i);
    }
  }
  picks.sort((a, b) => loads[b]! - loads[a]!);
  const splatter = P.p.splatterIntensity;
  const energy = 0.6 + splatter * 0.4;
  for (const i of picks.slice(0, 3)) {
    const pt = points[i]!;
    const before = points[i - 4]!;
    const after = points[i + 4]!;
    const vbx = (pt.x - before.x) * 15;
    const vby = (pt.y - before.y) * 15;
    const vax = (after.x - pt.x) * 15;
    const vay = (after.y - pt.y) * 15;
    const fling = Math.atan2(-(vay - vby), -(vax - vbx));
    const count = Math.max(
      1,
      Math.round((2 + splatter * 8) * (0.35 + energy * 0.65))
    );
    const cone = 0.45 + splatter * 1.7;
    const burst = (42 + splatter * 150) * SCALE;
    for (let k = 0; k < count; k++) {
      const seed = pt.materialSeed + k * 0.17320508075;
      const ang = fling + (jitterHash(seed, 0) - 0.5) * cone;
      const sp = burst * (0.55 + jitterHash(seed, 1) * 0.8);
      const maxAge =
        (0.35 + jitterHash(seed, 2) * 0.55) * (0.75 + splatter * 0.25);
      const age = Math.min(maxAge * 0.85, pt.age + 0.05 + rand() * 0.2);
      const vx = vax * 0.12 + Math.cos(ang) * sp;
      const vy0 = vay * 0.12 + Math.sin(ang) * sp;
      out.push({
        x: pt.x + vx * age,
        y: pt.y + vy0 * age + 0.5 * GRAVITY * SCALE * age * age,
        vx,
        vy: vy0 + GRAVITY * SCALE * age,
        age,
        maxAge,
        radius: (1 + jitterHash(seed, 3) * 2.6) * SCALE * 0.8,
        seed,
        kind: "splatter",
      });
    }
  }
  return out;
}

/** The oldest stretch of ink shatters into drops when viscosity allows; blood never does. */
function breakupTail(
  P: Params,
  points: StrokePoint[],
  rand: Rand
): { kept: StrokePoint[]; drops: Droplet[] } {
  if (P.blood) return { kept: points, drops: [] };
  const cut = Math.round(points.length * P.p.viscosity * 0.42);
  const detached = points.slice(0, cut);
  const kept = points.slice(cut);
  const stride = 3 + Math.round(P.p.splatterIntensity * 2);
  const drops: Droplet[] = [];
  for (let i = 0; i < detached.length; i += stride) {
    const pt = detached[i]!;
    const age = Math.min(1.2, ((cut - i) / 60) * 1.6 + rand() * 0.1);
    const maxAge =
      1.5 *
      (0.7 + jitterHash(pt.jitterSeed, 9) * 0.6) *
      (0.48 + (1 - P.p.splatterIntensity) * 0.18);
    if (age >= maxAge) continue;
    const vx =
      (jitterHash(pt.jitterSeed, 8) - 0.5) * DROPLET_DRIFT_PX * 2 * SCALE;
    drops.push({
      x: pt.x + vx * age,
      y: pt.y + 0.5 * GRAVITY * SCALE * age * age,
      vx,
      vy: GRAVITY * SCALE * age,
      age,
      maxAge,
      radius: (2 + jitterHash(pt.jitterSeed, 10) * 4) * SCALE * 0.5,
      seed: pt.jitterSeed,
      kind: "breakup",
    });
  }
  return { kept, drops };
}

export function paintInkTile(
  ctx: CanvasRenderingContext2D,
  intent: InkIntent
): void {
  const p = resolveInk2D(intent);
  const pal = p.resolvedPalette;
  const emissive = pal.emissive === true;
  const P: Params = {
    p,
    emissive,
    blood: pal.id === "blood",
    lifetime: p.lifetimeSeconds,
    peakAlpha: Math.min(1, p.opacityMax * (0.48 + p.intensity * 0.52)),
  };
  const rand = lcg(INK_TILE_SEED);

  const darkStage = !emissive && isDark(pal.edge);
  ground(ctx, darkStage ? [0.3, 0.29, 0.33] : [0.03, 0.03, 0.045]);
  if (darkStage) blob(ctx, 360, 120, 380, 220, [0.66, 0.64, 0.7], 0.8);
  else if (emissive) {
    blob(
      ctx,
      330,
      140,
      360,
      170,
      hexToRgb(pal.pigment),
      0.12 + 0.1 * p.intensity
    );
  } else blob(ctx, 330, 140, 360, 170, hexToRgb(pal.pigment), 0.05);

  const all = recordStroke(P, rand);
  const { kept: points, drops: breakDrops } = breakupTail(P, all, rand);
  const ribbon = buildRibbon(points, P, !emissive);

  // The renderer draws ink on its own transparent layer so grain can clip to
  // it and bristles can cut it.
  const layer = document.createElement("canvas");
  layer.width = TILE_W;
  layer.height = TILE_H;
  const L = layer.getContext("2d")!;
  const A = P.peakAlpha;
  if (emissive) {
    ribbonPass(L, ribbon, pal.edge, 1.04, A * 0.12, "lighter", {
      noiseChannel: 39,
      chunkSize: 6,
    });
    ribbonPass(L, ribbon, pal.pigment, 0.68, A * 0.74, "lighter", {
      noiseChannel: 41,
      chunkSize: 5,
    });
    segmentedPass(
      L,
      ribbon,
      mixWithWhite(pal.edge, 0.55),
      0.32,
      A * 0.72,
      "lighter",
      43
    );
  } else {
    const edge = darkStage ? mixWithWhite(pal.edge, 0.22) : pal.edge;
    const pig = darkStage ? mixWithWhite(pal.pigment, 0.22) : pal.pigment;
    ribbonPass(
      L,
      ribbon,
      edge,
      1.02,
      A * (darkStage ? 0.06 : 0.05),
      "source-over",
      { noiseChannel: 45, chunkSize: 7 }
    );
    ribbonPass(L, ribbon, pig, 0.72, A * 0.82, "source-over", {
      noiseChannel: 47,
      chunkSize: 6,
    });
    segmentedPass(L, ribbon, pal.pigment, 0.52, A * 0.5, "source-over", 49);
    ribbonPass(
      L,
      ribbon,
      mixWithWhite(pal.edge, darkStage ? 0.8 : 0.62),
      0.16,
      A * (darkStage ? 0.72 : 0.58),
      "screen",
      {
        offsetFactor: 0.18,
        noiseChannel: 51,
        breakThreshold: 0.12,
        chunkSize: 3,
        wetOnly: true,
      }
    );
  }
  drawGranulation(L, P, points, STAMPS.get(p));
  drawBristles(L, P, points);
  drawDroplets(L, P, [...breakDrops, ...droplets(P, points, rand)]);

  if (emissive) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.filter = "blur(14px)";
    ctx.globalAlpha = 0.55;
    ctx.drawImage(layer, 0, 0);
    ctx.restore();
  }
  ctx.drawImage(layer, 0, 0);
}
