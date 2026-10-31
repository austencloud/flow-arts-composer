/**
 * Shift-click on the step grid selects the box between the two beats, so
 * clicking the top of a column and then the bottom selects that column, not
 * every beat in between.
 */
import { describe, expect, it } from "vitest";
import { stepsInGridRange } from "#lib/features/create/shared/state/selection/grid-range-selection.js";

const fourByFour = { columns: 4, stepCount: 16 };

describe("stepsInGridRange", () => {
  it("selects a column when both beats sit in it", () => {
    expect(stepsInGridRange(4, 16, fourByFour)).toEqual([4, 8, 12, 16]);
    expect(stepsInGridRange(14, 2, fourByFour)).toEqual([2, 6, 10, 14]);
  });

  it("selects the run between two beats in one row", () => {
    expect(stepsInGridRange(7, 5, fourByFour)).toEqual([5, 6, 7]);
  });

  it("selects the box between two corners, in either direction", () => {
    expect(stepsInGridRange(2, 11, fourByFour)).toEqual([2, 3, 6, 7, 10, 11]);
    expect(stepsInGridRange(12, 1, fourByFour)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
  });

  it("skips columns a short last row does not reach", () => {
    expect(stepsInGridRange(4, 13, { columns: 4, stepCount: 14 })).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14,
    ]);
  });

  it("falls back to the contiguous run without a grid shape", () => {
    expect(stepsInGridRange(4, 9)).toEqual([4, 5, 6, 7, 8, 9]);
    expect(stepsInGridRange(9, 4, { columns: 0, stepCount: 16 })).toEqual([
      4, 5, 6, 7, 8, 9,
    ]);
  });
});
