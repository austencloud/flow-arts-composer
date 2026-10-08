/**
 * Turn Color Interpreter
 *
 * Determines which color (blue or red) to apply to top and bottom turn numbers
 * based on the letter type and motion arrangement.
 *
 * Color is determined by which performer hand ("left"/"right") owns the
 * motion in pictographData.motions. The canonical palette then maps left to
 * blue and right to red.
 *
 * Ported from legacy TurnsTupleInterpreter logic.
 */

import type { PictographData } from "../../shared/domain/models/pictograph-data";
import { turnsColumnHands } from "@tka/render-core";
import { getMotionColor } from "../../../utils/svg-color-utils";
import { HandSide } from "../../shared/domain/enums/pictograph-enums";

export type TurnNumberColor = string; // Color hex string from getMotionColor

export interface TurnColors {
  top: TurnNumberColor;
  bottom: TurnNumberColor;
}

export const BLUE_HEX: TurnNumberColor = getMotionColor(HandSide.LEFT, "dark");
export const RED_HEX: TurnNumberColor = getMotionColor(HandSide.RIGHT, "dark");

/**
 * The interpreter's colors name a hand; the hex is always the dark-theme one.
 * Resolve it to the palette of the theme being drawn so light-mode turn
 * numbers match the light-mode arrows and props, as TurnsColumn.svelte does.
 */
export function resolveTurnColor(
  color: TurnNumberColor,
  isDarkMode: boolean
): string {
  const mode = isDarkMode ? "dark" : "light";
  if (color === BLUE_HEX) return getMotionColor(HandSide.LEFT, mode);
  if (color === RED_HEX) return getMotionColor(HandSide.RIGHT, mode);
  return color;
}

/** Which hand an interpreter color stands for. Red is the right hand; everything else is left. */
export function turnColorHand(interpreterColor: TurnNumberColor): HandSide {
  return interpreterColor.toLowerCase() === RED_HEX.toLowerCase()
    ? HandSide.RIGHT
    : HandSide.LEFT;
}

/**
 * The paint color for a turn number. `interpretTurnColors` only says which
 * hand owns a number (as the dark-palette hex); the pixels must use the same
 * color the prop and arrow of that hand use, which is the theme palette or the
 * user prop color override. Every renderer that paints turn numbers goes
 * through here so the digits never drift from the hand they belong to.
 */
export function resolveTurnDisplayColor(
  interpreterColor: TurnNumberColor,
  isDarkMode: boolean,
  primaryPropColors?: { left: string; right: string } | null
): string {
  const hand = turnColorHand(interpreterColor);
  return (
    primaryPropColors?.[hand] ?? getMotionColor(hand, isDarkMode ? "dark" : "light")
  );
}

/**
 * Determine the colors for top and bottom turn numbers.
 *
 * Color assignment is based on which canonical motions key ("left"/"right")
 * the motion was extracted from, not on duplicated presentation metadata.
 */
export function interpretTurnColors(
  letter: string | null | undefined,
  pictographData?: PictographData | null
): TurnColors {
  if (!letter || !pictographData) {
    return { top: BLUE_HEX, bottom: RED_HEX };
  }

  const leftMotion = pictographData.motions.left;
  const rightMotion = pictographData.motions.right;

  if (!leftMotion || !rightMotion) {
    return { top: BLUE_HEX, bottom: RED_HEX };
  }

  // The slot order is shared with the MCP renderers.
  const hands = turnsColumnHands(letter, leftMotion, rightMotion);
  return {
    top: hands.top === "left" ? BLUE_HEX : RED_HEX,
    bottom: hands.bottom === "left" ? BLUE_HEX : RED_HEX,
  };
}
