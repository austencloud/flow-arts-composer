/**
 * The Create front door's Shape preview: the corner of the Shape Matrix it
 * shows, the Surprise each turn rolls, and the scene's beats around the
 * Matrix's own reveal. Pure, so tests check them without drawing.
 */
import type { TurnValue } from "#lib/shared/create/services/level-turn-values.js";
import { applyFilter } from "#lib/shared/shape-matrix/domain/filter-flower-axis.js";
import type { Flower } from "#lib/shared/shape-matrix/domain/flower-signature.js";
import {
  matrixFiltersForTurns,
  matrixTurnsForLevel,
  SHAPE_MATRIX_DEFAULT_LEVEL,
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

/** A page of the Matrix: the turn band on each hand's axis. */
export interface ShapePage {
  left: TurnValue;
  right: TurnValue;
}

/** A crossing of the corner. */
export interface ShapeSpot {
  row: number;
  column: number;
}

/** The page the Matrix opens on, and the one the preview rests on first. */
export const SHAPE_PREVIEW_FIRST_PAGE: ShapePage = Object.freeze({
  left: SHAPE_MATRIX_DEFAULT_TURN,
  right: SHAPE_MATRIX_DEFAULT_TURN,
});

/**
 * The top-left corner of a page of the Matrix (by default the page it opens
 * on), filtered the way the Matrix filters it, as many flowers as the layout
 * holds.
 */
export function shapeCorner(
  axis: Flower[],
  layout: Pick<ShapeLayout, "rows" | "columns">,
  page: ShapePage = SHAPE_PREVIEW_FIRST_PAGE
): ShapeCorner {
  const filters = matrixFiltersForTurns(page.left, page.right);
  return {
    rows: applyFilter(axis, filters.left, false).slice(0, layout.rows),
    columns: applyFilter(axis, filters.right, false).slice(0, layout.columns),
  };
}

function pick<T>(items: readonly T[], random: () => number): T | undefined {
  return items[Math.min(items.length - 1, Math.floor(random() * items.length))];
}

/**
 * The page a Surprise rolls next, as the Matrix rolls it
 * (shape-matrix-app-state surpriseMe): any pair of the opening level's turn
 * bands except the page showing. Only pages that fill the corner qualify.
 */
export function nextShapePage(
  previous: ShapePage,
  axis: Flower[],
  layout: Pick<ShapeLayout, "rows" | "columns">,
  random: () => number = Math.random
): ShapePage {
  const turns = matrixTurnsForLevel(SHAPE_MATRIX_DEFAULT_LEVEL);
  const pages = turns
    .flatMap((left) => turns.map((right) => ({ left, right })))
    .filter(
      (page) => page.left !== previous.left || page.right !== previous.right
    )
    .filter((page) => {
      const corner = shapeCorner(axis, layout, page);
      return (
        corner.rows.length === layout.rows &&
        corner.columns.length === layout.columns
      );
    });
  return pick(pages, random) ?? previous;
}

/**
 * The crossing a Surprise lights next: any tile of the corner except the
 * one lit last, so the light moves even where two pages look alike.
 */
export function nextShapeSpot(
  previous: ShapeSpot,
  layout: Pick<ShapeLayout, "rows" | "columns">,
  random: () => number = Math.random
): ShapeSpot {
  const spots: ShapeSpot[] = [];
  for (let row = 0; row < layout.rows; row++) {
    for (let column = 0; column < layout.columns; column++) {
      if (row !== previous.row || column !== previous.column) {
        spots.push({ row, column });
      }
    }
  }
  return pick(spots, random) ?? previous;
}
