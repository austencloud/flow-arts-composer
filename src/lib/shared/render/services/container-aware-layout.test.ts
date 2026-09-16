import { describe, it, expect } from "vitest";
import { pickBestFitLayout, type BestFitInput } from "./container-aware-layout";

/**
 * Auto layout picker: literal pictograph size is the primary objective.
 * Trailing gaps only break sub-pixel ties, so a visibly larger cell always wins.
 */

function input(overrides: Partial<BestFitInput>): BestFitInput {
  return {
    stepCount: 8,
    includeStartPlacement: true,
    containerWidth: 600,
    containerHeight: 800,
    showHeader: true,
    showFooter: true,
    showQRCode: true,
    ...overrides,
  };
}

describe("pickBestFitLayout — maximum pictograph size", () => {
  it("8 + start + QR (portrait viewer panel): picks the 3×4 start-column, not the 2×5 start-row", () => {
    // The reported case: auto chose 2×5 with a start+QR top row; the wider 3×4
    // start-column fills the panel better and its step region is full.
    const fit = pickBestFitLayout(input({ containerWidth: 630, containerHeight: 885 }))!;
    expect(fit).not.toBeNull();
    expect(`${fit.cols}x${fit.rows}`).toBe("3x4");
    expect(fit.startPlacement).toBe("column");
  });

  it("8 + start + QR: a step-region gap (4×3) is rejected for the full-step 3×4", () => {
    // 4×3 leaves an unfilled last step row ("upward space"); 3×4 does not.
    const fit = pickBestFitLayout(input({ containerWidth: 630, containerHeight: 885 }))!;
    expect(`${fit.cols}x${fit.rows}`).not.toBe("4x3");
  });

  it("12 + start + QR (near-square): keeps the container-filling 4×4", () => {
    const fit = pickBestFitLayout(input({ stepCount: 12, containerWidth: 900, containerHeight: 945 }))!;
    expect(`${fit.cols}x${fit.rows}`).toBe("4x4");
    expect(fit.cols).not.toBe(2); // never the skinny 2-wide grid
  });

  it("12 + start + QR (tall): more rows, 3 step-columns, full step region", () => {
    const fit = pickBestFitLayout(input({ stepCount: 12, containerWidth: 900, containerHeight: 1400 }))!;
    // start row + 3 step columns × 4 step rows.
    expect(`${fit.cols}x${fit.rows}`).toBe("3x5");
  });

  it("7 + start + QR (prime): a real shape, never a 1-wide strip", () => {
    const fit = pickBestFitLayout(input({ stepCount: 7 }))!;
    expect(fit).not.toBeNull();
    expect(fit.cols).toBeGreaterThan(1);
  });

  it("8, no start, no QR (square): keeps the four-column beat grid", () => {
    const shown = pickBestFitLayout(
      input({ includeStartPlacement: true, showQRCode: false, containerWidth: 800, containerHeight: 800 }),
    )!;
    const hidden = pickBestFitLayout(
      input({ includeStartPlacement: false, showQRCode: false, containerWidth: 800, containerHeight: 800 }),
    )!;

    expect(hidden).toEqual({
      cols: shown.startPlacement === "column" ? shown.cols - 1 : shown.cols,
      rows: 2,
      startPlacement: "none",
      widthUnits: 4,
    });
  });

  it("size still decides among full-step shapes: wide container favors more columns", () => {
    const fit = pickBestFitLayout(input({ containerWidth: 2000, containerHeight: 500 }))!;
    expect(fit.cols).toBeGreaterThan(fit.rows);
  });

  it("size still decides among full-step shapes: tall container favors more rows", () => {
    const fit = pickBestFitLayout(input({ containerWidth: 400, containerHeight: 2000 }))!;
    expect(fit.rows).toBeGreaterThan(fit.cols);
  });

  it("degenerate inputs return null", () => {
    expect(pickBestFitLayout(input({ stepCount: 0 }))).toBeNull();
    expect(pickBestFitLayout(input({ containerWidth: 0 }))).toBeNull();
    expect(pickBestFitLayout(input({ containerHeight: -1 }))).toBeNull();
  });
});
