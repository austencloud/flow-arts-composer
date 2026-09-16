import { describe, expect, it } from "vitest";
import { LOOPType, Period } from "../../../src/loop/loop-types.js";
import { loopEndPlacementSelector } from "../../../src/loop/targeting/LOOPEndPlacementSelector.js";

describe("LOOPEndPlacementSelector", () => {
  it.each([
    ["beta1", "beta5"],
    ["beta5", "beta1"],
    ["beta2", "beta6"],
    ["beta6", "beta2"],
  ])(
    "targets the inner halved rotation for mirrored+rotated+swapped from %s",
    (startPlacement, expectedEndPlacement) => {
      expect(
        loopEndPlacementSelector.determineEndPlacement(
          LOOPType.MIRRORED_ROTATED_SWAPPED,
          startPlacement,
          Period.HALVED
        )
      ).toBe(expectedEndPlacement);
    }
  );

  it.each([
    ["alpha1", "alpha5"],
    ["beta3", "beta7"],
    ["gamma1", "gamma5"],
  ])(
    "does not require a vertical-axis fixed point for mirrored+rotated+swapped from %s",
    (startPlacement, expectedEndPlacement) => {
      expect(
        loopEndPlacementSelector.determineEndPlacement(
          LOOPType.MIRRORED_ROTATED_SWAPPED,
          startPlacement,
          Period.HALVED
        )
      ).toBe(expectedEndPlacement);
    }
  );

  it("handles every declared LOOP type without falling through to the unsupported-type error", () => {
    for (const loopType of Object.values(LOOPType)) {
      expect(() =>
        loopEndPlacementSelector.determineEndPlacement(
          loopType,
          "beta1",
          Period.HALVED
        )
      ).not.toThrow();
    }
  });
});
