import { describe, expect, it } from "vitest";
import { LOOPComponent, symmetricSpec } from "../../../src/loop/loop-spec.js";
import { determineEndPlacementsForSpec } from "../../../src/loop/targeting/LOOPEndPlacementSelector.js";

describe("determineEndPlacementsForSpec", () => {
  it("admits clockwise and counter-clockwise quartered rotation seams", () => {
    const spec = symmetricSpec(
      new Map([[LOOPComponent.ROTATED, { period: 4 }]])
    );

    expect(determineEndPlacementsForSpec(spec, "alpha1")).toEqual([
      "alpha3",
      "alpha7",
    ]);
  });
});
