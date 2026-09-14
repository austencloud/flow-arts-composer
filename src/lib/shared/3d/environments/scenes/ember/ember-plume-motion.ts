import type { EmberPlumeConfig } from "../../domain/models/scene-configs";

/**
 * Fumarole puff motion.
 *
 * A vent is not a bounded drift field: a puff is born at the mouth, expands as
 * it entrains cold air, leans downwind in proportion to how fast it is still
 * climbing, and dissolves where it stands. That lifecycle is what separates
 * volcanic smoke from the round sprites a wrap-at-the-box-edge emitter makes,
 * so it lives here as plain functions the renderer drives and a test inspects.
 */

/** Mean of the buoyancy profile over a full life, used to size `maxAge`. */
const MEAN_BUOYANCY = 0.79;

/** Fraction of a life spent fading in, and the point the fade-out begins. */
const FADE_IN_END = 0.09;
const FADE_OUT_START = 0.42;

/** Radius multiplier at birth and at dissolution. */
export const DEFAULT_PLUME_GROWTH: readonly [number, number] = [0.28, 1];

/** Metres of lateral drift per metre climbed, when a look declares none. */
export const DEFAULT_PLUME_SHEAR: readonly [number, number] = [0.34, -0.12];

/**
 * Ceiling on how far a puff's colour may be pulled toward the fog.
 *
 * A column is denser than the air around it, so it never converges all the way
 * onto the haze. Mixing to a full 1.0 did exactly that: measured at the F09
 * orbit camera, puff luminance landed at 0.0198-0.0232 against a fog luminance
 * of 0.0213 — the far vents carried no contrast whatsoever and read as absent.
 */
export const PLUME_FOG_BLEND_CAP = 0.55;

/**
 * How much of the fog term is charged against coverage. The colour mix already
 * carries aerial perspective; charging the same term twice was the other half
 * of the vanishing-column defect, so this only softens the edge.
 */
export const PLUME_FOG_ALPHA_BITE = 0.25;

export interface PlumePuff {
  /** Metres, local to the vent mouth. */
  x: number;
  y: number;
  z: number;
  /** Turbulent lateral velocity, m/s, before the height-dependent spread. */
  turbX: number;
  turbZ: number;
  /** This puff's own nominal climb rate, m/s. */
  rise: number;
  /** Terminal radius in metres; the life curve scales up to it. */
  size: number;
  /** 0..1. Drives silhouette lobes and interior mottling in the shader. */
  seed: number;
  rotation: number;
  rotationSpeed: number;
  age: number;
  maxAge: number;
}

export interface PlumeSample {
  /** Radius the shader should draw this frame, metres. */
  size: number;
  /** Coverage before the plume's own opacity and the depth soften apply. */
  alpha: number;
  /** Height above the mouth as a fraction of the column, clamped to 0..1. */
  rise: number;
}

type Rng = () => number;

/**
 * Buoyancy decays as the puff cools and mixes, so the column climbs quickly off
 * the vent and loiters near the top instead of rising at one rate the whole way.
 */
export function plumeBuoyancy(t: number): number {
  return 0.45 + 0.85 * Math.exp(-2.2 * t);
}

/**
 * Fade in off the mouth, hold, then dissolve across the back half. Both ends
 * reach zero, so a puff can neither pop into existence nor be cut off alive —
 * the two ways the old box emitter announced itself.
 */
export function plumeAlpha(t: number): number {
  if (t <= 0 || t >= 1) return 0;
  return smoothstep(0, FADE_IN_END, t) * (1 - smoothstep(FADE_OUT_START, 1, t));
}

/** Puffs are born tight at the mouth and swell as they climb. */
export function plumeSizeScale(
  t: number,
  growth: readonly [number, number]
): number {
  const eased = Math.pow(clamp01(t), 0.55);
  return growth[0] + (growth[1] - growth[0]) * eased;
}

/**
 * How much of the vent's underlight a puff still carries. Ash is lit from
 * beneath, so the base glows and the crown goes to silhouette; the falloff is
 * steep because the light source is a point a few metres below the mouth.
 */
export function plumeLitFraction(rise: number): number {
  return Math.pow(1 - clamp01(rise), 2.1);
}

export function createPlumePuff(
  spec: EmberPlumeConfig,
  rng: Rng = Math.random
): PlumePuff {
  // A tight mouth. The column's width comes from growth and turbulence, which
  // is what makes it read as one plume rather than a curtain of columns.
  const angle = rng() * Math.PI * 2;
  const radius = Math.sqrt(rng()) * spec.area.width * 0.09;
  const turbScale = spec.area.width * 0.018;

  return {
    x: Math.cos(angle) * radius,
    y: rng() * 0.35,
    z: Math.sin(angle) * radius * (spec.area.depth / spec.area.width),
    turbX: (rng() - 0.5) * 2 * turbScale,
    turbZ: (rng() - 0.5) * 2 * turbScale,
    rise: spec.speed * (0.72 + rng() * 0.56),
    size: spec.sizeRange[0] + rng() * (spec.sizeRange[1] - spec.sizeRange[0]),
    seed: rng(),
    rotation: rng() * Math.PI * 2,
    rotationSpeed: (rng() - 0.5) * 0.22,
    age: 0,
    maxAge:
      (spec.area.height / (MEAN_BUOYANCY * spec.speed)) * (0.8 + rng() * 0.4),
  };
}

/**
 * Advances one puff. Returns null once it has dissolved, which is the caller's
 * cue to rebuild it at the mouth — a puff never wanders off as a stray.
 */
export function advancePlumePuff(
  puff: PlumePuff,
  delta: number,
  spec: EmberPlumeConfig
): PlumeSample | null {
  puff.age += delta;
  const t = puff.age / puff.maxAge;
  if (t >= 1) return null;

  const climb = puff.rise * plumeBuoyancy(t);
  puff.y += climb * delta;

  // Lean scales with how fast the puff is still climbing, so the column bends
  // hardest low down and flattens where the buoyancy has gone. Turbulence
  // widens with height: near the mouth a puff tracks the column, aloft it
  // wanders, which is the difference between a jet and a dispersing plume.
  const shear = spec.windShear ?? DEFAULT_PLUME_SHEAR;
  const spread = 0.35 + puff.y / spec.area.height;
  puff.x += (shear[0] * climb + puff.turbX * spread) * delta;
  puff.z += (shear[1] * climb + puff.turbZ * spread) * delta;
  puff.rotation += puff.rotationSpeed * delta;

  return {
    size: puff.size * plumeSizeScale(t, spec.growth ?? DEFAULT_PLUME_GROWTH),
    alpha: plumeAlpha(t),
    rise: clamp01(puff.y / spec.area.height),
  };
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}
