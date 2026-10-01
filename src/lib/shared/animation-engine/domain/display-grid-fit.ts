/**
 * Fit Display's tiles to a box's shape, at a size the box does not get
 * to dictate.
 *
 * Two decisions, in this order. First how big a picture may be: a fraction of
 * the box's SHORT side, floored and ceilinged, so the control looks like the
 * same control on a phone tray and on a 4K rail. Then how to arrange the
 * tiles: whole rows keep a lone tile off the end, while the grouped variant
 * keeps its four square-field layers and edge marks apart. The winner fits the biggest
 * picture, or, once the ceiling has settled that, whichever arrangement's own
 * proportions come closest to the box's, since that is the one that centres
 * without a lopsided margin down one axis.
 *
 * Filling the box was the first attempt and it was wrong: a 831x2186 rail
 * bought 390px toggles. The grid sits in the middle of the room it has. A host
 * whose box is bounded by something else on screen (`grow`) lifts the cap.
 *
 * The caller measures the rendered chip, so padding, gap and label metrics are
 * whatever the host's CSS resolved to.
 */
export interface DisplayGridBox {
  width: number;
  height: number;
  /** Horizontal padding of one tile. */
  padX: number;
  /** Everything in a tile that is not its picture, top to bottom. */
  chromeY: number;
  gapX: number;
  gapY: number;
  count: number;
  grow?: boolean;
  /** Compact hosts retain their smaller artwork floor when fitting a box. */
  minArt?: number;
  /** Compact grids may center a shorter final row, but never leave one tile. */
  allowPartialRows?: boolean;
  /** Tile index where the second visual group starts; null for one group. */
  groupBoundary?: number | null;
}

export interface DisplayGridFit {
  cols: number;
  art: number;
  tile: number;
}

/** The breath between the square-field layers and the edge marks. */
export const DISPLAY_GROUP_GAP = 10;
/** Below this a picture stops reading as one. A box that cannot hold eight at
 *  this size (a phone on its side) gets the width-only layout and scrolls
 *  instead of shrinking them to stamps. */
export const MIN_FIT_ART = 48;

/** The arrangement for the box, or null where the width-only layout applies. */
export function fitDisplayGrid(box: DisplayGridBox): DisplayGridFit | null {
  const { width, height, padX, chromeY, gapX, gapY, count } = box;
  if (width <= 0 || height <= 0 || count <= 0) return null;

  const boundary = box.groupBoundary === undefined ? 4 : box.groupBoundary;
  const grouped = boundary !== null && boundary > 0 && boundary < count;
  const columnChoices = grouped
    ? [2, 4, 8].filter((cols) => cols <= count)
    : Array.from({ length: count - 1 }, (_, i) => i + 2).filter(
        (cols) =>
          count % cols === 0 || (box.allowPartialRows && count % cols > 1)
      );

  const cap = box.grow
    ? Number.POSITIVE_INFINITY
    : Math.min(176, Math.max(72, Math.round(Math.min(width, height) * 0.2)));
  const boxAspect = width / height;
  // The tile is square: its picture plus the larger of its two chromes. That
  // side is what has to fit on both axes. Checking the width against the side
  // padding alone let a short box pick tiles wider than their columns.
  const chrome = Math.max(padX, chromeY);
  let best = { cols: 0, art: 0, skew: Number.POSITIVE_INFINITY };

  for (const cols of columnChoices) {
    const rows = Math.ceil(count / cols);
    // The group breath is a row gap when the boundary falls on a row edge,
    // and a column gap when one row holds everything.
    const tileW =
      (width -
        gapX * (cols - 1) -
        (grouped && rows === 1 ? DISPLAY_GROUP_GAP : 0)) /
      cols;
    const tileH =
      (height -
        gapY * (rows - 1) -
        (grouped && rows > 1 ? DISPLAY_GROUP_GAP : 0)) /
      rows;
    const art = Math.min(cap, tileW - chrome, tileH - chrome);
    if (art <= 0) continue;
    const tile = art + chrome;
    const gridW =
      cols * tile +
      gapX * (cols - 1) +
      (grouped && rows === 1 ? DISPLAY_GROUP_GAP : 0);
    const gridH =
      rows * tile +
      gapY * (rows - 1) +
      (grouped && rows > 1 ? DISPLAY_GROUP_GAP : 0);
    const skew = Math.abs(Math.log(gridW / gridH / boxAspect));
    // Biggest picture wins. Where the cap has already settled that, the shape
    // decides.
    if (
      art > best.art + 0.5 ||
      (Math.abs(art - best.art) <= 0.5 && skew < best.skew)
    ) {
      best = { cols, art, skew };
    }
  }

  if (!best.cols || best.art < (box.minArt ?? MIN_FIT_ART)) return null;
  return {
    cols: best.cols,
    art: Math.floor(best.art),
    tile: Math.floor(best.art + chrome),
  };
}

/**
 * The compact layout, for a host that scrolls the panel inside a box it does
 * not size (Post Studio's tool panel). There is no definite height to fit the
 * tiles to, so the arrangement is fixed (as few, wide rows as the width allows)
 * and only the picture size is chosen: the largest one for which everything the
 * scroller holds still fits its visible height, never smaller than a picture
 * that still reads as one.
 */
/** Smallest picture a compact tile keeps; below it the host scrolls instead. */
export const COMPACT_MIN_ART = 28;
/** Largest picture a compact tile draws, however much room the host has. */
export const COMPACT_MAX_ART = 64;
/** Narrowest compact tile, so a two-word label still fits in two lines. */
export const COMPACT_MIN_TILE_WIDTH = 60;

/**
 * Columns for `count` tiles: the fewest rows (two or more) whose columns are
 * each at least COMPACT_MIN_TILE_WIDTH wide. Ten tiles are two rows of five
 * wherever five columns fit; a narrower box gets more rows.
 */
export function compactDisplayColumns(box: {
  width: number;
  count: number;
  gap: number;
}): number {
  const { width, count, gap } = box;
  if (count <= 1) return Math.max(count, 1);
  for (let rows = 2; rows <= count; rows += 1) {
    const cols = Math.ceil(count / rows);
    const tile = (width - gap * (cols - 1)) / cols;
    if (tile >= COMPACT_MIN_TILE_WIDTH) return cols;
  }
  return 1;
}

/**
 * The picture cap that makes the scroller's content fit its visible height.
 *
 * `probeArt` is the picture size actually drawn when the cap was
 * COMPACT_MAX_ART, `overflow` is how far the scroller's content then ran past
 * its visible height (zero or less when it fit), and every row shrinks by the
 * same amount the picture does, so the content shortens by rows x shrink.
 */
export function compactDisplayArt(probe: {
  probeArt: number;
  rows: number;
  overflow: number;
}): number {
  const { probeArt, rows, overflow } = probe;
  if (overflow <= 0) return COMPACT_MAX_ART;
  const shrink = Math.ceil(overflow / Math.max(rows, 1));
  return Math.min(
    COMPACT_MAX_ART,
    Math.max(COMPACT_MIN_ART, Math.floor(probeArt - shrink))
  );
}
