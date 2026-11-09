import { describe, expect, it } from "vitest";
import { DENSE_GAP, fitEffectPicker } from "./effect-catalog-fit";

const count = 17;

// A guide screen never scrolls, so this arrangement is the only one its panel
// has. A box it could not fill would put a scrollbar back.
function tiles(width: number, height: number) {
  const fit = fitEffectPicker({ width, height, count });
  if (!fit) throw new Error("no arrangement");
  return {
    fit,
    w: (width - (fit.cols - 1) * fit.gap) / fit.cols,
    h: (height - (fit.rows - 1) * fit.gap) / fit.rows,
  };
}

describe("fitEffectPicker", () => {
  it.each([
    [320, 80],
    [340, 106],
    [340, 160],
    [400, 250],
    [700, 300],
    [500, 410],
    [1000, 700],
  ])("fits every effect inside a %ix%i box", (width, height) => {
    const { fit } = tiles(width, height);
    expect(fit.cols * fit.rows).toBeGreaterThanOrEqual(count);
    expect(fit.fill).toBe(true);
  });

  it("keeps the names on a phone's band", () => {
    const { fit, w, h } = tiles(340, 160);
    expect(fit.orientation).toBe("dense");
    expect(w).toBeGreaterThanOrEqual(46);
    expect(h).toBeGreaterThanOrEqual(34);
  });

  it("drops the names only when a tile cannot hold one", () => {
    expect(tiles(320, 60).fit.orientation).toBe("icons");
  });

  it("shows pictures when the box has room for them", () => {
    const { fit } = tiles(1000, 700);
    expect(fit.portrait).toBeGreaterThan(0);
  });

  it("uses the width and height it is given without overflowing", () => {
    const { fit, h } = tiles(340, 106);
    const used = fit.rows * h + (fit.rows - 1) * DENSE_GAP;
    expect(used).toBeLessThanOrEqual(106 + 0.01);
  });

  it("answers nothing for an empty box", () => {
    expect(fitEffectPicker({ width: 0, height: 100, count })).toBeNull();
    expect(fitEffectPicker({ width: 100, height: 0, count })).toBeNull();
  });
});
