/**
 * Fit Display's eight tiles to a box's shape, at a size the box does not get
 * to dictate.
 *
 * Two decisions, in this order. First how big a picture may be: a fraction of
 * the box's SHORT side, floored and ceilinged, so the control looks like the
 * same control on a phone tray and on a 4K rail. Then how to arrange eight
 * tiles: 2, 4 and 8 columns all keep the four square-field layers and the four
 * edge marks on whole rows, and the winner is whichever fits the biggest
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
}

export interface DisplayGridFit {
  cols: number;
  art: number;
  tile: number;
}

const COLUMN_CHOICES = [2, 4, 8];
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

  const cap = box.grow
    ? Number.POSITIVE_INFINITY
    : Math.min(176, Math.max(72, Math.round(Math.min(width, height) * 0.2)));
  const boxAspect = width / height;
  // The tile is square: its picture plus the larger of its two chromes. That
  // side is what has to fit on both axes. Checking the width against the side
  // padding alone let a short box pick tiles wider than their columns.
  const chrome = Math.max(padX, chromeY);
  let best = { cols: 0, art: 0, skew: Number.POSITIVE_INFINITY };

  for (const cols of COLUMN_CHOICES) {
    if (cols > count) continue;
    const rows = Math.ceil(count / cols);
    // The group breath is a row gap when the boundary falls on a row edge,
    // and a column gap when one row holds everything.
    const tileW =
      (width - gapX * (cols - 1) - (rows === 1 ? DISPLAY_GROUP_GAP : 0)) / cols;
    const tileH =
      (height - gapY * (rows - 1) - (rows > 1 ? DISPLAY_GROUP_GAP : 0)) / rows;
    const art = Math.min(cap, tileW - chrome, tileH - chrome);
    if (art <= 0) continue;
    const tile = art + chrome;
    const gridW = cols * tile + gapX * (cols - 1);
    const gridH = rows * tile + gapY * (rows - 1);
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

  if (!best.cols || best.art < MIN_FIT_ART) return null;
  return {
    cols: best.cols,
    art: Math.floor(best.art),
    tile: Math.floor(best.art + chrome),
  };
}
