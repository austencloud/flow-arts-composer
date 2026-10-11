/**
 * What this body can hold, next to what it is actually holding.
 *
 * The grip problem this lab exists for is a relationship between a body and a
 * prop, not a property of either. A rig with a short reach and a 152 cm staff
 * fails in a way that neither the rig nor the staff shows on its own, so the
 * two numbers have to sit side by side.
 *
 * Every measurement here comes from `shared/3d/domain/performer-reach-
 * measurements.ts`. This module only feeds the live skeleton readings into
 * that owner and formats what comes back; it derives no anthropometry of its
 * own.
 */
import type { AvatarPoseDiagnostics } from "@austencloud/scene-3d";

import {
  fitStaffLengthForHug,
  measurePerformerReach,
  planHugReachGeometry,
  type HugReachGeometry,
  type PerformerReachMeasurements,
  type StaffFitResult,
} from "#lib/shared/3d/domain/performer-reach-measurements.js";

/**
 * The one anthropometric ratio inside the fit. It is private to the fit
 * module's defaults, so the lab re-states it here purely to SHOW the torso
 * depth it implies. Displaying it is not re-deriving it: the number that
 * drives the fit is still the owner's.
 */
const TORSO_DEPTH_TO_SHOULDER_RATIO = 0.55;

export interface BodyPropFit {
  measurements: PerformerReachMeasurements;
  geometry: HugReachGeometry;
  fit: StaffFitResult;
  /** Front-to-back torso extent the converged shaft has to clear. */
  torsoDepthM: number;
}

/**
 * Read the live skeleton into the shared reach owner. Returns null while a rig
 * is still loading and its arm chains report degenerate lengths, which is the
 * owner's own contract for "do not pose against garbage".
 */
export function readBodyPropFit(
  diagnostics: AvatarPoseDiagnostics
): BodyPropFit | null {
  const measurements = measurePerformerReach({
    leftUpperArmM: diagnostics.leftUpperArmLength,
    leftForearmM: diagnostics.leftForearmLength,
    rightUpperArmM: diagnostics.rightUpperArmLength,
    rightForearmM: diagnostics.rightForearmLength,
    shoulderWidthM: diagnostics.shoulderWidth,
  });
  if (!measurements) return null;

  return {
    measurements,
    geometry: planHugReachGeometry(measurements),
    fit: fitStaffLengthForHug(measurements),
    torsoDepthM:
      TORSO_DEPTH_TO_SHOULDER_RATIO * measurements.shoulderWidthM,
  };
}

/** The length the body would choose for itself, in centimetres. */
export function bodyDerivedLengthCm(fit: BodyPropFit | null): number | null {
  if (!fit) return null;
  return fit.fit.fits ? fit.fit.recommendedStaffLengthCm : null;
}

export type FitVerdict = "fits" | "over" | "under" | "unsupported" | "unknown";

/**
 * How the prop currently on stage compares with what this body can hold.
 * `over` is the interesting one: the rendered shaft is longer than the hug
 * clears, which is where the grip collapses.
 */
export function compareLengths(
  fit: BodyPropFit | null,
  renderedCm: number | null
): { verdict: FitVerdict; deltaCm: number | null } {
  if (!fit) return { verdict: "unknown", deltaCm: null };
  if (!fit.fit.fits) return { verdict: "unsupported", deltaCm: null };
  if (renderedCm === null) return { verdict: "unknown", deltaCm: null };

  const max = fit.fit.maxStaffLengthCm;
  const delta = renderedCm - max;
  // Half a centimetre of slack: below that the difference is measurement
  // noise on a moving skeleton, not a real mismatch.
  if (delta > 0.5) return { verdict: "over", deltaCm: delta };
  if (delta < -0.5) return { verdict: "under", deltaCm: delta };
  return { verdict: "fits", deltaCm: delta };
}
