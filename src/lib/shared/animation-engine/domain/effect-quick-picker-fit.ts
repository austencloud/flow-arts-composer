/**
 * Arrange the quick effect picker that opens from a small player's effect
 * button, so the animation it changes stays in view while you compare looks.
 *
 * - `side`: where the player's workspace has room beside it (laptops,
 *   desktops, a short landscape phone whose player is a small square), the
 *   picker is a panel beside the player holding every effect four across, as
 *   a picture of its look when the panel is tall enough for five rows of them
 *   and as the icon and name otherwise. The panel grows with the player, so
 *   a 4K player does not get a postage-stamp picker.
 * - `strip`: where the player fills the width (phone and tablet portrait),
 *   one scrolling row of pictures sits on the player's bottom edge, just above
 *   its controls, and covers only that edge of the animation. The pictures
 *   are sized so the last one in view is cut about in half, which shows the
 *   row scrolls.
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
  /** The area the picker stays inside, in viewport pixels: the player's
   *  workspace, so it never covers the app's sidebar or toolbars. */
  bounds: QuickPickerRect;
  /** The player the picker changes, in viewport pixels. */
  player: QuickPickerRect;
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
    }
  | {
      arrangement: "strip";
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
/** The side panel's width as a share of the player's height. */
const SIDE_WIDTH_PER_PLAYER_HEIGHT = 0.3;
/** EffectSelector's icon tile: 48px tall, 6px apart. */
export const QUICK_PICKER_ICON_TILE = 48;
const ICON_GAP = 6;
const SIDE_COLUMNS = 4;

/** Strip padding and the leading Off tile's width. */
export const QUICK_PICKER_STRIP_PAD = 8;
export const QUICK_PICKER_OFF_WIDTH = 64;
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

/** The strip's outer height for pictures `portrait` px wide. */
export function stripHeight(portrait: number): number {
  return 2 * QUICK_PICKER_STRIP_PAD + pictureTileHeight(portrait);
}

export function fitEffectQuickPicker({
  bounds,
  player,
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
    };
  }

  return fitStrip(player.width, count);
}

function fitStrip(width: number, count: number): EffectQuickPickerFit {
  const room =
    width - 2 * QUICK_PICKER_STRIP_PAD - QUICK_PICKER_OFF_WIDTH - CATALOG_GAP;
  const base = Math.min(
    QUICK_PICKER_MAX_STRIP_PORTRAIT,
    Math.max(
      QUICK_PICKER_MIN_STRIP_PORTRAIT,
      Math.round(width * STRIP_PORTRAIT_PER_WIDTH)
    )
  );
  const basePitch = base + 2 * INSET + CATALOG_GAP;
  // Whole tiles in view, leaving about half of one more showing at the edge.
  const whole = Math.max(1, Math.floor(room / basePitch - 0.5));
  const pitch = room / (whole + 0.5);
  const portrait = Math.max(
    QUICK_PICKER_MIN_STRIP_PORTRAIT,
    Math.min(
      QUICK_PICKER_MAX_STRIP_PORTRAIT,
      Math.floor(pitch - 2 * INSET - CATALOG_GAP)
    )
  );
  const tile = portrait + 2 * INSET;
  return {
    arrangement: "strip",
    catalog: {
      cols: count,
      rows: 1,
      orientation: "stack",
      portrait,
      gap: CATALOG_GAP,
      fill: false,
    },
    trackWidth: count * tile + (count - 1) * CATALOG_GAP,
  };
}
