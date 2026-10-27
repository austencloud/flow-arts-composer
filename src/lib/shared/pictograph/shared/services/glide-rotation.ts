/**
 * Which way a gliding prop or arrow turns to reach its new resting angle.
 *
 * A CSS transform transition interpolates the raw degrees, so 350° → 10° would
 * spin 340° backwards and a 180° flip picks its direction by whichever number
 * is larger. The glide instead takes the short way round, and when the turns
 * changed it turns with the motion: more turns follow the rotation direction,
 * fewer turns unwind against it.
 */

import { HandSide, RotationDirection } from "../domain/enums/pictograph-enums";
import type { PictographData } from "../domain/models/pictograph-data";

export type GlideDirection = "cw" | "ccw" | "auto";

const EPSILON = 0.0001;

/**
 * Whether `next` redraws the same option as `previous`: same letter, and each
 * hand starts and ends where it did. Only a redraw like that (new turns, a new
 * orientation, another prop) glides; anything else is a different pictograph
 * and must not fly its props across from the old one.
 */
export function redrawsSameOption(
  previous: Pick<PictographData, "letter" | "motions">,
  next: Pick<PictographData, "letter" | "motions">
): boolean {
  if (previous.letter !== next.letter) return false;
  return [HandSide.LEFT, HandSide.RIGHT].every((hand) => {
    const before = previous.motions?.[hand];
    const after = next.motions?.[hand];
    return (
      before?.startLocation === after?.startLocation &&
      before?.endLocation === after?.endLocation
    );
  });
}

export function turnsChangeDirection(
  previousTurns: number | "fl" | undefined,
  nextTurns: number | "fl" | undefined,
  rotationDirection: RotationDirection | undefined
): GlideDirection {
  if (typeof previousTurns !== "number" || typeof nextTurns !== "number") {
    return "auto";
  }
  if (previousTurns === nextTurns) return "auto";
  const spin =
    rotationDirection === RotationDirection.COUNTER_CLOCKWISE
      ? "ccw"
      : rotationDirection === RotationDirection.CLOCKWISE
        ? "cw"
        : null;
  if (!spin) return "auto";
  if (nextTurns > previousTurns) return spin;
  return spin === "cw" ? "ccw" : "cw";
}

/**
 * The angle to paint so the transition from `previous` lands on `target`'s
 * heading by the requested route. The result may sit outside [0, 360).
 */
export function glideRotation(
  previous: number,
  target: number,
  direction: GlideDirection
): number {
  if (!Number.isFinite(previous) || !Number.isFinite(target)) return target;
  const delta = (((target - previous) % 360) + 360) % 360;
  if (delta < EPSILON || 360 - delta < EPSILON) return previous;
  if (direction === "cw") return previous + delta;
  if (direction === "ccw") return previous + delta - 360;
  // A half turn has no short way; keep the raw numbers' route.
  if (Math.abs(delta - 180) < EPSILON) return target;
  return delta < 180 ? previous + delta : previous + delta - 360;
}
