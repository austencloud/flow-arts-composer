import { BackgroundType } from "@austencloud/backgrounds";
import {
  resolvePetalSize,
  type PetalSpriteShape,
} from "#lib/shared/effects/domain/petal-palettes.js";
// Keying on BackgroundType.PRIDE directly writes an "undefined" key on any
// bundle that still calls the environment Rainbow, which drops that background
// through to the neutral profile and its zero contrast.
import { PRIDE_BACKGROUND_TYPE } from "#lib/shared/settings/domain/background-type-migration.js";

export interface PetalEnvironmentProfile3D {
  /** Approximate linear-space luminance behind the performer. */
  backdropLuminance: number;
  /** Lowest readable surface value in dark environments. */
  minimumSurfaceLuminance: number;
  /** Brightest retained surface value against pale environments. */
  maximumSurfaceLuminance: number;
  /** How strongly the shader corrects a low-contrast particle. */
  contrastStrength: number;
  /** Fine silhouette separation without turning every leaf into an outline. */
  edgeStrength: number;
  /** Readability compensation after density is reduced. */
  opacityScale: number;
  /** Keeps motion-born particles expressive without filling busy scenery. */
  motionEmissionScale: number;
  /** Ambient drift yields first when an environment already has visual motion. */
  ambientEmissionScale: number;
}

export const NEUTRAL_PETAL_ENVIRONMENT_PROFILE: PetalEnvironmentProfile3D = {
  backdropLuminance: 0.18,
  minimumSurfaceLuminance: 0.08,
  maximumSurfaceLuminance: 0.72,
  contrastStrength: 0,
  edgeStrength: 0,
  opacityScale: 1,
  motionEmissionScale: 1,
  ambientEmissionScale: 1,
};

// PRIDE_BACKGROUND_TYPE is resolved at runtime (see background-type-migration)
// rather than being the literal `BackgroundType.PRIDE`, so this computed key
// can't be statically proven to fill that slot of the enum - hence `Partial`.
// `resolvePetalEnvironmentProfile` below already falls back to the neutral
// profile for a key that ends up missing, so nothing here should ever
// actually be `undefined` at runtime.
const PETAL_ENVIRONMENT_PROFILES: Partial<
  Record<BackgroundType, PetalEnvironmentProfile3D>
> = {
  [BackgroundType.FOREST]: {
    backdropLuminance: 0.035,
    minimumSurfaceLuminance: 0.15,
    maximumSurfaceLuminance: 0.72,
    contrastStrength: 0.86,
    edgeStrength: 0.2,
    opacityScale: 1.16,
    motionEmissionScale: 0.82,
    ambientEmissionScale: 0.62,
  },
  [BackgroundType.OCEAN]: {
    backdropLuminance: 0.055,
    minimumSurfaceLuminance: 0.16,
    maximumSurfaceLuminance: 0.72,
    contrastStrength: 0.88,
    edgeStrength: 0.22,
    opacityScale: 1.16,
    motionEmissionScale: 0.84,
    ambientEmissionScale: 0.62,
  },
  [BackgroundType.COSMIC]: {
    backdropLuminance: 0.018,
    minimumSurfaceLuminance: 0.135,
    maximumSurfaceLuminance: 0.72,
    contrastStrength: 0.78,
    edgeStrength: 0.17,
    opacityScale: 1.12,
    motionEmissionScale: 0.92,
    ambientEmissionScale: 0.72,
  },
  [BackgroundType.VOID]: {
    backdropLuminance: 0.008,
    minimumSurfaceLuminance: 0.13,
    maximumSurfaceLuminance: 0.72,
    contrastStrength: 0.74,
    edgeStrength: 0.16,
    opacityScale: 1.1,
    motionEmissionScale: 0.95,
    ambientEmissionScale: 0.76,
  },
  [BackgroundType.EMBER]: {
    backdropLuminance: 0.065,
    minimumSurfaceLuminance: 0.16,
    maximumSurfaceLuminance: 0.72,
    contrastStrength: 0.84,
    edgeStrength: 0.21,
    opacityScale: 1.14,
    motionEmissionScale: 0.86,
    ambientEmissionScale: 0.64,
  },
  [BackgroundType.BLOSSOM]: {
    backdropLuminance: 0.12,
    minimumSurfaceLuminance: 0.16,
    maximumSurfaceLuminance: 0.68,
    contrastStrength: 0.72,
    edgeStrength: 0.17,
    opacityScale: 1.08,
    motionEmissionScale: 0.9,
    ambientEmissionScale: 0.72,
  },
  [BackgroundType.AUTUMN]: {
    backdropLuminance: 0.16,
    minimumSurfaceLuminance: 0.17,
    maximumSurfaceLuminance: 0.64,
    contrastStrength: 0.74,
    edgeStrength: 0.18,
    opacityScale: 1.1,
    motionEmissionScale: 0.88,
    ambientEmissionScale: 0.68,
  },
  [BackgroundType.WINTER]: {
    backdropLuminance: 0.56,
    minimumSurfaceLuminance: 0.08,
    maximumSurfaceLuminance: 0.2,
    contrastStrength: 0.94,
    edgeStrength: 0.3,
    opacityScale: 1.18,
    motionEmissionScale: 0.92,
    ambientEmissionScale: 0.74,
  },
  [BackgroundType.CELESTIAL]: {
    backdropLuminance: 0.48,
    minimumSurfaceLuminance: 0.08,
    maximumSurfaceLuminance: 0.22,
    contrastStrength: 0.9,
    edgeStrength: 0.27,
    opacityScale: 1.16,
    motionEmissionScale: 0.9,
    ambientEmissionScale: 0.7,
  },
  [PRIDE_BACKGROUND_TYPE]: {
    backdropLuminance: 0.28,
    minimumSurfaceLuminance: 0.18,
    maximumSurfaceLuminance: 0.58,
    contrastStrength: 0.7,
    edgeStrength: 0.18,
    opacityScale: 1.1,
    motionEmissionScale: 0.86,
    ambientEmissionScale: 0.66,
  },
};

/**
 * Keep the effect quieter in visually active scenes, then recover the leaf
 * itself with local contrast instead of solving darkness by adding more leaves.
 */
export function resolvePetalEnvironmentProfile(
  backgroundType: BackgroundType
): PetalEnvironmentProfile3D {
  return (
    PETAL_ENVIRONMENT_PROFILES[backgroundType] ??
    NEUTRAL_PETAL_ENVIRONMENT_PROFILE
  );
}

/**
 * Project the shared tiered silhouette size into Three.js world space.
 *
 * A small compensation is needed because a world-space plane loses more
 * apparent area through perspective and edge-on rotation than the equivalent
 * Canvas2D silhouette. The result remains roughly half the old 3D footprint.
 */
export function resolvePetalWorldSize(
  baseSize: number,
  intensity: number,
  shape: PetalSpriteShape,
  ambient: boolean,
  rand: () => number = Math.random
): number {
  const perspectiveCompensation = 1.45;
  const ambientScale = ambient ? 0.84 : 1;
  return (
    resolvePetalSize(baseSize, intensity, shape, rand) *
    perspectiveCompensation *
    ambientScale
  );
}

/**
 * Give a young ember a narrow halo outside the ash silhouette.
 *
 * The main plane spans `radius * 2`; this slightly larger emissive pass leaves
 * a thin rim while also warming the young fragment's core.
 */
export function resolveEmberWorldSpan(radius: number): number {
  return radius * 2.72;
}
