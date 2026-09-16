/**
 * orientation-alignment-calculator.ts
 *
 * Calculates orientation alignment for sequence extension.
 * Determines how many repetitions are needed for prop orientations
 * to return to their starting state after LOOP application.
 */

import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";

/**
 * Describes orientation alignment status for exact placement matches.
 */
export interface OrientationAlignment {
  /** Whether both left and right orientations match the start placement */
  matches: boolean;
  /** End orientation of the left prop after adding bridge letter */
  leftEndOri: string;
  /** End orientation of the right prop after adding bridge letter */
  rightEndOri: string;
  /** Start orientation of the left prop (from sequence start placement) */
  leftStartOri: string;
  /** Start orientation of the right prop (from sequence start placement) */
  rightStartOri: string;
  /**
   * How many times the sequence needs to repeat to return to original orientations.
   * 1 = orientations already match (true loop)
   * 2 = orientations flip once, need 2 repetitions
   * 4 = orientations quarter-cycle, need 4 repetitions
   */
  repetitionsNeeded: 1 | 2 | 4;
}

/**
 * Get the starting orientations from a sequence's start placement.
 */
export function getStartOrientations(
  sequence: SequenceData
): { leftOri: string; rightOri: string } | null {
  const startPosData = sequence.startPlacement || sequence.startingPlacement;
  if (!startPosData) return null;

  // Extract orientations from motion data
  const motions = (startPosData as unknown as Record<string, unknown>)
    .motions as Record<string, unknown> | undefined;

  if (!motions) {
    // Try the legacy format with direct hand properties.
    const leftData = (startPosData as unknown as Record<string, unknown>)
      .left as Record<string, unknown> | undefined;
    const rightData = (startPosData as unknown as Record<string, unknown>)
      .right as Record<string, unknown> | undefined;

    if (leftData?.endOri && rightData?.endOri) {
      return {
        leftOri: leftData.endOri as string,
        rightOri: rightData.endOri as string,
      };
    }
    return null;
  }

  const leftMotion = motions.left as Record<string, unknown> | undefined;
  const rightMotion = motions.right as Record<string, unknown> | undefined;

  if (!leftMotion?.endOri || !rightMotion?.endOri) {
    return null;
  }

  return {
    leftOri: leftMotion.endOri as string,
    rightOri: rightMotion.endOri as string,
  };
}

/**
 * Calculate how many steps an orientation needs to return to its original.
 * Orientations cycle: in → clock → out → counter → in (4 states)
 */
export function calculateOrientationSteps(
  startOri: string,
  endOri: string
): 1 | 2 | 4 {
  if (startOri === endOri) return 1;

  // Define the orientation cycle
  const cycle = ["in", "clock", "out", "counter"];
  const startIdx = cycle.indexOf(startOri);
  const endIdx = cycle.indexOf(endOri);

  // If either orientation isn't in the cycle, assume they match (conservative)
  if (startIdx === -1 || endIdx === -1) return 1;

  const diff = (endIdx - startIdx + 4) % 4;

  // diff === 0: same orientation (1 repetition)
  // diff === 2: opposite orientation (2 repetitions to flip back)
  // diff === 1 or 3: quarter-step (4 repetitions)
  if (diff === 0) return 1;
  if (diff === 2) return 2;
  return 4;
}

/**
 * Calculate orientation alignment between sequence start and a potential end placement.
 */
export function calculateOrientationAlignment(
  sequence: SequenceData,
  bridgePictograph: PictographData
): OrientationAlignment | null {
  // Get start orientations
  const startOris = getStartOrientations(sequence);
  if (!startOris) return null;

  // Get end orientations from bridge pictograph
  const leftMotion = bridgePictograph.motions?.left;
  const rightMotion = bridgePictograph.motions?.right;

  if (!leftMotion?.endOrientation || !rightMotion?.endOrientation) return null;

  const leftEndOri = leftMotion.endOrientation;
  const rightEndOri = rightMotion.endOrientation;

  // Calculate steps needed for each prop
  const leftSteps = calculateOrientationSteps(startOris.leftOri, leftEndOri);
  const rightSteps = calculateOrientationSteps(startOris.rightOri, rightEndOri);

  // Need LCM of both steps (if blue needs 2 and red needs 4, we need 4 total)
  const repetitionsNeeded = Math.max(leftSteps, rightSteps) as 1 | 2 | 4;

  return {
    matches:
      leftEndOri === startOris.leftOri && rightEndOri === startOris.rightOri,
    leftEndOri,
    rightEndOri,
    leftStartOri: startOris.leftOri,
    rightStartOri: startOris.rightOri,
    repetitionsNeeded,
  };
}

/**
 * Calculate the resulting sequence length after applying a LOOP.
 */
export function calculateResultingLength(
  currentLength: number,
  rotationRelation: "exact" | "half" | "quarter" | null,
  repetitionsNeeded: 1 | 2 | 4 = 1
): number {
  // Add 1 for the bridge letter itself
  const withBridge = currentLength + 1;

  switch (rotationRelation) {
    case "half":
      // 180° rotation = 2x sequence length
      return withBridge * 2;
    case "quarter":
      // 90° rotation = 4x sequence length
      return withBridge * 4;
    case "exact":
      // Exact placement = multiply by repetitions needed for orientation alignment
      return withBridge * repetitionsNeeded;
    default:
      return withBridge;
  }
}
