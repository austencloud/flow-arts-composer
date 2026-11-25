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
  /** `dense` and `icons` come from `fitEffectPicker` alone: an icon over its
   *  name, or the icon by itself where even that is too tall. */
  orientation: "row" | "stack" | "list" | "dense" | "icons";
  /** Picture width in px, 0 for the list. Its height follows from the 8:3
   *  frame. */
  portrait: number;
  /** Space between tiles in px. */
  gap: number;
  /** The tiles share the box's height (the catalog), or take the height they
   *  need (the roster above the dock). */
  fill: boolean;
  /** Icon size in px for `dense` and `icons`, which grow with their tiles. */
  icon?: number;
  /** The tile's own height in px where the host fixes it (the phone's dense
   *  tile), rather than the height its content takes. */
  tile?: number;
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

/** Four pictures across in the effects studio; narrow inspectors can request
 *  two or three larger pictures, and the quick picker's grid on a wide player
 *  more than four. Null where even that arrangement cannot fit. */
export function fitEffectRoster({
  width,
  count,
  columns = ROSTER_COLUMNS,
  minPortrait = MIN_CATALOG_PORTRAIT,
}: Pick<EffectCatalogBox, "width" | "count"> & {
  columns?: number;
  /** The narrowest picture this host accepts; the phone's grid takes 52. */
  minPortrait?: number;
}): EffectCatalogFit | null {
  if (width <= 0 || count <= 0) return null;
  const cols = columns;
  const innerW = (width - (cols - 1) * CATALOG_GAP) / cols - 2 * INSET;
  const portrait = Math.floor(innerW);
  if (portrait < minPortrait || innerW < CATALOG_NAME_WIDTH) {
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

/** Wider than any classic scrollbar (17px on Windows), so a scrollbar coming
 *  and going cannot carry the roster across the picture threshold. */
export const ROSTER_HOLD_WIDTH = 20;

/**
 * `fitEffectRoster` for a roster that already shows pictures. Pictures are
 * taller than icons, so in a scrolling column they can bring in the scrollbar
 * that narrows the card under the threshold, the shorter icons take it away
 * again, and the grid swaps between the two every frame. So pictures stay until
 * the card loses more than a scrollbar's width (or the names stop fitting), a
 * few pixels smaller instead of turning back into icons.
 */
export function holdEffectRoster(
  box: Parameters<typeof fitEffectRoster>[0]
): EffectCatalogFit | null {
  const fit = fitEffectRoster(box);
  if (fit) return fit;
  const held = fitEffectRoster({
    ...box,
    width: box.width + ROSTER_HOLD_WIDTH,
  });
  if (!held) return null;
  const innerW =
    (box.width - (held.cols - 1) * CATALOG_GAP) / held.cols - 2 * INSET;
  // Two wide columns lose twice as much per tile, and the name stops fitting.
  if (innerW < CATALOG_NAME_WIDTH) return null;
  return { ...held, portrait: Math.floor(innerW) };
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

/** The smallest tile `fitEffectPicker` shrinks to: an icon over a name set at
 *  the label size. 46px holds the longest name on one line in English only;
 *  other languages have longer names ("Pulsazione", "Blütenblätter"). The
 *  quick list on a phone does not shrink to it: its dense form is always four
 *  columns, at whatever width four across leaves (about 75px and up), so its
 *  names are not held to this constant. */
export const DENSE_TILE_WIDTH = 46;
export const DENSE_TILE_HEIGHT = 34;
export const DENSE_GAP = 4;
/** The dense tile's icon where the host fixes its height at 34px: 3px of
 *  border, 4px of padding, the icon, a 3px gap and the 12px name come to 34. */
export const DENSE_PHONE_ICON = 12;
const DENSE_ICON_MIN = 14;
const DENSE_ICON_MAX = 28;

/**
 * Every effect in a box that must hold them all, for a host that never scrolls.
 * Pictures when the catalog's arithmetic allows them; otherwise the tiles shrink
 * until they fit, as many columns as make the largest tile, and the names go
 * only when a tile is too small for one. It answers for any box with room in it,
 * so the host has no second arrangement to fall back to.
 */
export function fitEffectPicker(
  box: EffectCatalogBox
): EffectCatalogFit | null {
  const { width, height, count } = box;
  if (width <= 0 || height <= 0 || count <= 0) return null;
  const catalog = fitEffectCatalog(box);
  if (catalog && catalog.orientation !== "list") return catalog;

  let cols = 1;
  let rows = count;
  let tileHeight = 0;
  let best = -1;
  for (let candidate = 1; candidate <= count; candidate += 1) {
    const candidateRows = Math.ceil(count / candidate);
    const w = (width - (candidate - 1) * DENSE_GAP) / candidate;
    const h = (height - (candidateRows - 1) * DENSE_GAP) / candidateRows;
    const score = Math.min(w / DENSE_TILE_WIDTH, h / DENSE_TILE_HEIGHT);
    if (score > best) {
      best = score;
      cols = candidate;
      rows = candidateRows;
      tileHeight = h;
    }
  }
  return {
    cols,
    rows,
    orientation: best >= 1 ? "dense" : "icons",
    portrait: 0,
    gap: DENSE_GAP,
    fill: true,
    icon: Math.round(
      Math.max(DENSE_ICON_MIN, Math.min(DENSE_ICON_MAX, tileHeight * 0.34))
    ),
  };
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

// ── The pictures page ─────────────────────────────────────────────────────────
// A host whose whole pane is the effects page (the Shape Engine's Customize
// workspace) gives the grid every pixel the head row and the looks leave it.
// Four across, the picture over a 14px name, and the rows share the height, so
// the page has no empty band at any size. Turning effects off hands the looks'
// room to the grid, which grows into it.

export const PICTURE_COLUMNS = 4;
export const PICTURE_GAP = 8;
/** EffectSelector's picture tile: 4.5px of padding inside its 1.5px border. */
export const PICTURE_INSET = 6;
/** Between the picture and the name. */
export const PICTURE_INNER_GAP = 6;
/** One line of the 14px name. */
export const PICTURE_CAPTION_HEIGHT = 22;
/** The taller painting (tile-format.ts `tall`), 288 x 240. */
export const TALL_PICTURE_ASPECT = 6 / 5;
/** A picture box within this ratio of its painting's shape crops the painting
 *  to fill it; further off, the painting sits whole inside it, on the same
 *  dark ground, so a subject is never cut in half. */
export const PICTURE_COVER_LIMIT = 1.25;

/** The fixed parts of a picture tile; the picture takes the rest. */
export interface PictureTileMetrics {
  gap: number;
  inset: number;
  innerGap: number;
  caption: number;
}

const PAGE_PICTURE_TILE: PictureTileMetrics = {
  gap: PICTURE_GAP,
  inset: PICTURE_INSET,
  innerGap: PICTURE_INNER_GAP,
  caption: PICTURE_CAPTION_HEIGHT,
};

export interface EffectPictureFit {
  cols: number;
  rows: number;
  gap: number;
  tileWidth: number;
  tileHeight: number;
  pictureWidth: number;
  pictureHeight: number;
  /** Which painting suits the box: the 6:5 `tall` one, or the 8:3 card. */
  shape: "tall" | "wide";
  /** Crop the painting to fill the box, or fit it whole. */
  cover: boolean;
}

export function fitEffectPictures({
  width,
  height,
  count,
  columns = PICTURE_COLUMNS,
  tile = PAGE_PICTURE_TILE,
}: EffectCatalogBox & {
  columns?: number;
  tile?: PictureTileMetrics;
}): EffectPictureFit | null {
  if (width <= 0 || height <= 0 || count <= 0) return null;
  const cols = Math.min(columns, count);
  const rows = Math.ceil(count / cols);
  const tileWidth = (width - (cols - 1) * tile.gap) / cols;
  const tileHeight = (height - (rows - 1) * tile.gap) / rows;
  const pictureWidth = tileWidth - 2 * tile.inset;
  const pictureHeight =
    tileHeight - 2 * tile.inset - tile.innerGap - tile.caption;
  if (pictureWidth <= 0 || pictureHeight <= 0) return null;
  const aspect = pictureWidth / pictureHeight;
  const offTall = Math.max(
    aspect / TALL_PICTURE_ASPECT,
    TALL_PICTURE_ASPECT / aspect
  );
  const offWide = Math.max(
    aspect / CATALOG_PORTRAIT_ASPECT,
    CATALOG_PORTRAIT_ASPECT / aspect
  );
  const shape = offTall <= offWide ? "tall" : "wide";
  return {
    cols,
    rows,
    gap: tile.gap,
    tileWidth,
    tileHeight,
    pictureWidth,
    pictureHeight,
    shape,
    cover: Math.min(offTall, offWide) <= PICTURE_COVER_LIMIT,
  };
}

// ── The phone dock ────────────────────────────────────────────────────────────
// A dock under a player is about 215-310px of body, so its tiles wear the same
// pictures under a 12px name with less air round them. Four across on a phone;
// a dock as wide as a tablet takes eight, when that draws each picture bigger.
// Where even the tight tile leaves no picture worth looking at (the shortest
// phones), the answer is null and the dock keeps its one-line tiles.

/** EffectSelector's dock picture tile: 2px of padding inside its 1.5px border. */
export const DOCK_PICTURE_TILE: PictureTileMetrics = {
  gap: 6,
  inset: 3.5,
  innerGap: 2,
  caption: 16,
};
export const MIN_DOCK_PICTURE_HEIGHT = 19;
const DOCK_WIDE_COLUMNS = 8;
/** The picture a 360px phone's four columns draw, which holds every name. */
const DOCK_PICTURE_WIDTH = 63;

/** How much of the picture's box its painting covers, in square pixels. */
function paintedArea(fit: EffectPictureFit): number {
  if (fit.cover) return fit.pictureWidth * fit.pictureHeight;
  const aspect =
    fit.shape === "tall" ? TALL_PICTURE_ASPECT : CATALOG_PORTRAIT_ASPECT;
  const width = Math.min(fit.pictureWidth, fit.pictureHeight * aspect);
  return (width * width) / aspect;
}

export function fitEffectDock(box: EffectCatalogBox): EffectPictureFit | null {
  let best: EffectPictureFit | null = null;
  for (const columns of [PICTURE_COLUMNS, DOCK_WIDE_COLUMNS]) {
    const fit = fitEffectPictures({ ...box, columns, tile: DOCK_PICTURE_TILE });
    if (!fit || fit.pictureHeight < MIN_DOCK_PICTURE_HEIGHT) continue;
    // Eight columns only where a name still has the room it needs.
    if (columns !== PICTURE_COLUMNS && fit.pictureWidth < DOCK_PICTURE_WIDTH) {
      continue;
    }
    if (!best || paintedArea(fit) > paintedArea(best)) best = fit;
  }
  return best;
}
