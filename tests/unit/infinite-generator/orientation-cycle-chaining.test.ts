import { describe, it, expect } from "vitest";
import { detectOrientationCycle } from "#lib/shared/create/services/orientation-cycle-detector.js";
import { OrientationCycleExtender } from "#lib/features/create/generate/circular/services/orientation-cycle-extender.js";
import { createMotionData } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import { createSequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import {
  MotionType,
  HandSide,
  Orientation,
  RotationDirection,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import { GridLocation } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";

function makeStep(
  stepNumber: number,
  left: Partial<Parameters<typeof createMotionData>[0]>,
  right: Partial<Parameters<typeof createMotionData>[0]>
): StepData {
  return {
    id: `step-${stepNumber}`,
    stepNumber,
    duration: 1,
    leftReversal: false,
    rightReversal: false,
    isBlank: false,
    motions: {
      [HandSide.LEFT]: createMotionData({
        hand: HandSide.LEFT,
        ...left,
      }),
      [HandSide.RIGHT]: createMotionData({
        hand: HandSide.RIGHT,
        ...right,
      }),
    },
  };
}

/**
 * After extension, the final beat's end orientations must match the
 * first beat's start orientations. This is what the infinite generator
 * relies on for seamless chaining.
 */
function assertOrientationsReturnToStart(
  label: string,
  sequence: ReturnType<typeof createSequenceData>
) {
  const firstStep = sequence.steps[0];
  const lastStep = sequence.steps[sequence.steps.length - 1];

  const leftStart = firstStep.motions[HandSide.LEFT]!.startOrientation;
  const rightStart = firstStep.motions[HandSide.RIGHT]!.startOrientation;
  const leftEnd = lastStep.motions[HandSide.LEFT]!.endOrientation;
  const rightEnd = lastStep.motions[HandSide.RIGHT]!.endOrientation;

  expect(leftEnd, `${label}: blue end orientation`).toBe(leftStart);
  expect(rightEnd, `${label}: red end orientation`).toBe(rightStart);
}

describe("OrientationCycleExtender for infinite generator chaining", () => {
  const extender = new OrientationCycleExtender();

  it("passes through a sequence that already returns to starting orientation", () => {
    // PRO with 2 turns: even turns = same orientation. Already a complete cycle.
    const seq = createSequenceData({
      word: "A",
      isCircular: true,
      steps: [
        makeStep(1, {
          motionType: MotionType.PRO,
          turns: 2,
          rotationDirection: RotationDirection.CLOCKWISE,
          startLocation: GridLocation.NORTH,
          endLocation: GridLocation.NORTH,
          startOrientation: Orientation.IN,
          endOrientation: Orientation.IN,
        }, {
          motionType: MotionType.PRO,
          turns: 2,
          rotationDirection: RotationDirection.CLOCKWISE,
          startLocation: GridLocation.SOUTH,
          endLocation: GridLocation.SOUTH,
          startOrientation: Orientation.IN,
          endOrientation: Orientation.IN,
        }),
      ],
    });

    const result = extender.extendIfNeeded(seq);
    expect(result.orientationCycleCount).toBe(1);
    expect(result.steps.length).toBe(1); // Not extended
    assertOrientationsReturnToStart("cycle-1 passthrough", result);
  });

  it("extends a 2-cycle sequence (swapped LOOP with orientation flip)", () => {
    // PRO with 1 turn: odd turns = switched orientation (in -> out).
    // After 2 passes, out -> in again. Classic swapped LOOP mismatch.
    const seq = createSequenceData({
      word: "AB",
      isCircular: true,
      steps: [
        makeStep(1, {
          motionType: MotionType.PRO,
          turns: 1,
          rotationDirection: RotationDirection.CLOCKWISE,
          startLocation: GridLocation.NORTH,
          endLocation: GridLocation.SOUTH,
          startOrientation: Orientation.IN,
          endOrientation: Orientation.OUT,
        }, {
          motionType: MotionType.PRO,
          turns: 1,
          rotationDirection: RotationDirection.COUNTER_CLOCKWISE,
          startLocation: GridLocation.SOUTH,
          endLocation: GridLocation.NORTH,
          startOrientation: Orientation.IN,
          endOrientation: Orientation.OUT,
        }),
        makeStep(2, {
          motionType: MotionType.PRO,
          turns: 1,
          rotationDirection: RotationDirection.CLOCKWISE,
          startLocation: GridLocation.SOUTH,
          endLocation: GridLocation.NORTH,
          startOrientation: Orientation.OUT,
          endOrientation: Orientation.IN,
        }, {
          motionType: MotionType.PRO,
          turns: 1,
          rotationDirection: RotationDirection.COUNTER_CLOCKWISE,
          startLocation: GridLocation.NORTH,
          endLocation: GridLocation.SOUTH,
          startOrientation: Orientation.OUT,
          endOrientation: Orientation.IN,
        }),
      ],
    });

    // Verify: without extension, orientations DO return (2 beats, each flips in->out->in)
    // Let's make one that doesn't return after 1 pass:
    const mismatchSeq = createSequenceData({
      word: "A",
      isCircular: true,
      steps: [
        makeStep(1, {
          motionType: MotionType.PRO,
          turns: 1,
          rotationDirection: RotationDirection.CLOCKWISE,
          startLocation: GridLocation.NORTH,
          endLocation: GridLocation.SOUTH,
          startOrientation: Orientation.IN,
          endOrientation: Orientation.OUT, // Flipped!
        }, {
          motionType: MotionType.PRO,
          turns: 1,
          rotationDirection: RotationDirection.COUNTER_CLOCKWISE,
          startLocation: GridLocation.SOUTH,
          endLocation: GridLocation.NORTH,
          startOrientation: Orientation.IN,
          endOrientation: Orientation.OUT, // Flipped!
        }),
      ],
    });

    const detection = detectOrientationCycle(mismatchSeq);
    expect(detection.cycleCount).toBe(2); // Needs 2 reps to return

    const extended = extender.extendIfNeeded(mismatchSeq);
    expect(extended.orientationCycleCount).toBe(2);
    expect(extended.steps.length).toBe(2); // Doubled
    expect(extended.word).toBe("AA"); // Word repeated
    assertOrientationsReturnToStart("2-cycle swapped", extended);
  });

  it("extends a 4-cycle sequence (quarter-turn orientation shift)", () => {
    // ANTI with 0.5 turns shifts orientation by 90 degrees.
    // in -> clock -> out -> counter -> in (4 passes to return)
    const seq = createSequenceData({
      word: "X",
      isCircular: true,
      steps: [
        makeStep(1, {
          motionType: MotionType.ANTI,
          turns: 0.5,
          rotationDirection: RotationDirection.CLOCKWISE,
          startLocation: GridLocation.NORTH,
          endLocation: GridLocation.EAST,
          startOrientation: Orientation.IN,
          endOrientation: Orientation.CLOCK, // ANTI CW 0.5: IN +2 steps CW = CLOCK
        }, {
          motionType: MotionType.ANTI,
          turns: 0.5,
          rotationDirection: RotationDirection.COUNTER_CLOCKWISE,
          startLocation: GridLocation.SOUTH,
          endLocation: GridLocation.WEST,
          startOrientation: Orientation.IN,
          endOrientation: Orientation.COUNTER, // ANTI CCW 0.5: IN +2 steps CCW = COUNTER
        }),
      ],
    });

    const detection = detectOrientationCycle(seq);
    expect(detection.cycleCount).toBe(4);

    const extended = extender.extendIfNeeded(seq);
    expect(extended.orientationCycleCount).toBe(4);
    expect(extended.steps.length).toBe(4); // Quadrupled
    expect(extended.word).toBe("XXXX");
    assertOrientationsReturnToStart("4-cycle quarter-turn", extended);
  });

  it("handles mixed hand orientations (blue mismatched, red matched)", () => {
    // Blue: PRO 1 turn = in->out (mismatched)
    // Red: PRO 2 turns = in->in (matched)
    // Needs 2 reps for blue to return, red is already home
    const seq = createSequenceData({
      word: "M",
      isCircular: true,
      steps: [
        makeStep(1, {
          motionType: MotionType.PRO,
          turns: 1,
          rotationDirection: RotationDirection.CLOCKWISE,
          startLocation: GridLocation.NORTH,
          endLocation: GridLocation.SOUTH,
          startOrientation: Orientation.IN,
          endOrientation: Orientation.OUT,
        }, {
          motionType: MotionType.PRO,
          turns: 2,
          rotationDirection: RotationDirection.CLOCKWISE,
          startLocation: GridLocation.SOUTH,
          endLocation: GridLocation.SOUTH,
          startOrientation: Orientation.IN,
          endOrientation: Orientation.IN, // Already matched
        }),
      ],
    });

    const detection = detectOrientationCycle(seq);
    expect(detection.cycleCount).toBe(2);

    const extended = extender.extendIfNeeded(seq);
    expect(extended.orientationCycleCount).toBe(2);
    expect(extended.steps.length).toBe(2);
    assertOrientationsReturnToStart("mixed hands", extended);
  });

  it("handles multi-beat sequences with cumulative orientation drift", () => {
    // 4-beat sequence where each beat does PRO 0.5 turns (quarter-turn shift).
    // After 4 beats: in -> counterIn -> counter -> counterOut (not back to IN)
    // But we're testing the extender, so let's use a simpler cumulative case:
    // 2 beats, each PRO 1 turn. Beat 1: in->out, Beat 2: out->in. Already returns!
    // Instead: 2 beats of ANTI 0.5 turns each.
    // Beat 1: in -> clock (ANTI 0.5 CW steps same direction = clock)
    // Beat 2: clock -> out
    // After 1 pass: in -> out (not returned)
    // After 2 passes: out -> in (returned!)
    const seq = createSequenceData({
      word: "QR",
      isCircular: true,
      steps: [
        makeStep(1, {
          motionType: MotionType.ANTI,
          turns: 0.5,
          rotationDirection: RotationDirection.CLOCKWISE,
          startLocation: GridLocation.NORTH,
          endLocation: GridLocation.EAST,
          startOrientation: Orientation.IN,
          endOrientation: Orientation.CLOCK,
        }, {
          motionType: MotionType.ANTI,
          turns: 0.5,
          rotationDirection: RotationDirection.CLOCKWISE,
          startLocation: GridLocation.SOUTH,
          endLocation: GridLocation.WEST,
          startOrientation: Orientation.IN,
          endOrientation: Orientation.CLOCK,
        }),
        makeStep(2, {
          motionType: MotionType.ANTI,
          turns: 0.5,
          rotationDirection: RotationDirection.CLOCKWISE,
          startLocation: GridLocation.EAST,
          endLocation: GridLocation.SOUTH,
          startOrientation: Orientation.CLOCK,
          endOrientation: Orientation.OUT,
        }, {
          motionType: MotionType.ANTI,
          turns: 0.5,
          rotationDirection: RotationDirection.CLOCKWISE,
          startLocation: GridLocation.WEST,
          endLocation: GridLocation.NORTH,
          startOrientation: Orientation.CLOCK,
          endOrientation: Orientation.OUT,
        }),
      ],
    });

    const detection = detectOrientationCycle(seq);
    expect(detection.cycleCount).toBe(2);

    const extended = extender.extendIfNeeded(seq);
    expect(extended.orientationCycleCount).toBe(2);
    expect(extended.steps.length).toBe(4); // 2 beats x 2 passes
    expect(extended.word).toBe("QRQR");
    assertOrientationsReturnToStart("multi-beat cumulative", extended);
  });
});
