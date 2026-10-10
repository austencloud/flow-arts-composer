/**
 * SVG Generator Service Contract
 *
 * Handles generation of SVG strings for grid and prop staffs.
 */

import type { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import type { PropSpriteSide } from "#lib/shared/pictograph/prop/domain/prop-look.js";
import type { PropSvgData } from "#lib/shared/animation-engine/domain/types/svg-types.js";
import type { ThemeMode } from "#lib/shared/utils/svg-color-utils.js";

export type { PropSvgData } from "#lib/shared/animation-engine/domain/types/svg-types.js";

export interface ISVGGenerator {
  /**
   * Generate grid SVG
   * @param gridMode - Type of grid to generate (GridMode.DIAMOND or GridMode.BOX)
   */
  generateGridSvg(gridMode?: GridMode): Promise<string>;

  /**
   * Generate prop SVG with custom color
   * @param propType - Type of prop to generate (default: "staff")
   * @param color - Hex color for the prop
   * @returns PropSvgData with SVG string and viewBox dimensions
   */
  generatePropSvg(
    propType: string,
    color: string,
    themeMode?: ThemeMode,
    side?: PropSpriteSide
  ): Promise<PropSvgData>;

  /**
   * Generate blue prop SVG with dynamic prop type
   * @param propType - Type of prop to generate (default: "staff")
   * @param darkMode - When provided, uses this instead of global dark mode state
   * @returns PropSvgData with SVG string and viewBox dimensions
   */
  generateLeftPropSvg(propType?: string, darkMode?: boolean): Promise<PropSvgData>;

  /**
   * Generate red prop SVG with dynamic prop type
   * @param propType - Type of prop to generate (default: "staff")
   * @param darkMode - When provided, uses this instead of global dark mode state
   * @returns PropSvgData with SVG string and viewBox dimensions
   */
  generateRightPropSvg(propType?: string, darkMode?: boolean): Promise<PropSvgData>;

  /**
   * Generate blue staff SVG
   * @deprecated Use generateBluePropSvg instead
   */
  generateLeftStaffSvg(): string;

  /**
   * Generate red staff SVG
   * @deprecated Use generateRedPropSvg instead
   */
  generateRightStaffSvg(): string;
}
