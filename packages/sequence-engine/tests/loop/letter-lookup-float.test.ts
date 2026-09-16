import { describe, expect, it } from "vitest";
import { findLetterByMotions } from "../../src/loop/LetterLookup.js";

const pictographs = [
  {
    letter: "A",
    startPlacement: "alpha1",
    endPlacement: "alpha3",
    timing: "together",
    direction: "same",
    leftMotion: {
      motionType: "pro",
      rotationDirection: "cw",
      startLocation: "s",
      endLocation: "e",
    },
    rightMotion: {
      motionType: "anti",
      rotationDirection: "ccw",
      startLocation: "n",
      endLocation: "w",
    },
  },
];

describe("findLetterByMotions float provenance", () => {
  it("matches float output through its original shift type and rotation", () => {
    expect(
      findLetterByMotions(
        {
          motionType: "float",
          rotationDirection: "noRotation",
          prefloatMotionType: "pro",
          prefloatRotationDirection: "cw",
          startLocation: "s",
          endLocation: "e",
        },
        {
          motionType: "float",
          rotationDirection: "noRotation",
          prefloatMotionType: "anti",
          prefloatRotationDirection: "ccw",
          startLocation: "n",
          endLocation: "w",
        },
        pictographs
      )
    ).toBe("A");
  });
});
