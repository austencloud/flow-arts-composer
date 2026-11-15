import { describe, expect, it } from "vitest";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import { sizeArtScales } from "./prop-size-art";

describe("sizeArtScales", () => {
  it("draws Big at full size and Standard smaller for the measured pairs", () => {
    for (const prop of [
      PropType.STAFF,
      PropType.CLUB,
      PropType.MINIHOOP,
      PropType.EIGHTRINGS,
      PropType.TORCH,
      PropType.DOUBLESTAR,
      PropType.DOUBLECONTACTBALL,
    ]) {
      const { standard, big } = sizeArtScales(prop);
      expect(big, prop).toBe(1);
      expect(standard, prop).toBeGreaterThan(0.3);
      expect(standard, prop).toBeLessThan(1);
    }
  });

  it("keeps the staff at its true ratio", () => {
    // 249 against 596 painted pixels in the pictograph artwork.
    expect(sizeArtScales(PropType.STAFF).standard).toBeCloseTo(249 / 596, 1);
  });
});
