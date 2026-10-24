/**
 * Arrange the quick effect picker that opens from a small player's effect
 * button, so the animation it changes stays in view while you compare looks.
 *
 * - `side`: where the player's workspace has room beside it (laptops,
 *   desktops, a short landscape phone whose player is a small square), the
 *   picker is a panel beside the player holding every effect four across, as
 *   a picture of its look when the panel is tall enough for five rows of them
 *   and as the icon and name otherwise. The panel grows with the player, so
 *   a 4K player does not get a postage-stamp picker. Where the room beside
 *   the player is too narrow for four across (a landscape phone, or a
 *   laptop at 200% zoom), the panel is the player's height and holds two
 *   pictures across that scroll inside it.
 * - `grid`: where the player fills the width (phone and tablet portrait),
 *   the pictures wrap four or more across under an Effects title row that
 *   holds Off and close, in the room under the player that the animation does
 *   not need: a tray floating just under the player's controls where that
 *   room holds the whole grid, otherwise a sheet docked along the bottom of
 *   its bounds over the toolbar there (idle while the picker is open). Where
 *   neither holds every row, the grid takes the larger of the two and scrolls
 *   down inside it, its last row in view cut to show there is more. The
 *   pictures are as large as `QUICK_PICKER_MAX_STRIP_PORTRAIT` allows, so a
 *   tablet gets more columns rather than a phone's tiles stretched.
 * - `strip`: where the grid would not show more effects at once (too little
 *   room for its title row and a row and a half of pictures, as on a short
 *   phone), one scrolling row of pictures, placed so the whole animation
 *   stays in view: floating under the controls where the room there holds
 *   it (with smaller pictures if need be), otherwise docked along the bottom
 *   of its bounds, and over the animation's bottom edge only when neither of
 *   those nor the narrow side panel fits. The pictures are sized so the last
 *   one in view is cut about in half, which shows the row scrolls.
 *
 * Pure arithmetic over the picture tiles' own metrics (effect-catalog-fit),
 * so the CSS that draws the tiles and the fit cannot drift apart.
 */
import {
  CATALOG_CAPTION_HEIGHT,
  CATALOG_GAP,
  CATALOG_INNER_GAP,
  CATALOG_TILE_BORDER,
  CATALOG_TILE_PAD,
  fitEffectRoster,
  type EffectCatalogFit,
} from "./effect-catalog-fit";

export interface QuickPickerRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface QuickPickerBox {
  /** The area the picker stays inside, in viewport pixels: the app's
   *  content area, so it never covers the app's own navigation. */
  bounds: QuickPickerRect;
  /** The player the picker changes, in viewport pixels. */
  player: QuickPickerRect;
  /** The height under the player's controls the picker may cover: empty
   *  space down to the next control, or a band such as a notation rail that
   *  it covers whole. 0 when absent. */
  roomBelow?: number;
  /** Effects offered. */
  count: number;
}

export type EffectQuickPickerFit =
  | {
      arrangement: "side";
      side: "left" | "right";
      /** The panel's outer width in px. */
      width: number;
      /** Picture tiles, or null for the icon tiles. */
      catalog: EffectCatalogFit | null;
      /** The panel's outer height in px where its tiles scroll inside it,
       *  null where it takes the height they need. */
      height: number | null;
    }
  | {
      arrangement: "grid";
      /** Floating under the player's controls, or docked along the bottom
       *  of the bounds. */
      side: "below" | "dock";
      /** The panel's outer height in px. */
      height: number;
      /** The picture tiles, several rows of them. */
      catalog: EffectCatalogFit;
      /** The tiles scroll down inside the panel: the room holds fewer rows
       *  than there are. */
      scrolls: boolean;
    }
  | {
      arrangement: "strip";
      /** Floating under the player's controls, docked along the bottom of
       *  the bounds, or over the animation's bottom edge. */
      side: "below" | "dock" | "above";
      /** The strip's outer height in px. */
      height: number;
      /** One row of picture tiles. */
      catalog: EffectCatalogFit;
      /** The width of that row in px, wider than the strip so it scrolls. */
      trackWidth: number;
    };

/** Panel padding, the Effects title row (the Off button's 44px target) and
 *  the space under it. */
export const QUICK_PICKER_PAD = 12;
export const QUICK_PICKER_HEAD = 44;
export const QUICK_PICKER_HEAD_GAP = 8;
/** Space between the player and the panel, and between the panel and the
 *  edge of its bounds. */
export const QUICK_PICKER_OFFSET = 12;
export const QUICK_PICKER_EDGE = 12;
/** Four 64px pictures across, the smallest the side panel shows. */
export const QUICK_PICKER_SIDE_WIDTH = 374;
/** Four icon tiles across keep every name whole down to this width. */
export const QUICK_PICKER_MIN_SIDE_WIDTH = 300;
export const QUICK_PICKER_MAX_SIDE_WIDTH = 520;
/** Two pictures across, scrolling, down to this width. */
export const QUICK_PICKER_MIN_NARROW_SIDE_WIDTH = 200;
const NARROW_SIDE_COLUMNS = 2;
/** The side panel's width as a share of the player's height. */
const SIDE_WIDTH_PER_PLAYER_HEIGHT = 0.3;
/** EffectSelector's icon tile: 48px tall, 6px apart. */
export const QUICK_PICKER_ICON_TILE = 48;
const ICON_GAP = 6;
const SIDE_COLUMNS = 4;

/** Strip padding, the leading Off tile's width and the trailing close
 *  button's. */
export const QUICK_PICKER_STRIP_PAD = 8;
export const QUICK_PICKER_OFF_WIDTH = 64;
export const QUICK_PICKER_CLOSE_WIDTH = 44;
/** The tray's and the docked sheet's border. */
const QUICK_PICKER_BORDER = 1;
/** The grid wants at least this many columns: fewer and the side panel or
 *  the strip suits the player better. */
const GRID_MIN_COLUMNS = 4;
/** Space between the player's controls and the tray floating under them. */
export const QUICK_PICKER_STRIP_GAP = 8;
export const QUICK_PICKER_MIN_STRIP_PORTRAIT = 64;
export const QUICK_PICKER_MAX_STRIP_PORTRAIT = 112;
/** The strip's pictures as a share of the player's width before the peek
 *  adjustment, so a tablet's row is not a phone's row stretched. */
const STRIP_PORTRAIT_PER_WIDTH = 0.12;

const INSET = CATALOG_TILE_PAD + CATALOG_TILE_BORDER;

/** A picture tile's height for a picture `portrait` px wide. */
export function pictureTileHeight(portrait: number): number {
  return (
    2 * INSET + (portrait * 3) / 8 + CATALOG_INNER_GAP + CATALOG_CAPTION_HEIGHT
  );
}

/** The side panel's outer height for a tile arrangement. */
export function sidePanelHeight(
  catalog: EffectCatalogFit | null,
  count: number
): number {
  const rows = catalog?.rows ?? Math.ceil(count / SIDE_COLUMNS);
  const tile = catalog
    ? pictureTileHeight(catalog.portrait)
    : QUICK_PICKER_ICON_TILE;
  const gap = catalog?.gap ?? ICON_GAP;
  return (
    2 * QUICK_PICKER_PAD +
    QUICK_PICKER_HEAD +
    QUICK_PICKER_HEAD_GAP +
    rows * tile +
    (rows - 1) * gap
  );
}

/** The grid's outer height for a tile arrangement, with every row in view. */
export function gridPanelHeight(catalog: EffectCatalogFit): number {
  return (
    2 * QUICK_PICKER_STRIP_PAD +
    QUICK_PICKER_HEAD +
    QUICK_PICKER_HEAD_GAP +
    catalog.rows * pictureTileHeight(catalog.portrait) +
    (catalog.rows - 1) * catalog.gap
  );
}

/** The strip's outer height for pictures `portrait` px wide. */
export function stripHeight(portrait: number): number {
  return 2 * QUICK_PICKER_STRIP_PAD + pictureTileHeight(portrait);
}

/** The distance from one strip tile's start to the next's. */
export function stripTilePitch(portrait: number): number {
  return portrait + 2 * INSET + CATALOG_GAP;
}

/** How far in from a faded end of the strip a tile must start, or stop, to
 *  be clear of the fade and of the arrow over it. The strip's scroll padding,
 *  so its snap positions start a tile here too. */
export const QUICK_PICKER_STRIP_EDGE_CLEAR = 40;

/**
 * Where an arrow scrolls the strip to. Every stop starts a tile just clear of
 * the start's fade, the strip's own snap positions, so a swipe and an arrow
 * settle alike. Forward, the first tile still under the end's fade starts the
 * new view. Back, the view goes as far as it can while the last tile under
 * the start's fade stays clear of the end's. Either way the tile that was cut
 * is fully in view, and the view moves at least one tile.
 */
export function stripPageTarget({
  portrait,
  scrollLeft,
  viewWidth,
  scrollWidth,
  direction,
}: {
  portrait: number;
  scrollLeft: number;
  viewWidth: number;
  scrollWidth: number;
  direction: 1 | -1;
}): number {
  const pitch = stripTilePitch(portrait);
  const tile = pitch - CATALOG_GAP;
  const clear = QUICK_PICKER_STRIP_EDGE_CLEAR;
  /** The scroll that starts tile `index` just clear of the start's fade. */
  const startAt = (index: number) => index * pitch - clear;
  let target: number;
  if (direction > 0) {
    const cut = Math.floor((scrollLeft + viewWidth - clear - tile) / pitch) + 1;
    target = Math.max(scrollLeft + pitch, startAt(cut));
  } else {
    const cut = Math.ceil((scrollLeft + clear) / pitch) - 1;
    /** The least scroll that keeps the cut tile clear of the end's fade. */
    const least = cut * pitch + tile - (viewWidth - clear);
    target =
      least <= 0
        ? 0
        : Math.min(
            scrollLeft - pitch,
            startAt(Math.ceil((least + clear) / pitch))
          );
  }
  return Math.min(Math.max(0, scrollWidth - viewWidth), Math.max(0, target));
}

export function fitEffectQuickPicker({
  bounds,
  player,
  roomBelow = 0,
  count,
}: QuickPickerBox): EffectQuickPickerFit {
  const roomRight =
    bounds.left +
    bounds.width -
    (player.left + player.width) -
    QUICK_PICKER_OFFSET -
    QUICK_PICKER_EDGE;
  const roomLeft =
    player.left - bounds.left - QUICK_PICKER_OFFSET - QUICK_PICKER_EDGE;
  const target = Math.min(
    QUICK_PICKER_MAX_SIDE_WIDTH,
    Math.max(
      QUICK_PICKER_SIDE_WIDTH,
      Math.round(player.height * SIDE_WIDTH_PER_PLAYER_HEIGHT)
    )
  );
  // Right when it has the panel's full width, or at least as much as left.
  const side = roomRight >= target || roomRight >= roomLeft ? "right" : "left";
  const width = Math.floor(
    Math.min(target, side === "right" ? roomRight : roomLeft)
  );

  if (width >= QUICK_PICKER_MIN_SIDE_WIDTH) {
    const pictures = fitEffectRoster({
      width: width - 2 * QUICK_PICKER_PAD,
      count,
      columns: SIDE_COLUMNS,
    });
    const fitsTall =
      !!pictures &&
      sidePanelHeight(pictures, count) <= bounds.height - 2 * QUICK_PICKER_EDGE;
    return {
      arrangement: "side",
      side,
      width,
      catalog: fitsTall ? pictures : null,
      height: null,
    };
  }

  const strip = fitStrip(bounds, player, roomBelow, count);
  const grid = fitGrid(bounds, player, roomBelow, count, strip);
  if (grid) return grid;
  if (strip.arrangement === "strip" && strip.side === "below") return strip;
  return fitNarrowSide(bounds, player, side, width, count) ?? strip;
}

/** Two pictures across in a panel the player's height, scrolling, which keeps
 *  the whole animation in view where a strip would cover its bottom edge. Null
 *  where the room beside the player is too narrow for two, or the player too
 *  short to show a row and a half of them. */
function fitNarrowSide(
  bounds: QuickPickerRect,
  player: QuickPickerRect,
  side: "left" | "right",
  width: number,
  count: number
): EffectQuickPickerFit | null {
  if (width < QUICK_PICKER_MIN_NARROW_SIDE_WIDTH) return null;
  const pictures = fitEffectRoster({
    width: width - 2 * QUICK_PICKER_PAD,
    count,
    columns: NARROW_SIDE_COLUMNS,
  });
  if (!pictures) return null;
  const height = Math.floor(
    Math.min(player.height, bounds.height - 2 * QUICK_PICKER_EDGE)
  );
  // The cut row under the last whole one shows that the grid scrolls.
  const least =
    2 * QUICK_PICKER_PAD +
    QUICK_PICKER_HEAD +
    QUICK_PICKER_HEAD_GAP +
    1.5 * pictureTileHeight(pictures.portrait) +
    pictures.gap;
  if (height < least) return null;
  return {
    arrangement: "side",
    side,
    width,
    catalog: pictures,
    height: sidePanelHeight(pictures, count) > height ? height : null,
  };
}

/** The pictures wrapping across the player's width in the room under it, or
 *  null where that shows no more effects at once than `strip` does. It never
 *  covers the animation: it floats under the controls or docks below the
 *  player, so it is only ever as tall as the room there. */
function fitGrid(
  bounds: QuickPickerRect,
  player: QuickPickerRect,
  roomBelow: number,
  count: number,
  strip: EffectQuickPickerFit
): EffectQuickPickerFit | null {
  if (strip.arrangement !== "strip") return null;
  // The panel's padding, and the floating tray's border.
  const inner =
    player.width - 2 * QUICK_PICKER_STRIP_PAD - 2 * QUICK_PICKER_BORDER;
  let catalog: EffectCatalogFit | null = null;
  // The most pictures across that stay no larger than the strip's largest,
  // and never fewer than four.
  for (let cols = GRID_MIN_COLUMNS; ; cols++) {
    const next = fitEffectRoster({ width: inner, count, columns: cols });
    if (!next) break;
    catalog = next;
    if (next.portrait <= QUICK_PICKER_MAX_STRIP_PORTRAIT) break;
  }
  if (!catalog) return null;

  const tile = pictureTileHeight(catalog.portrait);
  // The floating tray's border runs all round it, the docked sheet's along
  // its top.
  const fullBelow = gridPanelHeight(catalog) + 2 * QUICK_PICKER_BORDER;
  const fullDocked = gridPanelHeight(catalog) + QUICK_PICKER_BORDER;
  const roomUnder = roomBelow - QUICK_PICKER_STRIP_GAP;
  const roomDocked = bounds.top + bounds.height - (player.top + player.height);
  const side =
    roomUnder >= fullBelow ||
    (roomDocked < fullDocked && roomUnder >= roomDocked)
      ? "below"
      : "dock";
  const full = side === "below" ? fullBelow : fullDocked;
  const room = Math.floor(side === "below" ? roomUnder : roomDocked);
  const height = Math.ceil(Math.min(full, room));
  const scrolls = height < full;
  // A scrolling grid shows a row and a half at least: the cut row under the
  // whole one shows that it scrolls.
  const head =
    2 * QUICK_PICKER_STRIP_PAD + QUICK_PICKER_HEAD + QUICK_PICKER_HEAD_GAP;
  if (scrolls && height < head + 1.5 * tile + catalog.gap) return null;

  // Whole tiles in view, against the strip's.
  const wholeRows = scrolls
    ? Math.floor((height - head + catalog.gap) / (tile + catalog.gap))
    : catalog.rows;
  const inGrid = Math.min(count, wholeRows * catalog.cols);
  const stripRoom =
    player.width -
    2 * QUICK_PICKER_STRIP_PAD -
    QUICK_PICKER_OFF_WIDTH -
    QUICK_PICKER_CLOSE_WIDTH -
    2 * CATALOG_GAP;
  const inStrip = Math.floor(
    (stripRoom + CATALOG_GAP) / stripTilePitch(strip.catalog.portrait)
  );
  if (inGrid <= inStrip) return null;

  return { arrangement: "grid", side, height, catalog, scrolls };
}

function fitStrip(
  bounds: QuickPickerRect,
  player: QuickPickerRect,
  roomBelow: number,
  count: number
): EffectQuickPickerFit {
  const { width } = player;
  const room =
    width -
    2 * QUICK_PICKER_STRIP_PAD -
    QUICK_PICKER_OFF_WIDTH -
    QUICK_PICKER_CLOSE_WIDTH -
    2 * CATALOG_GAP;
  const base = Math.min(
    QUICK_PICKER_MAX_STRIP_PORTRAIT,
    Math.max(
      QUICK_PICKER_MIN_STRIP_PORTRAIT,
      Math.round(width * STRIP_PORTRAIT_PER_WIDTH)
    )
  );
  // The largest pictures the room under the controls holds, with the gap
  // above the tray.
  const largestBelow = Math.floor(
    ((roomBelow - QUICK_PICKER_STRIP_GAP - stripHeight(0)) * 8) / 3
  );
  const below = largestBelow >= QUICK_PICKER_MIN_STRIP_PORTRAIT;
  const portrait = stripPortrait(
    room,
    base,
    below
      ? Math.min(QUICK_PICKER_MAX_STRIP_PORTRAIT, largestBelow)
      : QUICK_PICKER_MAX_STRIP_PORTRAIT
  );
  const height = stripHeight(portrait);
  const docks =
    bounds.top + bounds.height - (player.top + player.height) >= height;
  return {
    arrangement: "strip",
    side: below ? "below" : docks ? "dock" : "above",
    height,
    catalog: {
      cols: count,
      rows: 1,
      orientation: "stack",
      portrait,
      gap: CATALOG_GAP,
      fill: false,
    },
    trackWidth: count * (portrait + 2 * INSET) + (count - 1) * CATALOG_GAP,
  };
}

/** Pictures near `base` px wide, at most `largest`, sized so the tiles in
 *  `room` end with about half of one more showing at the edge. */
function stripPortrait(room: number, base: number, largest: number): number {
  let whole = Math.max(1, Math.floor(room / stripTilePitch(base) - 0.5));
  // Pictures held to `largest` would show more of the next tile than half,
  // or all of it: take one more whole tile and make them all smaller.
  while (room / (whole + 0.5) > stripTilePitch(largest)) whole += 1;
  const pitch = room / (whole + 0.5);
  return Math.max(
    QUICK_PICKER_MIN_STRIP_PORTRAIT,
    Math.min(largest, Math.floor(pitch - 2 * INSET - CATALOG_GAP))
  );
}
