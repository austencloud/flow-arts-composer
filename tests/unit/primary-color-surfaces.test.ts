import { describe, expect, it } from "vitest";
import {
  applyMandalaHandColors,
  mixColors,
} from "$lib/shared/mandala/domain/mandala-palette";
import { resolveTrailColors } from "$lib/shared/animation-engine/domain/resolve-trail-colors";
import { DEFAULT_TRAIL_SETTINGS } from "$lib/shared/animation-engine/domain/types/trail-types";

const colors = { left: "#00ff88", right: "#ff8800" };
const base = {
  leftStroke: "#3575e2",
  leftFill: "rgba(53, 117, 226, 0.2)",
  rightStroke: "#ed1c24",
  rightFill: "rgba(237, 28, 36, 0.2)",
  purpleStroke: "#a78bfa",
  purpleFill: "rgba(167, 139, 250, 0.2)",
};

describe("primary colors on related surfaces", () => {
  it("colors mandala strokes, fills, and overlap from the selected pair", () => {
    const palette = applyMandalaHandColors(base, colors);
    expect(palette.leftStroke).toBe(colors.left);
    expect(palette.rightStroke).toBe(colors.right);
    expect(palette.leftFill).toBe("rgba(0, 255, 136, 0.2)");
    expect(palette.rightFill).toBe("rgba(255, 136, 0, 0.2)");
    expect(palette.purpleStroke).toBe(mixColors(colors.left, colors.right));
    expect(base.leftStroke).toBe("#3575e2");
  });

  it("keeps the theme palette when primary colors are reset", () => {
    expect(applyMandalaHandColors(base, null)).toBe(base);
    expect(applyMandalaHandColors(base)).toBe(base);
  });

  it("uses primary colors for default trails without mutating saved settings", () => {
    const original = { ...DEFAULT_TRAIL_SETTINGS };
    const result = resolveTrailColors(original, colors);
    expect(result.leftColor).toBe(colors.left);
    expect(result.rightColor).toBe(colors.right);
    expect(original).toEqual(DEFAULT_TRAIL_SETTINGS);
    expect(resolveTrailColors(original, null)).toBe(original);
  });

  it("preserves a customized trail color independently for each hand", () => {
    const customLeft = { ...DEFAULT_TRAIL_SETTINGS, leftColor: "#aa66ff" };
    const result = resolveTrailColors(customLeft, colors);
    expect(result.leftColor).toBe("#aa66ff");
    expect(result.rightColor).toBe(colors.right);
    const customBoth = { ...customLeft, rightColor: "#ffffff" };
    expect(resolveTrailColors(customBoth, colors)).toBe(customBoth);
  });
});
