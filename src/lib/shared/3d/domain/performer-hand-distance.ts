/**
 * How far each of a performer's hands sits from its grid center.
 *
 * The prop-state interpolator places every grip at this distance. It can
 * differ by hand and by direction, because a hand reaches farther out to its
 * own side than across the chest. The two grid styles in
 * `docs/architecture/performer-grid-styles.md` are rules that produce one;
 * until a style is switched on, every performer holds the fixed distance.
 */

import type { Plane } from "@austencloud/scene-3d";
import { GRID_RADIUS_3D } from "./constants/plane-transforms";

/** One hand's distance from its grid center, in meters. */
export interface HandDistance {
  /**
   * The distance toward `angle` on `plane`. Angles follow `LOCATION_ANGLES`
   * (east 0, south π/2), as `planeAngleToWorldPosition` does.
   */
  toward(plane: Plane, angle: number): number;
  /** The farthest the hand sits in any direction. Camera framing uses it. */
  readonly max: number;
}

export interface PerformerHandDistance {
  readonly left: HandDistance;
  readonly right: HandDistance;
}

/** The same distance in every direction. */
export function fixedHandDistance(meters: number): HandDistance {
  return { toward: () => meters, max: meters };
}

/** Today's 0.52 m, which every performer holds until a grid style is on. */
export const DEFAULT_HAND_DISTANCE: HandDistance =
  fixedHandDistance(GRID_RADIUS_3D);

export const DEFAULT_PERFORMER_HAND_DISTANCE: PerformerHandDistance = {
  left: DEFAULT_HAND_DISTANCE,
  right: DEFAULT_HAND_DISTANCE,
};

/** The farthest either hand sits, for framing the performer's grid. */
export function largestHandDistance(
  hands: PerformerHandDistance = DEFAULT_PERFORMER_HAND_DISTANCE
): number {
  return Math.max(hands.left.max, hands.right.max);
}
