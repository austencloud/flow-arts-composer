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
import type { MotionData } from "../../shared/domain/models/motion-data";
import { getMotionColor } from "../../../utils/svg-color-utils";
import { HandSide } from "../../shared/domain/enums/pictograph-enums";

export type TurnNumberColor = string; // Color hex string from getMotionColor

export interface TurnColors {
  top: TurnNumberColor;
  bottom: TurnNumberColor;
}

type LetterType =
  | "TYPE1_HYBRID"
  | "TYPE1_NON_HYBRID"
  | "TYPE2"
  | "TYPE3"
  | "TYPE4"
  | "TYPE5"
  | "TYPE6";

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

function determineLetterType(letter: string): LetterType {
  if (["Φ-", "Ψ-", "Λ-"].includes(letter)) return "TYPE5";
  if (["α", "β", "γ"].includes(letter)) return "TYPE6";
  if (letter.endsWith("-")) return "TYPE3";
  if (["Φ", "Ψ", "Λ"].includes(letter)) return "TYPE4";
  if (["W", "X", "Y", "Z", "Σ", "Δ", "Θ", "Ω"].includes(letter)) return "TYPE2";
  if (["C", "F", "I", "L", "O", "R", "U", "V"].includes(letter))
    return "TYPE1_HYBRID";
  return "TYPE1_NON_HYBRID";
}

function getActualMotionType(motion: MotionData): string {
  const motionType = (motion as unknown as Record<string, unknown>).motionType;
  const motionTypeStr =
    typeof motionType === "string" ? motionType.toLowerCase() : "";

  if (motionTypeStr === "float") {
    const prefloatType = (motion as unknown as Record<string, unknown>)
      .prefloatMotionType;
    if (typeof prefloatType === "string") {
      return prefloatType.toLowerCase();
    }
  }
  return motionTypeStr;
}

function isShiftMotion(motion: MotionData): boolean {
  const motionType = (motion as unknown as Record<string, unknown>).motionType;
  const motionTypeStr =
    typeof motionType === "string" ? motionType.toLowerCase() : "";
  return ["pro", "anti", "float"].includes(motionTypeStr);
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

  const letterType = determineLetterType(letter);
  const leftMotion = pictographData.motions.left;
  const rightMotion = pictographData.motions.right;

  if (!leftMotion || !rightMotion) {
    return { top: BLUE_HEX, bottom: RED_HEX };
  }

  const colorOf = (motion: MotionData): TurnNumberColor =>
    motion === leftMotion ? BLUE_HEX : RED_HEX;

  switch (letterType) {
    case "TYPE2": {
      const shiftMotion = isShiftMotion(leftMotion) ? leftMotion : rightMotion;
      const staticMotion = isShiftMotion(leftMotion) ? rightMotion : leftMotion;
      return {
        top: colorOf(shiftMotion),
        bottom: colorOf(staticMotion),
      };
    }

    case "TYPE1_HYBRID": {
      const leftActualType = getActualMotionType(leftMotion);
      const proMotion = leftActualType === "pro" ? leftMotion : rightMotion;
      const antiMotion = leftActualType === "anti" ? leftMotion : rightMotion;
      return {
        top: colorOf(proMotion),
        bottom: colorOf(antiMotion),
      };
    }

    case "TYPE3": {
      const leftIsDash = leftMotion.motionType.toLowerCase() === "dash";
      const shiftMotion = leftIsDash ? rightMotion : leftMotion;
      const dashMotion = leftIsDash ? leftMotion : rightMotion;
      return {
        top: colorOf(shiftMotion),
        bottom: colorOf(dashMotion),
      };
    }

    case "TYPE4": {
      const leftIsDash = leftMotion.motionType.toLowerCase() === "dash";
      const dashMotion = leftIsDash ? leftMotion : rightMotion;
      const staticMotion = leftIsDash ? rightMotion : leftMotion;
      return {
        top: colorOf(dashMotion),
        bottom: colorOf(staticMotion),
      };
    }

    case "TYPE5":
    case "TYPE6":
    default: {
      return {
        top: BLUE_HEX,
        bottom: RED_HEX,
      };
    }
  }
}
