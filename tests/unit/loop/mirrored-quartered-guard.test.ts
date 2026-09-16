/**
 * Guard: a quartered (period-4) mirrored LOOP must NOT over-extend a seed that
 * already closes at period 2.
 *
 * Regression for the YΦΔ×4 defect (2026-07-10): the card is a 3-beat seed
 * (YΦΔ, gamma13→gamma5 — a valid vertical-mirror pair) with zero turns. A
 * zero-turn seed returns to its start orientation after the period-2 mirror, so
 * a quartered request produces a byte-for-byte literal repeat (12 beats) when
 * the honest loop is 6. The executor guard stops at period 2 in that case.
 */

import { describe, it, expect } from "vitest";
import { strictMirroredLOOPExecutor } from "$lib/features/create/generate/circular/services/strict-mirrored-loop-executor";
import { Period } from "$lib/features/create/generate/circular/domain/models/circular-models";
import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import {
  MotionType,
  HandSide,
  Orientation,
  RotationDirection,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { GridLocation, GridPlacement } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";

function step(
  stepNumber: number,
  startPlacement: GridPlacement | null,
  endPlacement: GridPlacement | null,
  left: Partial<Parameters<typeof createMotionData>[0]>,
  right: Partial<Parameters<typeof createMotionData>[0]>,
): StepData {
  return {
    id: `step-${stepNumber}`,
    stepNumber,
    startPlacement,
    endPlacement,
    duration: 1,
    leftReversal: false,
    rightReversal: false,
    isBlank: false,
    motions: {
      [HandSide.LEFT]: createMotionData({ hand: HandSide.LEFT, ...left }),
      [HandSide.RIGHT]: createMotionData({ hand: HandSide.RIGHT, ...right }),
    },
  } as StepData;
}

const RED_STATIC = {
  motionType: MotionType.STATIC,
  turns: 0,
  rotationDirection: RotationDirection.NO_ROTATION,
  startLocation: GridLocation.SOUTH,
  endLocation: GridLocation.SOUTH,
  startOrientation: Orientation.IN,
  endOrientation: Orientation.IN,
} as const;

/** Start position + the 3-beat YΦΔ seed (gamma13 → gamma5), all zero turns. */
function zeroTurnMirrorSeed(): StepData[] {
  return [
    step(0, GridPlacement.GAMMA13, GridPlacement.GAMMA13,
      { motionType: MotionType.STATIC, turns: 0, rotationDirection: RotationDirection.NO_ROTATION,
        startLocation: GridLocation.WEST, endLocation: GridLocation.WEST,
        startOrientation: Orientation.IN, endOrientation: Orientation.IN },
      RED_STATIC),
    step(1, GridPlacement.GAMMA13, GridPlacement.BETA5,
      { motionType: MotionType.PRO, turns: 0, rotationDirection: RotationDirection.COUNTER_CLOCKWISE,
        startLocation: GridLocation.WEST, endLocation: GridLocation.SOUTH,
        startOrientation: Orientation.IN, endOrientation: Orientation.IN },
      RED_STATIC),
    step(2, GridPlacement.BETA5, GridPlacement.ALPHA5,
      { motionType: MotionType.DASH, turns: 0, rotationDirection: RotationDirection.NO_ROTATION,
        startLocation: GridLocation.SOUTH, endLocation: GridLocation.NORTH,
        startOrientation: Orientation.IN, endOrientation: Orientation.OUT },
      RED_STATIC),
    step(3, GridPlacement.ALPHA5, GridPlacement.GAMMA5,
      { motionType: MotionType.ANTI, turns: 0, rotationDirection: RotationDirection.COUNTER_CLOCKWISE,
        startLocation: GridLocation.NORTH, endLocation: GridLocation.EAST,
        startOrientation: Orientation.OUT, endOrientation: Orientation.IN },
      RED_STATIC),
  ];
}

describe("StrictMirroredLOOPExecutor quartered guard", () => {
  it("stops a zero-turn quartered mirror at period 2 (6 beats, not 12)", () => {
    const out = strictMirroredLOOPExecutor.executeLOOP(zeroTurnMirrorSeed(), Period.QUARTERED);
    const letters = out.filter((s) => s.stepNumber > 0);

    // 3-beat seed × period 2 = 6. The redundant period-4 passes are dropped.
    expect(letters).toHaveLength(6);

    // And it genuinely closes: last beat returns to the start position.
    expect(out[0]!.startPlacement).toBe(GridPlacement.GAMMA13);
    expect(letters[letters.length - 1]!.endPlacement).toBe(GridPlacement.GAMMA13);
  });

  it("still produces a full period-2 mirror when halved is requested", () => {
    const out = strictMirroredLOOPExecutor.executeLOOP(zeroTurnMirrorSeed(), Period.HALVED);
    const letters = out.filter((s) => s.stepNumber > 0);
    expect(letters).toHaveLength(6);
  });
});
