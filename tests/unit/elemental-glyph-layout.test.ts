import { describe, expect, it } from "vitest";
import {
  containElementalGlyph,
  getElementalGlyphBox,
} from "$lib/shared/pictograph/shared/domain/constants/elemental-glyph-layout";

describe("elemental glyph layout", () => {
  it("returns the canonical 950-unit pictograph slot", () => {
    expect(getElementalGlyphBox(950)).toEqual({
      x: 798,
      y: 798,
      width: 112,
      height: 112,
    });
  });

  it("scales the slot proportionally for exported canvas sizes", () => {
    expect(getElementalGlyphBox(1900)).toEqual({
      x: 1596,
      y: 1596,
      width: 224,
      height: 224,
    });
  });

  it("uses the matching reserved slot in the top-right corner", () => {
    expect(getElementalGlyphBox(950, 0, "top-right")).toEqual({
      x: 798,
      y: 40,
      width: 112,
      height: 112,
    });
  });

  it("centers contained artwork without changing its aspect ratio", () => {
    expect(containElementalGlyph(getElementalGlyphBox(950), 224, 112)).toEqual({
      x: 798,
      y: 826,
      width: 112,
      height: 56,
    });
  });

  it("rejects images without intrinsic dimensions", () => {
    expect(containElementalGlyph(getElementalGlyphBox(950), 0, 100)).toBeNull();
  });
});
