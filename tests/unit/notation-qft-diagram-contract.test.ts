import { describe, expect, it } from "vitest";
import {
  angleOf,
  norm,
  pointAt,
  PROP_LENGTH,
} from "#lib/shared/notation/qft/qft-model.js";

/**
 * This contract used to read pixel coordinates out of a static SVG on
 * /notation. That page became the notation catalog on 2026-07-27 and the QfT
 * material moved to /notation/qft, which computes its geometry rather than
 * tracing it. The canon worth guarding was never the pixels — it is the
 * compass, so the assertions now sit on the model that draws it.
 */
describe("QfT compass", () => {
  // Screen space: x grows right, y grows DOWN, so straight up is negative y.
  const sign = (value: number) =>
    Math.abs(value) < 1e-9 ? 0 : value > 0 ? 1 : -1;

  it("puts 8 at the top and runs 1 through 7 clockwise", () => {
    const quadrants: Array<[number, number, number]> = [
      // position, expected sign of x, expected sign of y
      [8, 0, -1], // up
      [1, 1, -1], // up/right
      [2, 1, 0], // right
      [3, 1, 1], // down/right
      [4, 0, 1], // down
      [5, -1, 1], // down/left
      [6, -1, 0], // left
      [7, -1, -1], // up/left
    ];

    for (const [position, expectedX, expectedY] of quadrants) {
      const { x, y } = pointAt(position, 100);
      expect(
        { position, x: sign(x), y: sign(y) },
        `position ${position} sits in the wrong place on the compass`
      ).toEqual({ position, x: expectedX, y: expectedY });
    }
  });

  it("numbers the top position 8 rather than 0", () => {
    expect(norm(0)).toBe(8);
    expect(norm(8)).toBe(8);
    expect(norm(16)).toBe(8);
    expect(norm(9)).toBe(1);
    expect(norm(-1)).toBe(7);
  });

  it("spaces the eight positions one eighth of a turn apart", () => {
    for (let position = 1; position <= 8; position++) {
      expect(angleOf(position) - angleOf(position - 1)).toBeCloseTo(
        Math.PI / 4,
        10
      );
    }
    expect(angleOf(8)).toBeCloseTo(2 * Math.PI, 10);
  });

  it("expresses every distance against one prop length", () => {
    expect(PROP_LENGTH).toBe(1);
  });
});
