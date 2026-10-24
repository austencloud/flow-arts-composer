import { describe, expect, it } from "vitest";
import { activeGlyphColumn } from "./word-header-highlight";

/**
 * Steps count from 1 and glyph columns from 0. Mixing them up lights the
 * neighbouring column, which looks plausible enough that nobody would notice.
 */
describe("activeGlyphColumn", () => {
  it("puts step 1 on the first column", () => {
    expect(activeGlyphColumn(1, 4)).toBe(0);
  });

  it("wraps by the glyph's period", () => {
    expect(activeGlyphColumn(4, 4)).toBe(3);
    expect(activeGlyphColumn(5, 4)).toBe(0);
    expect(activeGlyphColumn(6, 4)).toBe(1);
    expect(activeGlyphColumn(7, 2)).toBe(0);
  });

  it("lights nothing without a step or a period", () => {
    expect(activeGlyphColumn(null, 4)).toBeNull();
    expect(activeGlyphColumn(0, 4)).toBeNull();
    expect(activeGlyphColumn(3, 0)).toBeNull();
  });
});
