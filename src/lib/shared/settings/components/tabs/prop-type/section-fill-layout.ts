/**
 * Tile sizing for the sectioned prop picker in a bounded host (PropGrid's
 * `fill`). The catalogue fills its card instead of huddling at the top of
 * it: every section shares one tile size, each balanced within one column
 * cap, and the cap chosen is the one that makes the largest tile once all
 * the rows share the height.
 */

/* A tile never grows past this: a wall-sized pane gets a composed block with
   margins rather than tiles the size of playing cards. */
export const FILL_MAX_TILE = 288;

/* Match the section CSS in PropGrid: .section-buttons gap and side padding,
   the .grid-content gap, and the tile's height over its width. */
const TILE_GAP = 10;
const INLINE_PAD = 4;
const STACK_GAP = 8;
const TILE_ASPECT = 1.05;
/* Rounding slack, so the grid never overflows by a pixel and summons the
   scrollbar that would then narrow it. */
const SLACK = 4;
/* Below this the ordinary tiered grid and its scrollbar read better. */
const MIN_TILE = 88;

/** Columns for `count` tiles under a cap of `max`, less any that would only
 *  leave a short last row: ten at a cap of eight sit five and five. */
export function balancedCount(count: number, max: number): number {
  const rows = Math.ceil(count / max);
  return Math.max(1, Math.ceil(count / rows));
}

/** The short last row of `count` tiles in `cols` columns, on a doubled
 *  track grid (two tracks per tile): its first tile's index and the track
 *  it starts on to sit centred under the full rows. Null when no row is
 *  short. */
export function centeredOrphan(
  count: number,
  cols: number
): { index: number; start: number } | null {
  const orphans = count % cols;
  if (orphans === 0) return null;
  return { index: count - orphans, start: cols - orphans + 1 };
}

export interface SectionFillBox {
  /** Tiles in each section, in order. */
  counts: readonly number[];
  /** The grid's content width. */
  width: number;
  /** The bounded height the grid may fill. */
  height: number;
  /** The section labels' combined height, which no tile size changes. */
  labels: number;
}

/** The rows and height a layout takes, for callers that check the fit. */
export function sectionFillExtent(
  counts: readonly number[],
  cols: number,
  tile: number,
  labels: number
): { width: number; height: number } {
  const rows = counts.map((n) => Math.ceil(n / cols));
  const totalRows = rows.reduce((sum, r) => sum + r, 0);
  const widest = Math.max(...counts.map((n) => balancedCount(n, cols)));
  return {
    width: widest * tile + TILE_GAP * (widest - 1) + INLINE_PAD,
    height:
      labels +
      STACK_GAP * (counts.length * 2 - 1) +
      totalRows * tile * TILE_ASPECT +
      TILE_GAP * (totalRows - counts.length),
  };
}

/**
 * The column cap and tile size that fill the box, or null when the box is
 * unmeasured or too small for readable tiles (the tiered grid stands).
 */
export function sectionFillLayout(
  box: SectionFillBox
): { cols: number; tile: number } | null {
  const { counts, width, height, labels } = box;
  if (counts.length === 0 || width <= 0 || height <= 0) return null;
  const tileHeight =
    height - labels - STACK_GAP * (counts.length * 2 - 1) - SLACK;
  let best: { cols: number; size: number } | null = null;
  for (let cols = 1; cols <= Math.min(Math.max(...counts), 12); cols += 1) {
    const rows = counts.map((n) => Math.ceil(n / cols));
    const totalRows = rows.reduce((sum, r) => sum + r, 0);
    const widest = Math.max(...counts.map((n) => balancedCount(n, cols)));
    const byWidth = (width - INLINE_PAD - TILE_GAP * (widest - 1)) / widest;
    const byHeight =
      (tileHeight - TILE_GAP * (totalRows - counts.length)) /
      totalRows /
      TILE_ASPECT;
    const size = Math.min(byWidth, byHeight, FILL_MAX_TILE);
    if (best === null || size > best.size + 0.5) best = { cols, size };
  }
  if (best === null || best.size < MIN_TILE) return null;
  return { cols: best.cols, tile: Math.floor(best.size) };
}
