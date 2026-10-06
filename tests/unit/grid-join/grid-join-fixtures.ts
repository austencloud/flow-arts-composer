/**
 * Shared fixtures for the joined-grid persistence tests: a three-step flow
 * whose sequence-level join, start-cell join and per-step joins are chosen by
 * the test. Steps and the start placement are plain literals, not factory
 * output, so a factory that drops `conjoined` cannot hide inside the fixture.
 */
import type { GridJoin } from "@tka/tka-types";
import {
  createSequenceData,
  type SequenceData,
} from "$lib/shared/foundation/domain/models/sequence-data";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import type { StartPlacementData } from "$lib/shared/foundation/domain/models/start-placement-data";
import { Letter } from "$lib/shared/foundation/domain/models/letter";
import {
  createMotionData,
  type MotionData,
} from "$lib/shared/pictograph/shared/domain/models/motion-data";
import {
  HandSide,
  MotionType,
  RotationDirection,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { GridLocation } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";

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
  join: GridJoin | null | undefined,
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
    ...(join !== undefined && { conjoined: join }),
  };
}

function plainStartPlacement(
  join: GridJoin | null | undefined
): StartPlacementData {
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
    ...(join !== undefined && { conjoined: join }),
  };
}

export interface JoinFixtureOptions {
  /** The join the whole sequence follows. */
  readonly sequenceJoin?: GridJoin;
  /** The start cell's own join; null keeps it on one grid. */
  readonly startJoin?: GridJoin | null;
  /** Each step's own join, step 1 first; undefined follows the sequence. */
  readonly stepJoins?: readonly (GridJoin | null | undefined)[];
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
  const stepJoins = options.stepJoins ?? [];
  return createSequenceData({
    id: "fixture-sequence",
    word: "ABC",
    name: "Join fixture",
    steps: STEP_SHAPES.map((shape, index) =>
      plainStep(index, shape, stepJoins[index], options.lettered ?? false)
    ),
    startPlacement: plainStartPlacement(options.startJoin),
    ...(options.sequenceJoin && { conjoined: options.sequenceJoin }),
    ...(options.handPath && { sequenceKind: "hand-path" as const }),
  });
}

/**
 * `sequence` with the joins `options` describes, its motions untouched. Lets a
 * test join a real saved sequence instead of the built fixture.
 */
export function withJoins(
  sequence: SequenceData,
  options: Pick<JoinFixtureOptions, "sequenceJoin" | "startJoin" | "stepJoins">
): SequenceData {
  const stepJoins = options.stepJoins ?? [];
  const startJoin = options.startJoin !== undefined && {
    conjoined: options.startJoin,
  };
  return {
    ...sequence,
    ...(options.sequenceJoin && { conjoined: options.sequenceJoin }),
    ...(startJoin &&
      sequence.startPlacement && {
        startPlacement: { ...sequence.startPlacement, ...startJoin },
      }),
    ...(startJoin &&
      sequence.startingPlacement && {
        startingPlacement: { ...sequence.startingPlacement, ...startJoin },
      }),
    steps: sequence.steps.map((step, index) =>
      stepJoins[index] !== undefined
        ? { ...step, conjoined: stepJoins[index] }
        : step
    ),
  };
}

/** The join fields of a sequence, for comparing across a round trip. */
export function joinsOf(sequence: SequenceData): {
  readonly sequence: GridJoin | null | undefined;
  readonly start: GridJoin | null | undefined;
  readonly steps: readonly (GridJoin | null | undefined)[];
} {
  const start = sequence.startPlacement ?? sequence.startingPlacement;
  return {
    sequence: sequence.conjoined,
    start: start?.conjoined,
    steps: sequence.steps.map((step) => step.conjoined),
  };
}
