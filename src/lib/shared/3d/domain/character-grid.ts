// How the character picker divides the room its host gives it.

export interface CharacterGrid {
  columns: number;
  rows: number;
  /**
   * True when the rows share the host's height, so every character is on
   * screen at once. False when the host is too short for that (a very short
   * window) or has no height yet: the tiles then keep their own shape and the
   * host scrolls.
   */
  fills: boolean;
}

/** A portrait tile is three wide to four tall; the closer a grid gets, the better. */
const TILE_SHAPE = 3 / 4;
/** Narrower than this and a name no longer fits under its portrait. */
const MIN_TILE_WIDTH = 76;
/** Shorter than this and the name covers the face. */
const MIN_TILE_HEIGHT = 72;
/** How much an empty cell in the last row counts against a grid. */
const EMPTY_CELL_WEIGHT = 0.6;
/** Tile width a grid that keeps its own shape aims for. */
const NATURAL_TILE_WIDTH = 132;
const NATURAL_MIN_COLUMNS = 2;
const NATURAL_MAX_COLUMNS = 6;
const UNMEASURED_COLUMNS = 3;

export function resolveCharacterGrid(
  count: number,
  width: number,
  height: number,
  gap: number
): CharacterGrid {
  if (!(count > 0)) return { columns: 1, rows: 1, fills: false };

  const measured = (value: number): boolean =>
    Number.isFinite(value) && value > 0;
  const spacing = measured(gap) ? gap : 0;

  if (measured(width) && measured(height)) {
    let best: (CharacterGrid & { score: number }) | null = null;
    for (let columns = 1; columns <= count; columns++) {
      const rows = Math.ceil(count / columns);
      const tileWidth = (width - spacing * (columns - 1)) / columns;
      const tileHeight = (height - spacing * (rows - 1)) / rows;
      if (tileWidth < MIN_TILE_WIDTH) break;
      if (tileHeight < MIN_TILE_HEIGHT) continue;
      const empty = columns * rows - count;
      const score =
        Math.abs(Math.log(tileWidth / tileHeight / TILE_SHAPE)) +
        (EMPTY_CELL_WEIGHT * empty) / (columns * rows);
      if (!best || score < best.score) {
        best = { columns, rows, fills: true, score };
      }
    }
    if (best) return { columns: best.columns, rows: best.rows, fills: true };

    // The pane cannot hold them all, so it scrolls. Pack the tiles as small as
    // a name allows: the most characters in view, the least scrolling.
    const packed = Math.min(
      count,
      Math.max(
        1,
        Math.floor((width + spacing) / (MIN_TILE_WIDTH + spacing))
      )
    );
    return { columns: packed, rows: Math.ceil(count / packed), fills: false };
  }

  const columns = measured(width)
    ? Math.min(
        NATURAL_MAX_COLUMNS,
        Math.max(
          NATURAL_MIN_COLUMNS,
          Math.round((width + spacing) / (NATURAL_TILE_WIDTH + spacing))
        )
      )
    : UNMEASURED_COLUMNS;
  const held = Math.min(columns, count);
  return { columns: held, rows: Math.ceil(count / held), fills: false };
}
