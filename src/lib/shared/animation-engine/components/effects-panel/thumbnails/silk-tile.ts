/**
 * Silk portrait. One ribbon on the sweep the prop just made: free tail
 * lower-left, the hand upper-right. The trail is recorded the way the renderer
 * records it (one sample per spacing, speed rising toward the head) and kept
 * to the length the preset's duration allows, then the renderer's own width
 * envelope, path smoothing, centripetal tracing and material colors build the
 * cloth: flutter waves and gravity sag through the free end, a fold shadow and
 * sheen inside, a lit selvedge and a shaded one. Shadow palettes sit on a lit
 * ground so the dark cloth reads. The renderer keeps its per-material alphas
 * private, so this file carries a copy of that table. Ported from the
 * approved reference page (spec reference/silk-draw.js).
 */
import type { EffectConfigMap } from "#lib/shared/effects/state/effects-config-state.svelte.js";
import { DEFAULT_EFFECTS_CONFIG } from "#lib/shared/effects/domain/defaults.js";
import {
  type SilkPalette,
  resolveSilkPalette,
} from "#lib/shared/effects/domain/silk-palettes.js";
import {
  resolveSilk2DMaterialColors,
  resolveSilk2DSampleSpacing,
  resolveSilk2DWidthEnvelope,
  smoothSilk2DPath,
} from "#lib/shared/effects/renderers/silk-2d-renderer.js";
import {
  traceCentripetalBackward,
  traceCentripetalForward,
} from "#lib/shared/effects/renderers/ribbon-trace.js";
import {
  blob,
  clamp01,
  css,
  cssToRgb,
  ground,
  hexToRgb,
  lcg,
  mix,
  smoothstep,
} from "./tile-paint";

export type SilkIntent = EffectConfigMap["silk"];
export const SILK_TILE_SEED = 0x5117;

const TAU = Math.PI * 2;
const SCALE = 2;
/** Frozen wave clock. */
const TIME = 3.7;
const AURA_STRIDE = 8;
const MAX_SAMPLES = 96;

interface MaterialProfile {
  bodyAlpha: number;
  glowAlpha: number;
  edgeAlpha: number;
  foldStrength: number;
  sheenAlpha: number;
  sheenWidth: number;
}

/** Copy of the renderer's private `MATERIAL_PROFILES` alphas (silk-2d-renderer.ts). */
const PROFILES: Record<string, MaterialProfile> = {
  satin: { bodyAlpha: 0.9, glowAlpha: 0.02, edgeAlpha: 0.14, foldStrength: 0.24, sheenAlpha: 0.21, sheenWidth: 1.35 },
  velvet: { bodyAlpha: 0.94, glowAlpha: 0.018, edgeAlpha: 0.22, foldStrength: 0.3, sheenAlpha: 0.08, sheenWidth: 0.9 },
  ethereal: { bodyAlpha: 0.62, glowAlpha: 0.12, edgeAlpha: 0.38, foldStrength: 0.22, sheenAlpha: 0.18, sheenWidth: 0.68 },
  shadow: { bodyAlpha: 0.72, glowAlpha: 0.01, edgeAlpha: 0.24, foldStrength: 0.34, sheenAlpha: 0.05, sheenWidth: 0.82 },
  gold_leaf: { bodyAlpha: 0.96, glowAlpha: 0.03, edgeAlpha: 0.34, foldStrength: 0.32, sheenAlpha: 0.3, sheenWidth: 0.64 },
  ember: { bodyAlpha: 0.8, glowAlpha: 0.18, edgeAlpha: 0.38, foldStrength: 0.24, sheenAlpha: 0.22, sheenWidth: 0.7 },
};

/** The sweep: free tail lower-left, prop (head) upper-right. */
const KNOTS: ReadonlyArray<readonly [number, number]> = [
  [380, 150],
  [430, 110],
  [400, 60],
  [320, 60],
  [270, 120],
  [290, 200],
  [380, 240],
  [500, 225],
  [600, 160],
  [660, 80],
  [690, 40],
];

interface Sample {
  x: number;
  y: number;
  pathDistance: number;
  speed: number;
}

function clamp(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v));
}

function signedTurn(x: number[], y: number[], i: number): number {
  if (i <= 0 || i >= x.length - 1) return 0;
  let ax = x[i]! - x[i - 1]!;
  let ay = y[i]! - y[i - 1]!;
  let bx = x[i + 1]! - x[i]!;
  let by = y[i + 1]! - y[i]!;
  const al = Math.hypot(ax, ay);
  const bl = Math.hypot(bx, by);
  if (al < 0.001 || bl < 0.001) return 0;
  ax /= al;
  ay /= al;
  bx /= bl;
  by /= bl;
  return ax * by - ay * bx;
}

function mixColors(a: string, b: string, t: number): string {
  return css(mix(cssToRgb(a), cssToRgb(b), t), 1);
}

function catmull(i: number, t: number): { x: number; y: number } {
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

/** Record the sweep as the renderer would: one sample every spacing, then keep only the length duration allows. */
function recordTrail(duration: number): Sample[] {
  const fine: { x: number; y: number }[] = [];
  for (let i = 0; i < KNOTS.length - 1; i++) {
    for (let k = 0; k < 60; k++) fine.push(catmull(i, k / 60));
  }
  fine.push(catmull(KNOTS.length - 2, 1));
  const spacing = resolveSilk2DSampleSpacing(SCALE);
  const samples: Sample[] = [];
  let acc = 0;
  let dist = 0;
  for (let i = 1; i < fine.length; i++) {
    const cur = fine[i]!;
    const prev = fine[i - 1]!;
    acc += Math.hypot(cur.x - prev.x, cur.y - prev.y);
    if (acc >= spacing || samples.length === 0) {
      acc = 0;
      dist += spacing;
      samples.push({ x: cur.x, y: cur.y, pathDistance: dist, speed: 0 });
    }
  }
  // Tip speed as recorded (world units/s over 60·scale): slow leaving the tail, fast at the head.
  const last = samples.length - 1;
  samples.forEach((s, i) => {
    s.speed = 3.0 * (0.15 + 0.85 * Math.pow(i / last, 1.4));
  });
  // Duration sets how much of the gesture the tail reaches: 60% at the shortest, all of it at the longest.
  const total = samples[last]!.pathDistance - samples[0]!.pathDistance;
  const maxLen = total * (0.6 + 0.4 * duration);
  while (
    samples.length > 2 &&
    samples[samples.length - 1]!.pathDistance - samples[0]!.pathDistance > maxLen
  ) {
    samples.shift();
  }
  return samples.slice(-MAX_SAMPLES);
}

function drawRibbon(
  ctx: CanvasRenderingContext2D,
  intent: SilkIntent,
  palette: SilkPalette,
  propColor: string,
  samples: Sample[],
  phase: number
): void {
  const profile = PROFILES[palette.id] ?? PROFILES.satin!;
  // Translator numbers: 5-30px half width, 0.5-4.0s life, world speed reference.
  const baseHalfWidth = 5 + intent.width * 25;
  const motionReferenceSpeed = 3.0;
  const n = samples.length;
  if (n < 3) return;
  const basePath = smoothSilk2DPath(samples.map((s) => ({ x: s.x, y: s.y })));
  const leftX: number[] = [];
  const leftY: number[] = [];
  const rightX: number[] = [];
  const rightY: number[] = [];
  const spineX: number[] = [];
  const spineY: number[] = [];
  const halfWidths: number[] = [];
  const sheenAcross: number[] = [];
  const shadowAcross: number[] = [];
  let lastTx = 1;
  let lastTy = 0;
  let maxHalfWidth = 1;
  for (let i = 0; i < n; i++) {
    const sample = samples[i]!;
    const pi = Math.max(0, i - 2);
    const ni = Math.min(n - 1, i + 2);
    let tx = basePath.x[ni]! - basePath.x[pi]!;
    let ty = basePath.y[ni]! - basePath.y[pi]!;
    const tl = Math.hypot(tx, ty);
    if (tl > 0.001) {
      tx /= tl;
      ty /= tl;
      lastTx = tx;
      lastTy = ty;
    } else {
      tx = lastTx;
      ty = lastTy;
    }
    const px = -ty;
    const py = tx;
    const speedFraction = clamp01(sample.speed / motionReferenceSpeed);
    const positionFraction = i / (n - 1);
    const freeEnd = Math.pow(1 - positionFraction, 0.72);
    const tautWidth = 1 - speedFraction * intent.tautness * 0.58;
    const widthEnvelope = resolveSilk2DWidthEnvelope(positionFraction);
    const turn = clamp(signedTurn(basePath.x, basePath.y, i), -0.45, 0.45);
    const flutterEnergy = (0.3 + speedFraction * 0.7) * (1 - intent.tautness * 0.42);
    const flutterAmplitude = intent.flutter * SCALE * (8 + flutterEnergy * 32);
    const pathCoordinate = sample.pathDistance / SCALE;
    const waveA = Math.sin(
      pathCoordinate * 0.018 - TIME * (0.38 + speedFraction * 0.5) + phase
    );
    const waveB = Math.sin(pathCoordinate * 0.0085 + TIME * 0.19 + phase * 1.7);
    const centerFlutter =
      (waveA + waveB * 0.42) *
        flutterAmplitude *
        freeEnd *
        (0.3 + smoothstep(0, 0.1, positionFraction) * 0.7) +
      turn * intent.flutter * 7 * SCALE * freeEnd;
    const gravitySag =
      baseHalfWidth *
      SCALE *
      (0.16 + intent.flutter * 2.4) *
      (1 - intent.tautness * 0.55) *
      Math.pow(freeEnd, 1.45);
    const foldWave = Math.sin(pathCoordinate * 0.026 + TIME * 0.28 + phase * 1.31);
    const minimumHalfWidth = (0.04 + smoothstep(0, 0.16, positionFraction) * 0.5) * SCALE;
    const widthBillow =
      1 + (waveA * 0.7 + waveB * 0.3) * intent.flutter * (0.18 + freeEnd * 0.2);
    const clothVolume = 1.16 + intent.flutter * 0.28;
    const halfWidth = Math.max(
      minimumHalfWidth,
      baseHalfWidth *
        SCALE *
        intent.intensity *
        tautWidth *
        widthEnvelope *
        widthBillow *
        clothVolume
    );
    halfWidths[i] = halfWidth;
    maxHalfWidth = Math.max(maxHalfWidth, halfWidth);
    const fold = foldWave * halfWidth * intent.flutter * 0.52 * freeEnd * profile.foldStrength;
    const lw = Math.max(minimumHalfWidth, halfWidth + fold);
    const rw = Math.max(minimumHalfWidth, halfWidth - fold);
    sheenAcross[i] = clamp(0.64 + foldWave * intent.flutter * 0.22 + turn * 0.18, 0.42, 0.82);
    shadowAcross[i] = clamp(0.27 - foldWave * intent.flutter * 0.18 - turn * 0.12, 0.12, 0.46);
    spineX[i] = basePath.x[i]! + px * centerFlutter;
    spineY[i] = basePath.y[i]! + py * centerFlutter + gravitySag;
    leftX[i] = spineX[i]! + px * lw;
    leftY[i] = spineY[i]! + py * lw;
    rightX[i] = spineX[i]! - px * rw;
    rightY[i] = spineY[i]! - py * rw;
  }
  const leftEdge = smoothSilk2DPath(leftX.map((x, i) => ({ x, y: leftY[i]! })));
  const rightEdge = smoothSilk2DPath(rightX.map((x, i) => ({ x, y: rightY[i]! })));
  const across = (arr: number[]) =>
    smoothSilk2DPath(
      arr.map((a, i) => ({
        x: rightEdge.x[i]! + (leftEdge.x[i]! - rightEdge.x[i]!) * a,
        y: rightEdge.y[i]! + (leftEdge.y[i]! - rightEdge.y[i]!) * a,
      }))
    );
  const sheenPath = across(sheenAcross);
  const shadowPath = across(shadowAcross);
  const rep = resolveSilk2DMaterialColors(palette, propColor, 0.55);
  const ribbonAlpha = Math.sqrt(intent.intensity);

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (palette.emissive) ctx.globalCompositeOperation = "lighter";
  if (profile.glowAlpha > 0) {
    ctx.globalAlpha = profile.glowAlpha * ribbonAlpha;
    ctx.strokeStyle = rep.body;
    ctx.lineWidth = maxHalfWidth * (palette.emissive ? 2.8 : 2.15);
    ctx.beginPath();
    traceCentripetalForward(ctx, spineX, spineY, 0, n - 1, n);
    ctx.stroke();
  }
  if (palette.emissive) {
    ctx.globalAlpha = ribbonAlpha * 0.12;
    for (let i = 0; i < n; i += AURA_STRIDE) {
      const r = halfWidths[i]! * 3.2;
      const g = ctx.createRadialGradient(spineX[i]!, spineY[i]!, 0, spineX[i]!, spineY[i]!, r);
      g.addColorStop(0, rep.edge);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.beginPath();
      ctx.arc(spineX[i]!, spineY[i]!, r, 0, TAU);
      ctx.fillStyle = g;
      ctx.fill();
    }
  }
  const outline = () => {
    ctx.beginPath();
    traceCentripetalForward(ctx, leftEdge.x, leftEdge.y, 0, n - 1, n);
    traceCentripetalBackward(ctx, rightEdge.x, rightEdge.y, 0, n - 1, n);
    ctx.closePath();
  };
  ctx.globalAlpha = ribbonAlpha * profile.bodyAlpha;
  ctx.fillStyle = rep.body;
  outline();
  ctx.fill();

  ctx.save();
  outline();
  ctx.clip();
  ctx.filter = `blur(${Math.max(0.9, SCALE * 1.45)}px)`;
  ctx.globalAlpha = ribbonAlpha * (0.075 + profile.foldStrength * 0.26) * 1.6;
  ctx.strokeStyle = rep.shadow;
  ctx.lineWidth = Math.max(0.9 * SCALE, maxHalfWidth * 1.06);
  ctx.beginPath();
  traceCentripetalForward(ctx, shadowPath.x, shadowPath.y, 0, n - 1, n);
  ctx.stroke();
  ctx.globalAlpha = ribbonAlpha * profile.sheenAlpha * 1.5;
  ctx.strokeStyle = mixColors(rep.body, rep.edge, 0.5);
  ctx.lineWidth = Math.max(0.8 * SCALE, maxHalfWidth * profile.sheenWidth);
  ctx.beginPath();
  traceCentripetalForward(ctx, sheenPath.x, sheenPath.y, 0, n - 1, n);
  ctx.stroke();
  ctx.restore();

  let edgeStyle: string | CanvasGradient = rep.edge;
  if (palette.hueShift) {
    const g = ctx.createLinearGradient(spineX[0]!, spineY[0]!, spineX[n - 1]!, spineY[n - 1]!);
    g.addColorStop(0, resolveSilk2DMaterialColors(palette, propColor, 0).edge);
    g.addColorStop(0.5, rep.edge);
    g.addColorStop(1, resolveSilk2DMaterialColors(palette, propColor, 1).edge);
    edgeStyle = g;
  }
  ctx.globalAlpha = ribbonAlpha * profile.edgeAlpha * 0.55;
  ctx.strokeStyle = rep.shadow;
  ctx.lineWidth = 0.65 * SCALE;
  ctx.beginPath();
  traceCentripetalForward(ctx, rightEdge.x, rightEdge.y, 0, n - 1, n);
  ctx.stroke();
  ctx.globalAlpha = Math.min(1, ribbonAlpha * profile.edgeAlpha * 1.5);
  ctx.strokeStyle = edgeStyle;
  ctx.lineWidth = 0.7 * SCALE;
  ctx.beginPath();
  traceCentripetalForward(ctx, leftEdge.x, leftEdge.y, 0, n - 1, n);
  ctx.stroke();
  ctx.restore();
}

/**
 * The hand color the ribbon is dyed toward (satin is 82% prop color). The
 * picker knows the prop kind but not its colors, so every prop takes the
 * left hand's default trail blue, the color the props wear on the dark canvas.
 */
export function resolveSilkTilePropColor(_propType: string | null): string {
  return DEFAULT_EFFECTS_CONFIG.trails.leftColor;
}

export function paintSilkTile(
  ctx: CanvasRenderingContext2D,
  intent: SilkIntent,
  propColor: string
): void {
  const palette = resolveSilkPalette(intent);
  const body = hexToRgb(palette.body);
  const dark =
    0.2126 * body[0] + 0.7152 * body[1] + 0.0722 * body[2] < 0.1 &&
    !palette.emissive;
  ground(ctx, dark ? [0.3, 0.29, 0.34] : [0.03, 0.03, 0.045]);
  if (dark) blob(ctx, 380, 120, 400, 220, [0.68, 0.66, 0.74], 0.8);
  else {
    blob(
      ctx,
      400,
      130,
      340,
      180,
      hexToRgb(palette.edge),
      palette.emissive ? 0.16 : 0.06 + 0.04 * intent.intensity
    );
  }
  const rand = lcg(SILK_TILE_SEED);
  const samples = recordTrail(intent.duration);
  drawRibbon(ctx, intent, palette, propColor, samples, rand() * TAU);
}
