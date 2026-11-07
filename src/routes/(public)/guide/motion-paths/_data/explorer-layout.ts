/**
 * How the motion path explorer composes to the room its guide screen gives it
 * (2026-11-06: no screen pans). The explorer holds a canvas, four path tiles
 * and "what plays" (the turn pickers, the chips, the matrix). The room decides
 * how many of those share a screen:
 *
 *   quad   tiles and canvas over the controls and the matrix
 *   trio   tiles, canvas, what-plays side by side: wide but not tall
 *   split  tiles beside the canvas, what-plays one tap away
 *   stack  a phone: the canvas with its tiles, what-plays one tap away
 *
 * The canvas is the page's subject, so each choice below takes whichever
 * arrangement leaves it the larger square.
 */

export type ExplorerMode = "quad" | "trio" | "split" | "stack";

export interface ExplorerLayout {
  mode: ExplorerMode;
  /** Tiles to a row. */
  tileColumns: 1 | 2 | 4;
  /** Stack only: the tiles stand in a column beside the canvas. */
  tilesBeside: boolean;
  /** Trio and split: the canvas column's width in px; 0 when it does not
      apply. */
  canvasColumn: number;
  /** Stack with tiles beside: the tile column's width in px; else 0. */
  tileColumn: number;
  /** A studio section opens beside the canvas rather than under it. */
  studioSide: boolean;
}

/** Height under the canvas: its transport and its pills. */
export const CANVAS_DOCK = 104;
/** Height of the row under the tiles: Trace and "Change what plays". */
export const LESSON_ROW = 44;
/** Height of the one-line caption over the tiles. */
export const TILE_HEADER = 24;
/** A preview tile: its square preview plus label and padding. */
export const TILE_EXTRA_HEIGHT = 24;
/** The transport's controls and the pills need this much width. */
export const MIN_CANVAS_COLUMN = 320;
/** Narrowest tile column that stands beside the canvas on a phone: its
    label still fits. A wider window gives it whatever the canvas leaves. */
export const BESIDE_TILE_COLUMN = 72;
const GAP = 8;
const COLUMN_GAP = 24;

const QUAD_MIN_WIDTH = 900;
const QUAD_MIN_ROOM = 560;
// A tablet held upright: narrower than the quad's usual width, but tall
// enough that the matrix still gets a real square under the canvas.
const TALL_QUAD_MIN_WIDTH = 640;
const TALL_QUAD_MIN_ROOM = 720;
/** The quad's top row against its bottom row (1). */
const QUAD_TOP_SHARE = 1.2;
const TRIO_MIN_WIDTH = 900;
const TRIO_MIN_ROOM = 420;
const SPLIT_MIN_WIDTH = 640;
const STUDIO_SIDE_MIN_WIDTH = 480;

/** The side of a tile with `columns` tiles to a row in a box this size. */
export function tileSide(
  width: number,
  height: number,
  columns: number
): number {
  const rows = Math.ceil(4 / columns);
  const byWidth = (width - GAP * (columns - 1)) / columns;
  const byHeight = (height - GAP * (rows - 1)) / rows - TILE_EXTRA_HEIGHT;
  return Math.min(byWidth, byHeight);
}

function bestColumns(width: number, height: number): 2 | 4 {
  return tileSide(width, height, 4) > tileSide(width, height, 2) ? 4 : 2;
}

export function explorerLayout(width: number, room: number): ExplorerLayout {
  const studioSide = width >= STUDIO_SIDE_MIN_WIDTH && width > room * 1.1;
  const tileRoom = room - TILE_HEADER - LESSON_ROW - GAP * 2;

  if (
    (width >= QUAD_MIN_WIDTH && room >= QUAD_MIN_ROOM) ||
    (width >= TALL_QUAD_MIN_WIDTH && room >= TALL_QUAD_MIN_ROOM)
  ) {
    // The tiles share the top row's left half with the row under them.
    const quadTileRoom = (room - GAP) * (QUAD_TOP_SHARE / (QUAD_TOP_SHARE + 1));
    return {
      mode: "quad",
      tileColumns: bestColumns(
        (width - COLUMN_GAP) / 2,
        quadTileRoom - TILE_HEADER - LESSON_ROW - GAP * 2
      ),
      tilesBeside: false,
      canvasColumn: 0,
      tileColumn: 0,
      studioSide,
    };
  }

  const tallestCanvas = room - CANVAS_DOCK;

  if (width >= TRIO_MIN_WIDTH && room >= TRIO_MIN_ROOM) {
    const canvasColumn = Math.round(
      Math.max(MIN_CANVAS_COLUMN, Math.min(tallestCanvas, width * 0.4))
    );
    // The grid gives the tiles 0.7 of the 2.2 shares left beside the canvas.
    const side = ((width - canvasColumn - COLUMN_GAP * 2) * 0.7) / 2.2;
    return {
      mode: "trio",
      tileColumns: bestColumns(side, tileRoom),
      tilesBeside: false,
      canvasColumn,
      tileColumn: 0,
      studioSide,
    };
  }

  if (width >= SPLIT_MIN_WIDTH) {
    const canvasColumn = Math.round(
      Math.max(MIN_CANVAS_COLUMN, Math.min(tallestCanvas, width * 0.6))
    );
    return {
      mode: "split",
      tileColumns: bestColumns(width - canvasColumn - COLUMN_GAP, tileRoom),
      tilesBeside: false,
      canvasColumn,
      tileColumn: 0,
      studioSide,
    };
  }

  // A phone: tiles beside the canvas, or a row of four under it, whichever
  // leaves the canvas larger.
  const stackRoom = room - CANVAS_DOCK - LESSON_ROW;
  const besideCanvas = Math.min(
    width - BESIDE_TILE_COLUMN - GAP,
    stackRoom - GAP * 2
  );
  const underTile = (width - GAP * 3) / 4;
  const underCanvas = Math.min(
    width,
    stackRoom - TILE_HEADER - underTile - TILE_EXTRA_HEIGHT - GAP * 3
  );
  const tilesBeside = besideCanvas > underCanvas;
  return {
    mode: "stack",
    tileColumns: tilesBeside ? 1 : 4,
    tilesBeside,
    canvasColumn: 0,
    tileColumn: tilesBeside
      ? Math.max(
          BESIDE_TILE_COLUMN,
          Math.min(
            width - besideCanvas - GAP,
            tileSide(
              Number.POSITIVE_INFINITY,
              room - LESSON_ROW - GAP,
              1
            )
          )
        )
      : 0,
    studioSide,
  };
}
