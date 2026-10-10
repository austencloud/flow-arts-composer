import { describe, it, expect } from "vitest";
import { getSheetPageLayout } from "#lib/features/write/domain/sheet-page-layout.js";
import { DEFAULT_SHEET_LAYOUT } from "#lib/features/write/domain/types/choreo-sheet.js";

describe("getSheetPageLayout (letter landscape)", () => {
  const geo = getSheetPageLayout({ columns: 8, rowsPerPage: 6, paperSize: "letter", orientation: "landscape" });

  it("uses US-Letter landscape points (792 x 612)", () => {
    expect(geo.pageWidthPt).toBe(792);
    expect(geo.pageHeightPt).toBe(612);
  });

  it("fits 48 square cells with the grid centered on the page", () => {
    expect(geo.cellsPerPage).toBe(48);
    expect(geo.cellSizePt).toBeCloseTo(91.875, 2);
    expect(geo.marginXPt).toBeCloseTo(18, 2);
    const gridH = geo.rows * geo.cellSizePt + (geo.rows - 1) * geo.gutterPt;
    expect(gridH).toBeLessThanOrEqual(geo.pageHeightPt - 2 * 18);
  });
});

describe("getSheetPageLayout (letter portrait)", () => {
  it("derives row capacity from the page instead of the saved landscape preset", () => {
    const geo = getSheetPageLayout({
      ...DEFAULT_SHEET_LAYOUT,
      orientation: "portrait",
      columns: 8,
      rowsPerPage: 6,
    });

    expect(geo.rows).toBe(10);
    expect(geo.cellsPerPage).toBe(80);
  });
});
