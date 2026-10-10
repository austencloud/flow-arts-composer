import { describe, expect, it } from "vitest";
import {
  ARROW_ORIENTATION_CYCLE,
  getArrowOrientationTransitionDirection,
} from "#lib/shared/pictograph/arrow/rendering/services/arrow-orientation-transition.js";
import { Orientation } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";

describe("quarter-orientation arrow transitions", () => {
  it("contains every relative orientation exactly once", () => {
    expect(new Set(ARROW_ORIENTATION_CYCLE).size).toBe(8);
    expect(ARROW_ORIENTATION_CYCLE).toEqual([
      Orientation.IN,
      Orientation.COUNTER_IN,
      Orientation.COUNTER,
      Orientation.COUNTER_OUT,
      Orientation.OUT,
      Orientation.CLOCK_OUT,
      Orientation.CLOCK,
      Orientation.CLOCK_IN,
    ]);
  });

  it("chooses the one-step visual direction around the complete cycle", () => {
    for (let index = 0; index < ARROW_ORIENTATION_CYCLE.length; index++) {
      const current = ARROW_ORIENTATION_CYCLE[index]!;
      const clockwise =
        ARROW_ORIENTATION_CYCLE[(index + 1) % ARROW_ORIENTATION_CYCLE.length]!;
      const counterClockwise =
        ARROW_ORIENTATION_CYCLE[
          (index - 1 + ARROW_ORIENTATION_CYCLE.length) %
            ARROW_ORIENTATION_CYCLE.length
        ]!;

      expect(
        getArrowOrientationTransitionDirection(current, clockwise, "ccw")
      ).toBe("cw");
      expect(
        getArrowOrientationTransitionDirection(current, counterClockwise, "cw")
      ).toBe("ccw");
    }
  });

  it("uses the explicit rotation direction for opposite axes", () => {
    expect(
      getArrowOrientationTransitionDirection(
        Orientation.IN,
        Orientation.OUT,
        "ccw"
      )
    ).toBe("ccw");
  });
});
