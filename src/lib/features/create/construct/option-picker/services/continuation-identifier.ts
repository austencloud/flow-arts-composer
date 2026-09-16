/**
 * Continuation Identifier
 *
 * Identifies which candidate pictograph continues the shift direction
 * of each hand from a reference beat. A "continuation" is the option
 * where every shifting hand keeps going the same way around the grid
 * (CW or CCW).
 */

import { GridLocation } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { MotionType } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import type { Motion } from "@tka/tka-types";
import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";

type ShiftDirection = "cw" | "ccw" | null;

/**
 * Ordered grid points for clockwise traversal on the diamond grid.
 * N -> E -> S -> W -> N
 */
const DIAMOND_CW_ORDER: GridLocation[] = [
  GridLocation.NORTH,
  GridLocation.EAST,
  GridLocation.SOUTH,
  GridLocation.WEST,
];

/**
 * Ordered grid points for clockwise traversal on the box grid.
 * NE -> SE -> SW -> NW -> NE
 */
const BOX_CW_ORDER: GridLocation[] = [
  GridLocation.NORTHEAST,
  GridLocation.SOUTHEAST,
  GridLocation.SOUTHWEST,
  GridLocation.NORTHWEST,
];

function getCWOrder(start: GridLocation): GridLocation[] {
  if (DIAMOND_CW_ORDER.includes(start)) return DIAMOND_CW_ORDER;
  if (BOX_CW_ORDER.includes(start)) return BOX_CW_ORDER;
  return [];
}

/**
 * Determine the shift direction of a single hand motion.
 *
 * Returns "cw" if the hand moves to the next CW location,
 * "ccw" if it moves to the previous (CCW) location,
 * or null if the motion is not a shift (dash/static) or is ambiguous
 * (opposite-location movement like N->S which is 2 steps in either direction).
 */
function deriveShiftDirection(motion: Motion): ShiftDirection {
  // Dashes and statics don't shift
  if (
    motion.motionType === MotionType.DASH ||
    motion.motionType === MotionType.STATIC
  ) {
    return null;
  }

  // Same start and end means no shift
  if (motion.startLocation === motion.endLocation) {
    return null;
  }

  const order = getCWOrder(motion.startLocation);
  if (order.length === 0) return null;

  const startIdx = order.indexOf(motion.startLocation);
  const endIdx = order.indexOf(motion.endLocation);

  // End location not found in same grid system
  if (startIdx === -1 || endIdx === -1) return null;

  const len = order.length;
  const cwStep = (endIdx - startIdx + len) % len;

  // 1 step forward = CW
  if (cwStep === 1) return "cw";

  // 1 step backward = CCW (which is len-1 steps forward)
  if (cwStep === len - 1) return "ccw";

  // 2 steps = opposite location (ambiguous) or any other distance
  return null;
}

/**
 * Score a candidate based on how many of its shifting hands match
 * the reference directions.
 *
 * - A matching shift hand = +1
 * - A non-shift hand paired with a non-shift reference = neutral (no penalty, no bonus)
 * - A mismatching shift direction = 0 total (disqualified)
 */
function scoreCandidate(
  candidate: PictographData,
  refLeftDir: ShiftDirection,
  refRightDir: ShiftDirection
): number {
  let score = 0;

  const candLeft = candidate.motions.left;
  const candRight = candidate.motions.right;

  // Score blue hand
  if (refLeftDir !== null && candLeft) {
    const candLeftDir = deriveShiftDirection(candLeft);
    if (candLeftDir === refLeftDir) {
      score += 1;
    } else if (candLeftDir !== null) {
      // Shifting in wrong direction -- disqualify
      return 0;
    }
    // candBlueDir === null means this hand dashes in candidate -- no match but not disqualified
  }

  // Score red hand
  if (refRightDir !== null && candRight) {
    const candRightDir = deriveShiftDirection(candRight);
    if (candRightDir === refRightDir) {
      score += 1;
    } else if (candRightDir !== null) {
      // Shifting in wrong direction -- disqualify
      return 0;
    }
  }

  return score;
}

export function identifyContinuation(
  referenceBeat: PictographData,
  candidates: PictographData[]
): PictographData | null {
  if (candidates.length === 0) return null;

  const refLeft = referenceBeat.motions.left;
  const refRight = referenceBeat.motions.right;

  // Determine shift directions from the reference beat
  const leftDir = refLeft ? deriveShiftDirection(refLeft) : null;
  const rightDir = refRight ? deriveShiftDirection(refRight) : null;

  // If neither hand is shifting, there's no continuation concept
  if (leftDir === null && rightDir === null) return null;

  let bestCandidate: PictographData | null = null;
  let bestScore = 0;

  for (const candidate of candidates) {
    const score = scoreCandidate(candidate, leftDir, rightDir);
    if (score > bestScore) {
      bestScore = score;
      bestCandidate = candidate;
    }
  }

  return bestCandidate;
}
