/**
 * Turn stepping rules shared by the step editor's stepper and its limits.
 *
 * Turns run from 0 to 3 in half steps. Shifts (pro/anti) may also go one half
 * step below 0 into a float, stored as "fl" and represented here as −0.5. A
 * motion already floating has motion type FLOAT and keeps the same minimum.
 *
 * Half steps (±0.5) move one notch, including into and out of a float.
 * Whole steps (±1) never enter or leave a float: they treat a float as 0, stop
 * at 0 on the way down, and clamp at the limits, so +1 at 2.5 lands on 3.
 */

export const MAX_TURNS = 3;
export const TURN_STEP_HALF = 0.5;
export const TURN_STEP_WHOLE = 1;
/** Numeric stand-in for a float ("fl"). */
export const FLOAT_TURNS = -0.5;

export function stepTurns(
  current: number,
  delta: number,
  minTurns: number,
  maxTurns: number = MAX_TURNS
): number {
  if (Math.abs(delta) >= TURN_STEP_WHOLE) {
    if (delta < 0 && current <= 0) return current;
    const base = Math.max(current, 0);
    return Math.min(maxTurns, Math.max(0, base + delta));
  }
  const next = Math.min(maxTurns, Math.max(minTurns, current + delta));
  // A step never moves against its own direction, even when the caller's
  // minimum sits above the current value.
  return delta < 0 ? Math.min(current, next) : Math.max(current, next);
}

export function canStepTurns(
  current: number,
  delta: number,
  minTurns: number,
  maxTurns: number = MAX_TURNS
): boolean {
  return stepTurns(current, delta, minTurns, maxTurns) !== current;
}
