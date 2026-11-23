import { describe, it, expect } from "vitest";
import { PropType } from "../../../prop/domain/enums/prop-type";
import { drawsOnlyHands, letterGlyphVisible } from "./hands-have-no-letter";

describe("a picture of hands has no letter", () => {
  it("hides the letter when both props are hands, even if asked to show it", () => {
    expect(letterGlyphVisible(true, PropType.HAND, PropType.HAND)).toBe(false);
  });

  it("keeps the letter for staffs, and for one hand beside one staff", () => {
    expect(letterGlyphVisible(true, PropType.STAFF, PropType.STAFF)).toBe(true);
    expect(drawsOnlyHands(PropType.HAND, PropType.STAFF)).toBe(false);
    expect(letterGlyphVisible(true, PropType.STAFF, PropType.HAND)).toBe(true);
  });

  it("never turns a hidden letter on", () => {
    expect(letterGlyphVisible(false, PropType.STAFF, PropType.STAFF)).toBe(false);
  });
});
