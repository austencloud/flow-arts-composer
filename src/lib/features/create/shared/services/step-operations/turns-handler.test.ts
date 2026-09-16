import { describe, it, expect, vi } from "vitest";
import { findPreviousRotationDirection, updateStepTurns } from "./turns-handler";
import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import {
  HandSide,
  MotionType,
  RotationDirection,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import type { ICreateModuleState } from "../../types/create-module-types";

vi.mock(
  "$lib/shared/pictograph/prop/services/orientation-calculator",
  () => ({
    calculateEndOrientation: () => "in",
  })
);

vi.mock("$lib/shared/create/services/reversal-detector", () => ({
  reversalDetector: {
    processReversals: (seq: unknown) => seq,
  },
}));

vi.mock("./OrientationHandler", () => ({
  calculatePropagatedSteps: (
    _stepNum: number,
    _color: string,
    seq: { steps: StepData[] }
  ) => seq.steps,
}));

function makeStep(
  overrides: {
    stepNumber?: number;
    left?: { motionType?: MotionType; rotationDirection?: RotationDirection; turns?: number | "fl" };
    right?: { motionType?: MotionType; rotationDirection?: RotationDirection; turns?: number | "fl" };
  } = {}
): StepData {
  return {
    id: "test",
    stepNumber: overrides.stepNumber ?? 1,
    duration: 1,
    leftReversal: false,
    rightReversal: false,
    isBlank: false,
    motions: {
      [HandSide.LEFT]: createMotionData({
        motionType: overrides.left?.motionType ?? MotionType.DASH,
        rotationDirection:
          overrides.left?.rotationDirection ?? RotationDirection.NO_ROTATION,
        turns: overrides.left?.turns ?? 0,
      }),
      [HandSide.RIGHT]: createMotionData({
        motionType: overrides.right?.motionType ?? MotionType.DASH,
        rotationDirection:
          overrides.right?.rotationDirection ?? RotationDirection.NO_ROTATION,
        turns: overrides.right?.turns ?? 0,
      }),
    },
  } as StepData;
}

describe("findPreviousRotationDirection", () => {
  it("returns CCW when previous step blue has CCW rotation", () => {
    const steps = [
      makeStep({
        left: {
          motionType: MotionType.DASH,
          rotationDirection: RotationDirection.COUNTER_CLOCKWISE,
        },
      }),
      makeStep(),
    ];

    const result = findPreviousRotationDirection(
      steps,
      2,
      HandSide.LEFT
    );
    expect(result).toBe(RotationDirection.COUNTER_CLOCKWISE);
  });

  it("returns CW when previous step blue has CW rotation", () => {
    const steps = [
      makeStep({
        left: {
          motionType: MotionType.PRO,
          rotationDirection: RotationDirection.CLOCKWISE,
        },
      }),
      makeStep(),
    ];

    const result = findPreviousRotationDirection(
      steps,
      2,
      HandSide.LEFT
    );
    expect(result).toBe(RotationDirection.CLOCKWISE);
  });

  it("searches backward past steps with NO_ROTATION", () => {
    const steps = [
      makeStep({
        left: {
          motionType: MotionType.ANTI,
          rotationDirection: RotationDirection.COUNTER_CLOCKWISE,
        },
      }),
      makeStep(), // NO_ROTATION
      makeStep(), // NO_ROTATION — this is the step being edited (step 3)
    ];

    const result = findPreviousRotationDirection(
      steps,
      3,
      HandSide.LEFT
    );
    expect(result).toBe(RotationDirection.COUNTER_CLOCKWISE);
  });

  it("uses correct color — red step context doesn't bleed into blue", () => {
    const steps = [
      makeStep({
        left: { rotationDirection: RotationDirection.NO_ROTATION },
        right: { rotationDirection: RotationDirection.COUNTER_CLOCKWISE },
      }),
      makeStep(),
    ];

    const result = findPreviousRotationDirection(
      steps,
      2,
      HandSide.LEFT
    );
    // Blue has no rotation context, should fall back to CLOCKWISE
    expect(result).toBe(RotationDirection.CLOCKWISE);
  });

  it("returns red rotation when querying red color", () => {
    const steps = [
      makeStep({
        left: { rotationDirection: RotationDirection.CLOCKWISE },
        right: { rotationDirection: RotationDirection.COUNTER_CLOCKWISE },
      }),
      makeStep(),
    ];

    const result = findPreviousRotationDirection(
      steps,
      2,
      HandSide.RIGHT
    );
    expect(result).toBe(RotationDirection.COUNTER_CLOCKWISE);
  });

  it("falls back to CLOCKWISE when no prior rotation exists", () => {
    const steps = [makeStep(), makeStep()];

    const result = findPreviousRotationDirection(
      steps,
      2,
      HandSide.LEFT
    );
    expect(result).toBe(RotationDirection.CLOCKWISE);
  });

  it("falls back to CLOCKWISE for step 1 (no prior steps)", () => {
    const steps = [makeStep()];

    const result = findPreviousRotationDirection(
      steps,
      1,
      HandSide.LEFT
    );
    expect(result).toBe(RotationDirection.CLOCKWISE);
  });

  it("picks nearest rotation when multiple prior steps have rotation", () => {
    const steps = [
      makeStep({
        left: { rotationDirection: RotationDirection.CLOCKWISE },
      }),
      makeStep({
        left: { rotationDirection: RotationDirection.COUNTER_CLOCKWISE },
      }),
      makeStep(),
    ];

    const result = findPreviousRotationDirection(
      steps,
      3,
      HandSide.LEFT
    );
    // Step 2 (index 1) is closer — should pick CCW
    expect(result).toBe(RotationDirection.COUNTER_CLOCKWISE);
  });

  // Reproduces the exact scenario from the feedback:
  // Step 1: dash ccw for both hands
  // Step 2: static with 0 turns — adding turns should default to ccw
  it("feedback scenario: step 1 dash ccw → step 2 static defaults to ccw", () => {
    const steps = [
      makeStep({
        left: {
          motionType: MotionType.DASH,
          rotationDirection: RotationDirection.COUNTER_CLOCKWISE,
        },
        right: {
          motionType: MotionType.DASH,
          rotationDirection: RotationDirection.COUNTER_CLOCKWISE,
        },
      }),
      makeStep({
        left: { motionType: MotionType.STATIC },
        right: { motionType: MotionType.STATIC },
      }),
    ];

    expect(
      findPreviousRotationDirection(steps, 2, HandSide.LEFT)
    ).toBe(RotationDirection.COUNTER_CLOCKWISE);

    expect(
      findPreviousRotationDirection(steps, 2, HandSide.RIGHT)
    ).toBe(RotationDirection.COUNTER_CLOCKWISE);
  });
});

function makeMockState(steps: StepData[]): ICreateModuleState {
  let captured: unknown = null;
  const sequence = {
    id: "test",
    name: "test",
    word: "",
    steps,
    gridMode: "diamond",
    difficulty: 1,
    metadata: {},
  };
  return {
    sequenceState: {
      currentSequence: sequence,
      selectedStartPlacement: null,
      setCurrentSequence: (seq: unknown) => {
        captured = seq;
      },
      get _captured() {
        return captured;
      },
    },
    pushUndoSnapshot: () => {},
  } as unknown as ICreateModuleState;
}

function getCapturedStep(
  state: ICreateModuleState,
  stepIndex: number,
  color: HandSide
) {
  const captured = (
    state.sequenceState as unknown as { _captured: { steps: StepData[] } }
  )._captured;
  return captured.steps[stepIndex]!.motions[color]!;
}

describe("updateStepTurns integration", () => {
  it("assigns ccw when previous step has ccw rotation (feedback scenario)", () => {
    const steps = [
      makeStep({
        stepNumber: 1,
        left: {
          motionType: MotionType.DASH,
          rotationDirection: RotationDirection.COUNTER_CLOCKWISE,
        },
        right: {
          motionType: MotionType.DASH,
          rotationDirection: RotationDirection.COUNTER_CLOCKWISE,
        },
      }),
      makeStep({
        stepNumber: 2,
        left: {
          motionType: MotionType.STATIC,
          rotationDirection: RotationDirection.NO_ROTATION,
        },
        right: {
          motionType: MotionType.STATIC,
          rotationDirection: RotationDirection.NO_ROTATION,
        },
      }),
    ];

    const state = makeMockState(steps);
    updateStepTurns(2, HandSide.LEFT, 0.5, state);

    expect(getCapturedStep(state, 1, HandSide.LEFT).rotationDirection).toBe(
      RotationDirection.COUNTER_CLOCKWISE
    );
  });

  it("assigns cw when previous step has cw rotation", () => {
    const steps = [
      makeStep({
        stepNumber: 1,
        left: {
          motionType: MotionType.DASH,
          rotationDirection: RotationDirection.CLOCKWISE,
        },
      }),
      makeStep({
        stepNumber: 2,
        left: {
          motionType: MotionType.STATIC,
          rotationDirection: RotationDirection.NO_ROTATION,
        },
      }),
    ];

    const state = makeMockState(steps);
    updateStepTurns(2, HandSide.LEFT, 0.5, state);

    expect(getCapturedStep(state, 1, HandSide.LEFT).rotationDirection).toBe(
      RotationDirection.CLOCKWISE
    );
  });

  it("falls back to cw when no previous step has rotation", () => {
    const steps = [
      makeStep({
        stepNumber: 1,
        left: {
          motionType: MotionType.STATIC,
          rotationDirection: RotationDirection.NO_ROTATION,
        },
      }),
      makeStep({
        stepNumber: 2,
        left: {
          motionType: MotionType.STATIC,
          rotationDirection: RotationDirection.NO_ROTATION,
        },
      }),
    ];

    const state = makeMockState(steps);
    updateStepTurns(2, HandSide.LEFT, 0.5, state);

    expect(getCapturedStep(state, 1, HandSide.LEFT).rotationDirection).toBe(
      RotationDirection.CLOCKWISE
    );
  });

  it("clears rotation when turns go to zero", () => {
    const steps = [
      makeStep({
        stepNumber: 1,
        left: {
          motionType: MotionType.DASH,
          rotationDirection: RotationDirection.COUNTER_CLOCKWISE,
          turns: 1,
        },
      }),
    ];

    const state = makeMockState(steps);
    updateStepTurns(1, HandSide.LEFT, 0, state);

    expect(getCapturedStep(state, 0, HandSide.LEFT).rotationDirection).toBe(
      RotationDirection.NO_ROTATION
    );
  });

  it("does not auto-assign rotation for PRO motion type", () => {
    const steps = [
      makeStep({
        stepNumber: 1,
        left: {
          motionType: MotionType.PRO,
          rotationDirection: RotationDirection.COUNTER_CLOCKWISE,
        },
      }),
      makeStep({
        stepNumber: 2,
        left: {
          motionType: MotionType.PRO,
          rotationDirection: RotationDirection.NO_ROTATION,
        },
      }),
    ];

    const state = makeMockState(steps);
    updateStepTurns(2, HandSide.LEFT, 0.5, state);

    expect(getCapturedStep(state, 1, HandSide.LEFT).rotationDirection).toBe(
      RotationDirection.NO_ROTATION
    );
  });
});
