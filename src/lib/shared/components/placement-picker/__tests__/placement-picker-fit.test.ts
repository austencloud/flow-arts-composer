import { describe, expect, it } from "vitest";
import {
  COMFORT_GRID_REM,
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

  it("stacks in a tall, narrow box and keeps the aside when the grid is comfortable", () => {
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

  it("never folds when the host gave no folded form", () => {
    const m = box(343, 530);
    delete m.foldedHeightAt;
    expect(fitPicker(m).folded).toBe(false);
  });

  it("holds the touch floor on a box too small for any arrangement", () => {
    expect(fitPicker(box(600, 150)).gridSize).toBe(MIN_GRID_PX);
  });

  it("fits every box with room for the floor, and keeps the aside whenever the grid is comfortable with it", () => {
    for (let w = 320; w <= 2400; w += 40) {
      for (let h = 300; h <= 1600; h += 40) {
        const m = box(w, h);
        const fit = fitPicker(m);
        if (fit.gridSize > MIN_GRID_PX) {
          expect(heightUsed(m, w)).toBeLessThanOrEqual(h);
        }
        if (fit.folded) {
          const unfolded = fitPicker({ ...m, foldedHeightAt: undefined });
          expect(unfolded.gridSize).toBeLessThan(COMFORT_GRID_REM * 16);
        }
      }
    }
  });
});
