import { describe, expect, it } from "vitest";

import { ensureComposition } from "$lib/shared/foundation/services/sequence-hydrator";
import {
  createSequenceData,
  type SequenceData,
} from "$lib/shared/foundation/domain/models/sequence-data";
import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import {
  MotionType,
  RotationDirection,
  Orientation,
  HandSide,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { GridLocation } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";

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
    letter: null,
    startPlacement: null,
    endPlacement: null,
    motions: {
      left: createMotionData({ ...left, hand: HandSide.LEFT }),
      right: createMotionData({ ...right, hand: HandSide.RIGHT }),
    },
  };
}

/** A 2-step sequence with valid motions but NO startPlacement (the bug's shape). */
function buildSequenceWithoutStartPlacement(): SequenceData {
  return createSequenceData({
    word: "",
    name: "",
    steps: [
      makeStep(
        1,
        {
          motionType: MotionType.PRO,
          rotationDirection: RotationDirection.CLOCKWISE,
          startLocation: GridLocation.NORTH,
          endLocation: GridLocation.EAST,
          startOrientation: Orientation.IN,
          endOrientation: Orientation.IN,
          turns: 0,
          propType: PropType.STAFF,
        },
        {
          motionType: MotionType.PRO,
          rotationDirection: RotationDirection.CLOCKWISE,
          startLocation: GridLocation.SOUTH,
          endLocation: GridLocation.WEST,
          startOrientation: Orientation.IN,
          endOrientation: Orientation.IN,
          turns: 0,
          propType: PropType.STAFF,
        }
      ),
      makeStep(
        2,
        {
          motionType: MotionType.PRO,
          rotationDirection: RotationDirection.CLOCKWISE,
          startLocation: GridLocation.EAST,
          endLocation: GridLocation.SOUTH,
          startOrientation: Orientation.IN,
          endOrientation: Orientation.IN,
          turns: 0,
          propType: PropType.STAFF,
        },
        {
          motionType: MotionType.PRO,
          rotationDirection: RotationDirection.CLOCKWISE,
          startLocation: GridLocation.WEST,
          endLocation: GridLocation.NORTH,
          startOrientation: Orientation.IN,
          endOrientation: Orientation.IN,
          turns: 0,
          propType: PropType.STAFF,
        }
      ),
    ],
  });
}

describe("ensureComposition — start placement persistence", () => {
  // Regression for the 2026-06 empty-start-cell bug: compositional/LOOP saves
  // dropped the startPlacement field, so saved docs + public mirrors rendered a
  // bare grid with no start props. ensureComposition (run at save + publish) must
  // now reconstruct a renderable start placement from the first step.
  it("derives a renderable startPlacement when the sequence lacks one", () => {
    const seq = buildSequenceWithoutStartPlacement();
    expect(seq.startPlacement).toBeUndefined();

    const composed = ensureComposition(seq);

    expect(composed.startPlacement).toBeTruthy();
    const motions = composed.startPlacement?.motions;
    expect(motions?.left).toBeTruthy();
    expect(motions?.right).toBeTruthy();
    // Start placement = both props STATIC at their first-step start locations.
    expect(motions?.left?.motionType).toBe(MotionType.STATIC);
    expect(motions?.right?.motionType).toBe(MotionType.STATIC);
    expect(motions?.left?.startLocation).toBe(GridLocation.NORTH);
    expect(motions?.left?.endLocation).toBe(GridLocation.NORTH);
    expect(motions?.right?.startLocation).toBe(GridLocation.SOUTH);
    expect(motions?.right?.endLocation).toBe(GridLocation.SOUTH);
    // The glyph must be the start PLACEMENT (blue@north + red@south = alpha),
    // NOT the first step's letter. Only alpha/beta/gamma are valid here.
    expect(["α", "β", "γ"]).toContain(composed.startPlacement?.letter);
    expect(composed.startPlacement?.letter).toBe("α");
  });

  it("preserves an existing startPlacement instead of overwriting it", () => {
    const seq = buildSequenceWithoutStartPlacement();
    const existing = {
      isStartPlacement: true as const,
      id: "start-preexisting",
      letter: null,
      endPlacement: null,
      motions: {
        left: createMotionData({
          motionType: MotionType.STATIC,
          startLocation: GridLocation.EAST,
          endLocation: GridLocation.EAST,
          hand: HandSide.LEFT,
        }),
        right: createMotionData({
          motionType: MotionType.STATIC,
          startLocation: GridLocation.WEST,
          endLocation: GridLocation.WEST,
          hand: HandSide.RIGHT,
        }),
      },
    } as SequenceData["startPlacement"];

    const composed = ensureComposition({ ...seq, startPlacement: existing });

    expect(composed.startPlacement?.id).toBe("start-preexisting");
    expect(composed.startPlacement?.motions?.left?.startLocation).toBe(GridLocation.EAST);
  });
});
