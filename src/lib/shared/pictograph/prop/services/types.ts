/**
 * Prop Placement Service Interface
 *
 * Calculates prop placement data for pictograph rendering.
 */

/** Motion visibility passed into placement so that a hidden partner suppresses
 *  this prop's beta offset (no collision → no offset needed). Omitted fields
 *  default to visible. */
export interface PropPlacementVisibility {
  showLeft?: boolean;
  showRight?: boolean;
}

/**
 * Prop SVG Loader Interface
 *
 * Fast, direct SVG loading for props - mirrors arrow loading approach
 */

import type { ThemeMode } from "../../../utils/svg-color-utils";
import type { FanAppearance } from "../domain/fan-appearance";
import type { PropLook } from "../domain/prop-look";

/**
 * Options for prop SVG loading
 */
export interface PropSvgLoadOptions {
  /** Theme mode for color selection ("dark" or "light"). If not provided, uses global state. */
  themeMode?: ThemeMode;
  /**
   * Which physical fan build to draw for fan-family props. Omitted or the
   * Pictograph build keeps the notation artwork. Ignored for other props.
   */
  fanAppearance?: FanAppearance;
  /**
   * The selected non-fan artwork family. Model sprites are already lit for
   * each hand, so the loader must preserve their authored pixels.
   */
  propLook?: PropLook;
}
