/**
 * How the Customize overview arranges itself in the box it is given.
 *
 * The overview has to fit its panel without scrolling, from a phone held
 * upright to a 4K window, and the panel's shape varies more than its size: a
 * desktop stage is wide and short, a phone screen narrow and tall, a bottom
 * sheet in between. So rather than breakpoints, every arrangement that shows
 * the placement previews is tried against the measured box and the one that
 * draws them largest wins. When none can draw them at a readable size, the
 * placement tiles drop their previews and become rows that open their
 * pickers; when even the Style controls do not fit above those rows, Style
 * becomes a row too, and the panel is a plain drill-down list.
 *
 * - top: Style across the top, Start and End side by side under it.
 * - stack: Style on top, Start under it, End under that.
 * - side: Style in a column on the left, Start and End side by side to its
 *   right.
 * - style-rows: Style controls on top, Start and End as rows.
 * - rows: Style, Start and End all as rows.
 */
export type OverviewLayout = "top" | "stack" | "side" | "style-rows" | "rows";

export interface OverviewMeasure {
  /** The overview's box, in px. */
  width: number;
  height: number;
  /** Root font size, in px. */
  rem: number;
  /** The persistence note under the tiles, in px. */
  noteHeight: number;
  /** A tile's head row (name, value, chevron), in px. */
  headHeight: number;
  /** The Style tile's height when laid out at a given width, in px. */
  styleHeightAt: (width: number) => number;
}

export interface OverviewFit {
  layout: OverviewLayout;
  /** Side of each placement preview square, in px; 0 for the row layouts. */
  gridSize: number;
  /** Width of the Style column in the side layout, in px. */
  styleColumn: number;
}

/** Below this a preview's sixteen cells are smudges: about 2.25rem each. */
export const MIN_GRID_REM = 9;

// Mirrors the overview's CSS: tile padding 0.875rem a side plus a 1px
// border, 0.75rem between a tile's head and its preview, 0.75rem between
// tiles (1rem in the two-column layouts) and above the note.
const TILE_PAD_REM = 0.875;
const TILE_BORDER_PX = 1;
const HEAD_GAP_REM = 0.75;
const STACK_GAP_REM = 0.75;
const COLUMN_GAP_REM = 1;
const STYLE_COLUMN_MIN_REM = 16;
const STYLE_COLUMN_SHARE = 0.34;

export function fitOverview(m: OverviewMeasure): OverviewFit {
  const { width, height, rem } = m;
  const padX = 2 * (TILE_PAD_REM * rem + TILE_BORDER_PX);
  const row = m.headHeight + padX;
  const chrome = row + HEAD_GAP_REM * rem;
  const avail = height - m.noteHeight - STACK_GAP_REM * rem;
  const colGap = COLUMN_GAP_REM * rem;
  const stackGap = STACK_GAP_REM * rem;

  const styleFull = m.styleHeightAt(width);
  const candidates: { layout: OverviewLayout; size: number }[] = [
    {
      layout: "top",
      size: Math.min(
        (width - colGap) / 2 - padX,
        avail - styleFull - colGap - chrome
      ),
    },
    {
      layout: "stack",
      size: Math.min(
        width - padX,
        (avail - styleFull - 2 * stackGap - 2 * chrome) / 2
      ),
    },
  ];

  const styleColumn = Math.max(
    STYLE_COLUMN_MIN_REM * rem,
    width * STYLE_COLUMN_SHARE
  );
  if (m.styleHeightAt(styleColumn) <= avail) {
    candidates.push({
      layout: "side",
      size: Math.min(
        (width - styleColumn - 2 * colGap) / 2 - padX,
        avail - chrome
      ),
    });
  }

  const best = candidates.reduce((a, b) => (b.size > a.size ? b : a));
  if (best.size >= MIN_GRID_REM * rem) {
    return {
      layout: best.layout,
      gridSize: Math.floor(best.size),
      styleColumn: Math.floor(styleColumn),
    };
  }

  const rows = 2 * row + 2 * stackGap;
  return {
    layout: styleFull + rows <= avail ? "style-rows" : "rows",
    gridSize: 0,
    styleColumn: 0,
  };
}
