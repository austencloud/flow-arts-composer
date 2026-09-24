import { describe, expect, it } from "vitest";
import {
  getModuleGridLayout,
  getModuleGridMaxColumns,
  MODULE_GRID_MAX_COLUMNS,
} from "$lib/shared/navigation/domain/module-grid-layout";

// Content widths the sheet gives the grid once gutters and the reserved
// scrollbar gutter are removed: a 375px phone, the 280px landscape side
// drawer, and the 720px sheet cap.
const PHONE = 327;
const SIDE_DRAWER = 232;
const SHEET = 664;

function rowLengths(count: number, width: number): number[] {
  const { columns, rows } = getModuleGridLayout(count, width);
  return Array.from({ length: rows }, (_, row) =>
    Math.min(columns, count - row * columns)
  );
}

describe("getModuleGridLayout", () => {
  it.each([
    [3, SHEET, [3]],
    [5, SHEET, [5]],
    [7, SHEET, [4, 3]],
    [13, SHEET, [5, 5, 3]],
    [3, PHONE, [3]],
    [5, PHONE, [3, 2]],
    [7, PHONE, [3, 3, 1]],
    [13, PHONE, [3, 3, 3, 3, 1]],
    [13, SIDE_DRAWER, [2, 2, 2, 2, 2, 2, 1]],
  ])("lays out %i tiles at %ipx as %j", (count, width, expected) => {
    expect(rowLengths(count, width)).toEqual(expected);
  });

  it("uses the fewest rows and never leaves a short row above the last", () => {
    for (const width of [PHONE, SIDE_DRAWER, SHEET, 2000]) {
      const max = getModuleGridMaxColumns(width);
      for (let count = 1; count <= 16; count++) {
        const layout = getModuleGridLayout(count, width);
        const rows = rowLengths(count, width);
        expect(layout.columns).toBeLessThanOrEqual(max);
        expect(rows).toHaveLength(Math.ceil(count / max));
        expect(rows.slice(0, -1).every((n) => n === layout.columns)).toBe(true);
        expect(rows.at(-1)).toBeGreaterThan(0);
      }
    }
  });

  it("indents a short last row by the half-columns it leaves empty", () => {
    expect(getModuleGridLayout(13, SHEET)).toMatchObject({
      lastRowStart: 10,
      lastRowIndent: 2,
    });
    expect(getModuleGridLayout(7, SHEET)).toMatchObject({
      lastRowStart: 4,
      lastRowIndent: 1,
    });
    expect(getModuleGridLayout(10, SHEET)).toMatchObject({
      lastRowStart: 5,
      lastRowIndent: 0,
    });
  });

  it("caps wide sheets at the maximum column count", () => {
    expect(getModuleGridMaxColumns(3840)).toBe(MODULE_GRID_MAX_COLUMNS);
  });

  it("falls back to one column before the grid has been measured", () => {
    expect(getModuleGridLayout(5, 0).columns).toBe(1);
  });
});
