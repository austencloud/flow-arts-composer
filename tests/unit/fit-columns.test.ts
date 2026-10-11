import { describe, expect, it } from "vitest";
import { fitColumns } from "#lib/features/creators/domain/fit-columns.js";

describe("fitColumns", () => {
  it("drops from 6 to 5 columns so 7 items never leave a lone last row (5+2)", () => {
    expect(fitColumns(7, 6)).toBe(5);
  });

  it("drops from 5 to 4 columns so 6 items never leave a lone last row (4+2)", () => {
    expect(fitColumns(6, 5)).toBe(4);
  });

  it("falls back to the cap when no reduction avoids the orphan (7 @ cap 3)", () => {
    expect(fitColumns(7, 3)).toBe(3);
  });

  it("returns the cap for a single item — there's no row to orphan", () => {
    expect(fitColumns(1, 6)).toBe(6);
  });

  it("returns 0 columns for zero items", () => {
    expect(fitColumns(0, 6)).toBe(0);
  });

  it("guards a negative or zero count", () => {
    expect(fitColumns(-3, 6)).toBe(0);
  });

  it("guards a maxCols under 1 by clamping to a single column", () => {
    expect(fitColumns(7, 0)).toBe(1);
    expect(fitColumns(7, -2)).toBe(1);
  });

  it("never returns a count above the cap", () => {
    for (let count = 1; count <= 40; count++) {
      expect(fitColumns(count, 8)).toBeLessThanOrEqual(8);
    }
  });
});

