/**
 * Hands hold no prop to spin, so a pictograph whose two props are both hands
 * draws each hand's path: a pro or anti shift becomes a float ("fl") along the
 * hand's own rotation, and a dash loses its turns.
 */
import type { HandPath } from "../types.js";

export interface HandPathMotionInput {
  motionType: string;
  startLocation: string;
  endLocation: string;
}

/** The fields a hand-path pictograph replaces on one motion. */
export interface HandPathMotionOverrides {
  motionType?: "float";
  turns?: "fl" | 0;
  handPath?: HandPath | null;
  rotationDirection?: "cw" | "ccw" | "noRotation";
  startOrientation?: "in";
  endOrientation?: "in";
  propType: "hand";
}

/** Both props are hands, so the pictograph draws hand paths. */
export function drawsHandPaths(
  leftPropType: string | null | undefined,
  rightPropType: string | null | undefined
): boolean {
  return leftPropType === "hand" && rightPropType === "hand";
}

const CW_PAIRS = new Set(["s_w", "w_n", "n_e", "e_s", "ne_se", "se_sw", "sw_nw", "nw_ne"]);
const CCW_PAIRS = new Set(["w_s", "n_w", "e_n", "s_e", "ne_nw", "nw_sw", "sw_se", "se_ne"]);
const DASH_PAIRS = new Set(["s_n", "w_e", "n_s", "e_w", "ne_sw", "se_nw", "sw_ne", "nw_se"]);
const POSITION_ORDER: Record<string, number> = {
  n: 0,
  ne: 1,
  e: 2,
  se: 3,
  s: 4,
  sw: 5,
  w: 6,
  nw: 7,
};

/** Which way the hand itself travels between two locations. */
export function deriveShiftHandPath(
  startLocation: string,
  endLocation: string
): HandPath | null {
  const s = startLocation.toLowerCase();
  const e = endLocation.toLowerCase();
  if (s === e) return "static";
  const key = `${s}_${e}`;
  if (CW_PAIRS.has(key)) return "cw";
  if (CCW_PAIRS.has(key)) return "ccw";
  if (DASH_PAIRS.has(key)) return "dash";
  // Skewed and cross-grid pairs take the shorter arc around the grid.
  const startIndex = POSITION_ORDER[s];
  const endIndex = POSITION_ORDER[e];
  if (startIndex === undefined || endIndex === undefined) return null;
  const clockwiseSteps = (((endIndex - startIndex) % 8) + 8) % 8;
  if (clockwiseSteps > 0 && clockwiseSteps < 4) return "cw";
  if (clockwiseSteps > 4) return "ccw";
  return "dash";
}

/** What one motion becomes when the pictograph draws hand paths. */
export function handPathMotionOverrides(
  motion: HandPathMotionInput
): HandPathMotionOverrides {
  if (motion.motionType === "pro" || motion.motionType === "anti") {
    const handPath = deriveShiftHandPath(motion.startLocation, motion.endLocation);
    // Orientations stay radial (IN) rather than blanked: placement keys off
    // them, and IN is what hand start positions carry.
    return {
      motionType: "float",
      turns: "fl",
      handPath,
      rotationDirection:
        handPath === "cw" ? "cw" : handPath === "ccw" ? "ccw" : "noRotation",
      startOrientation: "in",
      endOrientation: "in",
      propType: "hand",
    };
  }
  if (motion.motionType === "dash") {
    return { turns: 0, rotationDirection: "noRotation", propType: "hand" };
  }
  return { propType: "hand" };
}
