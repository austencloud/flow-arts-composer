import {
  makeSpinRatio,
  THEORY_SPIN_RATIO_MAX_PART,
  type SpinRatio,
} from "@vtg/domain";

/** The largest number either side of a typed ratio may carry. */
export const THEORY_RATIO_MAX_PART = THEORY_SPIN_RATIO_MAX_PART;

export const DEFAULT_THEORY_RATIO = makeSpinRatio(1, 3);

/**
 * Build the ratio the editor promises: two independent whole numbers from
 * 0 through 15, except 0:0. The domain constructor reduces valid pairs so a
 * typed 2:4 and a restored 1:2 always reach the matrix as the same ratio.
 */
export function theoryRatioFromParts(
  propRotations: number,
  handCycles: number
): SpinRatio | null {
  if (
    !Number.isInteger(propRotations) ||
    !Number.isInteger(handCycles) ||
    propRotations < 0 ||
    handCycles < 0 ||
    propRotations > THEORY_RATIO_MAX_PART ||
    handCycles > THEORY_RATIO_MAX_PART ||
    (propRotations === 0 && handCycles === 0)
  ) {
    return null;
  }

  try {
    return makeSpinRatio(propRotations, handCycles);
  } catch {
    return null;
  }
}

/**
 * User-facing VTG label: hand cycles first, prop rotations second, matching
 * Noel Yee's own notation (VTG2 index: "1/3 Four Petal Antispin Flower").
 * Only `spinRatioKey` and the URL parameters stay prop-first, for stability.
 */
export function theoryRatioLabel(ratio: SpinRatio): string {
  return `${ratio.handCycles}:${ratio.propRotations}`;
}

export function theoryRatioSpokenLabel(ratio: SpinRatio): string {
  const label = theoryRatioLabel(ratio);
  if (ratio.handCycles === 0) return `${label}, stationary hand`;
  if (ratio.propRotations === 0) return `${label}, float`;
  const cycles = ratio.handCycles;
  return `${label}, closes in ${cycles} hand ${cycles === 1 ? "cycle" : "cycles"}`;
}
