// How the placement picker arranges itself in the box it is given, when its
// host asks it to fit (layout "split"). The grid is the point of the screen,
// so every choice here is about drawing it as large as the box allows:
//
// - stack: quick choices and status above the grid, the aside below it.
// - side: the grid on the left, a column of choices, status and aside beside
//   it, for a box wider than it is tall.
//
// When neither draws the grid comfortably and the host gave a folded form of
// the aside (a row that opens it as a screen of its own), the aside folds.
// Below the touch floor nothing more can give way, and the host's scroller
// takes the rest.

export type PickerArrangement = "stack" | "side";

export interface PickerMeasure {
  width: number;
  height: number;
  rem: number;
  /** Quick choices and status, at a given width (chips wrap). */
  controlsHeightAt: (width: number) => number;
  /** The aside as written, at a given width. Absent when there is none. */
  asideHeightAt?: (width: number) => number;
  /** The aside folded to a row. Absent when the host gave no folded form. */
  foldedHeightAt?: (width: number) => number;
}

export interface PickerFit {
  arrangement: PickerArrangement;
  folded: boolean;
  /** Edge of the square grid, in px. */
  gridSize: number;
  /** Width of the side column, in px; 0 when stacked. */
  column: number;
}

/** Below this the cells read as small, and folding the aside is worth it. */
export const COMFORT_GRID_REM = 18;

/** Four 48px touch targets, three 8px gaps, 4px of padding a side. */
export const MIN_GRID_PX = 4 * 48 + 3 * 8 + 8;

const STACK_GAP = 12;
const SIDE_COLUMN_GAP = 24;
const SIDE_ROW_GAP = 16;

function sideColumn(width: number, rem: number): number {
  return Math.min(24 * rem, Math.max(16 * rem, width * 0.36));
}

function candidates(m: PickerMeasure, folded: boolean): PickerFit[] {
  const asideAt = folded ? m.foldedHeightAt : m.asideHeightAt;
  const asideBelow = (w: number) => (asideAt ? STACK_GAP + asideAt(w) : 0);
  const asideBeside = (w: number) => (asideAt ? SIDE_ROW_GAP + asideAt(w) : 0);

  const out: PickerFit[] = [
    {
      arrangement: "stack",
      folded,
      gridSize: Math.min(
        m.width,
        m.height - m.controlsHeightAt(m.width) - STACK_GAP - asideBelow(m.width)
      ),
      column: 0,
    },
  ];

  const column = sideColumn(m.width, m.rem);
  const room = m.width - column - SIDE_COLUMN_GAP;
  const columnHeight = m.controlsHeightAt(column) + asideBeside(column);
  if (room >= MIN_GRID_PX && columnHeight <= m.height) {
    out.push({
      arrangement: "side",
      folded,
      gridSize: Math.min(m.height, room),
      column,
    });
  }
  return out;
}

function largest(fits: PickerFit[]): PickerFit {
  return fits.reduce((a, b) => (b.gridSize > a.gridSize ? b : a));
}

export function fitPicker(m: PickerMeasure): PickerFit {
  let best = largest(candidates(m, false));
  const canFold = Boolean(m.asideHeightAt && m.foldedHeightAt);
  if (canFold && best.gridSize < COMFORT_GRID_REM * m.rem) {
    const folded = largest(candidates(m, true));
    if (folded.gridSize > best.gridSize) best = folded;
  }
  return {
    ...best,
    gridSize: Math.floor(
      Math.min(m.width, Math.max(best.gridSize, MIN_GRID_PX))
    ),
  };
}
