/**
 * Fit the effect roster in the side studio, where every tile can carry a
 * picture of its effect's look (the same picture as its looks card, in the same
 * 8:3 frame) instead of an icon.
 *
 * One rule decides between pictures and icons: pictures whenever the card is
 * wide enough for four of them across (`fitEffectRoster`), in both states.
 * Otherwise every state keeps the icons, so an effect never changes from a
 * picture to an icon when it is turned on.
 *
 * - With an effect on, the roster sits above the looks dock at the height its
 *   tiles need: four across, the picture above the name. That height depends on
 *   the width alone, so the grid and the dock's top edge hold still while you
 *   compare effects.
 * - With nothing on, the roster is the whole page (`fitEffectCatalog`) and its
 *   tiles fill the box in whichever arrangement gives the bigger picture:
 *   `row`, two columns with the name beside the picture (a studio card is tall
 *   and about 500px wide), or `stack`, four columns with the name under it.
 *   A card too narrow for pictures (a third of a laptop screen) fills with the
 *   icons and names as a two-column `list`. A box too short for either gets
 *   null, and the host shows the roster as it is with an effect on.
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
  /** The tiles share the box's height (the catalog), or take the height they
   *  need (the roster above the dock). */
  fill: boolean;
}

export const CATALOG_GAP = 6;
export const CATALOG_TILE_PAD = 8;
/** EffectSelector's .effect-btn border, inside the tile like its padding. */
export const CATALOG_TILE_BORDER = 1.5;
/** Space between the picture and the name. */
export const CATALOG_INNER_GAP = 8;
/** The longest name ("Bubbles", 43px at the label size) on one line. A tile
 *  with a picture shows the name alone; the picture is the effect's icon. */
export const CATALOG_NAME_WIDTH = 48;
/** An icon and the longest name on one line, for the list. */
export const CATALOG_CAPTION_WIDTH = 72;
export const CATALOG_CAPTION_HEIGHT = 16;
export const CATALOG_PORTRAIT_ASPECT = 8 / 3;
/** Narrower than this and the picture is too small to show the effect, so the
 *  icons are the better use of the space. A studio card at 1278x1249 (half a
 *  laptop screen at 150%) gives four pictures 62px wide. */
export const MIN_CATALOG_PORTRAIT = 56;
/** The list is a column of buttons, so its gap is tighter than the tiles'. */
export const CATALOG_LIST_GAP = 4;
/** The touch-target floor. Shorter rows are worse than the compact grid. */
export const MIN_LIST_ROW = 44;
/** A row holds one icon and one name; taller than this it looks stretched,
 *  so the rows stop growing and the rest of the box stays below them. */
export const MAX_LIST_ROW = 64;

const INSET = CATALOG_TILE_PAD + CATALOG_TILE_BORDER;
const COLUMN_CHOICES = [2, 4];
const ROSTER_COLUMNS = 4;
const LIST_COLUMNS = 2;

/** The roster with an effect on: four pictures across, or null for icons. */
export function fitEffectRoster({
  width,
  count,
}: Pick<EffectCatalogBox, "width" | "count">): EffectCatalogFit | null {
  if (width <= 0 || count <= 0) return null;
  const cols = ROSTER_COLUMNS;
  const innerW = (width - (cols - 1) * CATALOG_GAP) / cols - 2 * INSET;
  const portrait = Math.floor(innerW);
  if (portrait < MIN_CATALOG_PORTRAIT || innerW < CATALOG_NAME_WIDTH) {
    return null;
  }
  return {
    cols,
    rows: Math.ceil(count / cols),
    orientation: "stack",
    portrait,
    gap: CATALOG_GAP,
    fill: false,
  };
}

/** The roster with nothing on, filling the box. */
export function fitEffectCatalog(
  box: EffectCatalogBox
): EffectCatalogFit | null {
  const { width, height, count } = box;
  if (width <= 0 || height <= 0 || count <= 0) return null;
  // Pictures here only where the roster keeps them once an effect is on.
  if (!fitEffectRoster(box)) return fitList(box);

  let best: EffectCatalogFit | null = null;
  for (const cols of COLUMN_CHOICES) {
    const rows = Math.ceil(count / cols);
    const innerW = (width - (cols - 1) * CATALOG_GAP) / cols - 2 * INSET;
    const innerH = (height - (rows - 1) * CATALOG_GAP) / rows - 2 * INSET;
    if (innerW < CATALOG_NAME_WIDTH || innerH <= 0) continue;

    const beside = Math.min(
      innerW - CATALOG_NAME_WIDTH - CATALOG_INNER_GAP,
      innerH * CATALOG_PORTRAIT_ASPECT
    );
    const above = Math.min(
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
      fill: true,
    };
  }
  return best;
}

function fitList({
  width,
  height,
  count,
}: EffectCatalogBox): EffectCatalogFit | null {
  const rows = Math.ceil(count / LIST_COLUMNS);
  const innerW =
    (width - (LIST_COLUMNS - 1) * CATALOG_LIST_GAP) / LIST_COLUMNS - 2 * INSET;
  const rowH = (height - (rows - 1) * CATALOG_LIST_GAP) / rows;
  if (innerW < CATALOG_CAPTION_WIDTH || rowH < MIN_LIST_ROW) return null;
  return {
    cols: LIST_COLUMNS,
    rows,
    orientation: "list",
    portrait: 0,
    gap: CATALOG_LIST_GAP,
    fill: true,
  };
}
