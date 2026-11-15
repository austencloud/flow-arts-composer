// How the placement picker arranges itself in the box it is given, when its
// host asks it to fit (layout "split"). The grid is the point of the screen,
// so every choice here is about drawing its cells as large as the box allows:
//
// - stack: quick choices and status above a 4 x 4 grid, the aside below it.
// - side: a 4 x 4 grid on the left, a column of choices, status and aside
//   beside it, for a box wider than it is tall.
// - wide: eight across and two down, the full width, under one row of choices,
//   status and the folded aside, for a box much wider than it is tall. The
//   sixteen run four alpha, four beta, eight gamma, so the top row reads alpha
//   then beta and the gammas fill the bottom row; no ragged rows that would
//   split a family.
//
// The aside stays in view when that costs the cells little: within
// KEEP_ASIDE_SHARE of the cell it would allow folded. Otherwise, when the host
// gave a folded form (a row that opens the aside as a screen of its own), the
// aside folds. The wide arrangement only exists folded.
//
// A host may keep a corner at the box's top end for a control of its own
// (`reserve`): the side column starts below it and is at least as wide, the
// wide row of choices stops short of it, and a stack starts below it.
//
// Below the touch floor the largest grid that still fits the box both ways
// wins, so nothing scrolls. Only when even the choices do not fit does the
// grid hold the box's height in the arrangement that overflows least, and the
// host's scroller takes the rest.

export type PickerArrangement = "stack" | "side" | "wide";

export interface PickerReserve {
  /** From the reserved control's leading edge to the box's end edge, px. */
  width: number;
  /** From the box's top to the reserved control's bottom plus its gap, px. */
  height: number;
}

export interface PickerMeasure {
  width: number;
  height: number;
  rem: number;
  /** Quick choices and status, at a given width (chips wrap). */
  controlsHeightAt: (width: number) => number;
  /** The same laid out as one row (it wraps when it must). Absent: no wide
   *  arrangement. */
  controlsRowHeightAt?: (width: number) => number;
  /** The aside as written, at a given width. Absent when there is none. */
  asideHeightAt?: (width: number) => number;
  /** The aside folded to a row. Absent when the host gave no folded form. */
  foldedHeightAt?: (width: number) => number;
  /** A corner at the top end kept for the host's own control. */
  reserve?: PickerReserve;
}

export interface PickerFit {
  arrangement: PickerArrangement;
  folded: boolean;
  /** Grid columns: 4, or 8 in the wide arrangement. */
  columns: 4 | 8;
  /** Edge of one cell, in px. */
  cell: number;
  /** Width of the grid, in px. */
  gridSize: number;
  /** Width of the side column, in px; 0 unless side by side. */
  column: number;
  /** Wide only: height of the row above the grid, in px. */
  band: number;
  /** Wide only: width of the folded aside in that row, in px. */
  fold: number;
}

/** The aside stays in view while the cells keep this share of their folded size. */
export const KEEP_ASIDE_SHARE = 0.85;

/** A cell at the touch target. */
export const MIN_CELL_PX = 48;
const CELL_GAP = 8;
const GRID_PAD = 4;

/** Four 48px touch targets, three 8px gaps, 4px of padding a side. */
export const MIN_GRID_PX = 4 * MIN_CELL_PX + 3 * CELL_GAP + 2 * GRID_PAD;

const STACK_GAP = 12;
const SIDE_COLUMN_GAP = 24;
const SIDE_ROW_GAP = 16;
const WIDE_ROW_GAP = 8;
/** Room stack and side keep above and below themselves (focus rings, air);
 *  the wide arrangement spends it on the grid, which is short there. */
export const BLOCK_EDGE = 16;

function sideColumn(width: number, rem: number): number {
  return Math.min(24 * rem, Math.max(16 * rem, width * 0.36));
}

function foldWidth(width: number, rem: number): number {
  return Math.min(20 * rem, width * 0.45);
}

function gridExtent(cells: number, cell: number): number {
  return cells * cell + (cells - 1) * CELL_GAP + 2 * GRID_PAD;
}

/** The largest cell for a grid of `columns` in a width x height box. */
function cellIn(columns: 4 | 8, width: number, height: number): number {
  const rows = 16 / columns;
  const across = (width - (columns - 1) * CELL_GAP - 2 * GRID_PAD) / columns;
  const down = (height - (rows - 1) * CELL_GAP - 2 * GRID_PAD) / rows;
  return Math.min(across, down);
}

interface Candidate extends PickerFit {
  /** The choices and aside fit the box beside or around the grid. */
  fits: boolean;
  /** Height the arrangement takes with its grid at the touch floor. */
  heightAtFloor: number;
  /** Height left for the grid itself. */
  gridRoom: number;
}

function candidates(m: PickerMeasure, folded: boolean): Candidate[] {
  const asideAt = folded ? m.foldedHeightAt : m.asideHeightAt;
  const asideBelow = (w: number) => (asideAt ? STACK_GAP + asideAt(w) : 0);
  const asideBeside = (w: number) => (asideAt ? SIDE_ROW_GAP + asideAt(w) : 0);
  const inset = m.reserve?.height ?? 0;
  const base = { folded, band: 0, fold: 0, column: 0 };
  const out: Candidate[] = [];

  const band = m.controlsHeightAt(m.width) + STACK_GAP + asideBelow(m.width);
  const stackRoom = m.height - BLOCK_EDGE - inset - band;
  const stackCell = cellIn(4, m.width, stackRoom);
  out.push({
    ...base,
    arrangement: "stack",
    columns: 4,
    cell: stackCell,
    gridSize: gridExtent(4, stackCell),
    fits: stackRoom > 0,
    heightAtFloor: BLOCK_EDGE + inset + band + MIN_GRID_PX,
    gridRoom: stackRoom,
  });

  const column = Math.max(sideColumn(m.width, m.rem), m.reserve?.width ?? 0);
  const room = m.width - column - SIDE_COLUMN_GAP;
  const columnHeight =
    inset + m.controlsHeightAt(column) + asideBeside(column);
  if (room >= MIN_GRID_PX) {
    const sideCell = cellIn(4, room, m.height - BLOCK_EDGE);
    out.push({
      ...base,
      arrangement: "side",
      columns: 4,
      column,
      cell: sideCell,
      gridSize: gridExtent(4, sideCell),
      fits: columnHeight + BLOCK_EDGE <= m.height,
      heightAtFloor: BLOCK_EDGE + Math.max(MIN_GRID_PX, columnHeight),
      gridRoom: m.height - BLOCK_EDGE,
    });
  }

  // Wide only folded, or with no aside at all.
  if (m.controlsRowHeightAt && (folded || !m.asideHeightAt)) {
    const rowWidth =
      m.width - (m.reserve ? m.reserve.width + WIDE_ROW_GAP : 0);
    const fold = asideAt ? foldWidth(rowWidth, m.rem) : 0;
    const controlsWidth = rowWidth - (fold ? fold + WIDE_ROW_GAP : 0);
    const rowHeight = Math.max(
      m.controlsRowHeightAt(controlsWidth),
      asideAt && fold ? asideAt(fold) : 0
    );
    const bandHeight = Math.max(rowHeight, inset - WIDE_ROW_GAP);
    const wideRoom = m.height - bandHeight - WIDE_ROW_GAP;
    const wideCell = cellIn(8, m.width, wideRoom);
    out.push({
      ...base,
      arrangement: "wide",
      columns: 8,
      cell: wideCell,
      gridSize: gridExtent(8, wideCell),
      band: Math.ceil(bandHeight),
      fold: Math.floor(fold),
      fits: controlsWidth > 0 && wideRoom > 0,
      heightAtFloor: bandHeight + WIDE_ROW_GAP + gridExtent(2, MIN_CELL_PX),
      gridRoom: wideRoom,
    });
  }
  return out;
}

function largest(fits: Candidate[]): Candidate | null {
  const fitting = fits.filter((f) => f.fits);
  return fitting.length
    ? fitting.reduce((a, b) => (b.cell > a.cell ? b : a))
    : null;
}

function result(c: Candidate, cell: number): PickerFit {
  const { arrangement, folded, columns, column, band, fold } = c;
  const whole = Math.max(0, Math.floor(cell));
  return {
    arrangement,
    folded,
    columns,
    cell: whole,
    gridSize: gridExtent(columns, whole),
    column,
    band,
    fold,
  };
}

export function fitPicker(m: PickerMeasure): PickerFit {
  const canFold = Boolean(m.asideHeightAt && m.foldedHeightAt);
  const unfolded = candidates(m, false);
  const all = canFold ? [...unfolded, ...candidates(m, true)] : unfolded;

  let best = largest(unfolded);
  if (canFold) {
    const folded = largest(all.filter((c) => c.folded));
    if (folded && (!best || best.cell < KEEP_ASIDE_SHARE * folded.cell)) {
      best = folded;
    }
  }
  if (best && best.cell >= MIN_CELL_PX) return result(best, best.cell);

  // Nothing reaches the touch floor: the largest grid that still fits the box
  // both ways, so nothing scrolls.
  const fitting = largest(all);
  if (fitting && fitting.cell > 0) return result(fitting, fitting.cell);

  // Not even the choices fit. The arrangement that overflows least, its grid
  // no taller than the box, and the host's scroller takes the rest.
  const least = all.reduce((a, b) =>
    b.heightAtFloor < a.heightAtFloor ? b : a
  );
  return result(
    least,
    Math.min(MIN_CELL_PX, cellIn(least.columns, m.width, m.height))
  );
}
