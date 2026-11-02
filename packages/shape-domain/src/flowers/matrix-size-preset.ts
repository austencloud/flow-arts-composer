import type { AxisFilter, MatrixFilters } from "./filter-flower-axis";

/** Cumulative ratio-band size presets for the shape matrix. */
export type MatrixSize = "small" | "medium" | "large";

/**
 * Cumulative integer-turn ratio bands per size, matching the domain ratio
 * labels 1:1 (turns 0), 1:3 (turns 1), 1:5 (turns 2). Half-turn steps
 * (0.5/1.5/2.5, ratios 2:1/4:1/6:1) are excluded from the preset — they are
 * available via the manual filter, not the size control.
 */
const TURNS_BY_SIZE: Record<MatrixSize, readonly number[]> = {
  small: [0],
  medium: [0, 1],
  large: [0, 1, 2],
};

/**
 * Axis filter for a size preset: diamond grid only, both styles, both
 * orientations, no collapse — so the tile count matches the documented
 * cumulative counts exactly (small 16, medium 64, large 144).
 */
function axisFilterForSize(size: MatrixSize): AxisFilter {
  return {
    style: "all",
    turns: new Set(TURNS_BY_SIZE[size]),
    ori: "all",
    grid: "diamond",
  };
}

/** Full matrix filter set for a size preset — same axis filter on both hands. */
export function matrixFiltersForSize(size: MatrixSize): MatrixFilters {
  return {
    left: axisFilterForSize(size),
    right: axisFilterForSize(size),
    collapse: false,
  };
}
