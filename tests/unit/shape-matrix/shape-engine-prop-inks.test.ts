import { describe, expect, it } from "vitest";
import { propInkStyle } from "@tka/shape-engine/app/state/prop-inks.js";

describe("propInkStyle", () => {
  it("leaves the site's own colours alone when the player chose none", () => {
    expect(propInkStyle(null)).toBeUndefined();
    expect(propInkStyle(undefined)).toBeUndefined();
  });

  it("paints the blue names with the left colour and the red names with the right", () => {
    const style = propInkStyle({ left: "#7c5cff", right: "#f5c518" })!;
    for (const name of ["--prop-blue", "--prop-blue-text", "--dm-motion-blue"]) {
      expect(style).toContain(`${name}:#7c5cff;`);
    }
    for (const name of ["--prop-red", "--prop-red-text", "--dm-motion-red"]) {
      expect(style).toContain(`${name}:#f5c518;`);
    }
    expect(style).toContain("--dm-motion-both:color-mix(in srgb, #7c5cff 50%, #f5c518);");
  });
});
