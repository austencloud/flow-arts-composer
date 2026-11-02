/**
 * Arrange the quick effect picker that opens from a small player's effect
 * button, so the animation it changes stays in view while you compare looks.
 *
 * - `side`: where the player's workspace has room beside it (laptops,
 *   desktops, a short landscape phone whose player is a small square), the
 *   picker is a panel beside the player holding every effect four across, as
 *   a picture of its look when the panel is tall enough for five rows of them
 *   and as the icon and name otherwise. The panel grows with the player, so
 *   a 4K player does not get a postage-stamp picker, and stands the player's
 *   full height wherever the pictures can share it (`fitEffectCatalog`'s
 *   fill, two across with the name beside each picture where that makes them
 *   larger), instead of a short box at the player's foot. Where the room beside
 *   the player is too narrow for four across (a landscape phone, or a
 *   laptop at 200% zoom), the panel is the player's height and holds two
 *   pictures across that scroll inside it. A player centred in a wide, short
 *   area (an unfolded Fold held sideways) has empty room on both sides of it
 *   that is too narrow for the panel: the player `shift`s sideways into its
 *   own empty room, only as far as the panel needs, so canvas and picker sit
 *   side by side instead of the picker squeezing under the canvas.
 * - `grid`: where the player fills the width (phone and tablet portrait),
 *   the pictures wrap four or more across under an Effects title row that
 *   holds Off and close, in the room under the player that the animation does
 *   not need: a tray floating just under the player's controls where that
 *   room holds the whole grid, otherwise a sheet docked along the bottom of
 *   its bounds over the toolbar there (idle while the picker is open). A
 *   player centred in a tall area has empty room above it (`roomAbove`): the
 *   docked sheet asks the player to `lift` into it, only as far as the whole
 *   grid needs, so a tall phone shows every effect without scrolling and the
 *   animation stays whole above the sheet. Where even that is short of every
 *   row, the pictures shrink (more columns, or smaller pictures in the same
 *   columns, never under the catalog's smallest or too narrow for a name) if
 *   that brings every row into view. Short of that, the lifted player also
 *   `scale`s down from its top edge (only a player with room to lift into),
 *   only as far as every row needs and never under
 *   `QUICK_PICKER_MIN_PLAYER_SCALE` of its size. Only past that does the
 *   grid take the larger room and scroll down inside it, its last row in
 *   view cut to show there is more. The pictures are as large as
 *   `QUICK_PICKER_MAX_STRIP_PORTRAIT` allows, so a tablet gets more columns
 *   rather than a phone's tiles stretched.
 * - `strip`: where the grid would not show more effects at once (too little
 *   room for its title row and a row and a half of pictures, as on a short
 *   phone), pictures in a row that scrolls sideways, led by a slim Off tile,
 *   with the close button a disc in the sheet's top-right corner over the
 *   row's faded end, so neither takes room from the pictures. One row floats
 *   under the controls where the room there holds it (with smaller pictures
 *   if need be). Otherwise the sheet docks along the bottom of its bounds,
 *   and there it takes two rows where they fit: twice as tall, standing on
 *   the bounds' floor and reaching up over the player's control row
 *   (`controls`, which it may `cover`), never over the animation above it.
 *   The controls are not needed while comparing looks. Short of that, one
 *   row docks, and lies over the animation's bottom edge only when neither
 *   the dock nor the narrow side panel fits. The pictures are sized so the
 *   last one in view is cut about in half, which shows the row scrolls.
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
  fitEffectCatalog,
  fitEffectRoster,
  MIN_CATALOG_PORTRAIT,
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
  /** How far the player may move up into empty space above it, so a sheet
   *  docked under it can grow: the room between its top and the top of the
   *  area it is centred in, with the player at rest. 0 when absent. */
  roomAbove?: number;
  /** How far the player may move sideways into empty space beside it, so the
   *  side panel can take the width it gives up: the room between its side and
   *  the side of the area it is centred in, with the player at rest. 0 when
   *  absent. */
  roomBeside?: number;
  /** The height of the player's control row along its bottom edge, which a
   *  docked two-row strip may cover. 0 when absent. */
  controls?: number;
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
      /** The panel's outer height in px where its tiles scroll inside it or
       *  share the player's height (a `fill` catalog), null where it takes
       *  the height they need. */
      height: number | null;
      /** The tiles scroll down inside the panel (the narrow panel). */
      scrolls: boolean;
      /** The side panel never lifts or shrinks the player. */
      lift: 0;
      scale: 1;
      /** How far in px the player moves sideways to make room for the panel,
       *  negative to the left: 0 where the room beside it at rest holds it. */
      shift: number;
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
      /** How far in px the player moves up into the room above it while the
       *  docked sheet is open, so the sheet can be that much taller. 0 where
       *  the grid floats under the controls or needs no more room. */
      lift: number;
      /** How far the lifted player shrinks from its top edge while the
       *  docked sheet is open, 1 where it keeps its size. */
      scale: number;
      /** The grid never moves the player sideways. */
      shift: 0;
    }
  | {
      arrangement: "strip";
      /** Floating under the player's controls, docked along the bottom of
       *  the bounds, or over the animation's bottom edge. */
      side: "below" | "dock" | "above";
      /** The strip's outer height in px. */
      height: number;
      /** The picture tiles, in one row or two. */
      catalog: EffectCatalogFit;
      /** One row of tiles, or two that scroll sideways together. */
      rows: 1 | 2;
      /** How many px of the player's control row the docked sheet stands
       *  over: 0 for one row, or where the room under the player holds it. */
      cover: number;
      /** The width of the tiles' track in px, wider than the strip so it
       *  scrolls. */
      trackWidth: number;
      /** The strip never moves the player. */
      lift: 0;
      scale: 1;
      shift: 0;
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

/** Strip padding and the leading Off tile's width (the touch-target floor).
 *  The close button is a disc in the corner, out of the row. */
export const QUICK_PICKER_STRIP_PAD = 8;
export const QUICK_PICKER_OFF_WIDTH = 44;
/** The strip's close disc, in its top-right corner over the row's end. */
export const QUICK_PICKER_CLOSE_DISC = 32;
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
/** The docked grid shrinks a lifted player no further than this, so the
 *  animation stays the thing you are looking at. */
export const QUICK_PICKER_MIN_PLAYER_SCALE = 0.8;

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
/** The scroll padding at the strip's end: the close disc over it and the
 *  fade (28px) beside the disc, so a tile scrolled into view there is not
 *  hidden under the disc. */
export const QUICK_PICKER_STRIP_END_CLEAR = QUICK_PICKER_CLOSE_DISC + 28;

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
  roomAbove = 0,
  roomBeside = 0,
  controls = 0,
  count,
}: QuickPickerBox): EffectQuickPickerFit {
  const target = Math.min(
    QUICK_PICKER_MAX_SIDE_WIDTH,
    Math.max(
      QUICK_PICKER_SIDE_WIDTH,
      Math.round(player.height * SIDE_WIDTH_PER_PLAYER_HEIGHT)
    )
  );
  const atRest = sideRoom(bounds, player, target);
  if (atRest.width >= QUICK_PICKER_MIN_SIDE_WIDTH) {
    return fitSide(bounds, player, atRest.side, atRest.width, count, 0);
  }

  // The player's own empty room beside it, given up to the panel: it slides
  // left (or right, where only the left takes the panel), only as far as the
  // panel's width needs, and the panel takes the side it slid away from.
  const reach = Math.max(0, Math.floor(roomBeside));
  const slid = (reach > 0 ? (["right", "left"] as const) : []).map((side) => {
    const away = side === "right" ? -1 : 1;
    const atRestWidth = Math.floor(sideWidth(bounds, player, side, target));
    const allWidth = Math.floor(
      sideWidth(
        bounds,
        // Field by field: the player is often a DOMRect, whose fields are
        // getters a spread would drop.
        {
          left: player.left + away * reach,
          top: player.top,
          width: player.width,
          height: player.height,
        },
        side,
        target
      )
    );
    return { side, away, atRestWidth, allWidth };
  });
  const slidFull = slid.find(
    (option) => option.allWidth >= QUICK_PICKER_MIN_SIDE_WIDTH
  );
  if (slidFull) {
    const { side, away, atRestWidth } = slidFull;
    const shift = Math.min(reach, Math.max(0, target - atRestWidth));
    return fitSide(
      bounds,
      player,
      side,
      Math.min(target, atRestWidth + shift),
      count,
      away * shift
    );
  }

  const strip = fitStrip(bounds, player, roomBelow, count);
  const grid = fitGrid(bounds, player, roomBelow, roomAbove, count, strip);
  if (grid) return grid;
  if (strip.arrangement === "strip" && strip.side === "below") return strip;
  const narrow =
    fitNarrowSide(bounds, player, atRest.side, atRest.width, count, 0) ??
    slid
      .map((option) =>
        fitNarrowSide(
          bounds,
          player,
          option.side,
          option.allWidth,
          count,
          option.away * reach
        )
      )
      .find((option) => option !== null);
  return narrow ?? fitTwoRowStrip(bounds, player, controls, count, strip);
}

/** The room for the panel on `side` of `player`, at most `target`. */
function sideWidth(
  bounds: QuickPickerRect,
  player: QuickPickerRect,
  side: "left" | "right",
  target: number
): number {
  const room =
    side === "right"
      ? bounds.left +
        bounds.width -
        (player.left + player.width) -
        QUICK_PICKER_OFFSET -
        QUICK_PICKER_EDGE
      : player.left - bounds.left - QUICK_PICKER_OFFSET - QUICK_PICKER_EDGE;
  return Math.min(target, room);
}

/** The side with room for the panel beside `player` (right when it has the
 *  panel's full width, or at least as much as left), and the panel's width
 *  there, at most `target`. */
function sideRoom(
  bounds: QuickPickerRect,
  player: QuickPickerRect,
  target: number
): { side: "left" | "right"; width: number } {
  const roomRight = sideWidth(bounds, player, "right", Infinity);
  const roomLeft = sideWidth(bounds, player, "left", Infinity);
  const side = roomRight >= target || roomRight >= roomLeft ? "right" : "left";
  return {
    side,
    width: Math.floor(sideWidth(bounds, player, side, target)),
  };
}

/** The side panel `width` px wide: the player's height with the pictures
 *  sharing it where that keeps them at least as large as four across;
 *  otherwise four across, pictures where five rows of them fit the bounds'
 *  height, the icons and names otherwise. */
function fitSide(
  bounds: QuickPickerRect,
  player: QuickPickerRect,
  side: "left" | "right",
  width: number,
  count: number,
  shift: number
): EffectQuickPickerFit {
  const pictures = fitEffectRoster({
    width: width - 2 * QUICK_PICKER_PAD,
    count,
    columns: SIDE_COLUMNS,
  });
  const height = Math.floor(
    Math.min(player.height, bounds.height - 2 * QUICK_PICKER_EDGE)
  );
  const filled = fitEffectCatalog({
    width: width - 2 * QUICK_PICKER_PAD,
    height:
      height -
      2 * QUICK_PICKER_PAD -
      2 * QUICK_PICKER_BORDER -
      QUICK_PICKER_HEAD -
      QUICK_PICKER_HEAD_GAP,
    count,
  });
  // A player shorter than four across needs keeps the taller panel, and a
  // panel too narrow for pictures keeps the icon tiles at their own height.
  if (
    filled &&
    filled.orientation !== "list" &&
    filled.portrait >= (pictures?.portrait ?? 0)
  ) {
    return {
      arrangement: "side",
      side,
      width,
      catalog: filled,
      height,
      scrolls: false,
      lift: 0,
      scale: 1,
      shift,
    };
  }
  const fitsTall =
    !!pictures &&
    sidePanelHeight(pictures, count) <= bounds.height - 2 * QUICK_PICKER_EDGE;
  return {
    arrangement: "side",
    side,
    width,
    catalog: fitsTall ? pictures : null,
    height: null,
    scrolls: false,
    lift: 0,
    scale: 1,
    shift,
  };
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
  count: number,
  shift: number
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
    scrolls: sidePanelHeight(pictures, count) > height,
    lift: 0,
    scale: 1,
    shift,
  };
}

/** The pictures wrapping across the player's width in the room under it, or
 *  null where that shows no more effects at once than `strip` does. It never
 *  covers the animation: it floats under the controls or docks below the
 *  player, so it is only ever as tall as the room there, with the room the
 *  player can lift into above it counted in for the docked sheet. */
function fitGrid(
  bounds: QuickPickerRect,
  player: QuickPickerRect,
  roomBelow: number,
  roomAbove: number,
  count: number,
  strip: EffectQuickPickerFit
): EffectQuickPickerFit | null {
  if (strip.arrangement !== "strip") return null;
  // The panel's padding, and the floating tray's border.
  const inner =
    player.width - 2 * QUICK_PICKER_STRIP_PAD - 2 * QUICK_PICKER_BORDER;
  let largest: EffectCatalogFit | null = null;
  // The most pictures across that stay no larger than the strip's largest,
  // and never fewer than four.
  for (let cols = GRID_MIN_COLUMNS; ; cols++) {
    const next = fitEffectRoster({ width: inner, count, columns: cols });
    if (!next) break;
    largest = next;
    if (next.portrait <= QUICK_PICKER_MAX_STRIP_PORTRAIT) break;
  }
  if (!largest) return null;

  // The floating tray's border runs all round it, the docked sheet's along
  // its top.
  const belowBorder = 2 * QUICK_PICKER_BORDER;
  const dockBorder = QUICK_PICKER_BORDER;
  const roomUnder = Math.floor(roomBelow - QUICK_PICKER_STRIP_GAP);
  const roomDocked = Math.floor(
    bounds.top + bounds.height - (player.top + player.height)
  );
  const reach = Math.max(0, Math.floor(roomAbove));

  /** The tray floating under the controls, holding `catalog` whole. */
  const floating = (catalog: EffectCatalogFit): GridPick => ({
    side: "below",
    catalog,
    height: Math.ceil(gridPanelHeight(catalog) + belowBorder),
    lift: 0,
    scale: 1,
  });
  /** The docked sheet holding `catalog` whole, and the lift that takes. */
  const docked = (catalog: EffectCatalogFit): GridPick => {
    const height = Math.ceil(gridPanelHeight(catalog) + dockBorder);
    return {
      side: "dock",
      catalog,
      height,
      lift: Math.max(0, height - roomDocked),
      scale: 1,
    };
  };

  let pick: GridPick;
  const dockedLargest = docked(largest);
  if (gridPanelHeight(largest) + belowBorder <= roomUnder) {
    pick = floating(largest);
  } else if (dockedLargest.lift <= reach) {
    pick = dockedLargest;
  } else {
    // Smaller pictures that bring every row into view, floating with no lift
    // or docked with the player lifted as far as it can go; the larger
    // pictures win.
    const below = wholeGrid(inner, count, largest, roomUnder - belowBorder);
    const dock = wholeGrid(
      inner,
      count,
      largest,
      roomDocked + reach - dockBorder
    );
    // The player lifted all the way and shrunk from its top edge by as much
    // as the rest of the sheet needs: the bottom of its controls rises by
    // the share of its height it gives up. Only a player that can move (room
    // above it) shrinks; one held in place keeps its size.
    const shortfall = dockedLargest.height - roomDocked - reach;
    const scale =
      reach > 0 && player.height > 0
        ? Math.floor((1 - shortfall / player.height) * 1000) / 1000
        : 0;
    if (below && (!dock || below.portrait >= dock.portrait)) {
      pick = floating(below);
    } else if (dock) {
      pick = docked(dock);
    } else if (scale >= QUICK_PICKER_MIN_PLAYER_SCALE) {
      pick = { ...dockedLargest, lift: reach, scale };
    } else {
      // No room holds every row: the larger room, the player lifted all the
      // way for the docked sheet, and the grid scrolls.
      const roomLifted = roomDocked + reach;
      pick =
        roomUnder >= roomLifted
          ? {
              side: "below",
              catalog: largest,
              height: roomUnder,
              lift: 0,
              scale: 1,
            }
          : {
              side: "dock",
              catalog: largest,
              height: roomLifted,
              lift: reach,
              scale: 1,
            };
    }
  }

  const { side, catalog, height, lift, scale } = pick;
  const tile = pictureTileHeight(catalog.portrait);
  const full =
    gridPanelHeight(catalog) + (side === "below" ? belowBorder : dockBorder);
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
  // Against the one-row strip: two rows are a short phone's way of using
  // the room the grid cannot.
  const inStrip = Math.floor(
    (stripRoom(player.width) + CATALOG_GAP) /
      stripTilePitch(strip.catalog.portrait)
  );
  if (inGrid <= inStrip) return null;

  return {
    arrangement: "grid",
    side,
    height,
    catalog,
    scrolls,
    lift,
    scale,
    shift: 0,
  };
}

interface GridPick {
  side: "below" | "dock";
  catalog: EffectCatalogFit;
  height: number;
  lift: number;
  scale: number;
}

/** The largest pictures, no larger than `largest`'s, whose grid puts every
 *  row in a panel `room` px tall (its border aside): as many columns as
 *  `largest` or more, each picture as wide as its column allows or narrower,
 *  never under the catalog's smallest picture or too narrow for a name. Null
 *  where none fits. */
function wholeGrid(
  inner: number,
  count: number,
  largest: EffectCatalogFit,
  room: number
): EffectCatalogFit | null {
  let best: EffectCatalogFit | null = null;
  for (let cols = largest.cols; ; cols++) {
    const roster = fitEffectRoster({ width: inner, count, columns: cols });
    if (!roster) break;
    const fixed =
      2 * QUICK_PICKER_STRIP_PAD +
      QUICK_PICKER_HEAD +
      QUICK_PICKER_HEAD_GAP +
      (roster.rows - 1) * roster.gap;
    // A tile's height grows with its picture's width by 3/8: solve for the
    // widest picture whose rows fit.
    const tileRoom = (room - fixed) / roster.rows;
    const portrait = Math.min(
      largest.portrait,
      roster.portrait,
      Math.floor(((tileRoom - pictureTileHeight(0)) * 8) / 3)
    );
    if (portrait < MIN_CATALOG_PORTRAIT) continue;
    if (best && portrait <= best.portrait) continue;
    best = { ...roster, portrait };
  }
  return best;
}

/** The width of the strip's row of pictures: the player's width less the
 *  strip's padding and the Off tile leading the row. */
function stripRoom(width: number): number {
  return (
    width - 2 * QUICK_PICKER_STRIP_PAD - QUICK_PICKER_OFF_WIDTH - CATALOG_GAP
  );
}

/** The pictures' width before the peek adjustment. */
function stripBase(width: number): number {
  return Math.min(
    QUICK_PICKER_MAX_STRIP_PORTRAIT,
    Math.max(
      QUICK_PICKER_MIN_STRIP_PORTRAIT,
      Math.round(width * STRIP_PORTRAIT_PER_WIDTH)
    )
  );
}

type StripFit = Extract<EffectQuickPickerFit, { arrangement: "strip" }>;

/** The one-row strip. */
function fitStrip(
  bounds: QuickPickerRect,
  player: QuickPickerRect,
  roomBelow: number,
  count: number
): StripFit {
  const { width } = player;
  const room = stripRoom(width);
  // The largest pictures the room under the controls holds, with the gap
  // above the tray.
  const largestBelow = Math.floor(
    ((roomBelow - QUICK_PICKER_STRIP_GAP - stripHeight(0)) * 8) / 3
  );
  const below = largestBelow >= QUICK_PICKER_MIN_STRIP_PORTRAIT;
  const portrait = stripPortrait(
    room,
    stripBase(width),
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
    rows: 1,
    cover: 0,
    trackWidth: trackWidth(count, portrait),
    lift: 0,
    scale: 1,
    shift: 0,
  };
}

/**
 * Two rows of pictures in the docked sheet, where the one-row strip would
 * dock or lie over the animation: the sheet stands on the bounds' floor and
 * may reach up over the player's control row, never above it. Two rows go
 * for more effects at once rather than larger pictures: one more tile across
 * than the one row shows, still cut about in half at the end, where that
 * keeps the pictures at the catalog's smallest (56px) or larger. On a 375x667
 * phone that is three and a half 56px pictures a row where one row held two
 * and a half 88px ones, and a sheet short enough to leave most of the control
 * row in view. Two rows may go under the one row's 64px floor for this, down
 * to the catalog's 56px, and shrink no further to fit the room: the one-row
 * strip where even that does not fit.
 */
function fitTwoRowStrip(
  bounds: QuickPickerRect,
  player: QuickPickerRect,
  controls: number,
  count: number,
  oneRow: StripFit
): StripFit {
  // Floating under the controls, one row covers nothing it needs to.
  if (oneRow.side === "below" || count < 2) return oneRow;
  const roomDocked = Math.floor(
    bounds.top + bounds.height - (player.top + player.height)
  );
  const reach = roomDocked + Math.max(0, Math.floor(controls));
  // Padding, the gap between the rows, and the sheet's top border.
  const fixed = 2 * QUICK_PICKER_STRIP_PAD + CATALOG_GAP + QUICK_PICKER_BORDER;
  const tallest = Math.floor(
    (((reach - fixed) / 2 - pictureTileHeight(0)) * 8) / 3
  );
  if (tallest < MIN_CATALOG_PORTRAIT) return oneRow;
  const room = stripRoom(player.width);
  const whole = Math.floor(room / stripTilePitch(oneRow.catalog.portrait));
  const denser = Math.floor(room / (whole + 1.5) - 2 * INSET - CATALOG_GAP);
  let portrait = Math.min(
    denser >= MIN_CATALOG_PORTRAIT ? denser : oneRow.catalog.portrait,
    tallest
  );
  // Pictures shrunk to fit can leave the last tile in view nearly whole, or
  // barely showing: size them again for the half-cut tile, no larger.
  const inView = room / stripTilePitch(portrait);
  const peek = inView - Math.floor(inView);
  if (peek < 0.25 || peek > 0.75) {
    portrait = stripPortrait(
      room,
      stripBase(player.width),
      portrait,
      MIN_CATALOG_PORTRAIT
    );
  }
  const height = Math.ceil(fixed + 2 * pictureTileHeight(portrait));
  if (height > reach) return oneRow;
  const cols = Math.ceil(count / 2);
  return {
    arrangement: "strip",
    side: "dock",
    height,
    catalog: {
      cols,
      rows: 2,
      orientation: "stack",
      portrait,
      gap: CATALOG_GAP,
      fill: false,
    },
    rows: 2,
    cover: Math.max(0, height - roomDocked),
    trackWidth: trackWidth(cols, portrait),
    lift: 0,
    scale: 1,
    shift: 0,
  };
}

/** The width of `cols` tiles of pictures `portrait` px wide, side by side. */
function trackWidth(cols: number, portrait: number): number {
  return cols * (portrait + 2 * INSET) + (cols - 1) * CATALOG_GAP;
}

/** Pictures near `base` px wide, at most `largest` and at least `least`,
 *  sized so the tiles in `room` end with about half of one more showing at
 *  the edge. */
function stripPortrait(
  room: number,
  base: number,
  largest: number,
  least = QUICK_PICKER_MIN_STRIP_PORTRAIT
): number {
  let whole = Math.max(1, Math.floor(room / stripTilePitch(base) - 0.5));
  // Pictures held to `largest` would show more of the next tile than half,
  // or all of it: take one more whole tile and make them all smaller.
  while (room / (whole + 0.5) > stripTilePitch(largest)) whole += 1;
  const pitch = room / (whole + 0.5);
  return Math.max(
    least,
    Math.min(largest, Math.floor(pitch - 2 * INSET - CATALOG_GAP))
  );
}
