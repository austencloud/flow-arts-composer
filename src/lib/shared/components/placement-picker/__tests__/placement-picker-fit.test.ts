import { describe, expect, it } from "vitest";
import {
  BLOCK_EDGE,
  KEEP_ASIDE_SHARE,
  MIN_CELL_PX,
  fitPicker,
  type PickerFit,
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

// The Start Placement chooser's Custom grid as measured in a browser: one
// preset chip over the status line (74px), both in one 48px row from 221px
// across, the props block 172px, its folded row 48px, and the mode control
// kept clear at the top end in the chooser's wide arrangement.
function chooser(
  width: number,
  height: number,
  reserve?: { width: number; height: number }
): PickerMeasure {
  return {
    width,
    height,
    rem: 16,
    controlsHeightAt: () => 74,
    controlsRowHeightAt: (w) => (w >= 221 ? 48 : 74),
    asideHeightAt: () => 172,
    foldedHeightAt: () => 48,
    reserve,
  };
}

function rows(fit: PickerFit) {
  return 16 / fit.columns;
}

function gridHeight(fit: PickerFit) {
  return rows(fit) * fit.cell + (rows(fit) - 1) * 8 + 8;
}

// What the chosen arrangement takes in height, to check it fits the box.
function heightUsed(m: PickerMeasure, fit: PickerFit) {
  const aside = fit.folded ? m.foldedHeightAt : m.asideHeightAt;
  const inset = m.reserve?.height ?? 0;
  if (fit.arrangement === "wide") return fit.band + 8 + gridHeight(fit);
  if (fit.arrangement === "side") {
    const column =
      inset +
      m.controlsHeightAt(fit.column) +
      (aside ? 16 + aside(fit.column) : 0);
    return BLOCK_EDGE + Math.max(gridHeight(fit), column);
  }
  return (
    BLOCK_EDGE +
    inset +
    m.controlsHeightAt(m.width) +
    12 +
    gridHeight(fit) +
    (aside ? 12 + aside(m.width) : 0)
  );
}

describe("fitPicker", () => {
  it("puts the controls beside the grid in a wide, short box", () => {
    const fit = fitPicker(box(1100, 536));
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
    const fit = fitPicker(box(343, 546));
    expect(fit.folded).toBe(true);
    expect(fit.gridSize).toBeGreaterThan(300);
  });

  it("folds the aside in a squarish box, where beside or below it costs the grid most", () => {
    const fit = fitPicker(box(587, 556));
    expect(fit.folded).toBe(true);
    expect(fit.arrangement).toBe("stack");
    expect(fit.gridSize).toBeGreaterThan(360);
  });

  it("never folds when the host gave no folded form", () => {
    const m = box(343, 546);
    delete m.foldedHeightAt;
    expect(fitPicker(m).folded).toBe(false);
  });

  it("keeps an upright phone's grid as it was: 4 x 4, aside below", () => {
    // 360 x 689: the chooser's Custom picker box.
    const fit = fitPicker(chooser(328, 502));
    expect(fit.arrangement).toBe("stack");
    expect(fit.columns).toBe(4);
    expect(fit.folded).toBe(true);
    expect(fit.gridSize).toBe(328);
  });

  it("lays a phone on its side out eight across, two down", () => {
    const fit = fitPicker(chooser(883, 231, { width: 376, height: 44 }));
    expect(fit.arrangement).toBe("wide");
    expect(fit.columns).toBe(8);
    expect(fit.folded).toBe(true);
    expect(fit.cell).toBeGreaterThanOrEqual(76);
    expect(heightUsed(chooser(883, 231), fit)).toBeLessThanOrEqual(231);
  });

  it("keeps the aside beside a 4 x 4 grid in a short laptop window's float", () => {
    const m = chooser(848, 415, { width: 352, height: 44 });
    const fit = fitPicker(m);
    expect(fit.arrangement).toBe("side");
    expect(fit.folded).toBe(false);
    expect(fit.column).toBeGreaterThanOrEqual(352);
    // The grid stays left of the host's corner.
    expect(fit.gridSize + 24).toBeLessThanOrEqual(848 - 352);
  });

  it("never returns a grid taller than a box too short for the floor", () => {
    for (const [w, h] of [
      [638, 47],
      [752, 180],
      [656, 100],
    ] as const) {
      for (const m of [box(w, h), chooser(w, h)]) {
        const fit = fitPicker(m);
        expect(gridHeight(fit)).toBeLessThanOrEqual(h);
      }
    }
  });

  it("goes under the touch floor rather than spill when the choices still fit", () => {
    const m = chooser(752, 150);
    const fit = fitPicker(m);
    expect(fit.cell).toBeLessThan(MIN_CELL_PX);
    expect(fit.cell).toBeGreaterThan(0);
    expect(heightUsed(m, fit)).toBeLessThanOrEqual(150);
  });

  it("fits every box with room for the floor, and folds only when the aside would cost the cells more than their share", () => {
    for (let w = 320; w <= 2400; w += 40) {
      for (let h = 300; h <= 1600; h += 40) {
        for (const m of [box(w, h), chooser(w, h)]) {
          const fit = fitPicker(m);
          if (fit.cell >= MIN_CELL_PX) {
            expect(heightUsed(m, fit)).toBeLessThanOrEqual(h);
          }
          if (fit.folded && fit.cell >= MIN_CELL_PX) {
            const unfolded = fitPicker({ ...m, foldedHeightAt: undefined });
            // An unfolded aside that cannot fit at all holds the floor.
            if (unfolded.cell > MIN_CELL_PX)
              // Cells are whole pixels; the choice was made before rounding.
              expect(unfolded.cell).toBeLessThan(
                KEEP_ASIDE_SHARE * (fit.cell + 1)
              );
          }
        }
      }
    }
  });
});
