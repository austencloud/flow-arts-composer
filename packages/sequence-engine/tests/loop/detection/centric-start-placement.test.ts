/**
 * LOOP detection reads tau and terra start placements.
 *
 * `deriveStartPlacement` used to catch the placement deriver's throw and
 * return null for any step with a hand at center, so every quarter check on a
 * centric sequence failed before it started. Gap 13 of
 * docs/superpowers/specs/2026-10-22-center-point-beyond-level-3.md.
 *
 * These steps are hand-built fixtures for the engine's reading of placements.
 * They are not claims about which center steps are legal TKA (that is the
 * spec's question Q5).
 */

import { describe, expect, it } from "vitest";
import { loopDetectorClass } from "../../../src/loop/detection/LOOPDetector.js";
import type {
  MotionData,
  SequenceStep,
} from "../../../src/core/types/sequence-engine-types.js";

function motion(
  motionType: string,
  startLocation: string,
  endLocation: string
): MotionData {
  return {
    motionType,
    startLocation,
    endLocation,
    rotationDirection: motionType === "static" ? "noRotation" : "cw",
    startOrientation: "in",
    endOrientation: "in",
    turns: 0,
  } as MotionData;
}

function step(
  stepNumber: number,
  left: MotionData,
  right: MotionData
): SequenceStep {
  return {
    id: `step-${stepNumber}`,
    stepNumber,
    duration: 1,
    letter: null,
    motions: { left, right },
  } as SequenceStep;
}

// Private methods reached for a focused check of the placement reading.
const detector = loopDetectorClass as unknown as {
  deriveStartPlacement(step: SequenceStep): string | null;
  getQuarteredRotationDirection(
    steps: readonly SequenceStep[]
  ): "cw" | "ccw" | null;
};

describe("LOOPDetector: start placements at center", () => {
  it("names tau and terra start placements in a two-step sequence", () => {
    // Blue stays at center; red goes N -> E, then E -> N.
    const steps = [
      step(1, motion("static", "c", "c"), motion("pro", "n", "e")),
      step(2, motion("static", "c", "c"), motion("pro", "e", "n")),
    ];
    expect(steps.map((s) => detector.deriveStartPlacement(s))).toEqual([
      "tau1",
      "tau3",
    ]);

    const redAtCenter = step(
      1,
      motion("static", "s", "s"),
      motion("static", "c", "c")
    );
    expect(detector.deriveStartPlacement(redAtCenter)).toBe("tau13");

    const bothAtCenter = step(
      1,
      motion("static", "c", "c"),
      motion("static", "c", "c")
    );
    expect(detector.deriveStartPlacement(bothAtCenter)).toBe("terra1");
  });

  it("reads a quarter turn between tau quarters", () => {
    // Red walks round a static blue hand at center, one quarter per step.
    const walk = (path: string[]) =>
      [0, 1, 2, 3].map((i) =>
        step(
          i + 1,
          motion("static", "c", "c"),
          motion("pro", path[i]!, path[i + 1]!)
        )
      );
    expect(
      detector.getQuarteredRotationDirection(walk(["n", "e", "s", "w", "n"]))
    ).toBe("cw");
    expect(
      detector.getQuarteredRotationDirection(walk(["n", "w", "s", "e", "n"]))
    ).toBe("ccw");
  });
});
