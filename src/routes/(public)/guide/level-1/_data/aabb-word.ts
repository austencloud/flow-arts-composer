import { createMotionData } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import {
  MotionType,
  HandSide,
  Orientation,
  RotationDirection,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import {
  GridMode,
  GridLocation,
} from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import { getGridPlacementFromLocations } from "#lib/shared/pictograph/grid/services/grid-placement-deriver.js";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import { Letter } from "#lib/shared/foundation/domain/models/letter.js";
import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";

/**
 * The Guide's teaching word AABB (Words page, proof p31): A A forward around
 * the clockwise loop (blue s→w→n, red n→e→s, pro), then B B back (blue
 * n→w→s, red s→e→n, anti). Pro keeps each hand's starting orientation; anti
 * flips it into step 4, which flips it back. The Words page and the Guide
 * front page both draw this one word.
 */
const { NORTH: N, EAST: E, SOUTH: S, WEST: W } = GridLocation;
const { IN, OUT } = Orientation;
const CW = RotationDirection.CLOCKWISE;
const CCW = RotationDirection.COUNTER_CLOCKWISE;

type Leg = { from: GridLocation; to: GridLocation; anti: boolean };
const BLUE_LEGS: Leg[] = [
  { from: S, to: W, anti: false },
  { from: W, to: N, anti: false },
  { from: N, to: W, anti: true },
  { from: W, to: S, anti: true },
];
const RED_LEGS: Leg[] = [
  { from: N, to: E, anti: false },
  { from: E, to: S, anti: false },
  { from: S, to: E, anti: true },
  { from: E, to: N, anti: true },
];
const LETTERS = [Letter.A, Letter.A, Letter.B, Letter.B];

const HP_CW = new Set(["s-w", "w-n", "n-e", "e-s"]);
const hpDir = (from: GridLocation, to: GridLocation) =>
  HP_CW.has(`${from}-${to}`) ? CW : CCW;
const flip = (o: Orientation) => (o === IN ? OUT : IN);

// Orientation at the START of step i, given the row's starting orientation:
// pro (steps 1-2) preserves, anti (step 3) flips into step 4, which flips back.
const oriAt = (o0: Orientation, i: number): Orientation =>
  i === 3 ? flip(o0) : o0;

const hand = (color: HandSide, leg: Leg, so: Orientation) => {
  const dir = hpDir(leg.from, leg.to);
  return createMotionData({
    motionType: leg.anti ? MotionType.ANTI : MotionType.PRO,
    rotationDirection: leg.anti ? (dir === CW ? CCW : CW) : dir,
    startLocation: leg.from,
    endLocation: leg.to,
    startOrientation: so,
    endOrientation: leg.anti ? flip(so) : so,
    turns: 0,
    color,
    propType: PropType.STAFF,
    gridMode: GridMode.DIAMOND,
  });
};
const stat = (color: HandSide, loc: GridLocation, ori: Orientation) =>
  createMotionData({
    motionType: MotionType.STATIC,
    startLocation: loc,
    endLocation: loc,
    startOrientation: ori,
    endOrientation: ori,
    color,
    propType: PropType.STAFF,
    gridMode: GridMode.DIAMOND,
  });

/** The start position plus the four steps of AABB, from the given starting
 * thumb orientations. `key` prefixes each step id. */
export function aabbWordSteps(
  key: string,
  leftOri: Orientation,
  rightOri: Orientation
): StepData[] {
  const start = {
    id: `${key}-0`,
    letter: Letter.ALPHA,
    gridMode: GridMode.DIAMOND,
    stepNumber: 0,
    startPlacement: getGridPlacementFromLocations(S, N),
    endPlacement: getGridPlacementFromLocations(S, N),
    motions: {
      left: stat(HandSide.LEFT, S, leftOri),
      right: stat(HandSide.RIGHT, N, rightOri),
    },
  } as unknown as StepData;
  const steps = [0, 1, 2, 3].map(
    (i) =>
      ({
        id: `${key}-${i + 1}`,
        letter: LETTERS[i]!,
        gridMode: GridMode.DIAMOND,
        startPlacement: getGridPlacementFromLocations(
          BLUE_LEGS[i]!.from,
          RED_LEGS[i]!.from
        ),
        endPlacement: getGridPlacementFromLocations(
          BLUE_LEGS[i]!.to,
          RED_LEGS[i]!.to
        ),
        stepNumber: i + 1,
        motions: {
          left: hand(HandSide.LEFT, BLUE_LEGS[i]!, oriAt(leftOri, i)),
          right: hand(HandSide.RIGHT, RED_LEGS[i]!, oriAt(rightOri, i)),
        },
      }) as unknown as StepData
  );
  return [start, ...steps];
}
