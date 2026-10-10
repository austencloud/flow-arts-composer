/**
 * Retro Motion Utils
 *
 * Shared MotionData -> RetroHandData conversion for the era adapters.
 * The notation (SCRIBE) and cards (CARDS) adapters both consume the identical
 * engine MotionData shape and emit the same RetroHandData for the pixel
 * renderer, so the mapping lives here rather than being copy-pasted per adapter.
 *
 * Domain: Retro (shared across eras)
 */

import {
  GridLocation,
} from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import {
  HandSide,
  MotionType,
  Orientation,
  RotationDirection,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import type { MotionData } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";

import type { RetroHandData } from "../domain/pictograph-types";

/**
 * Convert a single MotionData from the real engine into a RetroHandData
 * for the pixel renderer.
 */
export function motionToRetroHand(motion: MotionData): RetroHandData {
  return {
    color: motion.hand,
    location: motion.startLocation,
    orientation: motion.startOrientation,
    motionType: motion.motionType,
    endLocation: motion.endLocation,
    turns: typeof motion.turns === "number" ? motion.turns : 0,
    rotationDirection: motion.rotationDirection,
  };
}

/**
 * Fallback hand data when a motion is missing from a step.
 * Produces a static hand at north with no rotation.
 */
export function fallbackHand(color: HandSide): RetroHandData {
  return {
    color,
    location: GridLocation.NORTH,
    orientation: Orientation.IN,
    motionType: MotionType.STATIC,
    endLocation: GridLocation.NORTH,
    turns: 0,
    rotationDirection: RotationDirection.NO_ROTATION,
  };
}
