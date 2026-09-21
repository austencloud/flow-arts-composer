/**
 * Pictograph Coordinator Contract
 *
 * Single responsibility service for coordinating pictograph lifecycle.
 * Orchestrates loading, positioning, and rendering coordination.
 */

import type { ArrowLifecycleResult } from "../../arrow/orchestration/domain/arrow-models";

export interface PictographRenderingState {
  readonly arrowLifecycleResult: ArrowLifecycleResult;
  readonly isReady: boolean;
  readonly errors: string[];
}

/**
 * Pictograph Coordinator - Single point of coordination for pictograph lifecycle
 */

/**
 * PictographPreparer - Contract for pictograph preparation
 *
 * Prepares pictographs with pre-calculated positions for efficient rendering.
 * Used before rendering to eliminate per-component async calculations.
 */

import type { PreparedPictographData } from "../domain/models/prepared-pictograph-data";
import type { ThemeMode } from "../../../utils/svg-color-utils";
import type { PropType } from "../../prop/domain/enums/prop-type";
import type { FanAppearance } from "../../prop/domain/fan-appearance";
import type { PropLook } from "../../prop/domain/prop-look";

// Re-export for convenience
export type { PreparedPictographData };

/**
 * Options for pictograph preparation
 */
export interface PrepareOptions {
  /** Theme mode for color selection ("dark" or "light"). If not provided, uses global state. */
  themeMode?: ThemeMode;
  /**
   * Physical fan build drawn for fan-family props. The pictographs draw the
   * same build the animator and the 3D scene show. Omitted means the
   * notation fan artwork.
   */
  fanAppearance?: FanAppearance;
  /**
   * The chosen artwork for non-fan props. The live workspace supplies this;
   * exporters retain their explicit rendering policy unless they opt in.
   */
  propLook?: PropLook;
  /**
   * Explicit prop type for the performer's left hand.
   * When provided, this value is used directly. When omitted, falls back to global settings.
   * Export/thumbnail rendering always provides this to ensure consistency during async operations.
   */
  leftPropType?: PropType;
  /**
   * Explicit prop type for the performer's right hand.
   * When provided, this value is used directly. When omitted, falls back to global settings.
   */
  rightPropType?: PropType;
  /**
   * Load grid-centered prop SVGs (from props/animated/) instead of pictograph versions (from props/).
   * Grid versions use the ghost-half centering strategy - designed for the animation canvas.
   * Pictograph versions (props/) are sized for pictograph grid rendering.
   * Defaults to false - pictographs use the non-animated versions.
   * Set to true only for animation canvas rendering.
   */
  useGridVersion?: boolean;

  /** When true, transforms motions for hand path visualization:
   *  pro/anti → float, propType → HAND, orientation → null. */
  handPathMode?: boolean;

  /** When false, the left prop is hidden at render time - suppresses beta offset
   *  for the right prop since there is no collision partner to avoid. Undefined/true
   *  means visible (both props rendered, full beta offset applied). */
  showLeftMotion?: boolean;
  /** When false, the right prop is hidden at render time - suppresses beta offset
   *  for the left prop. Undefined/true means visible. */
  showRightMotion?: boolean;

  /**
   * Chirality of the left buugeng-family prop (buugeng / bigbuugeng / trigeng).
   * True = the SVG is mirrored (scaleX(-1)) at render time.
   * Beta offset reads this: two buugeng of OPPOSITE chirality nest into an
   * infinity symbol and must stay on the same hand point, so they get no
   * separation offset. Same chirality does not nest, so the two ends are only
   * legible when the props are separated.
   */
  leftBuugengFlipped?: boolean;
  /** Chirality of the right buugeng-family prop. See leftBuugengFlipped. */
  rightBuugengFlipped?: boolean;
}
