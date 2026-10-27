/**
 * How old a villager looks: the body's size and an old person's stoop.
 *
 * The whole body scales evenly about the feet, so a youth is a smaller
 * person rather than a squashed adult, and the chair fit (chair-seat.ts)
 * holds for anyone seated at their size. The stoop is radians of forward
 * bend down the spine (posture-stoop.ts), eased in and out.
 */

import type { LifecyclePhase } from "../domain/village-types";

export interface AgeLook {
  /** Uniform scale of the whole body. */
  scale: number;
  /** Forward bend down the spine, radians, while the hands are free. */
  stoopRadians: number;
}

export const AGE_LOOK: Readonly<Record<LifecyclePhase, AgeLook>> = {
  youth: { scale: 0.82, stoopRadians: 0 },
  adult: { scale: 1, stoopRadians: 0 },
  elder: { scale: 0.97, stoopRadians: 0.26 },
};

/** Seconds to grow from youth to adult size once they come of age. */
export const GROW_SECONDS = 1.5;
/** Seconds for the stoop to settle in, or straighten to take up a prop. */
export const STOOP_EASE_SECONDS = 0.8;

/** Step `current` toward `target`, covering `span` in `seconds`, by `delta` seconds. */
export function easeToward(
  current: number,
  target: number,
  span: number,
  seconds: number,
  delta: number
): number {
  const step = (Math.abs(span) / Math.max(1e-3, seconds)) * delta;
  if (Math.abs(target - current) <= step) return target;
  return current + Math.sign(target - current) * step;
}
