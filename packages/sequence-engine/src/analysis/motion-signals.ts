/**
 * Motion signals — the two independent directional signals a motion carries.
 *
 * TKA ground truth (MCP `get_term_definition`, verified 2026-07-05):
 *   - **pro** = the prop rotates in the same direction as the hand's arc;
 *     **anti** = opposite. Pro/anti is a *relation* between prop rotation and
 *     hand arc, not a raw spin direction.
 *   - A **reversal** flips when either signal flips: hand reversal (hand
 *     retraces, prop continues), prop reversal (hand continues, prop reverses),
 *     full reversal (both retrace). All three are reversals.
 *
 * Canonical data proof that `rotationDirection` records the PROP's spin, not
 * the hand's arc: letters A (pro) and B (anti) share the same left hand path
 * w→n (a clockwise arc), but A stores rotationDirection "cw" while B stores
 * "ccw". So detecting reversals from `rotationDirection` alone is blind to
 * hand reversals — the hand-arc signal below closes that gap.
 *
 * Hand-arc computation (hybrid, in priority order):
 *   1. Authored `handPath` when present. The app stores it explicitly because
 *      it is "essential for floats (no rotation to derive from)" and it is the
 *      only signal that survives skewed motions that travel the long way
 *      around the grid (endpoint geometry cannot see `skewSteps`).
 *   2. Endpoint geometry on the 8-point location circle (shortest arc), the
 *      same convention as `HAND_ROTATION_DIRECTION_MAP`
 *      (src/loop/placement-maps/circular-placement-maps.ts) and the app's
 *      `deriveHandPath` / `calculateRotationDirection` helpers. Static
 *      (0 steps) and dash (4 steps, direction-ambiguous) have no arc.
 *
 * Orientation delta was rejected as a source: start/end orientation describe
 * the PROP's center-relative orientation and are subject to turn-parity rules
 * (even turns preserve, odd reverse — MCP pro definition), so they do not
 * encode the hand's travel direction.
 */

export type ArcDirection = "cw" | "ccw";
export type PropRotation = "cw" | "ccw" | "noRotation";

/**
 * Minimal structural view of a motion for signal extraction. Satisfied by the
 * canonical `Motion` (tka-types), the engine's `SequenceStep` motions, and the
 * app's `MotionData` — the unified motion-signal model.
 */
export interface MotionSignalSource {
  readonly motionType?: string;
  readonly rotationDirection?: string;
  readonly startLocation?: string;
  readonly endLocation?: string;
  /** Authored hand-path direction (app view field; absent in lean engine data). */
  readonly handPath?: string | null;
}

/** Locations ordered clockwise around the grid: N=0 … NW=7. Center is absent on purpose. */
const CLOCKWISE_INDEX: Record<string, number> = {
  n: 0,
  ne: 1,
  e: 2,
  se: 3,
  s: 4,
  sw: 5,
  w: 6,
  nw: 7,
};

/**
 * The hand's arc direction for a motion, or null when the hand has no
 * unambiguous arc (static, dash/opposite, center-involving, unknown data).
 */
export function handArcDirection(
  motion: MotionSignalSource | null | undefined
): ArcDirection | null {
  if (!motion) return null;

  // 1) Authored hand path wins when present.
  const authored = motion.handPath;
  if (authored === "cw" || authored === "ccw") return authored;
  if (
    authored === "dash" ||
    authored === "static" ||
    authored === "hashIn" ||
    authored === "hashOut"
  ) {
    return null;
  }

  // 2) Endpoint geometry: shortest arc on the 8-point circle.
  const start =
    typeof motion.startLocation === "string"
      ? CLOCKWISE_INDEX[motion.startLocation.toLowerCase()]
      : undefined;
  const end =
    typeof motion.endLocation === "string"
      ? CLOCKWISE_INDEX[motion.endLocation.toLowerCase()]
      : undefined;
  if (start === undefined || end === undefined) return null;

  const cwSteps = (end - start + 8) % 8;
  if (cwSteps === 0) return null; // static — no travel
  if (cwSteps === 4) return null; // dash/opposite — direction ambiguous
  return cwSteps < 4 ? "cw" : "ccw";
}

/**
 * The prop's rotation direction for a motion. Preserves the production
 * fallback semantics of the app detector byte-for-byte:
 *   - explicit rotationDirection wins ("no_rot" normalized to "noRotation");
 *   - static and dash motions legitimately have no rotation → "noRotation";
 *   - pro/anti/float with a missing rotationDirection is bad data → warn and
 *     default "cw" so downstream detection doesn't crash;
 *   - missing motion → null.
 */
export function propRotationDirection(
  motion: MotionSignalSource | null | undefined
): PropRotation | null {
  if (!motion) return null;

  const dir = motion.rotationDirection;
  if (dir) {
    if (dir === "no_rot") return "noRotation";
    return dir as PropRotation;
  }

  if (motion.motionType === "static" || motion.motionType === "dash") {
    return "noRotation";
  }

  console.warn(
    `Missing rotationDirection for motion type "${motion.motionType}". Defaulting to 'cw'.`
  );
  return "cw";
}
