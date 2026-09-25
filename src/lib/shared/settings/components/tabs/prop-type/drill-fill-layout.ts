/**
 * Tile grid for a drilled family in a bounded host (PropGrid's `fill`). The
 * column count is the one whose tiles show the largest art once the rows
 * share the height, so a family's few styles own the view in a wide pane
 * and in a tall narrow one (one hand in Cat Dog) alike, rather than sitting
 * in a strip across the middle of it.
 */
import { centeredOrphan } from "./section-fill-layout";

/* Match the .drill-tiles.fill gap in PropGrid. */
const TILE_GAP = 10;
/* Rows stop growing at this multiple of the column width, so two styles in
   a wide pane are generous cards rather than towers. */
const MAX_ROW_ASPECT = 1.25;
/* PropSelectionButton: its side padding, the height its padding, art gap
   and label take, and the share of what is left that the art may fill. */
const TILE_INLINE_PAD = 16;
const TILE_CHROME = 44;
const ART_OF_WIDTH = 0.82;
const ART_OF_HEIGHT = 0.8;
const MAX_COLS = 6;

export interface DrillFillLayout {
  cols: number;
  rowHeight: number;
  /** First tile of a short last row, or -1 when every row is full. */
  orphanIndex: number;
  /** The doubled track that short row starts on to sit centred. */
  orphanStart: number;
}

export function drillFillLayout(
  count: number,
  width: number,
  height: number
): DrillFillLayout | null {
  if (count === 0 || width <= 0 || height <= 0) return null;
  let best: { cols: number; rowHeight: number; art: number } | null = null;
  for (let cols = 1; cols <= Math.min(count, MAX_COLS); cols += 1) {
    const rows = Math.ceil(count / cols);
    const colWidth = (width - TILE_GAP * (cols - 1)) / cols;
    const rowHeight = Math.min(
      (height - TILE_GAP * (rows - 1)) / rows,
      colWidth * MAX_ROW_ASPECT
    );
    const art = Math.min(
      (colWidth - TILE_INLINE_PAD) * ART_OF_WIDTH,
      (rowHeight - TILE_CHROME) * ART_OF_HEIGHT
    );
    if (best === null || art > best.art + 0.5) {
      best = { cols, rowHeight, art };
    }
  }
  if (best === null) return null;
  const orphan = centeredOrphan(count, best.cols);
  return {
    cols: best.cols,
    rowHeight: Math.floor(best.rowHeight),
    orphanIndex: orphan?.index ?? -1,
    orphanStart: orphan?.start ?? 1,
  };
}
