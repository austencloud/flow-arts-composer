/**
 * LOOP Orientation Pass Detector
 *
 * Mirrors the positional LOOP detector but operates on orientation trajectories
 * rather than grid positions. Detects whether a sequence's orientation state
 * cycles back to its start value after 1, 2, or 4 passes.
 *
 * Why this exists:
 * Two sequences can share identical grid-placement trajectories yet have
 * different orientation behavior. A 4-step sequence where every beat is at
 * alpha1 but the props rotate 90° per beat is orientation-rotated (period 4)
 * while being position-static. The positional detector misses this entirely.
 *
 * Algorithm:
 * 1. Read the sequence's starting blue/red orientations from the first beat
 * 2. Read the ending blue/red orientations from the last beat
 * 3. Compute per-pass orientation delta on the 4-cycle wheel (in=0, clock=1,
 *    out=2, counter=3 - quarter-turn indices)
 * 4. Period from delta:
 *    - 0 → period 1 (already closed - no orientation cycle)
 *    - 2 → period 2 (180° shift per pass, closes after 2 passes)
 *    - 1 or 3 → period 4 (90° shift per pass, closes after 4 passes)
 * 5. Emit ROTATED with domain="orientation" when period > 1
 *
 * Caveats:
 * - Assumes stored `endOri` on the last beat reflects the orientation after
 *   running the sequence with its recorded `startOri`. This is the invariant
 *   OrientationCycleDetector validates via re-simulation; here we trust it.
 * - Half-turns contribute ±2 quarter-turn units to delta, floats contribute ±1.
 *   So a sequence where blue accumulates 0.5 turns and red accumulates 0.5
 *   turns across a 4-step pattern lands at delta=1 → period 4, matching the
 *   form-C example from the spec.
 */

import type { SequenceEntry } from "$lib/shared/loop-labeler/domain/sequence-models";
import {
  LOOPComponent,
  type DetectedComponent,
} from "$lib/shared/foundation/domain/models/generation/generate-models";

const ORIENTATION_TO_QUARTER: Record<string, number> = {
  in: 0,
  clock: 1,
  out: 2,
  counter: 3,
};

export interface OrientationDetectionResult {
  /** Period required for orientation to close (1, 2, or 4). */
  period: number;
  /** Components detected in orientation space. */
  components: DetectedComponent[];
}

/**
 * Compute the period required for orientations to return to their start.
 *
 * @param delta - per-pass orientation delta in quarter-turns (signed, mod 4)
 * @returns 1 (already closed), 2 (180°/pass), or 4 (90°/pass)
 */
function periodFromDelta(delta: number): 1 | 2 | 4 {
  const mod = ((delta % 4) + 4) % 4;
  if (mod === 0) return 1;
  if (mod === 2) return 2;
  return 4;
}

function quarterIndex(ori: string | undefined): number | null {
  if (!ori) return null;
  const q = ORIENTATION_TO_QUARTER[ori.toLowerCase()];
  return q ?? null;
}

export function detectOrientationPass(sequence: SequenceEntry): OrientationDetectionResult {
  const raw = sequence.fullMetadata?.sequence ?? [];

  // First-beat metadata may live at index 0 (raw structure has a metadata
  // object at the head). Find the first and last actual beats.
  const beats = raw.filter(
    (b) => typeof b.beat === "number" && (b.beat as number) >= 1
  );

  if (beats.length < 2) {
    return { period: 1, components: [] };
  }

  const firstStep = beats[0]!;
  const lastStep = beats[beats.length - 1]!;

  const leftStartIdx = quarterIndex(firstStep.leftAttributes?.startOri);
  const rightStartIdx = quarterIndex(firstStep.rightAttributes?.startOri);
  const leftEndIdx = quarterIndex(lastStep.leftAttributes?.endOri);
  const rightEndIdx = quarterIndex(lastStep.rightAttributes?.endOri);

  if (
    leftStartIdx === null ||
    rightStartIdx === null ||
    leftEndIdx === null ||
    rightEndIdx === null
  ) {
    // Missing or non-standard orientation values - fall back to closed.
    return { period: 1, components: [] };
  }

  const leftDelta = leftEndIdx - leftStartIdx;
  const rightDelta = rightEndIdx - rightStartIdx;

  const leftPeriod = periodFromDelta(leftDelta);
  const rightPeriod = periodFromDelta(rightDelta);

  // Overall period is the LCM; for {1,2,4} LCM is just max.
  const period = Math.max(leftPeriod, rightPeriod);

  if (period === 1) {
    return { period: 1, components: [] };
  }

  return {
    period,
    components: [
      { component: LOOPComponent.ROTATED, domain: "orientation" },
    ],
  };
}
