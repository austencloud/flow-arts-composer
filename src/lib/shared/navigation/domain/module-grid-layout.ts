/**
 * Module Grid Layout
 *
 * Column count and last-row placement for the module navigation grid. The
 * tile count depends on who is signed in (3 for a guest, 13 or more for an
 * admin), so a fixed column count leaves orphan rows: 13 tiles at 4 columns
 * land as 4+4+4+1. This takes the fewest rows the width allows, then the
 * fewest columns that still hold every tile in those rows, so only the last
 * row can be short. The grid runs on half-column tracks (each tile spans
 * two), which lets a short last row sit exactly centered.
 */

/** Narrowest tile the grid lays out; decides how many columns fit. */
export const MODULE_TILE_MIN_WIDTH = 96;

/** Row and column gap between tiles, in CSS pixels. */
export const MODULE_GRID_GAP = 10;

/** Widest row the navigation sheet shows, even when more would fit. */
export const MODULE_GRID_MAX_COLUMNS = 5;

export interface ModuleGridLayout {
  /** Tiles in each full row. */
  columns: number;
  rows: number;
  /** Index of the first tile in the last row. */
  lastRowStart: number;
  /** Half-column tracks left empty before the last row; 0 when it is full. */
  lastRowIndent: number;
}

export function getModuleGridMaxColumns(width: number): number {
  const fit = Math.floor(
    (width + MODULE_GRID_GAP) / (MODULE_TILE_MIN_WIDTH + MODULE_GRID_GAP)
  );
  return Math.min(MODULE_GRID_MAX_COLUMNS, Math.max(1, fit));
}

export function getModuleGridLayout(
  count: number,
  width: number
): ModuleGridLayout {
  if (count <= 0) {
    return { columns: 1, rows: 0, lastRowStart: 0, lastRowIndent: 0 };
  }
  const rows = Math.ceil(count / getModuleGridMaxColumns(width));
  const columns = Math.ceil(count / rows);
  const lastRowStart = (rows - 1) * columns;
  return {
    columns,
    rows,
    lastRowStart,
    lastRowIndent: columns - (count - lastRowStart),
  };
}
