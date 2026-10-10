/**
 * The Create front door's Shape preview: the corner of the Shape Matrix it
 * shows and the scene's beats around the Matrix's own reveal. Pure, so tests
 * check them without drawing.
 */
import { applyFilter } from "#lib/shared/shape-matrix/domain/filter-flower-axis.js";
import type { Flower } from "#lib/shared/shape-matrix/domain/flower-signature.js";
import {
  matrixFiltersForTurns,
  SHAPE_MATRIX_DEFAULT_TURN,
} from "#lib/shared/shape-matrix/domain/matrix-turn-band.js";
import type { ShapeLayout } from "./method-preview-compositions";

/**
 * The scene's beats, in milliseconds from the start of its turn. The corner
 * rebuilds on the Matrix's own schedule (SHAPE_MATRIX_REVEAL); these fit the
 * finger, the grow, and the draw around it.
 */
export const SHAPE_PREVIEW_TIMING = Object.freeze({
  /** The finished stage fades out as the corner rebuilds. */
  stageOutMs: 150,
  /**
   * When the finger leaves for the chosen tile. A tap takes at least 560ms
   * (the ghost's shortest glide, 300ms, then SCENE_TAP), so it lands as the
   * Matrix lights the chosen crossing (SHAPE_MATRIX_REVEAL.chosen.at).
   */
  fingerLeavesMs: 240,
  /** From the tap to the tile starting to grow. */
  growDelayMs: 100,
  growMs: 360,
  /** The mandala draws from its first stroke to the finished tile. */
  drawMs: 1300,
});

/** The flowers on the corner's rows (blue hand) and columns (red hand). */
export interface ShapeCorner {
  rows: Flower[];
  columns: Flower[];
}

/**
 * The top-left corner of the page the Matrix opens on: the default turn band
 * on both axes, filtered the way the Matrix filters it, as many flowers as
 * the layout holds.
 */
export function shapeCorner(
  axis: Flower[],
  layout: Pick<ShapeLayout, "rows" | "columns">
): ShapeCorner {
  const filters = matrixFiltersForTurns(
    SHAPE_MATRIX_DEFAULT_TURN,
    SHAPE_MATRIX_DEFAULT_TURN
  );
  return {
    rows: applyFilter(axis, filters.left, false).slice(0, layout.rows),
    columns: applyFilter(axis, filters.right, false).slice(0, layout.columns),
  };
}
