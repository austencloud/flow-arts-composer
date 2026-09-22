/**
 * The flower the 8-beat 3:4 sequence traces.
 *
 * The Shape Matrix's own turn axis (src/lib/shared/shape-matrix/domain/
 * flower-signature.ts) only expresses ratios reachable through TKA turn
 * values on a plain 90-degree hand arc; it has no arc-angle parameter, so it
 * cannot represent a skewed 135-degree arc directly.
 *
 * The Theory surface (src/lib/shared/shape-matrix/domain/theory-flower.ts,
 * built on the QfT model at src/lib/shared/notation/qft/qft-model.ts) draws
 * any rational hand:prop ratio directly, with no dependence on a 90-degree
 * base arc, exactly what this ratio needs. It IS the Shape Engine's answer
 * to "arbitrary hand:prop ratio," so this page uses it rather than
 * hand-computing the path: makeSpinRatio(4, 3) is the reduced prop:hand
 * ratio our 8 beats close on, and traceScaledPath draws it at the engine's
 * own hand radius (80) and staff tip reach (67.4).
 */
import { makeSpinRatio, spinRatioPetals, type SpinRatio } from "@vtg/domain";
import {
  traceScaledPath,
  type QftKnobs,
} from "$lib/shared/notation/qft/qft-model";

export const HAND_RADIUS = 80;
export const STAFF_TIP_REACH = 67.4;

/** prop:hand = 4:3, reduced from the 8-beat closure (4 prop circles : 3 hand circles). */
export const FLOWER_RATIO: SpinRatio = makeSpinRatio(4, 3);

/** Pro-style petal count for this ratio, from the same formula the Theory grid uses. */
export const FLOWER_PETALS = spinRatioPetals(FLOWER_RATIO, "pro");

const KNOBS: QftKnobs = {
  radius: 1,
  downbeats: FLOWER_RATIO.propRotations / FLOWER_RATIO.handCycles,
  ratio: FLOWER_RATIO,
  spin: "inspin", // pro is inspin in QfT's vocabulary
  phase: 0,
  handPhase: 8,
  handDirection: 1,
};

export function buildFlowerPoints(): Array<{ x: number; y: number }> {
  return traceScaledPath(KNOBS, { hand: HAND_RADIUS, prop: STAFF_TIP_REACH });
}

export function flowerPathData(
  points: Array<{ x: number; y: number }>
): string {
  return points
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`)
    .join(" ");
}

/**
 * Measures petals directly off the traced path (distance from center),
 * rather than trusting spinRatioPetals alone: counts sign changes in the
 * radial-distance slope around the closed loop.
 */
export function measurePetals(points: Array<{ x: number; y: number }>): number {
  if (points.length < 3) return 0;
  const dist = points.map((p) => Math.hypot(p.x, p.y));
  // Drop the duplicated closing point before wrapping.
  const n = dist.length - 1;
  let extrema = 0;
  for (let i = 0; i < n; i++) {
    const prev = dist[(i - 1 + n) % n]!;
    const cur = dist[i]!;
    const next = dist[(i + 1) % n]!;
    const risingIntoFalling = cur >= prev && cur > next;
    const fallingIntoRising = cur <= prev && cur < next;
    if (risingIntoFalling || fallingIntoRising) extrema++;
  }
  // Each petal contributes one distance maximum and one minimum.
  return Math.round(extrema / 2);
}
