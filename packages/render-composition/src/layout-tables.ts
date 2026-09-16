import type { StartPlacementLayout } from "./types.js";

export const BASE_STEP_SIZE = 144;

/**
 * Layout table for sequences WITH start position (sidebar/top rendering).
 * Copied exactly from LayoutCalculator.ts (LAYOUT_WITH_START_PLACEMENT).
 * Format: stepCount -> [columns, rows]
 */
const WITH_START_PLACEMENT: Record<number, [number, number]> = {
  0: [1, 1],
  1: [2, 1],
  2: [3, 1],
  3: [4, 1],
  4: [3, 2],
  5: [3, 2],
  6: [4, 2],
  7: [5, 2],
  8: [5, 2],
  9: [5, 3],
  10: [6, 2],
  11: [5, 3],
  12: [4, 4],
  13: [5, 4],
  14: [5, 4],
  15: [5, 4],
  16: [5, 4],
  17: [5, 5],
  18: [5, 5],
  19: [5, 5],
  20: [6, 4],
  21: [5, 6],
  22: [5, 6],
  23: [5, 6],
  24: [7, 4],
  25: [5, 7],
  26: [5, 7],
  27: [5, 7],
  28: [5, 7],
  29: [5, 8],
  30: [8, 4],
  31: [5, 8],
  32: [9, 4],
  33: [5, 9],
  34: [5, 9],
  35: [5, 9],
  36: [10, 4],
  37: [5, 10],
  38: [5, 10],
  39: [5, 10],
  40: [11, 4],
  41: [5, 11],
  42: [5, 11],
  43: [5, 11],
  44: [5, 11],
  45: [5, 12],
  46: [5, 12],
  47: [5, 12],
  48: [5, 12],
  49: [5, 13],
  50: [5, 13],
  51: [5, 13],
  52: [5, 13],
  53: [5, 14],
  54: [5, 14],
  55: [5, 14],
  56: [5, 14],
  57: [5, 15],
  58: [5, 15],
  59: [5, 15],
  60: [5, 15],
  61: [5, 16],
  62: [5, 16],
  63: [5, 16],
  64: [5, 16],
};

/**
 * Layout table for sequences WITHOUT start position.
 * Copied exactly from LayoutCalculator.ts (LAYOUT_WITHOUT_START_PLACEMENT).
 * Format: stepCount -> [columns, rows]
 */
const WITHOUT_START_PLACEMENT: Record<number, [number, number]> = {
  0: [1, 1],
  1: [1, 1],
  2: [2, 1],
  3: [3, 1],
  4: [2, 2],
  5: [2, 2],
  6: [3, 2],
  7: [4, 2],
  8: [4, 2],
  9: [3, 3],
  10: [5, 2],
  11: [4, 3],
  12: [3, 4],
  13: [4, 4],
  14: [4, 4],
  15: [4, 4],
  16: [4, 4],
  17: [4, 5],
  18: [9, 2],
  19: [4, 5],
  20: [5, 4],
  21: [4, 6],
  22: [4, 6],
  23: [4, 6],
  24: [6, 4],
  25: [4, 7],
  26: [4, 7],
  27: [4, 7],
  28: [7, 4],
  29: [4, 8],
  30: [4, 8],
  31: [4, 8],
  32: [8, 4],
  33: [4, 9],
  34: [4, 9],
  35: [4, 9],
  36: [9, 4],
  37: [4, 10],
  38: [4, 10],
  39: [4, 10],
  40: [10, 4],
  41: [4, 11],
  42: [4, 11],
  43: [4, 11],
  44: [11, 4],
  45: [4, 12],
  46: [4, 12],
  47: [4, 12],
  48: [12, 4],
  49: [4, 13],
  50: [4, 13],
  51: [4, 13],
  52: [13, 4],
  53: [4, 14],
  54: [4, 14],
  55: [4, 14],
  56: [14, 4],
  57: [4, 15],
  58: [4, 15],
  59: [4, 15],
  60: [15, 4],
  61: [4, 16],
  62: [4, 16],
  63: [4, 16],
  64: [16, 4],
};

/**
 * Layout table for sequences with start position as a TOP ROW.
 * Derived from WITHOUT_START_PLACEMENT by adding 1 row — the start pictograph
 * and QR code occupy row 0, steps begin at row 1.
 */
const WITH_START_ROW: Record<number, [number, number]> = Object.fromEntries(
  Object.entries(WITHOUT_START_PLACEMENT).map(([stepCount, [cols, rows]]) => [
    stepCount,
    [cols, rows + 1] as [number, number],
  ])
) as Record<number, [number, number]>;

/**
 * Portrait-optimized layout table for start position as a LEFT COLUMN.
 * Designed for playing card aspect ratio (5:7) — column 0 holds the start
 * position, remaining columns hold steps.
 * Copied exactly from LayoutCalculator.ts (LAYOUT_WITH_START_COLUMN).
 */
const WITH_START_COLUMN: Record<number, [number, number]> = {
  0: [1, 1],
  1: [2, 1],
  2: [3, 1],
  3: [4, 1],
  4: [3, 2],
  5: [3, 3],
  6: [4, 2],
  7: [3, 4],
  8: [5, 2],
  9: [4, 3],
  10: [3, 5],
  11: [4, 4],
  12: [4, 4],
  13: [4, 5],
  14: [4, 5],
  15: [4, 5],
  16: [5, 4],
  17: [5, 5],
  18: [5, 5],
  19: [5, 5],
  20: [5, 5],
  21: [5, 6],
  22: [5, 6],
  23: [5, 6],
  24: [5, 6],
  25: [5, 7],
  26: [5, 7],
  27: [5, 7],
  28: [5, 7],
  29: [5, 8],
  30: [5, 8],
  31: [5, 8],
  32: [5, 8],
  33: [5, 9],
  34: [5, 9],
  35: [5, 9],
  36: [5, 9],
  37: [5, 10],
  38: [5, 10],
  39: [5, 10],
  40: [5, 10],
  41: [5, 11],
  42: [5, 11],
  43: [5, 11],
  44: [5, 11],
  45: [5, 12],
  46: [5, 12],
  47: [5, 12],
  48: [5, 12],
  49: [5, 13],
  50: [5, 13],
  51: [5, 13],
  52: [5, 13],
  53: [5, 14],
  54: [5, 14],
  55: [5, 14],
  56: [5, 14],
  57: [5, 15],
  58: [5, 15],
  59: [5, 15],
  60: [5, 15],
  61: [5, 16],
  62: [5, 16],
  63: [5, 16],
  64: [5, 16],
};

function getTableForLayout(
  layout: StartPlacementLayout
): Record<number, [number, number]> {
  switch (layout) {
    case "sidebar":
      return WITH_START_PLACEMENT;
    case "top":
      // Same underlying table as sidebar — the rendering layer decides how to
      // visually place the start position; the grid dimensions are identical.
      return WITH_START_PLACEMENT;
    case "column":
      return WITH_START_COLUMN;
    case "row":
      return WITH_START_ROW;
    case "none":
      return WITHOUT_START_PLACEMENT;
  }
}

/**
 * Look up the [columns, rows] grid dimensions for a given step count and
 * start-placement layout mode.
 *
 * Falls back to the same aspect-ratio calculation used by Composer when the
 * step count exceeds the predefined tables.
 */
export function getLayout(
  stepCount: number,
  startPlacementLayout: StartPlacementLayout
): [columns: number, rows: number] {
  const table = getTableForLayout(startPlacementLayout);
  const predefined = table[stepCount];
  if (predefined) return predefined;

  if (stepCount <= 0) return [1, 1];
  const aspectRatio = 1.2;
  const rows = Math.max(1, Math.round(Math.sqrt(stepCount / aspectRatio)));
  const columns = Math.max(1, Math.ceil(stepCount / rows));

  if (startPlacementLayout === "none") return [columns, rows];
  if (startPlacementLayout === "row") return [columns, rows + 1];
  return [columns + 1, rows];
}

/**
 *
 * Matches the desktop _create_image() formula:
 *   width  = floor(columns * stepSize)
 *   height = floor(rows   * stepSize + additionalHeight)
 */
export function calculateImageDimensions(
  layout: [number, number],
  additionalHeight: number,
  stepSize: number
): [width: number, height: number] {
  const [columns, rows] = layout;
  const width = Math.floor(columns * stepSize);
  const height = Math.floor(rows * stepSize + additionalHeight);
  return [width, height];
}
