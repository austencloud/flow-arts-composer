import { describe, it, expect } from "vitest";
import { tipWearsEffect, type EmitterTrackingMode } from "./emitter-tip";

describe("tipWearsEffect", () => {
  const modes: EmitterTrackingMode[] = ["left_end", "right_end", "both_ends"];

  // Expected [end A, end B] for a prop with more than one tip.
  const twoTip: Record<string, [boolean, boolean]> = {
    left_end: [true, false],
    right_end: [false, true],
    both_ends: [true, true],
  };

  for (const mode of modes) {
    it(`${mode}: a multi-tip prop keeps its end choice`, () => {
      const [a, b] = twoTip[mode]!;
      expect(tipWearsEffect({ end: "A" }, mode)).toBe(a);
      expect(tipWearsEffect({ end: "B" }, mode)).toBe(b);
      expect(tipWearsEffect({ end: 0 }, mode)).toBe(a);
      expect(tipWearsEffect({ end: 1 }, mode)).toBe(b);
      expect(tipWearsEffect({ end: "A", onlyTip: false }, mode)).toBe(a);
    });

    it(`${mode}: a prop's only tip always wears the effect`, () => {
      expect(tipWearsEffect({ end: "A", onlyTip: true }, mode)).toBe(true);
      expect(tipWearsEffect({ end: "B", onlyTip: true }, mode)).toBe(true);
      expect(tipWearsEffect({ end: 0, onlyTip: true }, mode)).toBe(true);
    });
  }

  it("a tip with no end (prop-centre fallback) always wears the effect", () => {
    expect(tipWearsEffect({}, "right_end")).toBe(true);
  });
});
