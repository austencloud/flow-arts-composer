import { describe, expect, it } from "vitest";
import {
  DARK_MOTION_BLUE_STROKE,
  DARK_MOTION_RED_STROKE,
} from "$lib/shared/mandala/domain/mandala-constants";
import { resolveOpenerPalette } from "./video-opener-mandala";

describe("mandala opener palette", () => {
  it("wears the account's hand colours, like the card back", () => {
    const palette = resolveOpenerPalette({ left: "#00e5ff", right: "#ff9100" });
    expect(palette.leftStroke).toBe("#00e5ff");
    expect(palette.rightStroke).toBe("#ff9100");
    // The overlap stroke is the mix of the two, not the default purple.
    expect(palette.purpleStroke).toBe("#80bb80");
  });

  it("falls back to the dark blue/red pair without chosen colours", () => {
    for (const colors of [null, undefined]) {
      const palette = resolveOpenerPalette(colors);
      expect(palette.leftStroke).toBe(DARK_MOTION_BLUE_STROKE);
      expect(palette.rightStroke).toBe(DARK_MOTION_RED_STROKE);
    }
  });
});
