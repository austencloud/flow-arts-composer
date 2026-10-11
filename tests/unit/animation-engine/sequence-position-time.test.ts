import { describe, expect, it } from "vitest";
import type { Step } from "@tka/tka-types";
import { sequencePositionToAnimationTime } from "#lib/shared/animation-engine/services/step-calculator.js";

const steps = [{ duration: 1 }, { duration: 2 }, { duration: 0.5 }] as Step[];

describe("sequencePositionToAnimationTime", () => {
  it("keeps positions below beat 1 inside the start pose", () => {
    expect(sequencePositionToAnimationTime(0, steps, 0.75)).toBe(0);
    expect(sequencePositionToAnimationTime(0.5, steps, 0.75)).toBe(0.375);
    expect(sequencePositionToAnimationTime(1, steps, 0.75)).toBe(0.75);
  });

  it("respects variable motion-beat durations", () => {
    expect(sequencePositionToAnimationTime(1.5, steps, 0.75)).toBe(1.25);
    expect(sequencePositionToAnimationTime(2, steps, 0.75)).toBe(1.75);
    expect(sequencePositionToAnimationTime(2.5, steps, 0.75)).toBe(2.75);
    expect(sequencePositionToAnimationTime(3, steps, 0.75)).toBe(3.75);
    expect(sequencePositionToAnimationTime(4, steps, 0.75)).toBe(4.25);
  });

  it("clamps positions outside the sequence instead of extrapolating", () => {
    expect(sequencePositionToAnimationTime(-1, steps, 0.75)).toBe(0);
    expect(sequencePositionToAnimationTime(99, steps, 0.75)).toBe(4.25);
  });
});
