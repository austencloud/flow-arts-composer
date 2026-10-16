/** The size and hand colours every pictograph shares. */
import { BLUE_COLOR_DARK, BLUE_COLOR_LIGHT, RED_COLOR_DARK, RED_COLOR_LIGHT } from "@tka/render-core";
import type { HandColorPair } from "./types.js";

/** Pictographs are drawn in a 950 by 950 viewBox. */
export const VIEWBOX_SIZE = 950;

/** A hand's TKA color: blue left, red right, unless custom colors are given. */
export function resolveMotionColor(
  hand: "left" | "right",
  darkMode: boolean,
  customColors?: HandColorPair | null
): string {
  if (customColors) return customColors[hand];
  if (hand === "left") return darkMode ? BLUE_COLOR_DARK : BLUE_COLOR_LIGHT;
  return darkMode ? RED_COLOR_DARK : RED_COLOR_LIGHT;
}
