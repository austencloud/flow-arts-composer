import { describe, it, expect } from "vitest";
import { hashSequenceContent } from "../content-hasher";
import { applyVariationDescriptor } from "$lib/features/choreo-card/services/deck-variation";
import { createSequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";

function seq() {
  const m = () => createMotionData({
    motionType: "pro" as const,
    rotationDirection: "cw" as const,
    startLocation: "n" as const,
    endLocation: "e" as const,
    turns: 0,
    startOrientation: "in" as const,
    endOrientation: "in" as const,
  });
  return createSequenceData({
    id: "BASE", word: "AB",
    steps: [
      {
        id: "s1",
        stepNumber: 1, duration: 1, leftReversal: false, rightReversal: false, isBlank: false,
        letter: null, startPlacement: null, endPlacement: null,
        motions: { left: m(), right: m() },
      },
      {
        id: "s2",
        stepNumber: 2, duration: 1, leftReversal: false, rightReversal: false, isBlank: false,
        letter: null, startPlacement: null, endPlacement: null,
        motions: { left: m(), right: m() },
      },
    ],
  });
}

describe("hashSequenceContent discriminates turn variants of the same base id", () => {
  it("base vs +1-turn variant produce different hashes", () => {
    const base = seq();
    const varied = applyVariationDescriptor(base, { turnPattern: "1|1" }, []).sequence;
    expect(varied.id).toBe(base.id); // same id
    expect(hashSequenceContent(varied)).not.toBe(hashSequenceContent(base));
  });

  it("two different turn patterns over the same base differ", () => {
    const base = seq();
    const a = applyVariationDescriptor(base, { turnPattern: "1|1" }, []).sequence;
    const b = applyVariationDescriptor(base, { turnPattern: "2|2" }, []).sequence;
    expect(hashSequenceContent(a)).not.toBe(hashSequenceContent(b));
  });
});
