import { describe, expect, it } from "vitest";
import {
  KEEP_ASIDE_SHARE,
  MIN_GRID_PX,
  fitPicker,
  type PickerMeasure,
} from "../placement-picker-fit";

// Chips wrap to two lines below 420px; the orientation block is 170px tall,
// its folded row 64px.
function box(width: number, height: number, aside = true): PickerMeasure {
  return {
    width,
    height,
    rem: 16,
    controlsHeightAt: (w) => (w >= 420 ? 80 : 130),
    asideHeightAt: aside ? () => 170 : undefined,
    foldedHeightAt: aside ? () => 64 : undefined,
  };
}

// What the chosen arrangement takes in height, to check it fits the box.
function heightUsed(m: PickerMeasure, width: number) {
  const fit = fitPicker(m);
  const aside = fit.folded ? m.foldedHeightAt : m.asideHeightAt;
  if (fit.arrangement === "side") {
    const column =
      m.controlsHeightAt(fit.column) + (aside ? 16 + aside(fit.column) : 0);
    return Math.max(fit.gridSize, column);
  }
  return (
    m.controlsHeightAt(width) +
    12 +
    fit.gridSize +
    (aside ? 12 + aside(width) : 0)
  );
}

describe("fitPicker", () => {
  it("puts the controls beside the grid in a wide, short box", () => {
    const fit = fitPicker(box(1100, 520));
    expect(fit.arrangement).toBe("side");
    expect(fit.folded).toBe(false);
    expect(fit.gridSize).toBe(520);
  });

  it("stacks in a tall, narrow box and keeps the aside when it costs the grid nothing", () => {
    const fit = fitPicker(box(400, 900));
    expect(fit.arrangement).toBe("stack");
    expect(fit.folded).toBe(false);
    expect(fit.gridSize).toBe(400);
  });

  it("folds the aside on a phone, where it would cost the grid its comfort", () => {
    const fit = fitPicker(box(343, 530));
    expect(fit.folded).toBe(true);
    expect(fit.gridSize).toBeGreaterThan(300);
  });

  it("folds the aside in a squarish box, where beside or below it costs the grid most", () => {
    const fit = fitPicker(box(587, 540));
    expect(fit.folded).toBe(true);
    expect(fit.arrangement).toBe("stack");
    expect(fit.gridSize).toBeGreaterThan(360);
  });

  it("never folds when the host gave no folded form", () => {
    const m = box(343, 530);
    delete m.foldedHeightAt;
    expect(fitPicker(m).folded).toBe(false);
  });

  it("holds the touch floor on a box too small for any arrangement, in the one that overflows least", () => {
    const fit = fitPicker(box(656, 100));
    expect(fit.gridSize).toBe(MIN_GRID_PX);
    expect(fit.arrangement).toBe("side");
    expect(fit.folded).toBe(true);
  });

  it("fits every box with room for the floor, and folds only when the aside would cost the grid more than its share", () => {
    for (let w = 320; w <= 2400; w += 40) {
      for (let h = 300; h <= 1600; h += 40) {
        const m = box(w, h);
        const fit = fitPicker(m);
        if (fit.gridSize > MIN_GRID_PX) {
          expect(heightUsed(m, w)).toBeLessThanOrEqual(h);
        }
        if (fit.folded && fit.gridSize > MIN_GRID_PX) {
          const unfolded = fitPicker({ ...m, foldedHeightAt: undefined });
          // An unfolded aside that cannot fit at all holds the floor.
          if (unfolded.gridSize > MIN_GRID_PX)
            expect(unfolded.gridSize).toBeLessThan(
              KEEP_ASIDE_SHARE * fit.gridSize
            );
        }
      }
    }
  });
});
