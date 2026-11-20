/**
 * Which painting an effect picture gets for the width it is shown at. A small
 * picture (the phone grid at 52 to 69 wide, the viewer tray's 74, the desktop
 * panel's 88) gets the tile format, painted for it with fewer, bolder marks; a
 * big look card keeps the 720x270 card. One rule for every host of
 * `EffectPresetThumbnail`, so two lists cannot disagree about what "small" is.
 */
import type { TileFormat } from "./thumbnails/tile-format";

/** Pictures up to this wide (CSS px) are painted for it (the small tile format). */
export const SMALL_PICTURE_MAX = 130;

export function formatForPictureWidth(
  width: number
): Extract<TileFormat, "tile" | "card"> {
  return width > 0 && width <= SMALL_PICTURE_MAX ? "tile" : "card";
}
