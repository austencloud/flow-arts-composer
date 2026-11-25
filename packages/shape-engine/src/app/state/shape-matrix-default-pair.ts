/**
 * The crossing the Shape Engine opens on when nothing names one. A first visit
 * starts with a cell already playing: the stage traces it with the real prop
 * while the grid draws itself, and it keeps playing once the grid is done, so
 * loading has no hand-over to the content.
 */
import {
  applyFilter,
  buildShapeMatrixAxis,
  matrixFiltersForTurns,
  type Flower,
  type TurnValue,
} from "@tka/shape-domain";

/** Third row, fourth column: two different flowers, so both inks show. */
const DEFAULT_ROW = 2;
const DEFAULT_COLUMN = 3;

const AXIS = buildShapeMatrixAxis();

export function defaultShapeMatrixPair(
  leftTurn: TurnValue,
  rightTurn: TurnValue
): { left: Flower; right: Flower } | null {
  const filters = matrixFiltersForTurns(leftTurn, rightTurn);
  const rows = applyFilter(AXIS, filters.left, false);
  const columns = applyFilter(AXIS, filters.right, false);
  const left = rows[Math.min(DEFAULT_ROW, rows.length - 1)];
  const right = columns[Math.min(DEFAULT_COLUMN, columns.length - 1)];
  return left && right ? { left, right } : null;
}
