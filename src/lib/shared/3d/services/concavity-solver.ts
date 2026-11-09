/**
 * Minimum-depth concavity solver (Option B). For a flagged step, binary-search
 * the smallest concaveDepth k that clears the wall-plane collision test.
 * Deep pull only when needed; natural look preserved. Only concave-eligible
 * hands (ANTI motions, or explicit pathShape "concave") participate — pro
 * conflicts bail to the dual-wheel fallback.
 */
import { scanStepPair } from "./wall-feasibility-scanner";
import { concaveEligible, withDepth } from "./wall-plane-policy";
import type { MotionConfig3D } from "../domain/models/motion-data-3d";

const K_TOLERANCE = 0.02;
const MAX_ITERATIONS = 8; // bisection resolves k to < 1/256

export interface ConcavitySolveResult {
  cleared: boolean;
  /** Minimum clearing depth, null when no cheat was needed or possible. */
  k: number | null;
  hands: Array<"left" | "right">;
}

// The eligibility predicate and k stamp live with the viewer seam, which
// must not pull in the collision model; re-exported for the solvers.
export { concaveEligible, withDepth };

export function solveStepConcavity(
  left: MotionConfig3D,
  right: MotionConfig3D
): ConcavitySolveResult {
  if (scanStepPair(left, right).clean) {
    return { cleared: true, k: null, hands: [] };
  }
  const hands: Array<"left" | "right"> = [];
  if (concaveEligible(left)) hands.push("left");
  if (concaveEligible(right)) hands.push("right");
  if (hands.length === 0) return { cleared: false, k: null, hands: [] };

  // Feasibility probe at max depth — if k=1 doesn't clear, bail.
  if (!scanStepPair(withDepth(left, 1), withDepth(right, 1)).clean) {
    return { cleared: false, k: null, hands };
  }

  const k = bisectToThreshold(
    0,
    1,
    (mid) => scanStepPair(withDepth(left, mid), withDepth(right, mid)).clean,
    K_TOLERANCE
  );
  return { cleared: true, k, hands };
}

/**
 * Shrink a passing value toward a failing one. `lo` is known to fail and `hi`
 * to pass; the returned value always passed, so a non-monotonic test can make
 * the answer less than minimal but never wrong. Bounded by MAX_ITERATIONS.
 */
export function bisectToThreshold(
  lo: number,
  hi: number,
  passes: (value: number) => boolean,
  tolerance: number
): number {
  for (let i = 0; i < MAX_ITERATIONS && hi - lo > tolerance; i++) {
    const mid = (lo + hi) / 2;
    if (passes(mid)) hi = mid;
    else lo = mid;
  }
  return hi;
}
