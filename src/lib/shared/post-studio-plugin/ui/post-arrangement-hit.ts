import type { PostBox } from "#lib/shared/media-composition/domain/post-project.js";
import type {
  ArrangementCell,
  ArrangementSnapshot,
} from "#lib/shared/media-composition/domain/arrangement.js";
import {
  cellAt,
  isVisibleCell,
  occupiedPositions,
} from "#lib/shared/media-composition/domain/arrangement-edits.js";
import { boxTurn, intoTurnedBox } from "./post-box-drag";

/**
 * Where a pointer over the preview lands inside an arrangement. The canvas
 * owns pointer events over the frame, so it asks these pure functions which
 * cell is under a point and where a cell sits, and tells the layer what to
 * mark. Positions count from the top left; fractions run 0..1 across the
 * item's box.
 */

export interface GridPosition {
  row: number;
  col: number;
}

/** A cell's place inside its item's box, each side a fraction of the box. */
export interface CellFrame {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** A position inside the grid that holds no sequence: a target for one. */
export interface OpenCell {
  key: string;
  /** The record at the position, or null when the snapshot has none there. */
  cellId: string | null;
  row: number;
  col: number;
  rowSpan: number;
  colSpan: number;
}

/** What the canvas asks the arrangement layer to mark while its item is in hand. */
export interface ArrangementEditingMarks {
  selectedCellId: string | null;
  /** The position a dragged cell would swap into right now. */
  dropTarget: GridPosition | null;
  /** The cell being dragged, drawn lifted while its ghost follows the pointer. */
  draggingCellId: string | null;
}

/**
 * A frame point as fractions of a box from its top left, read in the box's
 * own axes when it is turned (the inverse of `boxContains`). `aspect` is the
 * frame's width over its height, so a turned step stays square.
 */
export function boxLocalPoint(
  box: PostBox,
  x: number,
  y: number,
  aspect = 1
): { u: number; v: number } {
  const wide = aspect > 0 && Number.isFinite(aspect) ? aspect : 1;
  const [alongWidth, alongHeight] = intoTurnedBox(
    (x - box.x - box.width / 2) * wide,
    y - box.y - box.height / 2,
    boxTurn(box)
  );
  return {
    u: box.width > 0 ? alongWidth / (box.width * wide) + 0.5 : 0,
    v: box.height > 0 ? alongHeight / box.height + 0.5 : 0,
  };
}

/** The grid position under a box-local point, or null outside the box. */
export function positionAtPoint(
  snapshot: ArrangementSnapshot,
  u: number,
  v: number
): GridPosition | null {
  if (!(u >= 0 && u < 1 && v >= 0 && v < 1)) return null;
  return {
    row: Math.min(snapshot.gridRows - 1, Math.floor(v * snapshot.gridRows)),
    col: Math.min(snapshot.gridCols - 1, Math.floor(u * snapshot.gridCols)),
  };
}

/** The visible cell at a position, counting a span as its origin cell's. */
export function cellAtPosition(
  snapshot: ArrangementSnapshot,
  position: GridPosition
): ArrangementCell | null {
  const covering = occupiedPositions(snapshot).get(
    `${position.row}-${position.col}`
  );
  const cell = covering
    ? snapshot.cells.find((c) => c.id === covering)
    : cellAt(snapshot, position.row, position.col);
  return cell && isVisibleCell(cell, snapshot) ? cell : null;
}

export function cellAtPoint(
  snapshot: ArrangementSnapshot,
  u: number,
  v: number
): ArrangementCell | null {
  const position = positionAtPoint(snapshot, u, v);
  return position ? cellAtPosition(snapshot, position) : null;
}

/** The box fraction a cell covers, its span clamped to the grid. */
export function cellFrame(
  snapshot: ArrangementSnapshot,
  cell: ArrangementCell
): CellFrame {
  const colSpan = Math.max(
    1,
    Math.min(cell.colSpan, snapshot.gridCols - cell.col)
  );
  const rowSpan = Math.max(
    1,
    Math.min(cell.rowSpan, snapshot.gridRows - cell.row)
  );
  return {
    left: cell.col / snapshot.gridCols,
    top: cell.row / snapshot.gridRows,
    width: colSpan / snapshot.gridCols,
    height: rowSpan / snapshot.gridRows,
  };
}

/** Positions inside the grid with no sequence, in reading order. */
export function openCells(snapshot: ArrangementSnapshot): OpenCell[] {
  const occupied = occupiedPositions(snapshot);
  const open: OpenCell[] = [];
  for (let row = 0; row < snapshot.gridRows; row++) {
    for (let col = 0; col < snapshot.gridCols; col++) {
      if (occupied.has(`${row}-${col}`)) continue;
      const cell = cellAt(snapshot, row, col);
      if (cell && (cell.layers.length > 0 || cell.mediaType !== "animation"))
        continue;
      open.push({
        key: cell?.id ?? `open-${row}-${col}`,
        cellId: cell?.id ?? null,
        row,
        col,
        rowSpan: cell
          ? Math.max(1, Math.min(cell.rowSpan, snapshot.gridRows - row))
          : 1,
        colSpan: cell
          ? Math.max(1, Math.min(cell.colSpan, snapshot.gridCols - col))
          : 1,
      });
    }
  }
  return open;
}
