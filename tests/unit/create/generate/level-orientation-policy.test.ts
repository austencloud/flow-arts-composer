import { describe, expect, it } from "vitest";
import {
  clampStartOrientationToLevel,
  startOrientationsForLevel,
} from "#lib/features/create/generate/domain/level-orientation-policy.js";
import { Orientation } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";

describe("Generate level orientation policy", () => {
  it.each([1, 2])(
    "limits Level %i start orientations to the radial pair",
    (level) => {
      expect(startOrientationsForLevel(level)).toEqual([
        Orientation.IN,
        Orientation.OUT,
      ]);
    }
  );

  it("adds Clock and Counter at Level 3", () => {
    expect(startOrientationsForLevel(3)).toEqual([
      Orientation.IN,
      Orientation.OUT,
      Orientation.CLOCK,
      Orientation.COUNTER,
    ]);
  });

  it.each([
    [Orientation.CLOCK, 1],
    [Orientation.COUNTER, 1],
    [Orientation.CLOCK, 2],
    [Orientation.COUNTER, 2],
  ] as const)(
    "normalizes %s to In when lowering to Level %i",
    (orientation, level) => {
      expect(clampStartOrientationToLevel(orientation, level)).toBe(
        Orientation.IN
      );
    }
  );

  it.each([
    [Orientation.IN, 1],
    [Orientation.OUT, 2],
    [Orientation.CLOCK, 3],
    [Orientation.COUNTER, 3],
  ] as const)("preserves %s at Level %i", (orientation, level) => {
    expect(clampStartOrientationToLevel(orientation, level)).toBe(orientation);
  });
});
