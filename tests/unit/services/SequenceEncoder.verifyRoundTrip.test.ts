import { describe, expect, it } from "vitest";
import { encodeSequenceWithCompression, verifySequenceRoundTrip } from "$lib/shared/navigation/services/sequence-encoder";
import { createSequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import {
  MotionType,
  RotationDirection,
  Orientation,
  HandSide,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { GridLocation } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";

describe("SequenceEncoder.verifyRoundTrip", () => {

  function makeAntiHalfTurn() {
    return createSequenceData({
      word: "",
      name: "",
      steps: [
        {
          id: "step-1",
          stepNumber: 1,
          duration: 1,
          leftReversal: false,
          rightReversal: false,
          isBlank: false,
          letter: null,
          startPlacement: null,
          endPlacement: null,
          motions: {
            left: createMotionData({
              hand: HandSide.LEFT,
              motionType: MotionType.ANTI,
              rotationDirection: RotationDirection.COUNTER_CLOCKWISE,
              startLocation: GridLocation.SOUTH,
              endLocation: GridLocation.WEST,
              startOrientation: Orientation.IN,
              endOrientation: Orientation.COUNTER,
              turns: 0.5,
              propType: PropType.STAFF,
            }),
            right: createMotionData({
              hand: HandSide.RIGHT,
              motionType: MotionType.STATIC,
              rotationDirection: RotationDirection.NO_ROTATION,
              startLocation: GridLocation.NORTH,
              endLocation: GridLocation.NORTH,
              startOrientation: Orientation.IN,
              endOrientation: Orientation.IN,
              turns: 0,
              propType: PropType.STAFF,
            }),
          },
        },
      ],
    });
  }

  it("returns ok=true for a clean round-trip", () => {
    const seq = makeAntiHalfTurn();
    const { encoded } = encodeSequenceWithCompression(seq);
    const result = verifySequenceRoundTrip(encoded);
    expect(result.ok).toBe(true);
    expect(result.decoded).toBeDefined();
    expect(result.reason).toBeUndefined();
  });

  it("returns ok=false for a corrupted blob", () => {
    const result = verifySequenceRoundTrip("s~z:not-actually-valid-data");
    expect(result.ok).toBe(false);
    expect(result.reason).toBeDefined();
  });
});
