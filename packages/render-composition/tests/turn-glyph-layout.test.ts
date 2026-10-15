import { describe, expect, it } from "vitest";
import {
  layoutTurnGlyph,
  TURN_GLYPH_BOX_W_CQI,
} from "../src/pattern-glyphs";

// The silent bug this guards: long turn patterns spilling past the card
// border (live card) or getting clipped off both edges (print raster).
// The invariant is clusterW ≤ box width for ANY pattern length.

describe("layoutTurnGlyph", () => {
  it("renders short patterns at natural size (no scaling)", () => {
    for (const n of [1, 2, 3]) {
      const layout = layoutTurnGlyph(n);
      expect(layout.scale).toBe(1);
      expect(layout.barW).toBeCloseTo(1.1);
      expect(layout.intraGap).toBeCloseTo(0.25);
      expect(layout.groupGap).toBeCloseTo(0.6);
      expect(layout.clusterW).toBeLessThanOrEqual(TURN_GLYPH_BOX_W_CQI);
    }
  });

  it("scales long patterns down to exactly the box width", () => {
    for (const n of [4, 6, 8, 12, 16, 32]) {
      const layout = layoutTurnGlyph(n);
      expect(layout.scale).toBeLessThan(1);
      expect(layout.scale).toBeGreaterThan(0);
      expect(layout.clusterW).toBeCloseTo(TURN_GLYPH_BOX_W_CQI);
    }
  });

  it("never exceeds the box for any count", () => {
    for (let n = 0; n <= 64; n++) {
      expect(layoutTurnGlyph(n).clusterW).toBeLessThanOrEqual(
        TURN_GLYPH_BOX_W_CQI + 1e-9,
      );
    }
  });

  it("scales all horizontal dimensions by the same factor", () => {
    const layout = layoutTurnGlyph(8);
    expect(layout.barW / 1.1).toBeCloseTo(layout.scale);
    expect(layout.intraGap / 0.25).toBeCloseTo(layout.scale);
    expect(layout.groupGap / 0.6).toBeCloseTo(layout.scale);
    expect(layout.radius / 0.2).toBeCloseTo(layout.scale);
  });

  it("handles the empty pattern", () => {
    const layout = layoutTurnGlyph(0);
    expect(layout.clusterW).toBe(0);
    expect(layout.scale).toBe(1);
  });

  it("respects a custom box width", () => {
    const layout = layoutTurnGlyph(8, 20);
    expect(layout.clusterW).toBeLessThanOrEqual(20);
    expect(layout.clusterW).toBeGreaterThan(TURN_GLYPH_BOX_W_CQI);
  });
});
