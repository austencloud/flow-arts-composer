import { describe, expect, it } from "vitest";
import { MANDALA_GRID_RADIUS } from "../../domain/mandala-constants";
import { fitMandalaStrokeWidth } from "../mandala-guide-painter";

// The scale that draws the hand circle at `radius` CSS pixels.
const scaleForHandRadius = (radius: number) => radius / MANDALA_GRID_RADIUS;

// A fixed 2.5px line filled in the Create front door's 32px Shape tiles and
// its 99px tunnel card. Small drawings thin their line; tiles and stages at
// the size the width was tuned for keep it, so nothing large changes.
describe("fitMandalaStrokeWidth", () => {
  it("keeps the requested width for a full-size drawing", () => {
    expect(fitMandalaStrokeWidth(2.5, scaleForHandRadius(32))).toBe(2.5);
    expect(fitMandalaStrokeWidth(2.5, scaleForHandRadius(200))).toBe(2.5);
  });

  it("thins in proportion to a smaller drawing", () => {
    expect(fitMandalaStrokeWidth(2.5, scaleForHandRadius(16))).toBeCloseTo(
      1.25
    );
    // A user's thicker post line keeps its ratio to the default.
    expect(fitMandalaStrokeWidth(5, scaleForHandRadius(16))).toBeCloseTo(2.5);
  });

  it("never thins below the floor, or past a width already under it", () => {
    expect(fitMandalaStrokeWidth(2.5, scaleForHandRadius(2))).toBe(0.6);
    expect(fitMandalaStrokeWidth(0.4, scaleForHandRadius(2))).toBe(0.4);
  });
});
