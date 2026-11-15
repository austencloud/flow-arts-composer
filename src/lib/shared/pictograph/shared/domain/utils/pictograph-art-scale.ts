import {
  SMALL_PICTOGRAPH_ART_HYSTERESIS,
  SMALL_PICTOGRAPH_ART_MAX_SIZE,
} from "../constants/pictograph-legibility";

/**
 * Whether a live pictograph of this width draws its small art.
 *
 * A pictograph goes small under 176px and comes back at 184px or more, so a
 * cell sitting on the 180px line keeps whichever art it already had. A width
 * of zero (not laid out, display: none) is no evidence either way.
 */
export function isSmallPictographArt(
  width: number,
  wasSmall: boolean
): boolean {
  if (!(width > 0)) return wasSmall;
  return wasSmall
    ? width < SMALL_PICTOGRAPH_ART_MAX_SIZE + SMALL_PICTOGRAPH_ART_HYSTERESIS
    : width < SMALL_PICTOGRAPH_ART_MAX_SIZE - SMALL_PICTOGRAPH_ART_HYSTERESIS;
}
