/**
 * Transform Functions
 *
 * Pure functions that apply transforms to pictograph data.
 * These are simplified versions for the help examples -
 * the full transform logic lives in SequenceTransformer.
 */

import {
  createMotionData,
  type MotionData,
} from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
import {
  HandSide,
  MotionType,
  RotationDirection,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import { GridLocation } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";

/** Mirror a grid location across the vertical center line */
function mirrorLocation(loc: GridLocation): GridLocation {
  const map: Record<GridLocation, GridLocation> = {
    [GridLocation.NORTH]: GridLocation.NORTH,
    [GridLocation.SOUTH]: GridLocation.SOUTH,
    [GridLocation.EAST]: GridLocation.WEST,
    [GridLocation.WEST]: GridLocation.EAST,
    [GridLocation.NORTHEAST]: GridLocation.NORTHWEST,
    [GridLocation.NORTHWEST]: GridLocation.NORTHEAST,
    [GridLocation.SOUTHEAST]: GridLocation.SOUTHWEST,
    [GridLocation.SOUTHWEST]: GridLocation.SOUTHEAST,
    [GridLocation.CENTER]: GridLocation.CENTER,
  };
  return map[loc];
}

/** Flip a grid location across the horizontal center line */
function flipLocation(loc: GridLocation): GridLocation {
  const map: Record<GridLocation, GridLocation> = {
    [GridLocation.NORTH]: GridLocation.SOUTH,
    [GridLocation.SOUTH]: GridLocation.NORTH,
    [GridLocation.EAST]: GridLocation.EAST,
    [GridLocation.WEST]: GridLocation.WEST,
    [GridLocation.NORTHEAST]: GridLocation.SOUTHEAST,
    [GridLocation.SOUTHEAST]: GridLocation.NORTHEAST,
    [GridLocation.NORTHWEST]: GridLocation.SOUTHWEST,
    [GridLocation.SOUTHWEST]: GridLocation.NORTHWEST,
    [GridLocation.CENTER]: GridLocation.CENTER,
  };
  return map[loc];
}

/** Flip rotation direction */
function flipRotation(rot: RotationDirection): RotationDirection {
  if (rot === RotationDirection.CLOCKWISE)
    return RotationDirection.COUNTER_CLOCKWISE;
  if (rot === RotationDirection.COUNTER_CLOCKWISE)
    return RotationDirection.CLOCKWISE;
  return rot;
}

/** Rotate a location 45° clockwise or counter-clockwise */
function rotateLocation(
  loc: GridLocation,
  direction: "cw" | "ccw"
): GridLocation {
  const order: GridLocation[] = [
    GridLocation.NORTH,
    GridLocation.NORTHEAST,
    GridLocation.EAST,
    GridLocation.SOUTHEAST,
    GridLocation.SOUTH,
    GridLocation.SOUTHWEST,
    GridLocation.WEST,
    GridLocation.NORTHWEST,
  ];
  const idx = order.indexOf(loc);
  if (idx === -1) return loc;
  const newIdx = direction === "cw" ? (idx + 1) % 8 : (idx + 7) % 8;
  return order[newIdx] ?? loc;
}

/** Apply mirror transform to pictograph */
export function applyMirror(data: PictographData): PictographData {
  const newMotions: Partial<Record<HandSide, MotionData>> = {};
  for (const [color, motion] of Object.entries(data.motions)) {
    if (motion) {
      newMotions[color as HandSide] = createMotionData({
        ...motion,
        startLocation: mirrorLocation(motion.startLocation),
        endLocation: mirrorLocation(motion.endLocation),
        arrowLocation: motion.arrowLocation
          ? mirrorLocation(motion.arrowLocation)
          : motion.startLocation,
        rotationDirection: flipRotation(motion.rotationDirection),
      });
    }
  }
  return { ...data, motions: newMotions };
}

/** Apply rotate transform to pictograph */
export function applyRotate(
  data: PictographData,
  direction: "cw" | "ccw"
): PictographData {
  const newMotions: Partial<Record<HandSide, MotionData>> = {};
  for (const [color, motion] of Object.entries(data.motions)) {
    if (motion) {
      newMotions[color as HandSide] = createMotionData({
        ...motion,
        startLocation: rotateLocation(motion.startLocation, direction),
        endLocation: rotateLocation(motion.endLocation, direction),
        arrowLocation: motion.arrowLocation
          ? rotateLocation(motion.arrowLocation, direction)
          : motion.startLocation,
      });
    }
  }
  return { ...data, motions: newMotions };
}

/** Apply swap hands transform to pictograph */
export function applySwap(data: PictographData): PictographData {
  const left = data.motions[HandSide.LEFT];
  const right = data.motions[HandSide.RIGHT];
  const newMotions: Partial<Record<HandSide, MotionData>> = {};
  if (left)
    newMotions[HandSide.RIGHT] = createMotionData({
      ...left,
      hand: HandSide.RIGHT,
    });
  if (right)
    newMotions[HandSide.LEFT] = createMotionData({
      ...right,
      hand: HandSide.LEFT,
    });
  return { ...data, motions: newMotions };
}

/** Apply rewind transform to pictograph */
export function applyRewind(data: PictographData): PictographData {
  const newMotions: Partial<Record<HandSide, MotionData>> = {};
  for (const [color, motion] of Object.entries(data.motions)) {
    if (motion) {
      newMotions[color as HandSide] = createMotionData({
        ...motion,
        startLocation: motion.endLocation,
        endLocation: motion.startLocation,
        startOrientation: motion.endOrientation,
        endOrientation: motion.startOrientation,
        rotationDirection: flipRotation(motion.rotationDirection),
      });
    }
  }
  return { ...data, motions: newMotions };
}

/** Apply flip transform to pictograph (flip north/south) */
export function applyFlip(data: PictographData): PictographData {
  const newMotions: Partial<Record<HandSide, MotionData>> = {};
  for (const [color, motion] of Object.entries(data.motions)) {
    if (motion) {
      newMotions[color as HandSide] = createMotionData({
        ...motion,
        startLocation: flipLocation(motion.startLocation),
        endLocation: flipLocation(motion.endLocation),
        arrowLocation: motion.arrowLocation
          ? flipLocation(motion.arrowLocation)
          : motion.startLocation,
        rotationDirection: flipRotation(motion.rotationDirection),
      });
    }
  }
  return { ...data, motions: newMotions };
}

/** Apply invert transform to pictograph (flip rotation directions and motion types) */
export function applyInvert(data: PictographData): PictographData {
  const newMotions: Partial<Record<HandSide, MotionData>> = {};
  for (const [color, motion] of Object.entries(data.motions)) {
    if (motion) {
      // Flip motion type (PRO ↔ ANTI, others stay same)
      let invertedMotionType = motion.motionType;
      if (motion.motionType === MotionType.PRO) {
        invertedMotionType = MotionType.ANTI;
      } else if (motion.motionType === MotionType.ANTI) {
        invertedMotionType = MotionType.PRO;
      }

      newMotions[color as HandSide] = createMotionData({
        ...motion,
        motionType: invertedMotionType,
        rotationDirection: flipRotation(motion.rotationDirection),
      });
    }
  }
  return { ...data, motions: newMotions };
}
