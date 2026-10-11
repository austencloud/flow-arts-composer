import { describe, expect, it } from "vitest";

import { spinRatioKey } from "@vtg/domain";
import {
  theoryRatioFromParts,
  theoryRatioLabel,
  theoryRatioSpokenLabel,
  THEORY_RATIO_MAX_PART,
} from "#lib/shared/shape-matrix/domain/theory-ratio.js";

describe("theory ratios", () => {
  it("accepts any two parts through 15 and reduces the result", () => {
    expect(THEORY_RATIO_MAX_PART).toBe(15);
    expect(spinRatioKey(theoryRatioFromParts(15, 14)!)).toBe("15:14");
    expect(spinRatioKey(theoryRatioFromParts(14, 15)!)).toBe("14:15");
    expect(spinRatioKey(theoryRatioFromParts(2, 4)!)).toBe("1:2");
    expect(spinRatioKey(theoryRatioFromParts(15, 0)!)).toBe("1:0");
  });

  it("rejects values outside the editor's field", () => {
    expect(theoryRatioFromParts(0, 0)).toBeNull();
    expect(theoryRatioFromParts(16, 15)).toBeNull();
    expect(theoryRatioFromParts(15, 16)).toBeNull();
    expect(theoryRatioFromParts(1.5, 2)).toBeNull();
    expect(theoryRatioFromParts(-1, 2)).toBeNull();
  });

  it("speaks the two stationary endpoints distinctly", () => {
    expect(theoryRatioSpokenLabel(theoryRatioFromParts(0, 1)!)).toBe(
      "1:0, float"
    );
    expect(theoryRatioSpokenLabel(theoryRatioFromParts(1, 0)!)).toBe(
      "0:1, stationary hand"
    );
  });

  it("displays ratios in SpiroAnim's hand-cycle-first order", () => {
    expect(theoryRatioLabel(theoryRatioFromParts(3, 1)!)).toBe("1:3");
    expect(theoryRatioLabel(theoryRatioFromParts(7, 3)!)).toBe("3:7");
  });
});
