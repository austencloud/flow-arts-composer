import { describe, expect, it } from "vitest";
import {
  defaultVariationColumns,
  fitVariationColumns,
  scrollVariationColumns,
  tallVariationColumnChoices,
  variationColumnChoices,
} from "./variation-columns";

describe("variation columns", () => {
  it("lays counts that divide by four in rows of four or eight", () => {
    expect(variationColumnChoices(16)).toEqual([4, 8]);
    expect(variationColumnChoices(8)).toEqual([4, 8]);
    expect(variationColumnChoices(12)).toEqual([4]);
  });

  it("splits other counts evenly", () => {
    expect(variationColumnChoices(6)).toEqual([2, 3, 6]);
    expect(defaultVariationColumns(6)).toBe(3);
    expect(defaultVariationColumns(10)).toBe(5);
    expect(defaultVariationColumns(7)).toBe(4);
  });

  it("never picks six columns for sixteen variations", () => {
    // The box that used to come out at six columns (Austen's 2026-10-21 report).
    for (const [width, height] of [
      [1240, 620],
      [1450, 640],
      [980, 520],
      [700, 900],
    ]) {
      const fit = fitVariationColumns(16, width!, height!, 10.4);
      expect([4, 8]).toContain(fit?.columns);
    }
  });

  it("picks eight columns in a wide, short box and four in a tall one", () => {
    expect(fitVariationColumns(16, 1600, 400, 10)?.columns).toBe(8);
    expect(fitVariationColumns(16, 900, 900, 10)?.columns).toBe(4);
  });

  it("scrolls a short screen through as few rows as stay readable", () => {
    // Landscape phone: eight across still clears the floor.
    expect(scrollVariationColumns(16, 868, 10, 88)).toBe(8);
    // Portrait phone: even four is under it, so the default four.
    expect(scrollVariationColumns(16, 309, 10, 88)).toBe(4);
    expect(scrollVariationColumns(6, 900, 10, 88)).toBe(6);
  });

  it("stops at the cell cap and keeps the block compact", () => {
    // Eight variations in a roomy box: both four and eight columns reach the
    // cap, so four wins and the dialog shrinks around two rows.
    expect(fitVariationColumns(8, 1800, 700, 10, 288)).toEqual({
      columns: 4,
      cell: 288,
    });
    expect(fitVariationColumns(6, 1800, 900, 10, 200)?.columns).toBe(3);
  });
});

describe("tall screen columns", () => {
  it("adds two across for an even count", () => {
    expect(tallVariationColumnChoices(8)).toEqual([2, 4, 8]);
    expect(tallVariationColumnChoices(6)).toEqual([2, 3, 6]);
    expect(tallVariationColumnChoices(5)).toEqual([4]);
  });
  it("draws eight variations two across on a portrait phone", () => {
    expect(
      fitVariationColumns(8, 336, 460, 10.4, 240, tallVariationColumnChoices(8))
    ).toEqual({ columns: 2, cell: 107 });
  });
});
