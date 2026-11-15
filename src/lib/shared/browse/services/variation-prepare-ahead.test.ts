import { describe, expect, it } from "vitest";
import { nextVariationToPrepare } from "./variation-prepare-ahead";

const base = {
  variationCount: 52,
  currentIndex: 3,
  hasTapped: true,
  pictureShown: true,
};

describe("nextVariationToPrepare", () => {
  it("does nothing before the first tap", () => {
    expect(nextVariationToPrepare({ ...base, hasTapped: false })).toBeNull();
  });

  it("waits for the shown picture", () => {
    expect(nextVariationToPrepare({ ...base, pictureShown: false })).toBeNull();
  });

  it("prepares exactly one ahead", () => {
    expect(nextVariationToPrepare(base)).toBe(4);
  });

  it("wraps at the end", () => {
    expect(nextVariationToPrepare({ ...base, currentIndex: 51 })).toBe(0);
  });

  it("does nothing with one or no variation", () => {
    expect(nextVariationToPrepare({ ...base, variationCount: 1 })).toBeNull();
    expect(nextVariationToPrepare({ ...base, variationCount: 0 })).toBeNull();
  });
});
