/**
 * Fits the Explore > Visuals wall to the screen it sits on, so the page never
 * scrolls. Every arrangement of the shelves is tried (side by side, or stacked,
 * at every column count) and the one that shows the artwork largest wins.
 * When even the best arrangement leaves the artwork too small to judge, the
 * caller drills down instead: one door per shelf, each opening its own screen.
 */

export interface WallMetrics {
  /** Content box the wall may fill. */
  readonly width: number;
  readonly height: number;
  /** Card size around the square artwork: padding, border, title lines. */
  readonly chromeX: number;
  readonly chromeY: number;
  /** A shelf's heading plus the gap beneath it. */
  readonly headHeight: number;
  /** Gap between cards in one shelf. */
  readonly wallGap: number;
  /** Gap between shelves. */
  readonly shelfGap: number;
}

export interface WallFit {
  readonly direction: "row" | "column";
  /** Column count per shelf, in shelf order. */
  readonly columns: readonly number[];
  /** Side of the square artwork, in px. */
  readonly plinth: number;
}

function sideBySide(
  shelves: readonly number[],
  metrics: WallMetrics,
  rows: number
): WallFit {
  const { width, height, chromeX, chromeY, headHeight, wallGap, shelfGap } =
    metrics;
  const columns = shelves.map((count) => Math.ceil(count / rows));
  const usedRows = Math.max(
    ...shelves.map((count, i) => Math.ceil(count / columns[i]!))
  );
  const totalColumns = columns.reduce((sum, cols) => sum + cols, 0);
  const innerGaps = columns.reduce((sum, cols) => sum + (cols - 1), 0);
  const byWidth =
    (width - (shelves.length - 1) * shelfGap - innerGaps * wallGap) /
      totalColumns -
    chromeX;
  const byHeight =
    (height - headHeight - (usedRows - 1) * wallGap) / usedRows - chromeY;
  return { direction: "row", columns, plinth: Math.min(byWidth, byHeight) };
}

function stacked(
  shelves: readonly number[],
  metrics: WallMetrics,
  maxColumns: number
): WallFit {
  const { width, height, chromeX, chromeY, headHeight, wallGap, shelfGap } =
    metrics;
  const columns = shelves.map((count) => Math.min(maxColumns, count));
  const widest = Math.max(...columns);
  const rows = shelves.map((count, i) => Math.ceil(count / columns[i]!));
  const totalRows = rows.reduce((sum, r) => sum + r, 0);
  const innerGaps = rows.reduce((sum, r) => sum + (r - 1), 0);
  const byWidth = (width - (widest - 1) * wallGap) / widest - chromeX;
  const byHeight =
    (height -
      shelves.length * headHeight -
      (shelves.length - 1) * shelfGap -
      innerGaps * wallGap) /
      totalRows -
    chromeY;
  return {
    direction: "column",
    columns,
    plinth: Math.min(byWidth, byHeight),
  };
}

/** The arrangement that shows the artwork largest. Ties go to side by side. */
export function fitVisualsWall(
  shelves: readonly number[],
  metrics: WallMetrics
): WallFit {
  const counts = shelves.filter((count) => count > 0);
  if (counts.length === 0) return { direction: "row", columns: [], plinth: 0 };
  const most = Math.max(...counts);
  let best = sideBySide(counts, metrics, 1);
  for (let n = 1; n <= most; n++) {
    for (const candidate of [
      sideBySide(counts, metrics, n),
      stacked(counts, metrics, n),
    ]) {
      if (candidate.plinth > best.plinth) best = candidate;
    }
  }
  return { ...best, plinth: Math.max(0, Math.floor(best.plinth)) };
}

/** Columns for one shelf too full to fit whole: it pans inside its own area,
 *  each piece at least `minPlinth` wide. */
export function panColumns(
  metrics: WallMetrics,
  minPlinth: number
): { columns: number; plinth: number } {
  const { width, chromeX, wallGap } = metrics;
  const columns = Math.max(
    1,
    Math.floor((width + wallGap) / (minPlinth + chromeX + wallGap))
  );
  const plinth = Math.floor(
    (width - (columns - 1) * wallGap) / columns - chromeX
  );
  return { columns, plinth: Math.max(0, plinth) };
}
