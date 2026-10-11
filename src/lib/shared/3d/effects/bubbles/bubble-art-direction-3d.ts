import type { Bubbles3DParams } from "#lib/shared/effects/translators/webgl3d-types.js";

export const BUBBLE_POP_DURATION_SECONDS = 0.18;
export const BUBBLE_LIFETIME_SWELL = 0.08;
export const BUBBLE_MAX_OPACITY = 0.82;
export const BUBBLE_WORLD_SCALE = 0.72;
export const BUBBLE_FRAGMENT_COUNT_MIN = 4;
export const BUBBLE_FRAGMENT_COUNT_MAX = 7;
export const BUBBLE_MAX_INHERITED_SPEED = 0.8;
export const BUBBLE_MAX_DEFORMATION = 0.18;
export const BUBBLE_MIN_REBOUND_DEFORMATION = -0.035;

const SIZE_FLOOR = 0.34;
const SIZE_BIAS = 2;
const TAU = Math.PI * 2;

export interface BubbleShellFrame3D {
  alpha: number;
  radius: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
}

export interface BubbleDeformationScales3D {
  major: number;
  minor: number;
  depth: number;
}

export interface BubbleRuptureOrigin3D {
  x: number;
  y: number;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * The visible field should be mostly small bubbles with a rare hero bubble.
 * A uniform roll made every spawn compete at roughly the same scale.
 */
export function resolveBubbleSizeMultiplier3D(
  randomUnit: number,
  sizeJitter: number
): number {
  const roll = Math.pow(clamp01(randomUnit), SIZE_BIAS);
  const spread = 0.42 + clamp01(sizeJitter) * 1.55;
  return (SIZE_FLOOR + roll * spread) * BUBBLE_WORLD_SCALE;
}

export function resolveBubbleLifetimeMultiplier3D(
  paletteId: Bubbles3DParams["resolvedPalette"]["id"]
): number {
  return paletteId === "champagne" || paletteId === "acid" ? 0.55 : 1;
}

export function resolveBubbleRiseSpeed3D(
  baseRiseSpeed: number,
  sizeMultiplier: number
): number {
  return baseRiseSpeed * (0.55 + sizeMultiplier * 0.75);
}

/**
 * New film follows a moving prop long enough to draw its path, then air drag
 * hands control back to buoyancy. The cap keeps a fast spin from firing soap
 * bubbles across the whole stage.
 */
export function resolveBubbleVelocityInheritance3D(
  sourceSpeed: number
): number {
  const speed = Math.max(0, sourceSpeed);
  if (speed <= 0.0001) return 0;
  return Math.min(0.22, BUBBLE_MAX_INHERITED_SPEED / speed);
}

/**
 * Fast prop movement temporarily wins over surface tension. Larger shells
 * respond more because the same film has more area to pull out of round.
 */
export function resolveBubbleDeformationTarget3D(
  relativeSpeed: number,
  sizeMultiplier: number
): number {
  const movingSpeed = Math.max(0, relativeSpeed - 0.04);
  const sizeResponse = Math.max(
    0.62,
    Math.min(1.25, 0.55 + Math.max(0, sizeMultiplier) * 0.42)
  );
  return Math.min(BUBBLE_MAX_DEFORMATION, movingSpeed * 0.18 * sizeResponse);
}

/**
 * The film stretches in one direction and contracts across the other two.
 * Keeping the product at one prevents a moving bubble from visibly inflating.
 */
export function resolveBubbleDeformationScales3D(
  deformation: number
): BubbleDeformationScales3D {
  const bounded = Math.max(
    BUBBLE_MIN_REBOUND_DEFORMATION,
    Math.min(BUBBLE_MAX_DEFORMATION, deformation)
  );
  const major = 1 + bounded;
  const crossSection = 1 / Math.sqrt(major);
  return {
    major,
    minor: crossSection,
    depth: crossSection,
  };
}

/**
 * Mature film usually fails in its gravity-drained upper region. The seed
 * keeps the break deterministic while moving it off-center for each shell.
 */
export function resolveBubbleRuptureOrigin3D(
  randomUnit: number
): BubbleRuptureOrigin3D {
  const wrappedSeed = randomUnit - Math.floor(randomUnit);
  const angle = wrappedSeed * TAU;
  return {
    x: Math.cos(angle) * 0.38,
    y: 0.54 + Math.sin(angle) * 0.14,
  };
}

export function resolveBubbleRuptureProgress3D(popAge: number): number {
  const progress = clamp01(popAge / BUBBLE_POP_DURATION_SECONDS);
  return Math.pow(progress, 0.72);
}

export function resolveBubbleWobbleX3D(
  age: number,
  frequency: number,
  phase: number,
  amplitude: number
): number {
  const wave = age * frequency + phase;
  return Math.sin(wave) * amplitude;
}

export function resolveBubbleWobbleZ3D(
  age: number,
  frequency: number,
  phase: number,
  amplitude: number
): number {
  const wave = age * frequency + phase;
  return Math.cos(wave * 0.83 + phase * 0.37) * amplitude * 0.64;
}

export function resolveAliveBubbleFrame3D(
  baseRadius: number,
  age: number,
  maxAge: number,
  phase: number
): BubbleShellFrame3D {
  const life = clamp01(maxAge > 0 ? age / maxAge : 1);
  const radius = baseRadius * (1 + BUBBLE_LIFETIME_SWELL * life * life);
  const fadeIn = life < 0.12 ? life / 0.12 : 1;
  const fadeOut = life > 0.8 ? 1 - (life - 0.8) / 0.2 : 1;
  const tension = Math.sin(age * 2.4 + phase) * 0.035;
  return {
    alpha: Math.max(0, fadeIn * fadeOut) * BUBBLE_MAX_OPACITY,
    radius,
    scaleX: radius * (1 + tension),
    scaleY: radius * (1 - tension * 0.72),
    scaleZ: radius * (1 + Math.sin(age * 1.9 + phase + TAU / 3) * 0.026),
  };
}

/**
 * The shell stays present while the shader opens a local rupture through it.
 * Only a slight tension release remains; flattening the whole bubble hid the
 * expanding hole and made every pop look like a deflating balloon.
 */
export function resolvePoppingBubbleFrame3D(
  popRadius: number,
  popAge: number
): BubbleShellFrame3D {
  const progress = clamp01(popAge / BUBBLE_POP_DURATION_SECONDS);
  const relaxed = 1 - Math.pow(1 - progress, 2);
  const radius = popRadius * (1 + relaxed * 0.055);
  return {
    alpha: Math.pow(1 - progress, 0.72) * BUBBLE_MAX_OPACITY,
    radius,
    scaleX: radius * (1 + progress * 0.02),
    scaleY: radius * (1 - progress * 0.015),
    scaleZ: radius * (1 - progress * 0.005),
  };
}

export function resolveBubbleFragmentCount3D(randomUnit: number): number {
  const range = BUBBLE_FRAGMENT_COUNT_MAX - BUBBLE_FRAGMENT_COUNT_MIN + 1;
  return (
    BUBBLE_FRAGMENT_COUNT_MIN +
    Math.min(range - 1, Math.floor(clamp01(randomUnit) * range))
  );
}
