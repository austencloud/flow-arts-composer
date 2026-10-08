import { describe, expect, it } from "vitest";
import { colorVisionDistance, simulateColorVision } from "./color-vision";
import { hexToOklch, oklabDistance } from "./oklch";

describe("color vision", () => {
  it("leaves greys alone", () => {
    for (const grey of ["#000000", "#808080", "#ffffff"]) {
      expect(simulateColorVision(grey, "protan")).toBe(grey);
      expect(simulateColorVision(grey, "deutan")).toBe(grey);
    }
  });

  it("folds teal and hot pink together for green-blind eyes", () => {
    const [teal, pink] = ["#5f9e99", "#f7199c"];
    expect(oklabDistance(hexToOklch(teal), hexToOklch(pink))).toBeGreaterThan(
      0.2
    );
    expect(colorVisionDistance(teal, pink)).toBeLessThan(0.03);
  });

  it("keeps the default blue and red apart for everyone", () => {
    expect(colorVisionDistance("#2e3192", "#ed1c24")).toBeGreaterThan(0.2);
  });
});
