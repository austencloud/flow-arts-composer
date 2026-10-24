// Decides how /codex lays itself out from the window alone. Pure, so the
// mode and the numbers behind it are pinned by codex-fit.test.ts.

export type CodexLayoutMode = "full-board" | "drill-down";

/** Austen's floor: a board cell under this is unreadable, so the page drills
 *  down instead. */
export const MIN_FULL_BOARD_CELL = 80;
/** Type 1's A-L row, the widest the board gets. */
export const BOARD_COLUMNS = 12;
/** A-L, M-V, Type 2, Type 3, Types 4-6 (BoardAtlas). */
export const BOARD_ROWS = 5;
/** The board's gutters across: section padding and frames (BoardAtlas). */
export const BOARD_WIDTH_CHROME_REM = 5;
/** Everything in a band that is not a cell, over all five rows, measured
 *  (BoardAtlas's --atlas-band-chrome). */
export const BAND_CHROME_REM = 21;
/** The page column in full-board mode. */
export const FULL_BOARD_COLUMN_PX = 1600;
export const WIDE_COLUMN_PX = 2400; // from 2000 wide
export const ULTRA_COLUMN_VW = 0.88; // from 3000 wide, capped at 3400
/** Page side padding, clamp(20px, 3vw, 56px), at its cap. */
export const PAGE_PADDING_PX = 56;
/** The controls rail beside the board, and the gap to it. */
export const RAIL_REM = 15;
export const RAIL_GAP_REM = 1;
/** TopicHeader plus the page's vertical padding in full-board mode, where the
 *  header is capped to this budget (page CSS). */
export const FULL_BOARD_CHROME_REM = 10;

export interface CodexFitInput {
  viewportWidth: number;
  viewportHeight: number;
  /** --marketing-header-h, measured. */
  siteHeaderHeight: number;
  remPx: number;
}

export function columnWidth(viewportWidth: number): number {
  if (viewportWidth >= 3000) return Math.min(viewportWidth * ULTRA_COLUMN_VW, 3400);
  if (viewportWidth >= 2000) return Math.min(viewportWidth, WIDE_COLUMN_PX);
  return Math.min(viewportWidth, FULL_BOARD_COLUMN_PX);
}

/** The cell the full board would get: twelve across the width left beside
 *  the rail, or five rows down the height left under the header, whichever
 *  binds first. */
export function fullBoardCell(input: CodexFitInput): number {
  const rem = input.remPx;
  const boardWidth =
    columnWidth(input.viewportWidth) -
    2 * PAGE_PADDING_PX -
    (RAIL_REM + RAIL_GAP_REM) * rem;
  const boardHeight =
    input.viewportHeight - input.siteHeaderHeight - FULL_BOARD_CHROME_REM * rem;
  const byWidth = (boardWidth - BOARD_WIDTH_CHROME_REM * rem) / BOARD_COLUMNS;
  const byHeight = (boardHeight - BAND_CHROME_REM * rem) / BOARD_ROWS;
  return Math.floor(Math.min(byWidth, byHeight));
}

export function codexLayoutMode(input: CodexFitInput): CodexLayoutMode {
  return fullBoardCell(input) >= MIN_FULL_BOARD_CELL ? "full-board" : "drill-down";
}

/** The six type tiles: two by three or three by two, whichever gives each
 *  tile the larger short side in the area. */
export function typeTileGrid(
  width: number,
  height: number,
  gap: number
): { columns: 2 | 3; rows: 3 | 2 } {
  const shortSide = (columns: number, rows: number) =>
    Math.min(
      (width - (columns - 1) * gap) / columns,
      (height - (rows - 1) * gap) / rows
    );
  return shortSide(3, 2) > shortSide(2, 3)
    ? { columns: 3, rows: 2 }
    : { columns: 2, rows: 3 };
}

/**
 * The Type screen's letters: the column count whose square cells come out
 * largest in the content area, each with its transition caption above it.
 * Unlike the variations (variation-columns.ts), a type's letters may end on
 * a short row: Type 1 holds 22, which splits evenly only as 2, 11 or 22
 * across, all far smaller than five rows of five.
 */
export function typeCellGrid(
  count: number,
  width: number,
  height: number,
  gap: number,
  caption: number,
  maxCell = Infinity
): { columns: number; rows: number; cell: number } | null {
  if (count <= 0 || width <= 0 || height <= 0) return null;
  let best = { columns: 1, rows: count, cell: -Infinity };
  for (let columns = 1; columns <= count; columns++) {
    const rows = Math.ceil(count / columns);
    const cell = Math.min(
      maxCell,
      (width - (columns - 1) * gap) / columns,
      (height - (rows - 1) * gap) / rows - caption
    );
    if (cell > best.cell) best = { columns, rows, cell };
  }
  return best.cell > 0 ? { ...best, cell: Math.floor(best.cell) } : null;
}
