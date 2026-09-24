import { describe, expect, it } from "vitest";
import { getMotionColor } from "$lib/shared/utils/svg-color-utils";
import { resolveStartPlacementColorOverrides } from "../card-back-appearance";

describe("resolveStartPlacementColorOverrides", () => {
  it("keeps live color lookup when no appearance snapshot was supplied", () => {
    expect(resolveStartPlacementColorOverrides(undefined, true)).toEqual({
      left: undefined,
      right: undefined,
    });
  });

  it.each([true, false])("pins explicit default colors for darkMode=%s", (darkMode) => {
    const mode = darkMode ? "dark" : "light";
    expect(resolveStartPlacementColorOverrides(null, darkMode)).toEqual({
      left: getMotionColor("left", mode),
      right: getMotionColor("right", mode),
    });
  });

  it("keeps both custom hand colors from the snapshot", () => {
    const colors = { left: "#123456", right: "#abcdef" };
    expect(resolveStartPlacementColorOverrides(colors, true)).toEqual(colors);
  });
});
