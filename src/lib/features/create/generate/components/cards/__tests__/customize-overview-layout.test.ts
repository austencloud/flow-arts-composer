import { describe, expect, it } from "vitest";
import {
  fitOverview,
  MIN_GRID_REM,
  type OverviewMeasure,
} from "../customize-overview-layout";

// The Style tile stands its three axes side by side from 42rem and stacks
// them below that, roughly doubling in height.
function box(width: number, height: number): OverviewMeasure {
  return {
    width,
    height,
    rem: 16,
    noteHeight: 40,
    headHeight: 40,
    styleHeightAt: (w) => (w >= 672 ? 180 : 360),
  };
}

describe("fitOverview", () => {
  it("puts the previews side by side under Style on a large panel", () => {
    const fit = fitOverview(box(1400, 1100));
    expect(fit.layout).toBe("top");
    expect(fit.gridSize).toBeGreaterThan(400);
  });

  it("moves Style beside the previews on a wide, short panel", () => {
    const fit = fitOverview(box(1100, 520));
    expect(fit.layout).toBe("side");
    expect(fit.styleColumn).toBe(374);
  });

  it("stacks the previews on a narrow, tall panel", () => {
    const fit = fitOverview(box(400, 1400));
    expect(fit.layout).toBe("stack");
  });

  it("never draws a preview below the readable floor", () => {
    const boxes: [number, number][] = [
      [400, 700],
      [520, 640],
      [700, 420],
      [360, 300],
    ];
    for (const [w, h] of boxes) {
      const fit = fitOverview(box(w, h));
      if (fit.gridSize > 0) {
        expect(fit.gridSize).toBeGreaterThanOrEqual(MIN_GRID_REM * 16);
      }
    }
  });

  it("turns the placements into rows when their previews would be too small", () => {
    const fit = fitOverview(box(520, 640));
    expect(fit.layout).toBe("style-rows");
    expect(fit.gridSize).toBe(0);
  });

  it("turns Style into a row too when its controls do not fit", () => {
    expect(fitOverview(box(360, 420)).layout).toBe("rows");
  });

  it("keeps everything inside the box it chose", () => {
    for (let w = 320; w <= 2400; w += 40) {
      for (let h = 360; h <= 1600; h += 40) {
        const m = box(w, h);
        const fit = fitOverview(m);
        if (fit.layout === "rows") continue;
        const style = m.styleHeightAt(
          fit.layout === "side" ? fit.styleColumn : w
        );
        const tile = 40 + 30 + (fit.gridSize ? 12 + fit.gridSize : 0);
        const used =
          fit.layout === "top"
            ? style + 16 + tile
            : fit.layout === "side"
              ? Math.max(style, tile)
              : style + 2 * 12 + 2 * tile;
        expect(used + 12 + 40, `${w}x${h} ${fit.layout}`).toBeLessThanOrEqual(
          h
        );
      }
    }
  });
});
