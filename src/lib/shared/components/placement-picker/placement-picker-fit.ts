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
// Below the touch floor nothing more can give way: the grid holds the floor in
// whichever arrangement overflows least, and the host's scroller takes the
// rest.

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

interface Candidate extends PickerFit {
  /** Fits the box with its grid at gridSize. */
  fits: boolean;
  /** Height the arrangement takes with its grid at the touch floor. */
  heightAtFloor: number;
}

function candidates(m: PickerMeasure, folded: boolean): Candidate[] {
  const asideAt = folded ? m.foldedHeightAt : m.asideHeightAt;
  const asideBelow = (w: number) => (asideAt ? STACK_GAP + asideAt(w) : 0);
  const asideBeside = (w: number) => (asideAt ? SIDE_ROW_GAP + asideAt(w) : 0);
  const floor = Math.min(m.width, MIN_GRID_PX);

  const band = m.controlsHeightAt(m.width) + STACK_GAP + asideBelow(m.width);
  const out: Candidate[] = [
    {
      arrangement: "stack",
      folded,
      gridSize: Math.min(m.width, m.height - band),
      column: 0,
      fits: true,
      heightAtFloor: band + floor,
    },
  ];

  const column = sideColumn(m.width, m.rem);
  const room = m.width - column - SIDE_COLUMN_GAP;
  const columnHeight = m.controlsHeightAt(column) + asideBeside(column);
  if (room >= MIN_GRID_PX) {
    out.push({
      arrangement: "side",
      folded,
      gridSize: Math.min(m.height, room),
      column,
      fits: columnHeight <= m.height,
      heightAtFloor: Math.max(floor, columnHeight),
    });
  }
  return out;
}

function largest(fits: Candidate[]): Candidate | null {
  const fitting = fits.filter((f) => f.fits);
  return fitting.length
    ? fitting.reduce((a, b) => (b.gridSize > a.gridSize ? b : a))
    : null;
}

function result(c: Candidate, gridSize: number): PickerFit {
  const { arrangement, folded, column } = c;
  return { arrangement, folded, gridSize: Math.floor(gridSize), column };
}

export function fitPicker(m: PickerMeasure): PickerFit {
  const canFold = Boolean(m.asideHeightAt && m.foldedHeightAt);
  const unfolded = candidates(m, false);
  const all = canFold ? [...unfolded, ...candidates(m, true)] : unfolded;

  let best = largest(unfolded);
  if (canFold && (!best || best.gridSize < COMFORT_GRID_REM * m.rem)) {
    const folded = largest(all.filter((c) => c.folded));
    if (folded && (!best || folded.gridSize > best.gridSize)) best = folded;
  }
  if (best && best.gridSize >= Math.min(m.width, MIN_GRID_PX)) {
    return result(best, Math.min(m.width, best.gridSize));
  }

  // Too small for the grid at the floor in any arrangement.
  const least = all.reduce((a, b) =>
    b.heightAtFloor < a.heightAtFloor ? b : a
  );
  return result(least, Math.min(m.width, MIN_GRID_PX));
}
