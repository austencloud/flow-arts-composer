import { describe, it, expect } from "vitest";
import {
  extractLeftSoloProp,
  extractRightSoloProp,
  extractStepPairings,
} from "$lib/shared/foundation/services/sequence-decomposer";
import { deriveSteps } from "$lib/shared/foundation/services/step-deriver";
import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import {
  GridLocation,
  GridPlacement,
} from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import {
  Orientation,
  MotionType,
  RotationDirection,
  HandSide,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import { Letter } from "$lib/shared/foundation/domain/models/letter";
import { createSequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import type { StartPlacementData } from "$lib/shared/foundation/domain/models/start-placement-data";

function makeMotion(
  startLocation: GridLocation,
  endLocation: GridLocation,
  color: HandSide,
  overrides: Parameters<typeof createMotionData>[0] = {}
) {
  return createMotionData({
    startLocation,
    endLocation,
    startOrientation: Orientation.IN,
    endOrientation: Orientation.OUT,
    motionType: MotionType.PRO,
    rotationDirection: RotationDirection.CLOCKWISE,
    turns: 1,
    hand: color,
    propType: PropType.STAFF,
    isVisible: true,
    arrowLocation: startLocation,
    ...overrides,
  });
}

function makeStep(
  leftStart: GridLocation,
  leftEnd: GridLocation,
  rightStart: GridLocation,
  rightEnd: GridLocation,
  overrides: Partial<StepData> = {}
): StepData {
  return {
    id: crypto.randomUUID(),
    letter: Letter.A,
    startPlacement: GridPlacement.ALPHA1,
    endPlacement: GridPlacement.BETA1,
    motions: {
      left: makeMotion(leftStart, leftEnd, HandSide.LEFT),
      right: makeMotion(rightStart, rightEnd, HandSide.RIGHT),
    },
    stepNumber: 1,
    duration: 1,
    leftReversal: false,
    rightReversal: false,
    isBlank: false,
    isStep: true,
    ...overrides,
  };
}

function makeStartPlacement(
  leftLocation: GridLocation,
  rightLocation: GridLocation,
  leftOrientation: Orientation = Orientation.IN,
  rightOrientation: Orientation = Orientation.OUT
): StartPlacementData {
  return {
    id: crypto.randomUUID(),
    isStartPlacement: true,
    gridPlacement: GridPlacement.ALPHA1,
    motions: {
      left: createMotionData({
        startLocation: leftLocation,
        endLocation: leftLocation,
        startOrientation: leftOrientation,
        endOrientation: leftOrientation,
        motionType: MotionType.STATIC,
        rotationDirection: RotationDirection.NO_ROTATION,
        turns: 0,
        hand: HandSide.LEFT,
        propType: PropType.STAFF,
        isVisible: true,
        arrowLocation: leftLocation,
      }),
      right: createMotionData({
        startLocation: rightLocation,
        endLocation: rightLocation,
        startOrientation: rightOrientation,
        endOrientation: rightOrientation,
        motionType: MotionType.STATIC,
        rotationDirection: RotationDirection.NO_ROTATION,
        turns: 0,
        hand: HandSide.RIGHT,
        propType: PropType.STAFF,
        isVisible: true,
        arrowLocation: rightLocation,
      }),
    },
  };
}

/**
 * Builds a two-step SequenceData with both a start position and two beats.
 *
 * Beat 1: blue N→E (PRO, CW, 1 turn), red S→W (PRO, CW, 1 turn)
 * Beat 2: blue E→S (ANTI, CCW, 1 turn), red W→N (ANTI, CCW, 1 turn)
 */
function createTestSequence() {
  const step1 = makeStep(
    GridLocation.NORTH,
    GridLocation.EAST,
    GridLocation.SOUTH,
    GridLocation.WEST,
    { stepNumber: 1, letter: Letter.A }
  );

  const step2 = makeStep(
    GridLocation.EAST,
    GridLocation.SOUTH,
    GridLocation.WEST,
    GridLocation.NORTH,
    {
      stepNumber: 2,
      letter: Letter.B,
      leftReversal: true,
      rightReversal: false,
      startPlacement: GridPlacement.BETA1,
      endPlacement: GridPlacement.GAMMA1,
      motions: {
        left: makeMotion(GridLocation.EAST, GridLocation.SOUTH, HandSide.LEFT, {
          motionType: MotionType.ANTI,
          rotationDirection: RotationDirection.COUNTER_CLOCKWISE,
        }),
        right: makeMotion(
          GridLocation.WEST,
          GridLocation.NORTH,
          HandSide.RIGHT,
          {
            motionType: MotionType.ANTI,
            rotationDirection: RotationDirection.COUNTER_CLOCKWISE,
          }
        ),
      },
    }
  );

  const startPos = makeStartPlacement(
    GridLocation.NORTH,
    GridLocation.SOUTH,
    Orientation.IN,
    Orientation.OUT
  );

  return createSequenceData({
    steps: [step1, step2],
    startPlacement: startPos,
    word: "AB",
  });
}

describe("SequenceDecomposer — extractBlueSoloProp", () => {
  it("returns a SoloPropData with one step per sequence step", () => {
    const sequence = createTestSequence();
    const left = extractLeftSoloProp(sequence);
    expect(left.steps).toHaveLength(sequence.steps.length);
  });

  it("preserves blue startLocation from startPlacement", () => {
    const sequence = createTestSequence();
    const left = extractLeftSoloProp(sequence);
    expect(left.startLocation).toBe(GridLocation.NORTH);
  });

  it("preserves blue startOrientation from startPlacement", () => {
    const sequence = createTestSequence();
    const left = extractLeftSoloProp(sequence);
    expect(left.startOrientation).toBe(Orientation.IN);
  });

  it("captures step motionType correctly", () => {
    const sequence = createTestSequence();
    const left = extractLeftSoloProp(sequence);
    expect(left.steps[0]?.motionType).toBe(MotionType.PRO);
    expect(left.steps[1]?.motionType).toBe(MotionType.ANTI);
  });

  it("captures step locations correctly", () => {
    const sequence = createTestSequence();
    const left = extractLeftSoloProp(sequence);
    expect(left.steps[0]?.startLocation).toBe(GridLocation.NORTH);
    expect(left.steps[0]?.endLocation).toBe(GridLocation.EAST);
    expect(left.steps[1]?.startLocation).toBe(GridLocation.EAST);
    expect(left.steps[1]?.endLocation).toBe(GridLocation.SOUTH);
  });

  it("captures step duration from the original StepData", () => {
    const step = makeStep(
      GridLocation.NORTH,
      GridLocation.EAST,
      GridLocation.SOUTH,
      GridLocation.WEST,
      { duration: 3 }
    );
    const sequence = createSequenceData({ steps: [step], word: "A" });
    const left = extractLeftSoloProp(sequence);
    expect(left.steps[0]?.duration).toBe(3);
  });

  it("falls back to first step motion when startPlacement is absent", () => {
    const step = makeStep(
      GridLocation.EAST,
      GridLocation.SOUTH,
      GridLocation.WEST,
      GridLocation.NORTH
    );
    const sequence = createSequenceData({ steps: [step], word: "A" });
    const left = extractLeftSoloProp(sequence);
    // Falls back to step[0].motions.left.startLocation
    expect(left.startLocation).toBe(GridLocation.EAST);
  });
});

describe("SequenceDecomposer — extractRedSoloProp", () => {
  it("returns a SoloPropData with one step per sequence step", () => {
    const sequence = createTestSequence();
    const right = extractRightSoloProp(sequence);
    expect(right.steps).toHaveLength(sequence.steps.length);
  });

  it("preserves red startLocation from startPlacement", () => {
    const sequence = createTestSequence();
    const right = extractRightSoloProp(sequence);
    expect(right.startLocation).toBe(GridLocation.SOUTH);
  });

  it("preserves red startOrientation from startPlacement", () => {
    const sequence = createTestSequence();
    const right = extractRightSoloProp(sequence);
    expect(right.startOrientation).toBe(Orientation.OUT);
  });

  it("captures correct step locations for red", () => {
    const sequence = createTestSequence();
    const right = extractRightSoloProp(sequence);
    expect(right.steps[0]?.startLocation).toBe(GridLocation.SOUTH);
    expect(right.steps[0]?.endLocation).toBe(GridLocation.WEST);
    expect(right.steps[1]?.startLocation).toBe(GridLocation.WEST);
    expect(right.steps[1]?.endLocation).toBe(GridLocation.NORTH);
  });
});

describe("SequenceDecomposer — extractStepPairings", () => {
  it("returns one pairing per step", () => {
    const sequence = createTestSequence();
    const pairings = extractStepPairings(sequence);
    expect(pairings).toHaveLength(sequence.steps.length);
  });

  it("preserves letter from each step", () => {
    const sequence = createTestSequence();
    const pairings = extractStepPairings(sequence);
    expect(pairings[0]?.letter).toBe(Letter.A);
    expect(pairings[1]?.letter).toBe(Letter.B);
  });

  it("preserves blueReversal and redReversal", () => {
    const sequence = createTestSequence();
    const pairings = extractStepPairings(sequence);
    // Step 2 has blueReversal: true, redReversal: false
    expect(pairings[1]?.leftReversal).toBe(true);
    expect(pairings[1]?.rightReversal).toBe(false);
  });

  it("preserves startPlacement and endPlacement", () => {
    const sequence = createTestSequence();
    const pairings = extractStepPairings(sequence);
    expect(pairings[1]?.startPlacement).toBe(GridPlacement.BETA1);
    expect(pairings[1]?.endPlacement).toBe(GridPlacement.GAMMA1);
  });

  it("converts undefined letter to null", () => {
    const step = makeStep(
      GridLocation.NORTH,
      GridLocation.EAST,
      GridLocation.SOUTH,
      GridLocation.WEST,
      { letter: undefined }
    );
    const sequence = createSequenceData({ steps: [step], word: "" });
    const pairings = extractStepPairings(sequence);
    expect(pairings[0]?.letter).toBeNull();
  });
});

describe("SequenceDecomposer — round-trip", () => {
  it("decompose then deriveSteps produces domain-equivalent steps", () => {
    const original = createTestSequence();

    const left = extractLeftSoloProp(original);
    const right = extractRightSoloProp(original);
    const pairings = extractStepPairings(original);

    const derived = deriveSteps(left, right, pairings);

    expect(derived).toHaveLength(original.steps.length);

    for (let i = 0; i < original.steps.length; i++) {
      const orig = original.steps[i]!;
      const deriv = derived[i]!;

      // Pairing fields
      expect(deriv.letter).toBe(orig.letter);
      expect(deriv.leftReversal).toBe(orig.leftReversal);
      expect(deriv.rightReversal).toBe(orig.rightReversal);

      // Blue motion geometry
      expect(deriv.motions.left?.startLocation).toBe(
        orig.motions.left?.startLocation
      );
      expect(deriv.motions.left?.endLocation).toBe(
        orig.motions.left?.endLocation
      );
      expect(deriv.motions.left?.motionType).toBe(
        orig.motions.left?.motionType
      );
      expect(deriv.motions.left?.rotationDirection).toBe(
        orig.motions.left?.rotationDirection
      );
      expect(deriv.motions.left?.turns).toBe(orig.motions.left?.turns);
      expect(deriv.motions.left?.startOrientation).toBe(
        orig.motions.left?.startOrientation
      );
      expect(deriv.motions.left?.endOrientation).toBe(
        orig.motions.left?.endOrientation
      );

      // Red motion geometry
      expect(deriv.motions.right?.startLocation).toBe(
        orig.motions.right?.startLocation
      );
      expect(deriv.motions.right?.endLocation).toBe(
        orig.motions.right?.endLocation
      );
      expect(deriv.motions.right?.motionType).toBe(
        orig.motions.right?.motionType
      );
      expect(deriv.motions.right?.rotationDirection).toBe(
        orig.motions.right?.rotationDirection
      );
      expect(deriv.motions.right?.turns).toBe(orig.motions.right?.turns);
      expect(deriv.motions.right?.startOrientation).toBe(
        orig.motions.right?.startOrientation
      );
      expect(deriv.motions.right?.endOrientation).toBe(
        orig.motions.right?.endOrientation
      );
    }
  });

  it("duration is preserved through the round-trip (blue is authoritative)", () => {
    const step1 = makeStep(
      GridLocation.NORTH,
      GridLocation.EAST,
      GridLocation.SOUTH,
      GridLocation.WEST,
      { duration: 2 }
    );
    const step2 = makeStep(
      GridLocation.EAST,
      GridLocation.SOUTH,
      GridLocation.WEST,
      GridLocation.NORTH,
      { duration: 4 }
    );

    const sequence = createSequenceData({ steps: [step1, step2], word: "AB" });

    const left = extractLeftSoloProp(sequence);
    const right = extractRightSoloProp(sequence);
    const pairings = extractStepPairings(sequence);
    const derived = deriveSteps(left, right, pairings);

    expect(derived[0]?.duration).toBe(2);
    expect(derived[1]?.duration).toBe(4);
  });

  it("handles sequences with turns=0 (static motion)", () => {
    const step = makeStep(
      GridLocation.NORTH,
      GridLocation.NORTH,
      GridLocation.SOUTH,
      GridLocation.SOUTH,
      {
        motions: {
          left: makeMotion(
            GridLocation.NORTH,
            GridLocation.NORTH,
            HandSide.LEFT,
            {
              motionType: MotionType.STATIC,
              rotationDirection: RotationDirection.NO_ROTATION,
              turns: 0,
            }
          ),
          right: makeMotion(
            GridLocation.SOUTH,
            GridLocation.SOUTH,
            HandSide.RIGHT,
            {
              motionType: MotionType.STATIC,
              rotationDirection: RotationDirection.NO_ROTATION,
              turns: 0,
            }
          ),
        },
      }
    );

    const sequence = createSequenceData({ steps: [step], word: "S" });

    const left = extractLeftSoloProp(sequence);
    const right = extractRightSoloProp(sequence);
    const pairings = extractStepPairings(sequence);
    const derived = deriveSteps(left, right, pairings);

    expect(derived[0]?.motions.left?.motionType).toBe(MotionType.STATIC);
    expect(derived[0]?.motions.left?.turns).toBe(0);
    expect(derived[0]?.motions.right?.motionType).toBe(MotionType.STATIC);
    expect(derived[0]?.motions.right?.turns).toBe(0);
  });
});
