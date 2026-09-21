/**
 * Skewed-frame membership for a beat.
 *
 * A position is skewed (zeta or eta) when one hand is on a cardinal point and
 * the other on an intercardinal point. A beat belongs to a skewed span of the
 * word when its start or its end position is skewed: that covers the entry
 * beat, every beat that stays in the frame, and the exit beat. A beat whose
 * hands both cross the grid boundary but start and end pure is not in a span.
 *
 * Dependency-free on purpose: word-deriver (foundation) and the pictograph
 * renderer both use it.
 */

const CARDINAL = new Set(["n", "e", "s", "w"]);
const INTERCARDINAL = new Set(["ne", "se", "sw", "nw"]);

export interface FrameHand {
  readonly startLocation?: string | null;
  readonly endLocation?: string | null;
}

export interface FrameStepLike {
  readonly motions?: {
    readonly left?: FrameHand | null;
    readonly right?: FrameHand | null;
  } | null;
  readonly startPlacement?: string | null;
  readonly endPlacement?: string | null;
}

type Family = "cardinal" | "intercardinal";

function familyOf(location: string | null | undefined): Family | null {
  if (!location) return null;
  if (CARDINAL.has(location)) return "cardinal";
  if (INTERCARDINAL.has(location)) return "intercardinal";
  return null;
}

/** True when both points are on the perimeter and in different families. */
export function isMixedPair(a: string | null | undefined, b: string | null | undefined): boolean {
  const familyA = familyOf(a);
  const familyB = familyOf(b);
  return familyA !== null && familyB !== null && familyA !== familyB;
}

/** True when the beat starts or ends in a zeta/eta position. */
export function isSkewedFrameBeat(
  left: FrameHand | null | undefined,
  right: FrameHand | null | undefined
): boolean {
  if (!left || !right) return false;
  return (
    isMixedPair(left.startLocation, right.startLocation) ||
    isMixedPair(left.endLocation, right.endLocation)
  );
}

function isSkewedPlacement(placement: string | null | undefined): boolean {
  if (!placement) return false;
  const lower = placement.toLowerCase();
  return lower.startsWith("zeta") || lower.startsWith("eta");
}

/**
 * Skewed-span membership for a step or step pairing. Motions decide when they
 * exist; otherwise the stored start/end placement; otherwise not skewed.
 */
export function isSkewedFrameStep(step: FrameStepLike): boolean {
  const left = step.motions?.left;
  const right = step.motions?.right;
  if (left && right) return isSkewedFrameBeat(left, right);
  return isSkewedPlacement(step.startPlacement) || isSkewedPlacement(step.endPlacement);
}
