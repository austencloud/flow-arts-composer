import { describe, expect, it } from "vitest";
import { nextUnviewed, previousViewed } from "./viewed-screens";

describe("a page whose screens are read in any order", () => {
  it("leads Next to what has not been viewed, around to the start", () => {
    expect(nextUnviewed(new Set([0]), 0, 6)).toBe(1);
    expect(nextUnviewed(new Set([0, 4]), 4, 6)).toBe(5);
    expect(nextUnviewed(new Set([0, 4, 5]), 5, 6)).toBe(1);
    expect(nextUnviewed(new Set([0, 1, 2, 4, 5]), 1, 6)).toBe(3);
  });

  it("leads Next on to the next lesson only once all have been viewed", () => {
    expect(nextUnviewed(new Set([0, 1, 2, 3, 4, 5]), 2, 6)).toBeNull();
  });

  it("never leads Back to one that has not been viewed", () => {
    expect(previousViewed(new Set([0, 4]), 4)).toBe(0);
    expect(previousViewed(new Set([3, 4]), 3)).toBeNull();
  });
});
