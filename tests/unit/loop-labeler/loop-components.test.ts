import { describe, expect, it } from "vitest";
import { BASE_COMPONENTS } from "#lib/features/loop-labeler/domain/constants/loop-components.js";

describe("LOOP reflection component colors", () => {
  it("uses the same purple for Mirrored and legacy Flipped", () => {
    const reflectionColors = BASE_COMPONENTS.filter(
      ({ id }) => id === "mirrored" || id === "flipped"
    ).map(({ color }) => color);

    expect(reflectionColors).toEqual(["#6F2DA8", "#6F2DA8"]);
  });
});
