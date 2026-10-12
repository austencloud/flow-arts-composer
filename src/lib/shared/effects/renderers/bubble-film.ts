/**
 * Soap-film optics and motion for the Canvas2D bubbles.
 *
 * A port of the 3D bubble film (`3d/effects/bubbles/bubble-film-material-3d.ts`
 * and `bubble-art-direction-3d.ts`) so both backends show the same bubble:
 * thin-film interference colour from film thickness and view angle, a film
 * that drains with gravity and goes clear across the top just before it
 * bursts, a key highlight up-left with a soft bounce down-right, and a burst
 * that tears open from one point in the drained top. Motion follows the 3D
 * emitter too: new film briefly carries the prop's swing, then buoyancy wins,
 * and a fast bubble stretches along its flight before surface tension pulls
 * it round.
 *
 * Coordinates are unit-disc, canvas orientation (y down); the 3D shader's
 * y-up terms are flipped where they are read.
 */

import type { BubblePalette } from "../domain/bubble-palettes";

const TAU = Math.PI * 2;
const FILM_IOR = 1.34;
/** Red, green and blue sample wavelengths (nm), as in the 3D shader. */
const WAVELENGTHS_NM = [650, 510, 475] as const;

/** Burst length (s). Matches the 3D shell. */
export const BUBBLE_POP_SECONDS = 0.18;
/** Pixels per world unit, the 2D effects' shared conversion. */
export const BUBBLE_PX_PER_WORLD = 60;
/** Most of the prop's speed a new bubble may carry (world units/s), as in 3D. */
const MAX_INHERITED_SPEED = 0.8;
/** Share of a slow prop's speed a new bubble carries, as in 3D. */
const MAX_INHERITANCE = 0.22;
export const BUBBLE_MAX_DEFORMATION = 0.18;
export const BUBBLE_MIN_REBOUND_DEFORMATION = -0.035;

/** How a palette's film reads: its tint and how strongly colour shows. */
export interface BubbleFilmLook {
  /** RGB 0-1, the palette rim colour the film is tinted toward. */
  readonly tint: readonly [number, number, number];
  /** 0-1. Oil wears its interference openly (1); the rest at 0.62, as in 3D. */
  readonly filmStrength: number;
  /**
   * How much of the face between the rims shows its bands. A soap film
   * reflects a few percent of the light across its whole face, more where
   * its thickness reinforces a colour, so on a dark stage the swirls read
   * across the bubble, not only at the edge.
   */
  readonly face: number;
  /**
   * RGB 0-1 multiplier: the palette dyes the film. Pale palettes barely
   * touch it; a strong one (Acid) shifts every band toward its hue, so a
   * preset still reads as itself on a dark stage. Oil stays undyed.
   */
  readonly dye: readonly [number, number, number];
  /** 0-1: how far the dye also calms the bands toward one hue. */
  readonly calm: number;
  /** RGB 0-1, the highlight colour. */
  readonly highlight: readonly [number, number, number];
  /** Cache key. */
  readonly key: string;
}

export function resolveBubbleFilmLook(palette: BubblePalette): BubbleFilmLook {
  const tint = parseColor(palette.rim);
  const highlight = parseColor(palette.highlight);
  const filmStrength = palette.iridescent === true ? 1 : 0.62;
  // The palette's interior alpha says how present the film is meant to be
  // (Spirit is faint, Champagne dense); 0.22 is Soap's.
  const fillAlpha = parseAlpha(palette.fill);
  const face = 0.075 * Math.max(0.5, Math.min(1.3, fillAlpha / 0.22));
  const top = Math.max(tint[0], tint[1], tint[2], 0.001);
  const chroma = top - Math.min(tint[0], tint[1], tint[2]);
  const dyeWeight =
    palette.iridescent === true ? 0 : Math.min(0.9, chroma * 3.2);
  const dye: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    dye[i] = 1 + (tint[i]! / top - 1) * dyeWeight;
  }
  return {
    tint,
    filmStrength,
    face,
    dye,
    calm: dyeWeight * 0.35,
    highlight,
    key: `${palette.rim}|${palette.highlight}|${filmStrength}|${face.toFixed(3)}`,
  };
}

/**
 * Interference colour of a soap film `thicknessNm` thick seen at `facing`
 * (cosine of the view angle; 1 = face-on). Each channel is the reflectance
 * of its wavelength through the film's optical path, then pulled apart so
 * bands separate into colour instead of washing to grey.
 */
export function thinFilmSpectrum(
  thicknessNm: number,
  facing: number,
  out: [number, number, number] = [0, 0, 0]
): [number, number, number] {
  const f = clamp01(facing);
  const sinThetaSquared = Math.max(0, 1 - f * f);
  const cosFilm = Math.sqrt(
    Math.max(0, 1 - sinThetaSquared / (FILM_IOR * FILM_IOR))
  );
  let floor = 1;
  for (let i = 0; i < 3; i++) {
    const phase =
      (2 * TAU * FILM_IOR * thicknessNm * cosFilm) / WAVELENGTHS_NM[i]!;
    const v = 0.5 - 0.5 * Math.cos(phase);
    out[i] = v;
    if (v < floor) floor = v;
  }
  for (let i = 0; i < 3; i++) {
    out[i] = clamp01((out[i]! - floor * 0.48) * 1.28);
  }
  return out;
}

const spectrumScratch: [number, number, number] = [0, 0, 0];

/**
 * Film colour and opacity at unit-disc point (x, y) of a bubble at `life`
 * (0 = new, 1 = bursting). `seed` (0-1) sets where its eddies sit. Returns
 * straight (unpremultiplied) RGBA in 0-1; alpha is 0 outside the disc.
 */
export function sampleBubbleFilm(
  x: number,
  y: number,
  seed: number,
  life: number,
  look: BubbleFilmLook,
  out: [number, number, number, number] = [0, 0, 0, 0]
): [number, number, number, number] {
  const r2 = x * x + y * y;
  if (r2 > 1) {
    out[0] = out[1] = out[2] = out[3] = 0;
    return out;
  }
  const up = -y;
  const z = Math.sqrt(Math.max(0, 1 - r2));
  const edge = 1 - z;
  const grazing = Math.pow(edge, 2.15);
  const fresnel = 0.02 + 0.98 * Math.pow(edge, 5);

  // Eddies ride a film turned by the seed and slowly carried down by
  // drainage over the bubble's life.
  const turn = seed * TAU;
  const c = Math.cos(turn);
  const s = Math.sin(turn);
  const fx = c * x - s * up;
  const fy = s * x + c * up - life * 0.16;
  const flowA = Math.sin(fx * 4.7 + fy * 2.6 + seed * TAU);
  const flowB = Math.sin(-fx * 2.1 + fy * 5.3 + seed * 11.7);
  const eddy = 0.5 + flowA * 0.25 + flowB * 0.25;

  // Gravity thins the top and pools film at the bottom; near the end a
  // clear zone advances down from the top before the film fails.
  const gravityDrainage = Math.exp(
    clamp(-0.72 * (up + 0.24) * (0.35 + life * 0.65), -1.15, 0.72)
  );
  const preRupture = smoothstep(0.72, 1, life);
  const drainFront = 1.08 + (-0.22 - 1.08) * preRupture;
  const drainedTop = smoothstep(drainFront - 0.14, drainFront + 0.14, up);
  const drainedEdge =
    (1 - smoothstep(0, 0.14, Math.abs(up - drainFront))) * preRupture;
  const thicknessMix = clamp01(
    (0.09 + eddy * 0.56 + gravityDrainage * 0.22) *
      (1 + (0.34 - 1) * drainedTop)
  );
  const thicknessNm = 180 + (720 - 180) * thicknessMix;

  const spectrum = thinFilmSpectrum(thicknessNm, z, spectrumScratch);
  const fs = look.filmStrength;
  const k = 0.48 + fs * 0.42;
  const peak = Math.max(spectrum[0], spectrum[1], spectrum[2]);
  if (look.calm > 0) {
    const lum = (spectrum[0] + spectrum[1] + spectrum[2]) / 3;
    for (let i = 0; i < 3; i++) {
      spectrum[i] = spectrum[i]! + (lum - spectrum[i]!) * look.calm;
    }
  }
  for (let i = 0; i < 3; i++) {
    const film = look.tint[i]! + (spectrum[i]! - look.tint[i]!) * k;
    out[i] = clamp01(film * 1.16 * look.dye[i]!);
  }

  const face = look.face * peak * (1 - drainedTop * 0.9);
  const rim = grazing * (0.48 + fs * 0.11) + fresnel * 0.24 + drainedEdge * 0.1;
  out[3] = clamp((face + rim) * (1 - drainedTop * 0.3), 0, 0.9);
  return out;
}

const KEY_LIGHT = normalize3(-0.48, 0.62, 0.62);
const BOUNCE_LIGHT = normalize3(0.42, -0.5, 0.76);

/**
 * Reflected light at unit-disc point (x, y): a tight key highlight up-left
 * with a soft halo, and a dimmer bounce down-right. Returns opacity 0-1 of
 * the highlight colour. The lights match the 3D shader; the key is broader
 * than its 3D exponent so it still reads on a bubble a few pixels across.
 */
export function sampleBubbleGloss(x: number, y: number): number {
  const r2 = x * x + y * y;
  if (r2 > 1) return 0;
  const nx = x;
  const ny = -y;
  const nz = Math.sqrt(Math.max(0, 1 - r2));
  const key = reflectToViewer(nx, ny, nz, KEY_LIGHT);
  const bounce = reflectToViewer(nx, ny, nz, BOUNCE_LIGHT);
  return clamp01(
    Math.pow(key, 36) * 0.95 +
      Math.pow(key, 6) * 0.14 +
      Math.pow(bounce, 14) * 0.24
  );
}

/**
 * Where a mature film fails: in its drained top, off to one side by seed.
 * Unit-disc, y down. Same placement as the 3D shell.
 */
export function resolveBubbleRuptureOrigin(seed: number): {
  x: number;
  y: number;
} {
  const angle = (seed - Math.floor(seed)) * TAU;
  return { x: Math.cos(angle) * 0.38, y: -(0.54 + Math.sin(angle) * 0.14) };
}

/** Radius (unit-disc) of the hole a burst has torn at `popAge` seconds. */
export function resolveBubbleRuptureRadius(popAge: number): number {
  const progress = Math.pow(clamp01(popAge / BUBBLE_POP_SECONDS), 0.72);
  return 0.018 + progress * 2.18;
}

/**
 * Velocity a new bubble takes from its tip (px/s). A slow tip passes on
 * 22% of its speed; a fast one is capped so a hard spin draws its path in
 * bubbles without firing them across the stage.
 */
export function resolveInheritedVelocity(
  tipVx: number,
  tipVy: number,
  scale: number
): { vx: number; vy: number } {
  const speed = Math.hypot(tipVx, tipVy);
  if (speed <= 0.0001 || scale <= 0) return { vx: 0, vy: 0 };
  const capPx = MAX_INHERITED_SPEED * BUBBLE_PX_PER_WORLD * scale;
  const share = Math.min(MAX_INHERITANCE, capPx / speed);
  return { vx: tipVx * share, vy: tipVy * share };
}

/**
 * How far a bubble moving at `relativeSpeedPx` through the air (px/s) is
 * pulled out of round. Bigger shells give more; capped well short of a
 * sausage. Same curve as 3D in world units.
 */
export function resolveBubbleDeformationTarget(
  relativeSpeedPx: number,
  sizeMultiplier: number,
  scale: number
): number {
  if (scale <= 0) return 0;
  const world = relativeSpeedPx / (BUBBLE_PX_PER_WORLD * scale);
  const moving = Math.max(0, world - 0.04);
  const sizeResponse = Math.max(
    0.62,
    Math.min(1.25, 0.55 + Math.max(0, sizeMultiplier) * 0.42)
  );
  return Math.min(BUBBLE_MAX_DEFORMATION, moving * 0.18 * sizeResponse);
}

function reflectToViewer(
  nx: number,
  ny: number,
  nz: number,
  light: readonly [number, number, number]
): number {
  const nDotL = nx * light[0] + ny * light[1] + nz * light[2];
  return Math.max(0, 2 * nDotL * nz - light[2]);
}

function normalize3(
  x: number,
  y: number,
  z: number
): readonly [number, number, number] {
  const l = Math.hypot(x, y, z);
  return [x / l, y / l, z / l];
}

function smoothstep(a: number, b: number, v: number): number {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function parseColor(color: string): [number, number, number] {
  const rgba = color.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
  if (rgba) {
    return [
      Number(rgba[1]) / 255,
      Number(rgba[2]) / 255,
      Number(rgba[3]) / 255,
    ];
  }
  let s = color.trim().replace(/^#/, "");
  if (s.length === 3) s = s.replace(/./g, (ch) => ch + ch);
  const n = parseInt(s.slice(0, 6), 16);
  if (!Number.isFinite(n)) return [0.78, 0.88, 1];
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function parseAlpha(color: string): number {
  const m = color.match(/rgba\([^)]*,\s*([\d.]+)\s*\)/i);
  return m ? Number(m[1]) : 0.22;
}
