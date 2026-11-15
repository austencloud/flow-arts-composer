import { describe, expect, it } from "vitest";
import { isSmallPictographArt } from "./pictograph-art-scale";

describe("isSmallPictographArt", () => {
  it("goes small under 176px and not at 176", () => {
    expect(isSmallPictographArt(64, false)).toBe(true);
    expect(isSmallPictographArt(175.9, false)).toBe(true);
    expect(isSmallPictographArt(176, false)).toBe(false);
    expect(isSmallPictographArt(285, false)).toBe(false);
  });

  it("stays small across the dead band and comes back at 184", () => {
    expect(isSmallPictographArt(176, true)).toBe(true);
    expect(isSmallPictographArt(183.9, true)).toBe(true);
    expect(isSmallPictographArt(184, true)).toBe(false);
  });

  it("keeps the last art for a cell sitting on the line", () => {
    for (const width of [178, 180, 182]) {
      expect(isSmallPictographArt(width, false)).toBe(false);
      expect(isSmallPictographArt(width, true)).toBe(true);
    }
  });

  it("treats a zero width (not laid out) as no evidence", () => {
    expect(isSmallPictographArt(0, true)).toBe(true);
    expect(isSmallPictographArt(0, false)).toBe(false);
  });
});
