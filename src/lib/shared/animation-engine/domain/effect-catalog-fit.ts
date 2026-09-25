/**
 * Fit the effect roster to a tall box while no effect is on.
 *
 * With nothing on, the roster is the whole page, so each tile can carry a
 * picture of its effect's look instead of an icon and a word. Once an effect is
 * on, the roster goes back to its compact grid so the looks dock fits under it.
 * This function only covers the first case.
 *
 * Two picture arrangements, whichever gives the bigger picture:
 *
 * - `row`   two columns, the picture on the left with the name beside it. This
 *           suits a studio card, which is tall and about 500px wide.
 * - `stack` four columns, the picture above the name, for a box too narrow to
 *           fit a picture and a name side by side.
 *
 * The picture uses the 8:3 frame the looks cards use, so an effect's catalog
 * picture and its look in the dock have the same shape. When neither
 * arrangement fits a picture at least MIN_CATALOG_PORTRAIT wide, a narrow tall
 * card (a third of a laptop screen) still has height the compact grid would
 * leave empty, so the names fill it as a two-column `list`. Only a box too
 * short for the list's rows gets null, and the host keeps the compact grid.
 *
 * The CSS reads the tile metrics below as custom properties, so the arithmetic
 * and the rendered tile cannot drift apart.
 */
export interface EffectCatalogBox {
  width: number;
  height: number;
  count: number;
}

export interface EffectCatalogFit {
  cols: number;
  rows: number;
  orientation: "row" | "stack" | "list";
  /** Picture width in px, 0 for the list. Its height follows from the 8:3
   *  frame. */
  portrait: number;
  /** Space between tiles in px. */
  gap: number;
}

export const CATALOG_GAP = 6;
export const CATALOG_TILE_PAD = 8;
/** Space between the picture and the name. */
export const CATALOG_INNER_GAP = 8;
/** An icon and the longest name ("Bubbles", "Sparkle") on one line. */
export const CATALOG_CAPTION_WIDTH = 72;
export const CATALOG_CAPTION_HEIGHT = 16;
export const CATALOG_PORTRAIT_ASPECT = 8 / 3;
/** Narrower than this and the picture is too small to show the effect, so the
 *  compact grid is the better use of the space. */
export const MIN_CATALOG_PORTRAIT = 64;
/** The list is a column of buttons, so its gap is tighter than the tiles'. */
export const CATALOG_LIST_GAP = 4;
/** The touch-target floor. Shorter rows are worse than the compact grid. */
export const MIN_LIST_ROW = 44;
/** A row holds one icon and one name; taller than this it looks stretched,
 *  so the rows stop growing and the rest of the box stays below them. */
export const MAX_LIST_ROW = 64;

const COLUMN_CHOICES = [2, 4];
const LIST_COLUMNS = 2;

export function fitEffectCatalog(
  box: EffectCatalogBox
): EffectCatalogFit | null {
  const { width, height, count } = box;
  if (width <= 0 || height <= 0 || count <= 0) return null;

  let best: EffectCatalogFit | null = null;
  for (const cols of COLUMN_CHOICES) {
    const rows = Math.ceil(count / cols);
    const innerW =
      (width - (cols - 1) * CATALOG_GAP) / cols - 2 * CATALOG_TILE_PAD;
    const innerH =
      (height - (rows - 1) * CATALOG_GAP) / rows - 2 * CATALOG_TILE_PAD;
    if (innerW <= 0 || innerH <= 0) continue;

    const beside = Math.min(
      innerW - CATALOG_CAPTION_WIDTH - CATALOG_INNER_GAP,
      innerH * CATALOG_PORTRAIT_ASPECT
    );
    // Stacked, the name sits under the picture, so the tile must still be wide
    // enough for the name on one line.
    const above =
      innerW < CATALOG_CAPTION_WIDTH
        ? 0
        : Math.min(
            innerW,
            (innerH - CATALOG_CAPTION_HEIGHT - CATALOG_INNER_GAP) *
              CATALOG_PORTRAIT_ASPECT
          );
    const portrait = Math.floor(Math.max(beside, above));
    if (portrait < MIN_CATALOG_PORTRAIT) continue;
    if (best && portrait <= best.portrait) continue;
    best = {
      cols,
      rows,
      orientation: beside >= above ? "row" : "stack",
      portrait,
      gap: CATALOG_GAP,
    };
  }
  return best ?? fitList(box);
}

function fitList({
  width,
  height,
  count,
}: EffectCatalogBox): EffectCatalogFit | null {
  const rows = Math.ceil(count / LIST_COLUMNS);
  const innerW =
    (width - (LIST_COLUMNS - 1) * CATALOG_LIST_GAP) / LIST_COLUMNS -
    2 * CATALOG_TILE_PAD;
  const rowH = (height - (rows - 1) * CATALOG_LIST_GAP) / rows;
  if (innerW < CATALOG_CAPTION_WIDTH || rowH < MIN_LIST_ROW) return null;
  return {
    cols: LIST_COLUMNS,
    rows,
    orientation: "list",
    portrait: 0,
    gap: CATALOG_LIST_GAP,
  };
}
