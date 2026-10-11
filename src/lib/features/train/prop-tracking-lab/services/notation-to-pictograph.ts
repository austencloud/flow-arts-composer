import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
import { createMotionData } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import {
  MotionType,
  HandSide,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import {
  GridLocation,
  GridMode,
} from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import type { StaffMotionNotation } from "../domain/notation-3d";

/** Lowercase notation location -> GridLocation enum value. */
const LOCATION_MAP: Record<string, GridLocation> = {
  n: GridLocation.NORTH,
  ne: GridLocation.NORTHEAST,
  e: GridLocation.EAST,
  se: GridLocation.SOUTHEAST,
  s: GridLocation.SOUTH,
  sw: GridLocation.SOUTHWEST,
  w: GridLocation.WEST,
  nw: GridLocation.NORTHWEST,
};

const CARDINAL = new Set(["n", "e", "s", "w"]);

function toMotion(n: StaffMotionNotation, hand: HandSide, gridMode: GridMode) {
  return createMotionData({
    motionType: n.motionType,
    rotationDirection: n.rotationDirection,
    startLocation: LOCATION_MAP[n.startLocation]!,
    endLocation: LOCATION_MAP[n.endLocation]!,
    turns: n.motionType === MotionType.FLOAT ? "fl" : n.turns,
    startOrientation: n.startOrientation,
    endOrientation: n.endOrientation,
    hand,
    gridMode,
  });
}

/** Build a renderable PictographData from a left/right notation pair. */
export function notationToPictographData(
  left: StaffMotionNotation,
  right: StaffMotionNotation,
  id: string
): PictographData {
  const allCardinal = [
    left.startLocation,
    left.endLocation,
    right.startLocation,
    right.endLocation,
  ].every((l) => CARDINAL.has(l));
  const gridMode = allCardinal ? GridMode.DIAMOND : GridMode.BOX;

  return {
    id,
    letter: null,
    motions: {
      left: toMotion(left, HandSide.LEFT, gridMode),
      right: toMotion(right, HandSide.RIGHT, gridMode),
    },
    gridMode,
  };
}
