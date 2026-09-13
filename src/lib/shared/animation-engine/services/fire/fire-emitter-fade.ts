/**
 * Post-emission fade bookkeeping for the WebGL fire simulation.
 *
 * When every fire-carrying tip disappears — the usual cause is switching a
 * fire-capable prop to hands, whose `PROP_TIP_POINTS` entry is deliberately
 * empty — the simulation has no fuel left to inject but still holds a live
 * plume. That plume has to keep being stepped and redrawn until it burns out,
 * or the fire canvas (WebGL2 with `preserveDrawingBuffer: true`) goes on
 * compositing whatever frame it drew last, forever.
 *
 * Stepping it forever is just as wrong, so the renderer tracks a cheap scalar
 * estimate of the heat still in the field: reset to full on every emitting
 * frame, then multiplied down by the same per-sub-step temperature dissipation
 * the solver itself applies once emission stops. When the estimate falls below
 * one 8-bit display step there is nothing visible left to draw, and the
 * renderer can clear and stand down.
 *
 * The estimate follows sub-steps rather than wall-clock time on purpose: dt
 * scaling (reduced motion, deterministic export dt, long frames) changes how
 * fast the field actually decays, and a wall-clock timer would cut a slow fade
 * short or idle through a fast one.
 */

/** Under one 8-bit code value the plume can no longer paint a pixel. */
export const FIRE_RESIDUAL_VISIBILITY_FLOOR = 1 / 255;

/**
 * Heat the estimate starts from. Each splat injects `temperatureInjection`
 * (1.1 by default) scaled by intensity, and overlapping splats from a moving
 * tip accumulate, so the peak field value sits comfortably above 1. Four is
 * deliberate headroom: underestimating truncates a plume the user can still
 * see, while overestimating only costs a few tenths of a second of extra
 * simulation on a fade that is ending anyway.
 */
export const FIRE_RESIDUAL_PEAK_HEAT = 4;

/**
 * Ceiling on the dissipation the estimate will believe. The solver happily
 * accepts a configured dissipation of 1.0 (never fade at all); the estimate
 * still has to reach the floor so the fade terminates and the renderer stops
 * burning frames.
 */
const MAX_ESTIMATED_DISSIPATION = 0.99;

/**
 * Advance the residual-heat estimate across one rendered frame of `subSteps`
 * solver sub-steps with no emission. Returns exactly 0 once the remaining heat
 * is invisible, which is the renderer's signal to clear and stop.
 */
export function decayResidualHeat(
  previous: number,
  dissipationPerSubStep: number,
  subSteps: number
): number {
  if (!(previous > 0)) return 0;
  const steps = Math.max(1, Math.floor(subSteps));
  const dissipation = Math.min(
    Math.max(dissipationPerSubStep, 0),
    MAX_ESTIMATED_DISSIPATION
  );
  const next = previous * Math.pow(dissipation, steps);
  return next < FIRE_RESIDUAL_VISIBILITY_FLOOR ? 0 : next;
}

/**
 * How long a fade lasts, in seconds, at a given sub-step rate. Not used by the
 * render path — it exists so the fade window can be asserted against real
 * physics constants instead of a hand-picked duration.
 */
export function estimateResidualFadeSeconds(
  dissipationPerSubStep: number,
  subStepsPerSecond: number
): number {
  if (subStepsPerSecond <= 0) return Infinity;
  let heat = FIRE_RESIDUAL_PEAK_HEAT;
  let steps = 0;
  while (heat > 0) {
    heat = decayResidualHeat(heat, dissipationPerSubStep, 1);
    steps++;
  }
  return steps / subStepsPerSecond;
}
