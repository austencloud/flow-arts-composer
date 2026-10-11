/**
 * Shared fixtures for the joined-grid persistence tests: a three-step flow
 * whose one sequence-level join is chosen by the test. A sequence has one join
 * for every cell, so the steps and the start placement carry none. They are
 * plain literals, not factory output, so a factory cannot hide a stray join
 * inside the fixture.
 */
import type { GridJoin } from "@tka/tka-types";
import {
  createSequenceData,
  type SequenceData,
} from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
import type { StartPlacementData } from "#lib/shared/foundation/domain/models/start-placement-data.js";
import { Letter } from "#lib/shared/foundation/domain/models/letter.js";
import {
  createMotionData,
  type MotionData,
} from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import {
  HandSide,
  MotionType,
  RotationDirection,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import { GridLocation } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";

export const JOIN_EAST_ONE: GridJoin = { toward: "e", steps: 1 };
export const JOIN_NORTHEAST_TWO: GridJoin = { toward: "ne", steps: 2 };
export const JOIN_SOUTH_TWO: GridJoin = { toward: "s", steps: 2 };

type MotionInput = Parameters<typeof createMotionData>[0];

interface StepShape {
  readonly left: MotionInput;
  readonly right: MotionInput;
  readonly duration: number;
}

const N = GridLocation.NORTH;
const E = GridLocation.EAST;
const S = GridLocation.SOUTH;
const W = GridLocation.WEST;
const PRO = MotionType.PRO;
const CW = RotationDirection.CLOCKWISE;
const CCW = RotationDirection.COUNTER_CLOCKWISE;

const STEP_SHAPES: readonly StepShape[] = [
  {
    left: {
      motionType: PRO,
      rotationDirection: CW,
      startLocation: N,
      endLocation: E,
      turns: 0,
    },
    right: {
      motionType: PRO,
      rotationDirection: CW,
      startLocation: S,
      endLocation: W,
      turns: 0,
    },
    duration: 1,
  },
  {
    left: {
      motionType: PRO,
      rotationDirection: CW,
      startLocation: E,
      endLocation: S,
      turns: 1,
    },
    right: {
      motionType: PRO,
      rotationDirection: CW,
      startLocation: W,
      endLocation: N,
      turns: 1,
    },
    duration: 2,
  },
  {
    left: {
      motionType: PRO,
      rotationDirection: CCW,
      startLocation: S,
      endLocation: W,
      turns: 0,
    },
    right: {
      motionType: PRO,
      rotationDirection: CCW,
      startLocation: N,
      endLocation: E,
      turns: 0,
    },
    duration: 1,
  },
];

function motions(left: MotionInput, right: MotionInput) {
  return {
    left: createMotionData({ ...left, hand: HandSide.LEFT }) as MotionData,
    right: createMotionData({ ...right, hand: HandSide.RIGHT }) as MotionData,
  };
}

const LETTERS: readonly Letter[] = [Letter.A, Letter.B, Letter.C];

function plainStep(
  index: number,
  shape: StepShape,
  lettered: boolean
): StepData {
  return {
    id: `fixture-step-${index + 1}`,
    stepNumber: index + 1,
    duration: shape.duration,
    leftReversal: false,
    rightReversal: false,
    isBlank: false,
    letter: lettered ? (LETTERS[index] ?? null) : null,
    startPlacement: null,
    endPlacement: null,
    motions: motions(shape.left, shape.right),
  };
}

function plainStartPlacement(): StartPlacementData {
  const hold = { motionType: MotionType.STATIC, turns: 0 };
  return {
    isStartPlacement: true,
    id: "fixture-start",
    letter: null,
    startPlacement: null,
    endPlacement: null,
    gridPlacement: null,
    motions: motions(
      { ...hold, startLocation: N, endLocation: N },
      { ...hold, startLocation: S, endLocation: S }
    ),
  };
}

export interface JoinFixtureOptions {
  /** The join the whole sequence follows. */
  readonly sequenceJoin?: GridJoin;
  readonly handPath?: boolean;
  /**
   * Give the steps the letters A, B, C so the sequence has a complete word.
   * Persistence normalization refuses a sequence without one.
   */
  readonly lettered?: boolean;
}

/** The same flow with only its join fields varying between calls. */
export function buildJoinFixture(
  options: JoinFixtureOptions = {}
): SequenceData {
  return createSequenceData({
    id: "fixture-sequence",
    word: "ABC",
    name: "Join fixture",
    steps: STEP_SHAPES.map((shape, index) =>
      plainStep(index, shape, options.lettered ?? false)
    ),
    startPlacement: plainStartPlacement(),
    ...(options.sequenceJoin && { conjoined: options.sequenceJoin }),
    ...(options.handPath && { sequenceKind: "hand-path" as const }),
  });
}

/**
 * `sequence` with the join `options` describes, its motions untouched. Lets a
 * test join a real saved sequence instead of the built fixture.
 */
export function withJoins(
  sequence: SequenceData,
  options: Pick<JoinFixtureOptions, "sequenceJoin">
): SequenceData {
  return {
    ...sequence,
    ...(options.sequenceJoin && { conjoined: options.sequenceJoin }),
  };
}

/** The sequence's join, for comparing across a round trip. */
export function joinOf(sequence: SequenceData): GridJoin | undefined {
  return sequence.conjoined;
}
