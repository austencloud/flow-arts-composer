import { describe, it, expect } from "vitest";
import { mapOrientationToAngle } from "#lib/shared/animation-engine/services/angle-calculator.js";
import { Orientation } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";

const PI = Math.PI;

describe("mapOrientationToAngle — cardinal (unchanged) + interradial (fixed)", () => {
  it("keeps the four cardinals at their canonical relative angles", () => {
    expect(mapOrientationToAngle(Orientation.OUT, 0)).toBeCloseTo(0, 6);
    expect(mapOrientationToAngle(Orientation.IN, 0)).toBeCloseTo(PI, 6);
    expect(mapOrientationToAngle(Orientation.CLOCK, 0)).toBeCloseTo(PI / 2, 6);
    expect(mapOrientationToAngle(Orientation.COUNTER, 0)).toBeCloseTo((3 * PI) / 2, 6);
  });

  it("places interradials 45deg between their neighbours (was wrongly counter before)", () => {
    expect(mapOrientationToAngle(Orientation.CLOCK_OUT, 0)).toBeCloseTo(PI / 4, 6);
    expect(mapOrientationToAngle(Orientation.CLOCK_IN, 0)).toBeCloseTo((3 * PI) / 4, 6);
    expect(mapOrientationToAngle(Orientation.COUNTER_IN, 0)).toBeCloseTo((5 * PI) / 4, 6);
    expect(mapOrientationToAngle(Orientation.COUNTER_OUT, 0)).toBeCloseTo((7 * PI) / 4, 6);
  });
});
