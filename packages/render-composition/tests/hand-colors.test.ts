import { describe, expect, it } from "vitest";
import { DARK_HAND_COLORS, resolveHandColorPair } from "../src/hand-colors.js";

describe("hand color normalization", () => {
  it("expands short hex colors and normalizes case", () => {
    expect(
      resolveHandColorPair(
        { left: " #0EF ", right: "#FF2EA6" },
        DARK_HAND_COLORS
      )
    ).toEqual({ left: "#00eeff", right: "#ff2ea6" });
  });

  it("falls back per hand when persisted input is invalid", () => {
    expect(
      resolveHandColorPair(
        { left: "not-a-color", right: "#123456" },
        DARK_HAND_COLORS
      )
    ).toEqual({ left: DARK_HAND_COLORS.left, right: "#123456" });
  });
});
