/**
 * Minimum-depth concavity solver (Option B). For a flagged step, binary-search
 * the smallest concaveDepth k that clears the wall-plane collision test.
 * Deep pull only when needed; natural look preserved. Only concave-eligible
 * hands (ANTI motions, or explicit pathShape "concave") participate — pro
 * conflicts bail to the dual-wheel fallback.
 */
import { MotionType } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import { scanStepPair } from "./wall-feasibility-scanner";
import type { MotionConfig3D } from "../domain/models/motion-data-3d";

const K_TOLERANCE = 0.02;
const MAX_ITERATIONS = 8; // bisection resolves k to < 1/256

export interface ConcavitySolveResult {
  cleared: boolean;
  /** Minimum clearing depth, null when no cheat was needed or possible. */
  k: number | null;
  hands: Array<"left" | "right">;
}

function concaveEligible(m: MotionConfig3D): boolean {
  return m.motionType === MotionType.ANTI || m.pathShape === "concave";
}

function withDepth(m: MotionConfig3D, k: number): MotionConfig3D {
  return concaveEligible(m) ? { ...m, pathShape: "concave", concaveDepth: k } : m;
}

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

  let lo = 0,
    hi = 1;
  for (let i = 0; i < MAX_ITERATIONS && hi - lo > K_TOLERANCE; i++) {
    const mid = (lo + hi) / 2;
    if (scanStepPair(withDepth(left, mid), withDepth(right, mid)).clean) hi = mid;
    else lo = mid;
  }
  return { cleared: true, k: hi, hands };
}
